import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { Store } from '../electron/store';
import { WorkService, MAX_PARALLEL_RUNS, type Harness } from '../electron/service';
import { Coordinator, dependencyWaves, playbookTasks, type Subtask } from '../electron/coordinator';
import { Automations, nextCron } from '../electron/cron';
import { defaultPolicy } from '../electron/policy';
const { evaluatePrivacyGate }: any = await import('../../src/modules/privacy/index.js');
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const route = async () => ({ routingContract: { mode: 'GENERAL', authority: { status: 'ALLOW' }, mandatoryReferences: [] } });
function fixture() {
  const store = new Store(':memory:'),
    policy = defaultPolicy();
  store.put('connection', 'c', { id: 'c', provider: 'openai', model: 'synthetic', ready: true });
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc', assistant: 'test' });
  policy.features.coordinator = policy.features.cron = true;
  return { store, policy };
}
test('dependency waves preserve explicit data dependencies, versioned outputs and undeclared barriers', () => {
  const tasks = playbookTasks([
    { id: 'a', description: 'First', consumes: [], produces: ['x'] },
    { id: 'b', description: 'Second', consumes: [], produces: ['y'] },
    { id: 'c', description: 'Revise', consumes: ['x'], produces: ['x'] },
    { id: 'd', description: 'Merge', consumes: ['x', 'y'], produces: ['z'] },
  ]);
  assert.deepEqual(
    dependencyWaves(tasks).map(w => w.map(t => t.id)),
    [['a', 'b'], ['c'], ['d']],
  );
  assert.deepEqual(playbookTasks([{ description: 'Unknown' }, { description: 'Known', consumes: [], produces: [] }])[1].dependsOn, [
    'step-1',
  ]);
  assert.throws(() => dependencyWaves([{ id: 'a', query: 'Q', dependsOn: ['a'] }]), /DEPENDENCY_CYCLE/);
  assert.throws(() => dependencyWaves([{ id: 'a', query: 'Q', dependsOn: ['missing'] }]), /PLAN_INVALID/);
  assert.throws(() => playbookTasks([{ type: 'action', description: 'Publish' }]), /AUTHORITY_REVIEW_REQUIRED/);
});
test('coordinator runs three actual WorkService calls concurrently and merges only after dependencies finish', async () => {
  const { store, policy } = fixture(),
    parent = store.create('c', 'cc');
  const tasks: Subtask[] = ['a', 'b', 'c', 'd'].map(id => ({ id, query: `TASK_${id}`, dependsOn: [] }));
  tasks.push({ id: 'e', query: 'TASK_e', dependsOn: ['a', 'd'] });
  let active = 0,
    peak = 0,
    tools = 0,
    contexts = 0,
    merge = false;
  const finished = new Set<string>();
  const harness: Harness = {
    root: tmpdir(),
    route,
    contextPolicy: () => ({ history: 'ignore', carryover: false }),
    privacy: evaluatePrivacyGate,
    skillMetadata: async () => null,
    documentPrivacy: async () => null,
    nextOutput: async () => null,
    toolLoop: () => true,
    tools: async () => {
      tools++;
      throw new Error('should remain draft-only');
    },
    extraContext: async () => {
      contexts++;
      return { text: '', loaded: [] };
    },
  };
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async prompt => {
          if (prompt.includes('Decompose the request')) return JSON.stringify({ tasks });
          const id = /TASK_([a-e])/.exec(prompt)?.[1];
          if (id) {
            if (id === 'e') assert.ok(finished.has('a') && finished.has('d'));
            active++;
            peak = Math.max(peak, active);
            await pause(45);
            active--;
            finished.add(id);
            return `RESULT_${id}`;
          }
          assert.equal(finished.size, 5);
          assert.ok(prompt.includes('RESULT_e'));
          merge = true;
          return 'Merged draft';
        },
      },
    }),
    () => {},
  );
  const coordinator = new Coordinator(
    store,
    service,
    () => policy,
    () => 'stable',
    async () => true,
    route,
    () => {},
  );
  try {
    await coordinator.run(parent.id, 'Prepare a bounded synthetic summary.', 'Public source');
    assert.equal(peak, MAX_PARALLEL_RUNS);
    assert.equal(tools, 0);
    assert.equal(contexts, 0);
    assert.ok(merge);
    assert.equal(store.session(parent.id).proposals[0].text, 'Merged draft');
    const children = store.list<any>('session').filter(s => s.parentId === parent.id);
    assert.equal(children.length, 6);
    assert.ok(children.every(s => s.connectionId === 'c' && !s.allowedIdentifiers));
  } finally {
    await coordinator.closeAndWait();
    await service.closeAndWait();
    store.close();
  }
});
test('coordinator declined plan does not execute subtasks; authority denial starts no provider', async () => {
  const { store, policy } = fixture(),
    parent = store.create('c', 'cc');
  let calls = 0;
  const service = new WorkService(
    store,
    {
      root: tmpdir(),
      route,
      contextPolicy: () => ({ history: 'ignore', carryover: false }),
      privacy: evaluatePrivacyGate,
      skillMetadata: async () => null,
      documentPrivacy: async () => null,
      nextOutput: async () => null,
    },
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async () => {
          calls++;
          return '{"tasks":[{"id":"a","query":"Draft only","dependsOn":[]}]}';
        },
      },
    }),
    () => {},
  );
  const coordinator = new Coordinator(
    store,
    service,
    () => policy,
    () => '',
    async () => false,
    route,
    () => {},
  );
  await assert.rejects(coordinator.run(parent.id, 'Prepare a synthetic draft', ''), /CANCELLED/);
  assert.equal(calls, 1);
  const blocked = new Coordinator(
    store,
    service,
    () => policy,
    () => '',
    async () => true,
    async () => ({ routingContract: { mode: 'BLOCK', authority: { status: 'BLOCK' } } }),
    () => {},
  );
  await assert.rejects(blocked.run(parent.id, 'Prepare a draft', ''), /AUTHORITY_REVIEW_REQUIRED/);
  assert.equal(calls, 1);
  store.close();
});
test('coordinator rejects changed context after plan consent before executing children', async () => {
  const { store, policy } = fixture(),
    parent = store.create('c', 'cc');
  let identity = 'original',
    calls = 0;
  const service = new WorkService(
    store,
    {
      root: tmpdir(),
      route,
      contextPolicy: () => ({ history: 'ignore', carryover: false }),
      privacy: evaluatePrivacyGate,
      skillMetadata: async () => null,
      documentPrivacy: async () => null,
      nextOutput: async () => null,
    },
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async () => {
          calls++;
          return '{"tasks":[{"id":"a","query":"Draft only","dependsOn":[]}]}';
        },
      },
    }),
    () => {},
  );
  const coordinator = new Coordinator(
    store,
    service,
    () => policy,
    id => {
      assert.equal(id, parent.id);
      return identity;
    },
    async () => {
      identity = 'changed';
      return true;
    },
    route,
    () => {},
  );
  try {
    await assert.rejects(coordinator.run(parent.id, 'Prepare a synthetic draft', ''), /WORKSPACE_CHANGED/);
    assert.equal(calls, 1);
  } finally {
    await coordinator.closeAndWait();
    await service.closeAndWait();
    store.close();
  }
});
test('cron validates UTC syntax, leap dates and DOM/DOW semantics', () => {
  assert.equal(new Date(nextCron('0 2 * * 1-5', Date.parse('2026-10-02T02:00:00Z'))).toISOString(), '2026-10-05T02:00:00.000Z');
  assert.equal(new Date(nextCron('*/15 * * * *', Date.parse('2026-09-30T00:01:00Z'))).toISOString(), '2026-09-30T00:15:00.000Z');
  assert.throws(() => nextCron('60 * * * *', Date.now()), /CRON_INVALID/);
  assert.throws(() => nextCron('* * 31 2 *', Date.now()), /CRON_INVALID/);
  assert.throws(() => nextCron('bad', Date.now()), /CRON_INVALID/);
});
test('automations persist CRUD/history, serialize background runs, cancel queued work and reject changed context', async () => {
  const { store, policy } = fixture();
  let now = Date.parse('2026-09-30T00:00:00Z'),
    active = 0,
    peak = 0;
  const queue = new Automations(
    store,
    () => policy,
    evaluatePrivacyGate,
    async (_job, signal) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 40);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
      active--;
      return 'draft-session';
    },
    () => {},
    () => now,
  );
  const a = queue.save({ name: 'A', query: 'Prepare a public draft', schedule: '* * * * *', connectionId: 'c', enabled: true });
  const b = queue.save({ name: 'B', query: 'Prepare a public draft', schedule: '* * * * *', connectionId: 'c', enabled: true });
  assert.equal(queue.save({ ...a, enabled: false }).id, a.id);
  assert.equal(queue.list().length, 2);
  queue.enqueue(a.id);
  queue.enqueue(b.id);
  queue.cancel(b.id);
  await pause(65);
  assert.equal(peak, 1);
  assert.equal(queue.history(a.id)[0].status, 'review');
  assert.equal(queue.history(b.id)[0].status, 'cancelled');
  store.put('settings', 'main', { ...store.settings(), team: 'mi' });
  queue.enqueue(a.id);
  await pause(10);
  assert.equal(
    queue.history(a.id).some(r => r.code === 'AUTOMATION_CONTEXT_CHANGED'),
    true,
  );
  assert.throws(
    () => queue.save({ name: 'Bad', query: 'person@example.test', schedule: '* * * * *', connectionId: 'c' }),
    /PRIVACY_REVIEW_REQUIRED/,
  );
  now += 60000;
  queue.remove(b.id);
  assert.equal(queue.list().length, 1);
  await queue.closeAndWait();
  store.close();
});
test('restart interrupts stale runs, advances overdue schedules and never replays them', () => {
  const { store, policy } = fixture(),
    now = Date.now();
  store.put('automation', 'a', {
    id: 'a',
    name: 'A',
    query: 'Draft',
    schedule: '* * * * *',
    enabled: true,
    nextAt: now - 60000,
    running: 'r',
  });
  store.put('automation-run', 'r', { id: 'r', automationId: 'a', status: 'running', at: new Date().toISOString() });
  let calls = 0;
  const queue = new Automations(
    store,
    () => policy,
    evaluatePrivacyGate,
    async () => {
      calls++;
      return '';
    },
    () => {},
    () => now,
  );
  queue.tick();
  assert.equal(calls, 0);
  assert.equal(queue.history()[0].status, 'interrupted');
  assert.ok(queue.list()[0].nextAt > now);
  queue.stop();
  store.close();
});
test('WorkService claims the global three-run capacity and cancellation frees it', async () => {
  const { store } = fixture();
  let calls = 0;
  const sessions = Array.from({ length: 4 }, () => store.create('c', 'cc'));
  const service = new WorkService(
    store,
    {
      root: tmpdir(),
      route,
      contextPolicy: () => ({ history: 'ignore', carryover: false }),
      privacy: evaluatePrivacyGate,
      skillMetadata: async () => null,
      documentPrivacy: async () => null,
      nextOutput: async () => null,
    },
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async (_p, _c, context) => {
          calls++;
          await new Promise<void>(resolve => context.signal.addEventListener('abort', () => resolve(), { once: true }));
          return 'Cancelled draft';
        },
      },
    }),
    () => {},
  );
  const pending = sessions
    .slice(0, 3)
    .map(s => service.run(s.id, 'Prepare a synthetic draft', '', true, undefined, 'draft', undefined, [], { draftOnly: true }));
  await pause(25);
  assert.equal(calls, 3);
  assert.equal(service.activeCount(), 3);
  await assert.rejects(service.run(sessions[3].id, 'Prepare draft', '', true), /RUN_LIMIT/);
  service.cancelAll();
  await Promise.allSettled(pending);
  assert.equal(service.activeCount(), 0);
  store.close();
});
