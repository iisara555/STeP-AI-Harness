import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curatorReport, similarity } from '../src/learning-curator';

const lesson = (id: string, name: string, text: string, kind: 'preference' | 'procedure' = 'preference', trigger = '') => ({
  id,
  revisions: [{ revision: 1, content: { name, kind, trigger, text }, at: '2026-01-01T00:00:00Z' }],
});

test('the health report flags duplicates, shared triggers, stale proposals, long lessons and a full store, and changes nothing', () => {
  const state = {
    lessons: [
      lesson('a', 'ห้ามเดาเลขภาษี', 'ถ้าใบเสร็จไม่มีเลขผู้เสียภาษี ให้เขียนว่าไม่พบ ห้ามเดาจากชื่อร้าน'),
      lesson('b', 'เลขภาษีหาย', 'ถ้าใบเสร็จไม่มีเลขผู้เสียภาษี ให้เขียนว่าไม่พบ ห้ามเดาจากชื่อร้านค้า'),
      lesson('c', 'ตรวจยอด', 'รวมยอดทุกรายการแล้วเทียบกับยอดสุทธิ', 'procedure', 'ใบเสร็จ,receipt'),
      lesson('d', 'ตรวจวันที่', 'วันที่ต้องอยู่ในปีงบประมาณ', 'procedure', 'ใบเสร็จ'),
      lesson('e', 'ยาว', 'ก'.repeat(2500)),
      { id: 'f', revisions: [{ revision: 2, content: null, at: '' }] },
    ],
    candidates: [
      {
        id: 'x',
        lessonId: 'x',
        baseRevision: 0,
        content: { name: 'เก่า', kind: 'preference', trigger: '', text: 't' },
        evidence: 'e',
        source: 'review',
        at: '2026-01-01T00:00:00Z',
        status: 'pending',
      },
      {
        id: 'y',
        lessonId: 'y',
        baseRevision: 0,
        content: { name: 'ใหม่', kind: 'preference', trigger: '', text: 't' },
        evidence: 'e',
        source: 'ai',
        at: '2026-03-01T00:00:00Z',
        status: 'pending',
      },
    ],
  } as any;
  const before = JSON.stringify(state);
  const findings = curatorReport(state, Date.parse('2026-03-05T00:00:00Z'));
  assert.equal(JSON.stringify(state), before, 'report only');
  assert.ok(findings.some(f => f.kind === 'duplicate' && f.lessons.includes('ห้ามเดาเลขภาษี') && f.lessons.includes('เลขภาษีหาย')));
  assert.ok(findings.some(f => f.kind === 'sharedTrigger' && f.words.includes('ใบเสร็จ')));
  assert.deepEqual(
    findings.filter(f => f.kind === 'stalePending').map(f => (f as any).candidate),
    ['เก่า'],
  );
  assert.ok(findings.some(f => f.kind === 'long' && f.lesson === 'ยาว'));
  // A disabled lesson is not compared, and nothing is flagged for being old or unused.
  assert.equal(findings.filter(f => f.kind === 'duplicate').length, 1);
  assert.ok(similarity('ห้ามเดา', 'ห้ามเดา') === 1 && similarity('', 'x') === 0);
  const full = curatorReport({
    lessons: Array.from({ length: 80 }, (_, i) => lesson(String(i), 'n' + i, 'unique text ' + i * 7919)),
    candidates: [],
  } as any);
  assert.ok(full.some(f => f.kind === 'capacity' && f.what === 'lessons'));
});
