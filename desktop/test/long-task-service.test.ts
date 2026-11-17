import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { WorkService, type Harness } from '../electron/service';
import { Store } from '../electron/store';
import type { Connection } from '../src/types';

// A long reading task on synthetic data, through the real WorkService: stopping, resuming and "write the answer now".
type Reply = (prompt: string, turn: number) => string | Promise<string>;
function fixture(reply: Reply) {
  const store = new Store(':memory:');
  store.put('connection', 'c', { id: 'c', provider: 'openai', mode: 'api', model: 'synthetic', ready: true } as Connection);
  store.put('settings', 'main', { workspace: tmpdir() });
  const session = store.create('c', 'cc');
  const executed: string[] = [];
  const prompts: string[] = [];
  let turn = 0;
  const harness: Harness = {
    root: tmpdir(),
    route: async () => ({ routingContract: { mode: 'GENERAL', authority: { status: 'ALLOW' }, mandatoryReferences: [] } }),
    contextPolicy: () => ({ history: 'ignore', carryover: false }),
    privacy: t => ({ action: 'pass', redactedText: t, findings: [] }),
    skillMetadata: async () => null,
    documentPrivacy: async () => null,
    nextOutput: async () => null,
    toolLoop: () => true,
    tools: async () => ({
      enabled: () => true,
      check: async () => {},
      readOnly: () => true,
      outgoing: async t => t,
      execute: async r => (executed.push(r.input), `synthetic text of ${r.input}`),
    }),
  };
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async prompt => {
          prompts.push(prompt);
          return reply(prompt, ++turn);
        },
      },
    }),
    () => {},
  );
  return { store, service, session, executed, prompts, turns: () => turn };
}
const request = (tool: string, input: string) => '```step-tool\n' + JSON.stringify({ tool, input }) + '\n```';

test('a task that stopped after reading gets its reads back on "ลองอีกครั้ง" and spends no turns re-reading', async () => {
  let failing = true;
  const f = fixture((prompt, turn) => {
    if (failing) {
      if (turn === 1) return request('skill', 'tor-government-writing') + request('reference', 'qp-af-002');
      throw new Error('PROVIDER_QUOTA');
    }
    // The resumed attempt already has both texts in its first prompt.
    assert.match(prompt, /previous attempt/);
    assert.match(prompt, /synthetic text of qp-af-002/);
    return 'Synthetic TOR draft';
  });
  try {
    await f.service.run(f.session.id, 'ผมขอ TOR อีกฉบับ', '', true, undefined, 'chat');
    let session = f.store.session(f.session.id);
    assert.equal(session.status, 'error');
    assert.deepEqual(
      session.resumeReads?.requests.map(r => r.input),
      ['tor-government-writing', 'qp-af-002'],
    );
    assert.doesNotMatch(JSON.stringify(session.resumeReads), /synthetic text/, 'only the requests are kept, never the text');
    failing = false;
    const before = f.turns();
    await f.service.run(f.session.id, 'ลองอีกครั้ง', '', true, undefined, 'chat', undefined, [], { retry: true });
    session = f.store.session(f.session.id);
    assert.equal(session.status, 'review');
    assert.equal(f.turns() - before, 1, 'one model turn: straight to the answer');
    assert.equal(session.resumeReads, undefined, 'given back once, then forgotten');
    assert.equal(session.runs?.at(-1)?.steps[0].loop?.seeded, 2);
  } finally {
    f.store.close();
  }
});

test('a finished task keeps nothing to resume', async () => {
  const f = fixture((_p, turn) => (turn === 1 ? request('reference', 'qp-af-002') : 'Synthetic answer'));
  try {
    await f.service.run(f.session.id, 'Synthetic request', '', true, undefined, 'chat');
    assert.equal(f.store.session(f.session.id).resumeReads, undefined);
  } finally {
    f.store.close();
  }
});

test('"เขียนคำตอบเลย" makes a reading task write its answer from what it has read', async () => {
  let f: ReturnType<typeof fixture>;
  f = fixture(async (prompt, turn) => {
    if (prompt.includes('time for this message is nearly used up')) return 'Synthetic answer from what was read';
    // The person presses the control while the third read is under way.
    if (turn === 3) assert.equal(f.service.writeNow(f.session.id), true);
    return request('reference', `synthetic-${turn}`);
  });
  try {
    assert.equal(f.service.writeNow(f.session.id), false, 'nothing to stop when no task runs');
    await f.service.run(f.session.id, 'Synthetic request', '', true, undefined, 'chat');
    const session = f.store.session(f.session.id);
    assert.equal(session.status, 'review');
    assert.equal(session.messages.at(-1)?.text, 'Synthetic answer from what was read');
    assert.equal(session.runs?.at(-1)?.steps[0].loop?.final, 'deadline');
    assert.equal(f.executed.length, 3, 'the read requested in that turn still ran; nothing ran after it');
  } finally {
    f.store.close();
  }
});

test('typing "ต่อ" after a stop also gets the earlier reads back', async () => {
  let failing = true;
  const f = fixture((prompt, turn) => {
    if (failing) {
      if (turn === 1) return request('reference', 'qp-af-002');
      throw new Error('PROVIDER_QUOTA');
    }
    assert.match(prompt, /synthetic text of qp-af-002/);
    return 'Synthetic answer';
  });
  try {
    await f.service.run(f.session.id, 'Synthetic request', '', true, undefined, 'chat');
    failing = false;
    await f.service.run(f.session.id, 'ต่อ', '', true, undefined, 'chat');
    assert.equal(f.store.session(f.session.id).status, 'review');
    assert.deepEqual(f.executed, ['qp-af-002', 'qp-af-002'], 'read once per attempt, by the host, not by a model turn');
  } finally {
    f.store.close();
  }
});
