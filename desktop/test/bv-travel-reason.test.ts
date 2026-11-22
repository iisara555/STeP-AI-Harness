import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bvReasonProblem, checkBvReason, draftBvReason } from '../src/bv-travel-reason';
import {
  applyAnswer,
  applyClaimSummary,
  claimAiPrompt,
  claimSummary,
  nextQuestion,
  parseAnswer,
  questionView,
  type ClaimAnswers,
} from '../src/claim-interview';
import { caseContext } from '../src/claim-case';
import { createReceiptPacket } from '../src/receipt-packet';
import { loadEnglish, setLanguage, t } from '../src/i18n';

before(() => loadEnglish());

// AFP procurement's own examples and the short reasons it asked staff to avoid (announcement of 20 Nov 2569).
const AFP_COMPLETE = [
  'เพื่อรับวิทยากร วันที่ 9 กันยายน 2569 จากท่าอากาศยานเชียงใหม่ไปยังโรงแรมแคนทารี เพื่อเข้าร่วมกิจกรรมตามกำหนดการ',
  'เพื่อส่งวิทยากร วันที่ 12 กันยายน 2569 จากโรงแรมแคนทารีไปยังท่าอากาศยานเชียงใหม่ ภายหลังเสร็จสิ้นกิจกรรมตามกำหนดการ',
];
const AFP_SHORT = ['รับวิทยากร', 'เดินทางไปกรุงเทพฯ', 'ใช้รถในกิจกรรม'];

test("AFP's complete examples pass and its too-short examples are flagged", () => {
  for (const text of AFP_COMPLETE) assert.deepEqual(checkBvReason(text).missing, [], text);
  for (const text of AFP_COMPLETE) assert.equal(bvReasonProblem(text), null, text);
  for (const text of AFP_SHORT) {
    const check = checkBvReason(text);
    assert.equal(check.short, true, text);
    assert.equal(check.ok, false, text);
    assert.match(bvReasonProblem(text)!, /สั้นเกินไป/);
  }
  // "ไปกรุงเทพฯ" names no starting point, so the route is still missing.
  assert.ok(checkBvReason('เดินทางไปกรุงเทพฯ').missing.includes('route'));
});

test('the examples AFP gave without every part are named for the part they lack', () => {
  assert.deepEqual(
    checkBvReason('เพื่อรับ-ส่งวิทยากร ระหว่างวันที่ 4–6 กันยายน 2569 ให้สามารถเดินทางและเข้าร่วมกิจกรรมได้ตามกำหนดการ').missing,
    ['route'],
  );
  assert.deepEqual(
    checkBvReason('เพื่อใช้ในการเดินทางภายในกรุงเทพมหานครของผู้เข้าร่วมกิจกรรมแถลงความสำเร็จการดำเนินโครงการ Frontier Technology 2569')
      .missing,
    ['when'],
  );
  assert.equal(bvReasonProblem(''), 'ยังไม่ได้เขียนเหตุผลการเดินทาง');
});

test("the draft follows AFP's sentence and keeps a bracketed blank for an unknown part", () => {
  const full = draftBvReason({
    who: 'วิทยากร',
    what: 'รับ',
    when: '9 ก.ย. 2569',
    route: 'ท่าอากาศยานเชียงใหม่ - โรงแรมแคนทารี',
    activity: 'เข้าร่วมกิจกรรมตามกำหนดการ',
  });
  assert.equal(full, 'เพื่อรับวิทยากร วันที่ 9 ก.ย. 2569 จากท่าอากาศยานเชียงใหม่ไปยังโรงแรมแคนทารี เพื่อเข้าร่วมกิจกรรมตามกำหนดการ');
  assert.equal(checkBvReason(full).ok, true);
  assert.equal(
    draftBvReason({
      who: 'บุคลากรอุทยานวิทยาศาสตร์ฯ',
      what: 'อำนวยความสะดวกในการเดินทาง',
      when: 'ระหว่างวันที่ 4–6 กันยายน 2569',
      route: 'ภายในกรุงเทพมหานคร',
      activity: 'Frontier Technology 2569',
    }),
    'เพื่ออำนวยความสะดวกในการเดินทางของบุคลากรอุทยานวิทยาศาสตร์ฯ ระหว่างวันที่ 4–6 กันยายน 2569 ภายในกรุงเทพมหานคร สำหรับกิจกรรม Frontier Technology 2569',
  );
  const partial = draftBvReason({ who: 'ผู้เข้าร่วมกิจกรรม', what: 'รับ-ส่ง', when: '', route: '' });
  assert.match(partial, /\[วันเดินทาง\]/);
  assert.match(partial, /จาก \[ต้นทาง\] ไปยัง \[ปลายทาง\]/);
  const check = checkBvReason(partial);
  assert.equal(check.placeholder, true);
  assert.equal(check.ok, false);
  assert.deepEqual(check.missing, ['when', 'route']);
});

const answer = (pairs: [string, string][], from: ClaimAnswers = {}) =>
  pairs.reduce<ClaimAnswers>((answers, [id, value]) => applyAnswer(answers, id as never, value), from);
const vehicle: [string, string][] = [
  ['expense', 'vehicle'],
  ['activity', 'event'],
  ['paid', 'no'],
  ['funding', 'advance'],
  ['amount', 'unknown'],
];

test('a vehicle hire asks the five travel-reason parts one at a time; other expenses do not', () => {
  let answers = answer(vehicle);
  const asked: string[] = [];
  for (const [id, value] of [
    ['bvWho', 'วิทยากร'],
    ['bvWhat', 'รับ'],
    ['bvWhen', '9 ก.ย. 2569'],
    ['bvRoute', 'จากท่าอากาศยานเชียงใหม่ไปยังโรงแรมแคนทารี'],
    ['bvActivity', 'เข้าร่วมกิจกรรมตามกำหนดการ'],
  ] as const) {
    assert.equal(nextQuestion(answers), id);
    asked.push(questionView(id, answers).text);
    assert.equal(parseAnswer(id, value), value, 'typed words are kept as the answer');
    answers = applyAnswer(answers, id, value);
  }
  assert.equal(nextQuestion(answers), null);
  assert.equal(new Set(asked).size, 5);
  const summary = claimSummary(answers)!;
  assert.equal(summary.code, 'BV');
  assert.equal(summary.travelReason, AFP_COMPLETE[0].replace('9 กันยายน', '9 ก.ย.'));
  assert.ok(!summary.notes.some(note => /เหตุผลการเดินทางยังขาด/.test(note.text)));

  const water = answer([
    ['expense', 'water'],
    ['activity', 'meeting'],
    ['paid', 'no'],
    ['funding', 'advance'],
    ['amount', 'unknown'],
  ]);
  assert.equal(nextQuestion(water), null);
  assert.equal(claimSummary(water)!.travelReason, null);
});

test('"ยังไม่ทราบ" leaves a blank the summary warns about, and the project is offered for the activity', () => {
  const packet = createReceiptPacket('22222222-2222-4222-8222-222222222222', '2026-11-22T00:00:00.000Z');
  packet.project = 'โครงการสมมติ 2569';
  const view = questionView('bvActivity', {}, packet);
  assert.equal(view.recommended?.value, 'โครงการสมมติ 2569');
  assert.ok(view.options.some(option => option.value === 'โครงการสมมติ 2569'));
  assert.equal(parseAnswer('bvWhen', 'ยังไม่ทราบ'), 'unknown');
  assert.equal(parseAnswer('bvRoute', 'x'.repeat(201)), null, 'an overlong answer is not taken');
  const answers = answer(
    [
      ['bvWho', 'วิทยากร'],
      ['bvWhat', 'ส่ง'],
      ['bvWhen', 'unknown'],
      ['bvRoute', 'unknown'],
      ['bvActivity', 'โครงการสมมติ 2569'],
    ],
    answer(vehicle),
  );
  const summary = claimSummary(answers)!;
  assert.match(summary.travelReason!, /\[วันเดินทาง\]/);
  assert.ok(
    summary.notes.some(
      note => /เหตุผลการเดินทางยังขาด/.test(note.text) && note.source === 'เหตุผลการเดินทาง หมวด BV (งานพัสดุ AFP 20 พ.ย. 2569)',
    ),
  );
});

test('applying fills an empty or weak purpose with the draft and keeps a complete one the person wrote', () => {
  const answers = answer(
    [
      ['bvWho', 'วิทยากร'],
      ['bvWhat', 'รับ'],
      ['bvWhen', '9 ก.ย. 2569'],
      ['bvRoute', 'จากท่าอากาศยานเชียงใหม่ไปยังโรงแรมแคนทารี'],
      ['bvActivity', 'เข้าร่วมกิจกรรมตามกำหนดการ'],
    ],
    answer(vehicle),
  );
  const summary = claimSummary(answers)!;
  const packet = createReceiptPacket('33333333-3333-4333-8333-333333333333', '2026-11-22T00:00:00.000Z');
  assert.equal(applyClaimSummary(packet, summary).purpose, summary.travelReason);
  packet.purpose = 'รับวิทยากร';
  assert.equal(applyClaimSummary(packet, summary).purpose, summary.travelReason, 'a reason AFP would send back is replaced');
  packet.purpose = AFP_COMPLETE[1];
  assert.equal(applyClaimSummary(packet, summary).purpose, AFP_COMPLETE[1]);
  assert.equal(applyClaimSummary(packet, summary).guidance.category, 'BV');
});

test('the travel-reason words never reach the AI handoff or the case context, only which parts are there', () => {
  const answers = answer(
    [
      ['bvWho', 'นายสมมติ ใจดี'],
      ['bvWhat', 'รับ'],
      ['bvWhen', '9 ก.ย. 2569'],
      ['bvRoute', 'จากบ้านเลขที่ 99 ไปยังโรงแรมแคนทารี'],
      ['bvActivity', 'งานสมมติ'],
    ],
    answer(vehicle),
  );
  const prompt = claimAiPrompt(answers, claimSummary(answers)!);
  assert.doesNotMatch(prompt, /สมมติ|บ้านเลขที่|แคนทารี/);
  assert.match(prompt, /BV/);

  const packet = createReceiptPacket('44444444-4444-4444-8444-444444444444', '2026-11-22T00:00:00.000Z');
  packet.guidance = { ...packet.guidance, category: 'BV' };
  packet.purpose = 'รับวิทยากร นายสมมติ';
  const context = caseContext(packet);
  assert.doesNotMatch(context, /สมมติ/);
  assert.match(context, /เหตุผลการเดินทาง BV: ยังไม่ครบ ยังไม่พบ เมื่อไร, จากไหนไปไหน, เพื่อกิจกรรมอะไร และสั้นเกินไป/);
  packet.purpose = AFP_COMPLETE[0];
  assert.match(caseContext(packet), /เหตุผลการเดินทาง BV: ครบ 5 ส่วน/);
  packet.guidance = { ...packet.guidance, category: 'B' };
  assert.doesNotMatch(caseContext(packet), /เหตุผลการเดินทาง/, 'only BV cases are checked');
});

test('the problem line and the parts read in English when the app is in English', () => {
  setLanguage('en');
  try {
    assert.equal(bvReasonProblem('รับวิทยากร', t), 'Too short; missing: When, From where to where, For which activity');
  } finally {
    setLanguage('th');
  }
});

test('the claims chat rule and the knowledge document carry the same five parts and template', async () => {
  const service = await readFile(new URL('../electron/service.ts', import.meta.url), 'utf8');
  assert.match(service, /category BV[\s\S]*who travels, what for[\s\S]*when, from where to where, and for which activity/);
  assert.match(service, /เพื่อ\[รับ\/ส่ง\/อำนวยความสะดวกในการเดินทาง\]/);
  const doc = await readFile(new URL('../../docs/knowledge/afp-bv-travel-reason.md', import.meta.url), 'utf8');
  const manifest = await readFile(new URL('../../manifest/documents.yaml', import.meta.url), 'utf8');
  assert.match(manifest, /afp-bv-travel-reason:[\s\S]*?path: docs\/knowledge\/afp-bv-travel-reason\.md/);
  assert.match(doc, /ใคร \+ ทำอะไร \+ เมื่อไร \+ จากไหนไปไหน \+ เพื่อกิจกรรมอะไร/);
  assert.match(doc, /ว 119/);
  assert.match(doc, /STeP_Name&Contact > แนวปฏิบัติงานการเงิน > ชีท หมวด BV ค่าพาหนะ/);
  for (const text of [...AFP_COMPLETE, ...AFP_SHORT]) assert.ok(doc.includes(text), text);
});

test('staff questions about writing a BV travel reason retrieve the registered BV travel-reason document', async () => {
  const { resolve } = await import('node:path');
  const { OrganizationKnowledge } = await import('../electron/knowledge');
  const routing: any = await import('../../src/modules/router/service.js');
  const knowledge = new OrganizationKnowledge(resolve('..'), routing.loadDocumentCatalog);
  for (const question of [
    'เขียนเหตุผลการเดินทางหมวด BV ยังไง',
    'เหตุผลการจ้างเหมารถตู้ต้องระบุอะไรบ้าง',
    'เบิกค่าพาหนะ BV เขียนเหตุผลว่ารับวิทยากรได้ไหม',
    'จ้างรถตู้รับวิทยากรจากสนามบิน ต้องเขียนเหตุผลยังไง',
  ]) {
    const found = await knowledge.search(question);
    assert.equal(found[0]?.id, 'afp-bv-travel-reason', question);
    assert.ok(
      found.some(section => section.text.includes('ใคร + ทำอะไร + เมื่อไร + จากไหนไปไหน + เพื่อกิจกรรมอะไร')),
      question,
    );
  }
});
