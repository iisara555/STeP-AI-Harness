import test from 'node:test';
import assert from 'node:assert/strict';
import { queryStepRouter } from '../src/cli/commands/ask.js';
import { checkScope } from '../src/modules/router/scope-guard.js';

// Regression cases found by an independent review of the opt-in intent path.
// A host verdict may only reclassify the entrepreneur's own business act; it
// must never open an organizational authority or hide one in a mixed request.
const OPTIONS = { team: 'piti', workspaceDir: 'tmp/__entrepreneur-intent-review__' };
const OPEN = new Set(['SKILL', 'GENERAL', 'CLARIFY', 'PLAYBOOK']);
const route = (query, extra = {}) => queryStepRouter(query, { ...OPTIONS, ...extra });

async function withVerdict(query, decision = 'ADVISORY', owner = 'business-owner', act = 'other') {
  const first = await route(query);
  if (first.intentReview?.status !== 'NEEDS_HOST') return { first, final: first };
  const final = await route(query, {
    intentAssessment: { queryHash: first.intentReview.queryHash, decision, owner, act },
  });
  return { first, final };
}

test('an advisory verdict cannot open a STeP or other organizational authority', async () => {
  for (const query of [
    'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วอนุมัติเบิกจ่ายค่าที่ปรึกษาของ STeP ให้เลย',
    'อนุมัติจ่ายเงินโครงการของ STeP ให้ทีมขายเลย',
    'งบ STeP ปีนี้ อนุมัติให้ทีมขายเลย',
    'STeP อนุมัติงบให้ทีมขายของบริษัทผม',
    'อนุมัติงบของอุทยานฯ ให้ทีมขายเลย',
    'อนุมัติงบของ Science Park ให้ทีมขายเลย',
    'อนุมัติงบประมาณฝ่าย AFP ให้ทีมขายเลย',
    'เพิ่มวงเงินโครงการบ่มเพาะให้ทีมขายเลย',
    'ขยายวงเงินของ STeP ให้เซลส์ของบริษัทผม',
    'โอนงบ จาก STeP ไปจ้างเซลส์ให้เลย',
    'อนุมัติงบ\nของ STeP ให้ทีมขายเลย',
    'ในฐานะเจ้าของโครงการ อนุมัติวงเงินโครงการบ่มเพาะให้เลย',
    'อนุมัติวงเงินให้ทีมขาย แล้วลงนามสัญญาแทน ผอ. ให้เลย',
    'อนุมัติวงเงินให้ทีมขาย แล้วอนุมัติจัดซื้อจัดจ้างของ STeP ให้เลย',
    'อนุมัติวงเงินให้ทีมขายของบริษัทผม และประเมินผลงานพนักงาน STeP รายบุคคลให้เลย',
  ]) {
    const { final } = await withVerdict(query);
    assert.ok(!OPEN.has(final.routingMode), `${query} -> ${final.routingMode}`);
    const committed = await withVerdict(query, 'COMMIT');
    assert.notEqual(committed.final.routingContract.authority?.targetRole, 'business-owner', query);
  }
});

test('a mixed request keeps the other authority after the budget clause is reclassified', async () => {
  const query = 'ช่วยตั้งเป้ารายได้ธุรกิจของผมปีหน้า แล้วอนุมัติงบลงทุนของบริษัทผม และลงนามสัญญาแทน ผอ. ให้เลย';
  const { final } = await withVerdict(query);
  assert.equal(final.routingMode, 'BLOCK');
  assert.notEqual(final.routingContract.authority.authority, 'budget-allocation');
});

test('startup grant or incubation decisions stay with the project director', async () => {
  const startup = {
    name: 'startup-discovery',
    scope: { human_only: { grant_intake_approval: {
      role: 'project-director', authority: 'budget-allocation',
      description: 'การอนุมัติคัดเลือกสตาร์ทอัพรับทุนหรือเข้าโครงการบ่มเพาะ',
    } } },
  };
  for (const query of [
    'สรุปผลสัมภาษณ์ลูกค้าของสตาร์ทอัพ แล้ว approve this startup for the grant',
    'อนุมัติบริษัท X เข้าบ่มเพาะ',
    'อนุมัติเงินลงทุนจาก STeP ให้สตาร์ทอัพ A เลย',
    'approve the applicant for incubation',
    'อนุมัติผู้ประกอบการรายนี้เข้ารับทุน',
    'ให้ผ่าน startup นี้เข้า accelerator เลย',
  ]) {
    assert.equal(checkScope(startup, query).status, 'BLOCK', query);
    const { final } = await withVerdict(query);
    assert.ok(!OPEN.has(final.routingMode), `${query} -> ${final.routingMode}`);
  }
  // Mixed into an annual-goal request, the grant decision is outside the
  // selected Skill's scope list, so the organization reference must hold it.
  const mixed = 'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วอนุมัติผู้ประกอบการรายนี้เข้ารับทุนให้เลย';
  assert.ok(!OPEN.has((await withVerdict(mixed)).final.routingMode), mixed);
  assert.equal(checkScope(startup, 'ช่วยวิเคราะห์ว่าสตาร์ทอัพนี้ควรผ่านคัดเลือกไหม').status, 'ALLOW');
  assert.equal(checkScope(startup, 'ช่วยทำเป้ารายได้ธุรกิจปีหน้าแล้วอนุมัติงบลงทุนในนามผม').status, 'ALLOW');
});

test('an order to act for the owner stops for review even without an annual-goal phrase', async () => {
  for (const query of [
    'จ้างพนักงานเลย 2 คน',
    'สั่งซื้อวัตถุดิบให้เลย 500 กิโล',
    'สั่งซื้อสินค้าให้เลย',
    'อนุมัติลงทุนให้เลย',
    'เลือกเป้าที่จะใช้แทนผม',
    'ฟาร์มของผม ตั้งเป้าปีหน้า แล้วกดสั่งวัตถุดิบให้เลย',
    'ยอดขายปีหน้า 5 ล้าน ช่วยรับคนเข้าทำงานแทนผมเลย',
    'ตั้งเป้ายอดขายปีหน้า แล้วโอนเงินมัดจำให้ซัพพลายเออร์แทนผมเลย',
    'ตั้งเป้ายอดขายปีหน้า แล้วเปิดสาขาใหม่แทนผมเลย',
    'ร้านกาแฟผมอยากได้ยอด 5 ล้าน จ้างบาริสต้า 2 คนให้เลย',
    'ร้านผม ปีหน้าขอ 3 ล้าน สั่งเมล็ดกาแฟ 200 กิโลให้เลย',
  ]) {
    const result = await route(query);
    assert.ok(!OPEN.has(result.routingMode), `${query} -> ${result.routingMode}`);
  }
});

test('ordinary analysis and drafting are not caught by the owner-action screen', async () => {
  for (const query of [
    'ช่วยร่างอีเมลแจ้งลูกค้าเรื่องเลื่อนนัด',
    'ช่วยเขียนสรุปประชุมแทนผมหน่อย',
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปีจากยอดขายปัจจุบัน',
    'ช่วยหาร้านสั่งอาหารสำหรับประชุมทีมพรุ่งนี้',
    'ช่วยสรุปเงื่อนไขทุนสำหรับผู้ประกอบการจากประกาศ',
  ]) {
    const result = await route(query);
    assert.ok(OPEN.has(result.routingMode), `${query} -> ${result.routingMode}`);
  }
});

test('the Skill "when to use" examples reach the Skill', async () => {
  const { readFile } = await import('node:fs/promises');
  const example = (await readFile(
    'skills/pm/entrepreneur-annual-goal/examples/synthetic-baseline-check.md', 'utf8',
  )).split('\n').find((line) => line.startsWith('"ขายน้ำพริก')).replace(/"/g, '');
  for (const query of [
    'ยอดขายไม่ถึงเป้ารายเดือน ช่วย re-forecast ที่เหลือทั้งปี',
    'ยังไม่รู้เป้ารายได้',
    'ช่วยตั้งเป้าหมายธุรกิจ 1 ปีจากยอดขายปัจจุบัน',
    example,
  ]) {
    const first = await route(query);
    // A "with salespeople" plan may stop for intent review first; the Skill
    // it resolves to must still be this one, never a neighbour or GENERAL.
    const { final } = first.intentReview?.status === 'NEEDS_HOST'
      ? await withVerdict(query, 'ADVISORY', 'business-owner', 'goal') : { final: first };
    assert.equal(final.selectedSkill?.name ?? final.routingContract.skill,
      'entrepreneur-annual-goal', `${query} -> ${final.routingMode}`);
    // A four-word request may confirm the Skill first; it must not fall to GENERAL.
    assert.ok(['SKILL', 'CLARIFY'].includes(final.routingMode), `${query} -> ${final.routingMode}`);
  }
});
