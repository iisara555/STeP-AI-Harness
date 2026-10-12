import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectFailure, setTestRetryDelay, signInAndTest, signInExpired } from '../electron/connect';
import { connectionState } from '../src/connection-state';
import type { Connection } from '../src/types';

const base: Connection = {
  id: 'synthetic',
  provider: 'compatible',
  mode: 'api',
  model: 'synthetic-model',
  executable: '',
  ready: false,
  note: '',
};

function deps(run: () => Promise<unknown>, progress: string[] = []) {
  return {
    runtime: { adapter: { run } as any, context: { key: 'synthetic' } as any },
    progress: (text: string) => void progress.push(text),
    openExternal: async () => {},
    askForCode: async () => null,
    dropCode: () => {},
  };
}

test('the connection test tries once more when the service was only busy', async () => {
  setTestRetryDelay(1);
  let calls = 0;
  const progress: string[] = [];
  await signInAndTest(
    base,
    deps(async () => {
      if (++calls === 1) throw new Error('PROVIDER_BUSY');
      return { text: 'OK' };
    }, progress),
    new AbortController().signal,
  );
  assert.equal(calls, 2);
  assert.ok(progress.some(line => line.includes('กำลังลองใหม่')));
});

test('the connection test does not retry account problems, and retries a busy service only once', async () => {
  setTestRetryDelay(1);
  for (const [code, expected] of [
    ['LOGIN_REQUIRED', 1],
    ['PROVIDER_QUOTA', 1],
    ['PROVIDER_NETWORK', 2],
  ] as const) {
    let calls = 0;
    await assert.rejects(
      signInAndTest(
        base,
        deps(async () => {
          calls++;
          throw new Error(code);
        }),
        new AbortController().signal,
      ),
      { message: code },
    );
    assert.equal(calls, expected, code);
  }
});

test('a re-test that only met a busy service or a cancel keeps a working account ready', () => {
  const working = { ready: true, signedIn: true, note: 'ผ่านแล้ว' };
  assert.deepEqual(connectFailure(working, 'CANCELLED'), { ready: true, signedIn: true, note: 'ผ่านแล้ว', problem: undefined });
  const busy = connectFailure(working, 'PROVIDER_BUSY');
  assert.equal(busy.ready, true);
  assert.match(busy.note, /PROVIDER_BUSY/);
  // A real account problem still marks it not ready, with the code for the status chip.
  const expired = connectFailure(working, 'LOGIN_REQUIRED');
  assert.equal(expired.ready, false);
  assert.equal(expired.problem, 'LOGIN_REQUIRED');
  // A connection that never worked is not made ready by a cancel.
  assert.equal(connectFailure({ ready: false, note: '' }, 'CANCELLED').ready, false);
});

test('a chat that finds the sign-in expired flips the account to "sign in again"', () => {
  const expired = signInExpired({ ...base, provider: 'openai', mode: 'subscription', ready: true, signedIn: true });
  assert.equal(expired.ready, false);
  assert.equal(expired.signedIn, undefined);
  assert.deepEqual(connectionState(expired), { tone: 'attention', label: 'ต้องลงชื่อใหม่', action: 'sign-in-again' });
});

test('every account shows one plain status and the one button that fixes it', () => {
  const s = (c: Partial<Connection>) => connectionState({ ...base, mode: 'subscription', ...c });
  assert.equal(s({ ready: true }).action, 'retest');
  assert.equal(s({ ready: true, policyBlocked: true }).tone, 'blocked');
  assert.equal(s({}).label, 'ยังไม่ได้เชื่อมต่อ');
  assert.equal(s({}).action, 'connect');
  assert.equal(s({ problem: 'CANCELLED' }).tone, 'idle');
  assert.equal(s({ problem: 'LOGIN_TIMEOUT' }).label, 'เชื่อมต่อไม่สำเร็จ');
  assert.equal(s({ signedIn: true, problem: 'CONNECT_TEST_TIMEOUT' }).action, 'test');
  assert.equal(s({ mode: 'api', problem: 'LOGIN_REQUIRED' }).label, 'API key ใช้ไม่ได้');
  // Connections saved by older versions keep the code at the end of the note.
  assert.equal(s({ note: 'การลงชื่อเข้าใช้หมดอายุ (LOGIN_REQUIRED)' }).action, 'sign-in-again');
});
