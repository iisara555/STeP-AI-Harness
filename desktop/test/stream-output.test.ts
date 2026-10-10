import { test } from 'node:test';
import assert from 'node:assert/strict';
import { credentialsOnly } from '../electron/checks';
import { StreamOutput } from '../electron/stream-output';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../electron/store';
import { Workbench } from '../electron/workbench';
import { defaultPolicy } from '../electron/policy';
const privacy: any = await import('../../src/modules/privacy/index.js');
const SECRET = 'SyntheticCredentialValue987654';
const scrub = (text: string) => credentialsOnly(text, privacy.scanPrivacyText, privacy.CREDENTIAL_PATTERN).redactedText;
function fixture(review = scrub) {
  const chunks: string[] = [];
  const stream = new StreamOutput(review, text => chunks.push(text));
  return { stream, chunks, text: () => chunks.join('') };
}

test('mixed CR/LF and split CRLF keep credential values masked across poll cursors with default privacy', () => {
  for (const ending of ['\r\n', '\n', '\r']) {
    const f = fixture();
    f.stream.write('x'.repeat(2000) + '\npassword:' + ending.slice(0, 1));
    const cursor = f.text().length;
    f.stream.write(ending.slice(1) + SECRET + '\nMARK\n');
    f.stream.end();
    assert.ok(!f.text().includes(SECRET));
    assert.ok(!scrub(f.text().slice(cursor)).includes(SECRET));
    assert.match(f.text(), /MARK\n$/);
  }
});

test('oversized unfinished lines never expose token prefixes or credential tails and use bounded storage', () => {
  for (const token of ['sk-' + 'abcdefghijklmnopqrstuv', 'ghp_' + 'abcdefghijklmnopqrstuv', 'password: ' + SECRET]) {
    const f = fixture();
    f.stream.write('x'.repeat(8000) + token.slice(0, 5));
    assert.ok(!f.text().includes(token.slice(0, 5)));
    f.stream.write(token.slice(5) + 'y'.repeat(20000));
    f.stream.write('\nNEXT\nSAFE\n');
    f.stream.end();
    assert.ok(!f.text().includes(token));
    assert.ok(!f.text().includes(SECRET));
    assert.match(f.text(), /withheld/);
    assert.match(f.text(), /SAFE\n$/);
  }
});

test('a withheld credential key cannot release the value on its next nonempty line', () => {
  const f = fixture(text => (/password/.test(text) ? null : scrub(text)));
  f.stream.write('password: \"blocked\"\n\n\r\n');
  f.stream.write(SECRET + '\nMARK\n');
  f.stream.end();
  assert.ok(!f.text().includes(SECRET));
  assert.match(f.text(), /MARK\n$/);
});

test('blank lines, ANSI keys, long values and final unterminated values cannot orphan a credential', () => {
  const f = fixture();
  f.stream.write('\u001b[31mpassword\u001b[0m:\r');
  f.stream.write('\n\n\r\n  ' + SECRET + 'z'.repeat(4000));
  f.stream.end();
  assert.ok(!f.text().includes(SECRET));
  assert.ok(!f.text().includes('z'.repeat(20)));
});

test('public CR progress and final text are append-only; stdout and stderr states stay independent', () => {
  const out = fixture(),
    err = fixture();
  out.stream.write('10%\r');
  const before = out.text();
  err.stream.write('password:\n');
  out.stream.write('done-no-newline');
  err.stream.write(SECRET + '\n');
  out.stream.end();
  err.stream.end();
  assert.ok(out.text().startsWith(before));
  assert.match(out.text(), /done-no-newline$/);
  assert.ok(!err.text().includes(SECRET));
});

test('real background poll continuation passes no credential to the outgoing default-policy check', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-stream-regression-'));
  const store = new Store(':memory:'),
    policy = defaultPolicy();
  assert.equal(policy.checks.privacy, false);
  store.put('settings', 'main', { workspace: root });
  const workbench = new Workbench(store, scrub, () => policy);
  try {
    await writeFile(
      join(root, 'output.cjs'),
      `process.stdout.write('x'.repeat(2000)+'\\npassword:\\r\\n'); setTimeout(()=>process.stdout.write('${SECRET}\\nMARK\\n'),500);`,
    );
    const executable = `${process.platform === 'win32' ? '& ' : ''}"${process.execPath}"`;
    const task = await workbench.start(`${executable} output.cjs`, 's');
    let first: any;
    for (let n = 0; n < 150; n++) {
      first = await workbench.inspectTask('s', task.id, { action: 'poll' });
      if (first.endOffset) break;
      await new Promise(r => setTimeout(r, 10));
    }
    assert.ok(first.endOffset, 'the public first line is shown before the credential value');
    for (let n = 0; n < 200 && workbench.tasks().find(t => t.id === task.id)?.status === 'running'; n++)
      await new Promise(r => setTimeout(r, 10));
    const next: any = await workbench.inspectTask('s', task.id, { action: 'poll', offset: first.endOffset });
    const outgoing = credentialsOnly(JSON.stringify(next), privacy.scanPrivacyText, privacy.CREDENTIAL_PATTERN);
    assert.ok(!outgoing.redactedText?.includes(SECRET));
    assert.match(next.output, /MARK/);
    assert.ok(
      !workbench
        .tasks()
        .find(t => t.id === task.id)!
        .output.includes(SECRET),
    );
  } finally {
    await workbench.close();
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
