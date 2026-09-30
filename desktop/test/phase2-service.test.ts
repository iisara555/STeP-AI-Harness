import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { Store } from '../electron/store';
import { WorkService, type Harness } from '../electron/service';
import type { Connection } from '../src/types';
const privacy: any = await import('../../src/modules/privacy/index.js');
test('chat and draft both run gated tools and count retries and every model turn', async () => {
  for (const mode of ['chat', 'draft'] as const) {
    const store = new Store(':memory:');
    store.put('connection', 'c', { id: 'c', provider: 'openai', model: 'test', ready: true } as Connection);
    const session = store.create('c', 'cc');
    store.put('settings', 'main', { workspace: tmpdir(), team: 'cc', assistant: 'test' });
    let calls = 0,
      executions = 0;
    const counts: number[] = [];
    const harness: Harness = {
      root: tmpdir(),
      route: async () => ({ routingContract: { mode: 'GENERAL', authority: { status: 'ALLOW' }, mandatoryReferences: [] } }),
      contextPolicy: () => ({ history: 'ignore', carryover: false }),
      privacy: privacy.evaluatePrivacyGate,
      skillMetadata: async () => null,
      documentPrivacy: async () => null,
      nextOutput: async () => null,
      toolLoop: () => true,
      tools: async scope => ({
        enabled: () => true,
        check: async () => {
          assert.equal(scope.contract.authority.status, 'ALLOW');
        },
        readOnly: () => true,
        execute: async () => {
          executions++;
          return 'checked data';
        },
        outgoing: async t => t,
      }),
      recordUsage: (_c, count) => counts.push(count.total),
    };
    const service = new WorkService(
      store,
      harness,
      async () => ({
        context: { cwd: tmpdir(), env: {} },
        adapter: {
          run: async (prompt, _c, context) => {
            calls++;
            context.onUsage?.({ input: 3, output: 2, total: 5 });
            if (calls === 1) throw new Error('PROVIDER_BUSY');
            if (calls === 2) {
              assert.ok(context.system?.includes('host-governed tools'));
              return '```step-tool\n{"tool":"files","input":"a.txt"}\n```';
            }
            assert.ok(prompt.includes('checked data'));
            return 'Completed draft';
          },
        },
      }),
      () => {},
      undefined,
      undefined,
      [0, 0, 0],
    );
    await service.run(session.id, 'Read the local note', '', false, undefined, mode);
    const done = store.session(session.id);
    assert.equal(done.status, 'review');
    assert.equal(calls, 3);
    assert.equal(executions, 1);
    assert.equal(done.usage?.total, 15);
    assert.deepEqual(counts, [5, 5, 5]);
    assert.equal(done.runs?.[0].steps[0].usage?.total, 15);
    assert.equal(done.messages.at(-1)?.text.includes('step-tool'), false);
    if (mode === 'draft') assert.equal(done.proposals[0].text, 'Completed draft');
    store.close();
  }
});
test('toolLoop off leaves validated proposals inert', async () => {
  const store = new Store(':memory:');
  store.put('connection', 'c', { id: 'c', provider: 'openai', ready: true });
  store.put('settings', 'main', { workspace: tmpdir() });
  const session = store.create('c', 'cc');
  let effects = 0;
  const harness: Harness = {
    root: tmpdir(),
    route: async () => ({ routingContract: { mode: 'GENERAL', authority: { status: 'ALLOW' } } }),
    contextPolicy: () => ({ history: 'ignore', carryover: false }),
    privacy: privacy.evaluatePrivacyGate,
    skillMetadata: async () => null,
    documentPrivacy: async () => null,
    nextOutput: async () => null,
    toolLoop: () => false,
    tools: async () => {
      effects++;
      throw new Error('must not run');
    },
  };
  const service = new WorkService(
    store,
    harness,
    async () => ({ context: { cwd: tmpdir(), env: {} }, adapter: { run: async () => '```step-tool\n{"tool":"files","input":"a"}\n```' } }),
    () => {},
  );
  await service.run(session.id, 'Read note', '', false, undefined, 'chat');
  assert.equal(effects, 0);
  assert.equal(store.session(session.id).status, 'review');
  store.close();
});
