import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { Store } from '../electron/store';
import { Learning } from '../electron/learning';
import { learningMetrics } from '../src/learning-metrics';
import { overlap } from '../src/learning-curator';
const privacy: any = await import('../../src/modules/privacy/index.js');

const receipt = {
  name: 'ห้ามเดาเลขภาษี',
  kind: 'procedure',
  trigger: 'ใบเสร็จ,receipt',
  text: 'ถ้าใบเสร็จไม่มีเลขผู้เสียภาษี ให้เขียนว่าไม่พบ ห้ามเดาจากชื่อร้าน',
};
const tone = { name: 'ภาษาสุภาพ', kind: 'preference', trigger: '', text: 'ตอบด้วยภาษาทางการ ลงท้ายด้วยครับ' };
function setup() {
  const store = new Store(':memory:');
  const learning = new Learning(store, tmpdir(), privacy.evaluatePrivacyGate);
  const context = learning.context();
  const confirm = (content: any) => {
    const p = learning.propose(context, { content, evidence: 'คำแก้จากงาน' });
    learning.decide(context, p.id, true);
    return p.lessonId;
  };
  return { store, learning, context, confirm };
}

test('a short correction matches the longer lesson it restates, unrelated or tiny text does not', () => {
  const lesson = [receipt.name, receipt.text].join('\n');
  assert.ok(overlap('ใบเสร็จไม่มีเลขผู้เสียภาษีอีกแล้ว ห้ามเดา', lesson) >= 0.5);
  assert.ok(overlap('สรุปประชุมให้สั้นกว่านี้หน่อย', lesson) < 0.5);
  assert.equal(overlap('ภาษี', lesson), 0, 'too short to judge');
});

test('usage records ids and revisions per turn, a retried turn replaces its record, and nothing bumps the lessons', () => {
  const { learning, confirm } = setup();
  const id = confirm(receipt);
  const generation = learning.snapshot().generation;
  learning.recordUse('s1', 0, learning.relevant('ตรวจใบเสร็จ'));
  learning.recordUse('s1', 0, learning.relevant('ตรวจใบเสร็จ'));
  learning.recordUse('s1', 2, []);
  const usage = learning.usage();
  assert.deepEqual(
    usage.uses.map(u => [u.sessionId, u.index, u.lessons]),
    [
      ['s1', 0, [`${id}@1`]],
      ['s1', 2, []],
    ],
  );
  assert.equal(learning.snapshot().generation, generation, 'recording usage must not abort running tasks');
  assert.doesNotMatch(JSON.stringify(usage), /เลขผู้เสียภาษี/, 'usage stores no lesson text');
});

test('a human correction that restates a lesson in use counts as a repeat; AI drafts, revisions and imports do not', () => {
  const { learning, context, confirm } = setup();
  const id = confirm(receipt);
  confirm(tone);
  assert.deepEqual(learning.noteRepeat('สรุปประชุมให้สั้นกว่านี้หน่อย', 'fix'), []);
  assert.equal(learning.noteRepeat('ใบเสร็จไม่มีเลขผู้เสียภาษีอีกแล้ว ห้ามเดา', 'fix')[0].lessonId, id);
  const typed = learning.propose(context, {
    content: { ...receipt, name: 'เลขภาษีหายอีก', text: 'ใบเสร็จไม่มีเลขผู้เสียภาษี ให้เขียนว่าไม่พบ อย่าเดา' },
    evidence: 'แก้ซ้ำ',
  });
  assert.equal(learning.usage().repeats.length, 2);
  learning.revise(context, typed.id, { ...typed.content, name: 'เลขภาษีหาย' });
  learning.propose(context, { content: { ...receipt, name: 'ร่างจาก AI' }, evidence: 'AI' }, 'ai');
  learning.propose(context, {
    lessonId: id,
    baseRevision: 1,
    content: { ...receipt, text: receipt.text + ' ให้ขอเอกสารเพิ่ม' },
    evidence: 'e',
  });
  assert.equal(learning.usage().repeats.length, 2, 'only the fix note and the typed new lesson count');
});

test('metrics compare answers with and without lessons, per lesson, and list repeated lessons first', () => {
  const lessons = [
    { id: 'a', revisions: [{ revision: 1, content: { ...receipt, kind: 'procedure' as const }, at: '' }] },
    {
      id: 'b',
      revisions: [
        { revision: 1, content: { ...tone, kind: 'preference' as const }, at: '' },
        { revision: 2, content: null, at: '' },
      ],
    },
    { id: 'c', revisions: [{ revision: 1, content: { ...tone, name: 'ไม่เคยใช้', kind: 'preference' as const }, at: '' }] },
  ];
  const uses = [
    { sessionId: 's1', index: 0, at: '2026-10-02T00:00:00Z', lessons: ['a@1', 'b@1'] },
    { sessionId: 's1', index: 2, at: '2026-10-03T00:00:00Z', lessons: ['a@1'] },
    { sessionId: 's2', index: 0, at: '2026-10-01T00:00:00Z', lessons: [] },
    { sessionId: 's2', index: 2, at: '2026-10-04T00:00:00Z', lessons: [] },
  ];
  const ratings: Record<string, 'good' | 'fix' | undefined> = { 's1:0': 'good', 's1:2': 'fix', 's2:0': 'good' };
  const metrics = learningMetrics(
    lessons,
    { uses, repeats: [{ lessonId: 'a', revision: 1, source: 'fix', at: '2026-10-03T01:00:00Z' }] },
    use => ratings[`${use.sessionId}:${use.index}`],
  );
  assert.equal(metrics.since, '2026-10-01T00:00:00Z');
  assert.deepEqual(metrics.withLessons, { answers: 2, good: 1, fix: 1 });
  assert.deepEqual(metrics.withoutLessons, { answers: 2, good: 1, fix: 0 });
  assert.deepEqual(
    metrics.lessons.map(l => [l.id, l.active, l.answers, l.tasks, l.good, l.fix, l.repeats, l.lastUsed ?? null]),
    [
      ['a', true, 2, 1, 1, 1, 1, '2026-10-03T00:00:00Z'],
      ['b', false, 1, 1, 1, 0, 0, '2026-10-02T00:00:00Z'],
      ['c', true, 0, 0, 0, 0, 0, null],
    ],
  );
  assert.equal(metrics.lessons[1].name, tone.name, 'a disabled lesson keeps its last name');
});
