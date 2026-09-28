import test from 'node:test';
import assert from 'node:assert/strict';
import { queryStepRouter } from '../src/cli/commands/ask.js';

test('CRM complaint escalation reaches support triage', async () => {
  const result = await queryStepRouter(
    'ลูกค้าร้องเรียนเรื่องบริการใช้งานไม่ได้ ช่วยคัดแยกและทำบันทึกส่งต่อทีมเจ้าของบริการ',
    { team: 'crm' },
  );
  assert.equal(result.routingMode, 'SKILL');
  assert.equal(result.routingContract.skill, 'customer-support-faq-triage');
});

test('survey complaint triage for voice-of-customer stays with feedback synthesis', async () => {
  const result = await queryStepRouter(
    'คัดแยกข้อร้องเรียนลูกค้าจากแบบสำรวจเพื่อทำ voice of customer',
    { team: 'crm' },
  );
  assert.equal(result.routingMode, 'SKILL');
  assert.equal(result.routingContract.skill, 'voice-of-customer');
});

test('MI competitor feature and positioning comparison reaches market radar', async () => {
  const result = await queryStepRouter('ช่วยเทียบคู่แข่ง A กับ B เรื่อง feature และ positioning', { team: 'mi' });
  assert.equal(result.routingMode, 'SKILL');
  assert.equal(result.routingContract.skill, 'market-signal-radar');
});

test('feature comparison without competitors is not market radar', async () => {
  const result = await queryStepRouter('ช่วยเทียบ feature ของบริการ A กับ B', { team: 'mi' });
  assert.notEqual(result.routingContract?.skill, 'market-signal-radar');
});

test('competitor mention in customer interviews stays with discovery', async () => {
  const result = await queryStepRouter('ช่วยสัมภาษณ์ลูกค้าเพื่อทดสอบ problem-solution fit และถามถึง feature คู่แข่ง', { team: 'mi' });
  assert.equal(result.routingContract.skill, 'startup-discovery');
});

test('competitor mentions in survey synthesis stay with voice of customer', async () => {
  const result = await queryStepRouter('สรุป voice of customer จาก survey feedback เรื่อง feature คู่แข่ง', { team: 'crm' });
  assert.equal(result.routingContract.skill, 'voice-of-customer');
});

test('CRM customer-feedback synthesis stays with voice-of-customer', async () => {
  const result = await queryStepRouter(
    'สรุป voice of customer จาก survey feedback และ complaint themes ชุดนี้',
    { team: 'crm' },
  );
  assert.equal(result.routingMode, 'SKILL');
  assert.equal(result.routingContract.skill, 'voice-of-customer');
});
