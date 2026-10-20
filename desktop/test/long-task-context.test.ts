import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compact } from '../electron/compact';
import { section } from '../electron/prompt';
import { Store } from '../electron/store';
import { WorkService, type Harness } from '../electron/service';
import type { SummaryCheckpoint } from '../src/types';
const boundary: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');
const routing: any = await import('../../src/modules/router/service.js');
const root = fileURLToPath(new URL('../../', import.meta.url));

test('committed summaries are reused for identical history and invalidated for changed history', async () => {
  let checkpoint: SummaryCheckpoint | undefined;
  const calls: string[] = [];
  const messages = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 ? 'assistant' : 'user',
    text: `Turn ${i}: ` + 'synthetic history '.repeat(250),
  }));
  const run = () =>
    compact(section('conversation', JSON.stringify(messages)) + section('current_message', 'continue'), {
      system: 'Synthetic governance',
      state: 'goal and pending tasks',
      budget: 3500,
      checkpoint,
      signal: new AbortController().signal,
      privacy: value => value,
      summarize: async value => {
        calls.push(value);
        return 'Retained synthetic decisions';
      },
      retain: value => {
        checkpoint = value;
      },
    });
  await run();
  const first = calls.length;
  assert.ok(first > 0);
  assert.equal(checkpoint?.covered, 18);
  await run();
  assert.equal(calls.length, first, 'no repeated summarizer provider calls');
  messages.push({ role: 'user', text: 'New request' }, { role: 'assistant', text: 'New result' });
  await run();
  assert.ok(calls.length > first);
  assert.match(calls[first], /Retained synthetic decisions/);
  messages[0].text = 'Changed source history';
  const before = calls.length;
  await run();
  assert.ok(calls.slice(before).some(text => text.includes('Changed source history')));
});

test('a failed compaction cannot commit a replacement checkpoint', async () => {
  let commits = 0;
  await assert.rejects(
    compact(section('conversation', JSON.stringify(Array.from({ length: 8 }, () => ({ role: 'user', text: 'large '.repeat(2000) })))), {
      system: '',
      state: '',
      budget: 10,
      signal: new AbortController().signal,
      privacy: value => value,
      summarize: async () => {
        throw Error('PROVIDER_QUOTA');
      },
      retain: () => {
        commits++;
      },
    }),
    /PROVIDER_QUOTA/,
  );
  assert.equal(commits, 0);
});

function planFixture(count: number, advance: boolean, reported = 12) {
  const store = new Store(':memory:');
  store.put('connection', 'test', { id: 'test', provider: 'openai', model: 'synthetic', ready: true });
  const session = store.create('test', 'cc');
  session.workPlan = {
    goal: 'Synthetic bounded plan',
    approvedAt: 'confirmed',
    tasks: Array.from({ length: count }, (_, i) => ({ title: `Task ${i}`, status: 'todo' })),
  };
  store.save(session);
  let calls = 0,
    effects = 0;
  const harness: Harness = {
    root,
    route: (query, options) => routing.queryStepRouter(query, { ...options, autoRoute: false, disableMemory: true, workspaceDir: root }),
    contextPolicy: boundary.classifyContextPolicy,
    privacy: privacy.evaluatePrivacyGate,
    skillMetadata: async () => null,
    documentPrivacy: async () => null,
    nextOutput: async () => null,
    toolLoop: () => reported > 50000,
    tools: async () => ({
      enabled: () => true,
      readOnly: () => true,
      check: async () => {},
      outgoing: async text => text,
      execute: async () => {
        effects++;
        return '';
      },
    }),
  };
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: process.cwd(), env: {} },
      adapter: {
        run: async (_p, _c, context) => {
          calls++;
          if (advance) {
            // Stand-in for the existing plan_update host tool; the continuation reads the persisted result.
            const current = store.session(session.id),
              task = current.workPlan!.tasks.find(t => t.status !== 'done');
            if (task) task.status = 'done';
            store.save(current);
          }
          context.onUsage?.({ input: reported - 2, output: 2, total: reported });
          return reported > 50000 ? '```step-tool\n{"tool":"files","input":"synthetic.txt"}\n```' : 'Synthetic verified task result';
        },
      },
    }),
    () => {},
    undefined,
    undefined,
    [],
  );
  return { store, session, service, calls: () => calls, effects: () => effects };
}

test('approved plans continue using persisted progress and stop at completion or their round budget', async () => {
  for (const count of [2, 5]) {
    const f = planFixture(count, true);
    try {
      await f.service.run(f.session.id, 'ลงมือทำตามแผน', '', true, undefined, 'chat', undefined, [], {
        workflow: 'execute',
        autoContinue: true,
      });
      const done = f.store.session(f.session.id);
      assert.equal(f.calls(), Math.min(count, 3), JSON.stringify(done.runs));
      assert.equal(done.longTask?.status, count === 2 ? 'completed' : 'budget');
      assert.equal(done.workPlan?.tasks.filter(t => t.status === 'done').length, Math.min(count, 3));
    } finally {
      f.store.close();
    }
  }
});

test('no progress pauses instead of looping, and spent token admission runs no further tools', async () => {
  for (const spent of [false, true]) {
    const f = planFixture(3, false, spent ? 60000 : 12);
    try {
      await f.service.run(f.session.id, 'ลงมือทำตามแผน', '', true, undefined, 'chat', undefined, [], {
        workflow: 'execute',
        autoContinue: true,
      });
      const done = f.store.session(f.session.id);
      assert.equal(f.calls(), 1);
      assert.equal(f.effects(), 0);
      assert.equal(done.longTask?.status, spent ? 'budget' : 'paused');
      assert.equal(done.longTask?.reason, spent ? 'budget' : 'no-progress');
    } finally {
      f.store.close();
    }
  }
});

test('reopening a task retains progress and summary but never replays interrupted work', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-long-context-'));
  try {
    const path = join(dir, 'state.sqlite');
    let store = new Store(path);
    const s = store.create('synthetic', 'cc');
    s.contextCheckpoint = { covered: 3, prefixHash: 'synthetic', text: 'Retained synthetic summary' };
    s.longTask = { status: 'running', rounds: 1, maxRounds: 3, maxTokens: 50000, maxMs: 600000, startedAt: new Date().toISOString() };
    s.sideQuestions = [{ id: 'synthetic', question: 'Question', revision: 0, status: 'running', at: new Date().toISOString() }];
    store.save(s);
    store.close();
    store = new Store(path);
    const done = store.session(s.id);
    assert.equal(done.longTask?.status, 'interrupted');
    assert.equal(done.sideQuestions?.[0].status, 'error');
    assert.equal(done.contextCheckpoint?.text, 'Retained synthetic summary');
    store.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
