import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../electron/store';
import { Memories, memoryMarkdown, parseMemory, stableMemory } from '../electron/memory';
import { Learning } from '../electron/learning';
import { defaultPolicy } from '../electron/policy';
const privacy: any = await import('../../src/modules/privacy/index.js');
const scan = privacy.evaluatePrivacyGate;

// rules/learning-and-verification.md: every memory says where it came from; short-lived facts are not kept.
async function fixture(t: any) {
  const dir = await mkdtemp(join(tmpdir(), 'step-memory-provenance-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new Store(':memory:'),
    policy = defaultPolicy();
  store.put('settings', 'main', { workspace: '', team: 'cc' });
  return { dir, store, memories: new Memories(store, dir, () => policy, scan) };
}
const entry = (text: string, name = 'Style') => ({ name, text, type: 'user', scope: 'private', importance: 0.7, ttl_days: 0 });

test('a typed memory is recorded as typed by the employee, with its date', async t => {
  const { dir, memories } = await fixture(t);
  const saved = await memories.save({ ...entry('Prefer concise responses.'), origin: 'feedback', origin_session: 'forged' });
  assert.equal(saved.origin, 'manual', 'the renderer cannot choose the origin');
  assert.equal(saved.origin_session, undefined);
  const file = await readFile(join(dir, 'memory', saved.id + '.md'), 'utf8');
  assert.match(file, /^origin: "manual"$/m);
  assert.ok(Number.isFinite(Date.parse(saved.created_at)));
});

test('a confirmed proposal keeps the task and the words it came from, and an edit keeps them', async t => {
  const { memories } = await fixture(t);
  const proposal = memories.proposeFeedback('session-1', 'Use tables for comparisons.');
  const saved = await memories.confirm(proposal.id, {});
  assert.equal(saved.origin, 'feedback');
  assert.equal(saved.origin_session, 'session-1');
  assert.equal(saved.origin_evidence, 'Use tables for comparisons.');
  const [listed] = await memories.list();
  assert.equal(listed.origin_session, 'session-1');
  const edited = await memories.save({ ...listed, text: 'Use tables when comparing options.' });
  assert.equal(edited.origin, 'feedback');
  assert.equal(edited.origin_session, 'session-1');
  assert.equal(edited.created_at, listed.created_at);
});

test('a memory file written before origins existed still loads, without a source', async t => {
  const { dir, memories } = await fixture(t);
  const saved = await memories.save(entry('Respond in Thai.'));
  const path = join(dir, 'memory', saved.id + '.md');
  await writeFile(path, (await readFile(path, 'utf8')).replace(/^origin: "manual"\n/m, ''));
  const [listed] = await memories.list();
  assert.equal(listed.text, 'Respond in Thai.');
  assert.equal(listed.origin, undefined);
  const round = parseMemory(memoryMarkdown({ ...listed, origin: 'chat', origin_evidence: 'ตอบสั้น ๆ' }));
  assert.equal(round.origin, 'chat');
  assert.equal(round.origin_evidence, 'ตอบสั้น ๆ');
});

test('short-lived facts are refused as memory, as feedback and as new lessons', async t => {
  for (const text of [
    'แก้ PR #190 เสร็จแล้ว',
    'See https://github.com/x/y/pull/42 for the fix',
    'CI run 38921477004 failed on Windows',
    '2026-10-16 15:08:27 ERROR build failed',
    'Traceback (most recent call last):\n  File "x.py", line 1',
    'ตอนนี้กำลังแก้หน้าร่างเอกสาร',
    'งานค้างอยู่ที่ขั้นทดสอบ',
    'WIP: memory provenance',
  ])
    assert.throws(() => stableMemory(text), /MEMORY_EPHEMERAL/, text);
  for (const text of [
    'Respond in Thai.',
    'ตอบสั้นและใช้ตารางเมื่อเปรียบเทียบ',
    'อยากให้รายงานความคืบหน้าทุกเย็น',
    'Before a release, check the newest main and published versions.',
    'Releases build Windows x64 and macOS Apple silicon only.',
    'ถ้ากำลังทำงานยาวให้แจ้งสถานะเป็นระยะ',
  ])
    assert.equal(stableMemory(text), text);

  const { store, memories } = await fixture(t);
  await assert.rejects(memories.save(entry('PR #190 is waiting on review')), /MEMORY_EPHEMERAL/);
  assert.throws(() => memories.proposeFeedback('s1', 'run 38921477004 failed'), /MEMORY_EPHEMERAL/);
  const learning = new Learning(store, tmpdir(), scan);
  assert.throws(
    () =>
      learning.propose(learning.context(), {
        content: { name: 'Status', kind: 'preference', trigger: '', text: 'ตอนนี้กำลังแก้ PR #190' },
        evidence: 'from chat',
      }),
    /MEMORY_EPHEMERAL/,
  );
  learning.propose(learning.context(), {
    content: { name: 'Style', kind: 'preference', trigger: '', text: 'ตอบสั้นและใช้ตาราง' },
    evidence: 'ตอบสั้นๆ ใช้ตาราง',
  });
  assert.equal(learning.snapshot().candidates.length, 1);
});
