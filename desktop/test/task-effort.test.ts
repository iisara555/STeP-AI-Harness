import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { WorkService, type Harness } from '../electron/service';
import { autoEffort, modelOption, taskSize, type TaskSignals } from '../electron/effort';
import { defaultPolicy } from '../electron/policy';
import { Store } from '../electron/store';
import type { Connection } from '../src/types';
const routing: any = await import('../../src/modules/router/service.js');
const boundary: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');
const catalog: any = await import('../../src/modules/skills/catalog.js');
const root = resolve('..');

// Step 5 of the agent-learning plan: the reasoning level follows the size of the task unless the employee picked one.
const base: TaskSignals = { chat: true, text: 'วันลาพักร้อนมีกี่วัน', sourceChars: 0, files: 0, steps: 1, plan: false, revising: false };
const LEVELS = ['low', 'medium', 'high'].map(id => ({ id }));

test('task size: short chat questions are small, documents and follow-ups are medium, big work is large', () => {
  assert.equal(taskSize(base), 'small');
  assert.equal(taskSize({ ...base, chat: false }), 'medium', 'a short draft request still gets normal care');
  assert.equal(taskSize({ ...base, revising: true }), 'medium');
  assert.equal(taskSize({ ...base, files: 1 }), 'medium');
  assert.equal(taskSize({ ...base, text: 'ก'.repeat(400) }), 'medium');
  assert.equal(taskSize({ ...base, steps: 3 }), 'large', 'a Playbook');
  assert.equal(taskSize({ ...base, plan: true }), 'large');
  assert.equal(taskSize({ ...base, text: 'ก'.repeat(1600) }), 'large');
  assert.equal(taskSize({ ...base, chat: false, sourceChars: 25_000 }), 'large');
  assert.equal(taskSize({ ...base, files: 3 }), 'large');
});

test('only levels the model offers are picked; a medium task keeps the model default', () => {
  assert.equal(autoEffort(LEVELS, 'small'), 'low');
  assert.equal(autoEffort(LEVELS, 'medium'), undefined);
  assert.equal(autoEffort(LEVELS, 'large'), 'high');
  assert.equal(autoEffort([{ id: 'medium' }], 'large'), undefined, 'no "high" on this model: use its default');
  assert.equal(autoEffort(undefined, 'small'), undefined, 'a model without levels gets none');
  const models = [
    { id: 'a', label: 'A', efforts: LEVELS },
    { id: 'b', label: 'B', isDefault: true, efforts: [{ id: 'low' }] },
  ];
  assert.equal(modelOption({ model: 'a', models })?.id, 'a');
  assert.equal(modelOption({ model: '', models })?.id, 'b', 'the provider default model when none is chosen');
  assert.equal(modelOption({ model: 'zzz', models }), undefined);
  assert.equal(defaultPolicy().features.autoEffort, true);
});

async function effortsFor(run: { text: string; mode: 'chat' | 'draft'; chosen?: string; auto?: boolean }) {
  const store = new Store(':memory:');
  store.put('connection', 'c', {
    id: 'c',
    provider: 'openai',
    model: 'fixture',
    ready: true,
    models: [{ id: 'fixture', label: 'Fixture', efforts: LEVELS }],
  } as Connection);
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
  const sent: (string | undefined)[] = [];
  const harness: Harness = {
    root,
    route: (query, opts) => routing.queryStepRouter(query, { autoRoute: false, authorityChecks: true, ...opts }),
    contextPolicy: boundary.classifyContextPolicy,
    privacy: privacy.evaluatePrivacyGate,
    skillMetadata: async id => {
      const metadata = await routing.loadSkillContextMetadata(id);
      return { ...metadata, mandatoryReferences: await routing.loadDocumentContextMetadata(metadata.mandatory) };
    },
    documentCatalog: async () => routing.loadDocumentCatalog(),
    catalog: async () => catalog.loadSkillCatalog(root),
    documentPrivacy: async () => null,
    nextOutput: async () => null,
    autoEffort: () => run.auto ?? true,
  };
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async (_prompt, _c, context) => {
          sent.push(context.effort);
          return 'เรียบร้อยครับ';
        },
      },
    }),
    () => {},
  );
  try {
    const session = store.create('c', 'cc');
    if (run.chosen) store.save({ ...session, effort: run.chosen });
    await service.run(session.id, run.text, '', true, undefined, run.mode);
    return { sent, trace: store.session(session.id).runs?.at(-1)?.effort };
  } finally {
    store.close();
  }
}

test('a run sends the level picked by task size, and the employee’s own choice always wins', async () => {
  const small = await effortsFor({ text: 'สวัสดีครับ ช่วยแนะนำตัวหน่อย', mode: 'chat' });
  assert.deepEqual(small.sent, ['low']);
  assert.deepEqual(small.trace, { size: 'small', auto: true, level: 'low' });

  const long = await effortsFor({ text: 'ช่วยวิเคราะห์เรื่องนี้อย่างละเอียด '.repeat(60), mode: 'chat' });
  assert.ok(long.sent.length && long.sent.every(e => e === 'high'));
  assert.equal(long.trace?.size, 'large');

  const chosen = await effortsFor({ text: 'สวัสดีครับ', mode: 'chat', chosen: 'high' });
  assert.deepEqual(chosen.sent, ['high']);
  assert.deepEqual(chosen.trace, { size: 'small', auto: false, level: 'high' });

  const off = await effortsFor({ text: 'สวัสดีครับ', mode: 'chat', auto: false });
  assert.deepEqual(off.sent, [undefined], 'policy autoEffort: false keeps the model default');
});
