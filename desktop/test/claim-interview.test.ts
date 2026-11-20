import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPENSE_TYPES,
  answeredQuestions,
  applyAnswer,
  applyClaimSummary,
  claimAiPrompt,
  claimSummary,
  expenseFromText,
  nextQuestion,
  parseAnswer,
  questionView,
  undoLast,
  type ClaimAnswers,
} from '../src/claim-interview';
import { createReceiptPacket } from '../src/receipt-packet';
import { loadEnglish, setLanguage, t } from '../src/i18n';

before(() => loadEnglish());
const now = '2026-11-20T00:00:00Z';
const answerAll = (pairs: [string, string][]) =>
  pairs.reduce<ClaimAnswers>((answers, [id, value]) => applyAnswer(answers, id as never, value), {});

test('questions come one at a time and the receipt date is asked only once paid', () => {
  let answers: ClaimAnswers = {};
  assert.equal(nextQuestion(answers), 'expense');
  answers = answerAll([
    ['expense', 'water'],
    ['activity', 'meeting'],
    ['paid', 'no'],
    ['funding', 'advance'],
    ['amount', 'unknown'],
  ]);
  assert.equal(nextQuestion(answers), null, 'not paid: no receipt date to ask');
  answers = applyAnswer(undoLast(undoLast(undoLast(answers))), 'paid', 'yes');
  assert.deepEqual(answeredQuestions(answers), ['expense', 'activity', 'paid']);
  assert.equal(nextQuestion(answers), 'funding');
  assert.throws(() => applyAnswer(answers, 'funding', 'credit-card'), /INVALID_INPUT/);
});

test('typed answers are read locally and an unclear one is not guessed', () => {
  assert.equal(parseAnswer('expense', 'ค่าน้ำดื่มสำหรับประชุม'), 'water');
  assert.equal(parseAnswer('expense', 'จ้างเหมารถตู้ไปดูงาน'), 'vehicle');
  assert.equal(parseAnswer('expense', 'ค่าอาหารและค่าที่พัก'), null, 'two expense types: ask again');
  assert.equal(parseAnswer('paid', 'ยังไม่ได้จ่ายครับ'), 'no');
  assert.equal(parseAnswer('funding', 'ออกเงินตัวเองไปก่อน'), 'own');
  assert.equal(parseAnswer('amount', '12,500 บาท'), '1250000');
  assert.equal(parseAnswer('amount', 'ประมาณหมื่นกว่า'), null);
  assert.equal(parseAnswer('date', '18 พ.ย. 2569'), '18 พ.ย. 2569');
  assert.equal(parseAnswer('date', 'เมื่อวาน'), null);
  assert.equal(expenseFromText('อบรมเชิงปฏิบัติการ'), null);
});

test('drinking water paid from an advance becomes B10 settlement with a 3-working-day report', () => {
  const answers = answerAll([
    ['expense', 'water'],
    ['activity', 'meeting'],
    ['paid', 'yes'],
    ['funding', 'advance'],
    ['amount', '80000'],
    ['date', '20 พ.ย. 2569'],
  ]);
  const summary = claimSummary(answers)!;
  assert.equal(summary.category, 'B');
  assert.equal(summary.code, 'B10');
  assert.equal(summary.finance, 'b_clearance');
  assert.equal(summary.mode, 'paid');
  // 20 Nov 2569 is a Friday: three working days later is Wednesday 25 Nov.
  assert.deepEqual(summary.deadline, { date: '25 พ.ย. 2569', days: 3 });
  assert.ok(summary.documents.includes('ใบเซ็นชื่อเข้าร่วม FM-AF-015'));
  assert.ok(summary.documents.includes('รายงานขอความเห็นชอบ'));
  assert.ok(!summary.documents.includes('สัญญายืมเงิน FM-AF-001'), 'settlement needs no new loan agreement');
});

test('paying with own money first follows QP-AF-003 4.3 and warns before paying', () => {
  const before = claimSummary(
    answerAll([
      ['expense', 'event_service'],
      ['activity', 'event'],
      ['paid', 'no'],
      ['funding', 'own'],
      ['amount', '1500000'],
    ]),
  )!;
  assert.equal(before.finance, 'reserve_approval');
  assert.equal(before.mode, 'awaiting-payment');
  assert.equal(before.deadline, null);
  assert.ok(before.notes.some(note => /ก่อนจ่ายเงิน/.test(note.text) && /4\.3 a/.test(note.source)));
  assert.ok(
    before.notes.some(note => /ผ่านงานพัสดุ ห้ามใช้เงินยืม/.test(note.text)),
    'over 10,000 in category B',
  );
  const after = claimSummary(
    answerAll([
      ['expense', 'event_service'],
      ['activity', 'event'],
      ['paid', 'yes'],
      ['funding', 'own'],
      ['amount', 'unknown'],
      ['date', 'none'],
    ]),
  )!;
  assert.equal(after.finance, 'reserve_claim');
  assert.ok(after.notes.some(note => /ห้ามจ่ายก่อนได้รับอนุมัติ/.test(note.text)));
});

test('expenses without registered rules or rates send the person to AFP instead of guessing', () => {
  for (const expense of ['food', 'speaker', 'lodging', 'travel'] as const) {
    const summary = claimSummary(
      answerAll([
        ['expense', expense],
        ['activity', 'training'],
        ['paid', 'yes'],
        ['funding', 'unsure'],
        ['amount', 'unknown'],
        ['date', '20 พ.ย. 2569'],
      ]),
    )!;
    assert.equal(summary.category, 'other', expense);
    assert.equal(summary.finance, 'unknown');
    assert.equal(summary.deadline, null, 'no category B deadline is invented');
    assert.ok(
      summary.notes.some(note => /AFP/.test(note.text)),
      expense,
    );
    assert.ok(!summary.notes.some(note => /\d+ บาท\/มื้อ/.test(note.text)), 'no meal rate is made up');
  }
  const lodging = claimSummary(
    answerAll([
      ['expense', 'lodging'],
      ['activity', 'none'],
      ['paid', 'no'],
      ['funding', 'advance'],
      ['amount', 'unknown'],
    ]),
  )!;
  assert.ok(lodging.documents.includes('เอกสารยืนยันการเข้าพัก (Folio)'));
  assert.ok(!lodging.documents.includes('ใบเซ็นชื่อเข้าร่วม FM-AF-015'));
  const repair = claimSummary(
    answerAll([
      ['expense', 'urgent_repair'],
      ['activity', 'none'],
      ['paid', 'yes'],
      ['funding', 'own'],
      ['amount', '300000'],
      ['date', '20 พ.ย. 2569'],
    ]),
  )!;
  assert.equal(repair.category, 'emergency');
  assert.equal(repair.deadline?.days, 5);
});

test('recommendations come from the packet title or AFP guidance and are never forced', () => {
  const packet = createReceiptPacket('11111111-1111-4111-8111-111111111111', now);
  packet.title = 'ประชุมคณะทำงาน ค่าน้ำดื่ม';
  assert.equal(questionView('expense', {}, packet).recommended?.value, 'water');
  assert.equal(questionView('activity', {}, packet).recommended?.value, 'meeting');
  assert.equal(questionView('funding', { paid: false }).recommended?.value, 'advance');
  assert.equal(questionView('funding', { paid: true }).recommended, undefined);
  assert.equal(questionView('paid', {}).recommended, undefined);
});

test('applying keeps a typed title, replaces the default one and fills category, finance and mode', () => {
  const summary = claimSummary(
    answerAll([
      ['expense', 'speaker'],
      ['activity', 'training'],
      ['paid', 'no'],
      ['funding', 'advance'],
      ['amount', 'unknown'],
    ]),
  )!;
  const packet = createReceiptPacket('11111111-1111-4111-8111-111111111111', now);
  const applied = applyClaimSummary(packet, summary);
  assert.equal(applied.title, 'เบิกค่าวิทยากร');
  assert.equal(applied.mode, 'awaiting-payment');
  assert.deepEqual(
    [applied.guidance.category, applied.guidance.finance, applied.guidance.activity, applied.guidance.speaker],
    ['other', 'b_advance', 'training', 'yes'],
  );
  packet.title = 'อบรมผู้ประกอบการ รุ่น 3';
  assert.equal(applyClaimSummary(packet, summary).title, 'อบรมผู้ประกอบการ รุ่น 3');
});

test('the AI handoff carries answer labels only and reads fully in English', () => {
  const answers = answerAll([
    ['expense', 'water'],
    ['activity', 'meeting'],
    ['paid', 'yes'],
    ['funding', 'own'],
    ['amount', '50000'],
    ['date', 'none'],
  ]);
  const summary = claimSummary(answers)!;
  assert.match(claimAiPrompt(answers, summary), /ห้ามสรุปว่าเบิกได้/);
  setLanguage('en');
  try {
    const prompt = claimAiPrompt(answers, summary, t);
    assert.doesNotMatch(prompt, /[฀-๿]/);
    assert.match(prompt, /THB 500\.00/);
  } finally {
    setLanguage('th');
  }
  for (const rule of Object.values(EXPENSE_TYPES)) for (const note of rule.notes) assert.ok(note.source, note.text);
});
