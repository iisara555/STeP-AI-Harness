import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { WorkService, type Harness } from '../electron/service';
import { Store } from '../electron/store';
import type { Connection } from '../src/types';

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), reject(new Error('CANCELLED'))), { once: true });
  });

// A long tool loop (an xhigh model reading Skills and references turn after turn) on synthetic data.
function fixture(turnMs: number, finishAfter: number, budgetMs: number, obeysDeadline = false) {
  const store = new Store(':memory:');
  store.put('connection', 'c', { id: 'c', provider: 'openai', mode: 'api', model: 'synthetic', ready: true } as Connection);
  store.put('settings', 'main', { workspace: tmpdir() });
  const session = store.create('c', 'cc');
  const failed: { text?: string }[] = [];
  let turns = 0;
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
      execute: async () => ({ text: 'synthetic reference text' }),
    }),
  };
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async (prompt, _c, context) => {
          await pause(turnMs, context.signal);
          turns++;
          if (obeysDeadline && prompt.includes('time for this message is nearly used up')) return 'Synthetic answer from what was read';
          return turns >= finishAfter ? 'Synthetic answer' : `\`\`\`step-tool\n{"tool":"reference","input":"synthetic-${turns}"}\n\`\`\``;
        },
      },
    }),
    event => {
      if (event.type === 'failed') failed.push(event);
    },
    budgetMs,
  );
  return { store, service, session, failed, turns: () => turns };
}

test('a tool loop whose model turns keep completing may run past one step budget', async () => {
  // Four turns of 80 ms each (320 ms) against a 200 ms budget: no single turn is slow, so the step finishes.
  const f = fixture(80, 4, 200);
  try {
    await f.service.run(f.session.id, 'Synthetic request', '', true, undefined, 'chat');
    assert.equal(f.turns(), 4);
    assert.equal(f.store.session(f.session.id).status, 'review');
    assert.deepEqual(f.failed, []);
  } finally {
    f.store.close();
  }
});

test('a tool loop that never finishes still stops at three step budgets and logs RUN_TIMEOUT', async () => {
  const f = fixture(70, Infinity, 100);
  try {
    const started = Date.now();
    await f.service.run(f.session.id, 'Synthetic request', '', true, undefined, 'chat');
    const elapsed = Date.now() - started;
    const session = f.store.session(f.session.id);
    assert.equal(session.status, 'error');
    assert.equal(session.messages.at(-1)?.text, 'RUN_TIMEOUT');
    assert.ok(elapsed >= 280 && elapsed < 1000, `stopped after ${elapsed} ms`);
    // Diagnostics get the same code the person sees, not the abort's CANCELLED.
    assert.equal(f.failed.at(-1)?.text, 'RUN_TIMEOUT');
  } finally {
    f.store.close();
  }
});

test('a reading loop that reaches the last step budget is asked to answer, and its answer is delivered', async () => {
  // The same never-ending reader as above, but a model that follows the final-turn notice: the person gets an answer
  // written from what was read, not RUN_TIMEOUT and nothing.
  const f = fixture(70, Infinity, 100, true);
  try {
    await f.service.run(f.session.id, 'Synthetic request', '', true, undefined, 'chat');
    const session = f.store.session(f.session.id);
    assert.equal(session.status, 'review');
    assert.equal(session.messages.at(-1)?.text, 'Synthetic answer from what was read');
    assert.deepEqual(f.failed, []);
  } finally {
    f.store.close();
  }
});
