import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../electron/store';
import { Memories } from '../electron/memory';
import { Learning } from '../electron/learning';
import { defaultPolicy } from '../electron/policy';
import { personal } from '../electron/service';
const privacy: any = await import('../../src/modules/privacy/index.js');
const scan = privacy.evaluatePrivacyGate;

async function home(t: any) {
  const dir = await mkdtemp(join(tmpdir(), 'step-memory-integrity-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('a 4,000-character Thai memory that saves also lists', async t => {
  const dir = await home(t);
  const store = new Store(':memory:'),
    policy = defaultPolicy();
  store.put('settings', 'main', { workspace: '', team: 'cc' });
  const memories = new Memories(store, dir, () => policy, scan);
  const text = 'ตอบสั้นและสุภาพ'.repeat(300).slice(0, 4000);
  const saved = await memories.save({ name: 'สไตล์'.repeat(24), text, type: 'user', scope: 'private', importance: 0.7, ttl_days: 0 });
  assert.ok((await stat(join(dir, 'memory', saved.id + '.md'))).size > 12_000);
  const listed = await memories.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].text, text);
});

test('deleting a memory while the workspace switches never deletes in the new workspace', async t => {
  const dir = await home(t),
    a = join(dir, 'a'),
    b = join(dir, 'b');
  await mkdir(a);
  await mkdir(b);
  const store = new Store(':memory:'),
    policy = defaultPolicy();
  store.put('settings', 'main', { workspace: a, team: 'cc' });
  const memories = new Memories(store, join(dir, 'data'), () => policy, scan);
  await mkdir(join(dir, 'data'));
  const saved = await memories.save({
    name: 'Plan',
    text: 'Present a plan first.',
    type: 'project',
    scope: 'project',
    importance: 0.5,
    ttl_days: 0,
  });
  // A copied workspace carries the same memory file name.
  await mkdir(join(b, '.step', 'memory'), { recursive: true });
  await copyFile(join(a, '.step', 'memory', saved.id + '.md'), join(b, '.step', 'memory', saved.id + '.md'));
  const list = memories.list.bind(memories);
  memories.list = async () => {
    const entries = await list();
    store.put('settings', 'main', { workspace: b, team: 'cc' });
    return entries;
  };
  await assert.rejects(memories.remove(saved.id), /WORKSPACE_CHANGED/);
  assert.deepEqual(await readdir(join(b, '.step', 'memory')), [saved.id + '.md']);
});

test('saving or deleting a memory changes its version; a repeated confirmation saves once', async t => {
  const dir = await home(t);
  const store = new Store(':memory:'),
    policy = defaultPolicy();
  store.put('settings', 'main', { workspace: '', team: 'cc' });
  const memories = new Memories(store, dir, () => policy, scan);
  const before = memories.version;
  const saved = await memories.save({
    name: 'Style',
    text: 'Prefer concise responses.',
    type: 'user',
    scope: 'private',
    importance: 0.7,
    ttl_days: 0,
  });
  assert.notEqual(memories.version, before);
  const afterSave = memories.version;
  await memories.remove(saved.id);
  assert.notEqual(memories.version, afterSave);

  const proposal = memories.proposeFeedback('s1', 'Use tables for comparisons.');
  const results = await Promise.allSettled([memories.confirm(proposal.id, {}), memories.confirm(proposal.id, {})]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await memories.list()).length, 1);
});

test('a lesson can be turned off when the learning history is at its size cap', async () => {
  const store = new Store(':memory:');
  const learning = new Learning(store, tmpdir(), scan);
  const context = learning.context();
  const lesson = {
    id: '00000000-0000-4000-8000-000000000001',
    revisions: [
      {
        revision: 1,
        content: { name: 'Style', kind: 'preference', trigger: '', text: 'Prefer tables.' },
        candidateId: 'c1',
        at: new Date().toISOString(),
      },
    ],
  };
  const padding = {
    id: '00000000-0000-4000-8000-000000000002',
    revisions: [{ revision: 1, content: null, restoredFrom: 0, at: new Date().toISOString(), pad: '' }],
  };
  const state: any = { generation: 1, candidates: [], lessons: [lesson, padding] };
  padding.revisions[0].pad = 'x'.repeat(8_000_000 - 40 - Buffer.byteLength(JSON.stringify(state)));
  store.put('learning', context, state);
  learning.restore(context, lesson.id, 1, 0);
  const head = learning.snapshot().lessons[0].revisions.at(-1);
  assert.equal(head?.content, null);
  // Turning one back on still respects the cap.
  assert.throws(() => learning.restore(context, lesson.id, 2, 1), /LEARNING_LIMIT/);
});

test('a 300-character custom conversation style reaches the prompt whole', () => {
  const tone = 'ตอบเป็นข้อ'.repeat(30);
  const [line] = personal({ personality: 'custom', assistantTone: tone });
  assert.ok(line.includes(tone));
});

test('chat language is independent of UI language and explicit user requests keep precedence', () => {
  assert.deepEqual(personal({ chatLanguage: 'auto' }), personal({}));
  assert.match(personal({ chatLanguage: 'en' }).join('\n'), /Preferred language for chat replies: English/);
  assert.match(personal({ chatLanguage: 'th' }).join('\n'), /Preferred language for chat replies: Thai/);
  assert.match(personal({ chatLanguage: 'en' }).join('\n'), /different language explicitly requested by the user/);
});

// Synthetic memories written straight to the folder, dated in the past so later edits always get a newer time.
async function seed(dir: string, count: number) {
  const { memoryMarkdown } = await import('../electron/memory');
  const { randomUUID } = await import('node:crypto');
  const { writeFile } = await import('node:fs/promises');
  await mkdir(join(dir, 'memory'), { recursive: true });
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = randomUUID();
    ids.push(id);
    const at = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
    await writeFile(
      join(dir, 'memory', id + '.md'),
      memoryMarkdown({
        schema_version: 1,
        id,
        name: `Synthetic note ${i}`,
        text: `Synthetic stable preference number ${i}.`,
        type: 'user',
        scope: 'private',
        importance: 0.5,
        ttl_days: 0,
        created_at: at,
        updated_at: at,
        source: 'user-confirmed',
      }),
    );
  }
  return ids;
}
const fresh = (i: number) => ({
  name: `New note ${i}`,
  text: `Another stable preference ${i}.`,
  type: 'user',
  scope: 'private',
  importance: 0.5,
  ttl_days: 0,
});

test('saving memories at the same time never goes past 200, and every saved memory lists', async t => {
  const dir = await home(t);
  const store = new Store(':memory:'),
    policy = defaultPolicy();
  store.put('settings', 'main', { workspace: '', team: 'cc' });
  const memories = new Memories(store, dir, () => policy, scan);
  await seed(dir, 199);
  const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => memories.save(fresh(i))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  for (const r of results) if (r.status === 'rejected') assert.equal(r.reason.message, 'MEMORY_LIMIT');
  assert.equal((await readdir(join(dir, 'memory'))).filter(f => f.endsWith('.md')).length, 200);
  assert.equal((await memories.list()).length, 200);
});

test('a folder that already holds more than 200 memories lists all of them', async t => {
  const dir = await home(t);
  const store = new Store(':memory:'),
    policy = defaultPolicy();
  store.put('settings', 'main', { workspace: '', team: 'cc' });
  const memories = new Memories(store, dir, () => policy, scan);
  const ids = await seed(dir, 209);
  const listed = await memories.list();
  assert.equal(listed.length, 209);
  assert.deepEqual(listed.map(m => m.id).sort(), [...ids].sort());
  // Each one can be removed to get back under the limit, and new saves stay refused until then.
  await assert.rejects(memories.save(fresh(0)), /MEMORY_LIMIT/);
  await Promise.all(ids.slice(0, 10).map(id => memories.remove(id)));
  assert.equal((await memories.list()).length, 199);
  await memories.save(fresh(1));
  assert.equal((await memories.list()).length, 200);
});

test('two edits of the same memory: the second one reports MEMORY_CONFLICT instead of overwriting', async t => {
  const dir = await home(t);
  const store = new Store(':memory:'),
    policy = defaultPolicy();
  store.put('settings', 'main', { workspace: '', team: 'cc' });
  const memories = new Memories(store, dir, () => policy, scan);
  await seed(dir, 1);
  const [entry] = await memories.list();
  const results = await Promise.allSettled([
    memories.save({ ...entry, text: 'First edit of the synthetic preference.' }),
    memories.save({ ...entry, text: 'Second edit of the synthetic preference.' }),
  ]);
  assert.deepEqual(
    results.map(r => (r.status === 'fulfilled' ? 'ok' : r.reason.message)),
    ['ok', 'MEMORY_CONFLICT'],
  );
  const [after] = await memories.list();
  assert.equal(after.text, 'First edit of the synthetic preference.');
  // Editing from the latest version works.
  await memories.save({ ...after, text: 'Third edit of the synthetic preference.' });
  assert.equal((await memories.list())[0].text, 'Third edit of the synthetic preference.');
});
