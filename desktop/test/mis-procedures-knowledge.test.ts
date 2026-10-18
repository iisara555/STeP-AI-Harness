import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { OrganizationKnowledge } from '../electron/knowledge';

// The QM, QP and Master List texts converted from STeP MIS (2026-10-18) must answer the way staff ask about their
// procedures, without taking revision questions from the MIS register or off-topic questions from nothing.
// Questions are synthetic, written for this test.
const routing: any = await import('../../src/modules/router/service.js');
const knowledge = new OrganizationKnowledge(resolve('..'), routing.loadDocumentCatalog);
const top = async (q: string) => (await knowledge.search(q))[0];

test('staff procedure questions reach the converted STeP MIS procedure', async () => {
  for (const [question, id] of [
    ['ขั้นตอนเคลียร์เงินยืมโครงการ', 'afp-advance-procedure'],
    ['ตรวจนับพัสดุประจำปีทำอย่างไร', 'afp-annual-inventory-procedure'],
    ['จำหน่ายพัสดุชำรุดทำอย่างไร', 'afp-annual-inventory-procedure'],
    ['จัดซื้อจัดจ้างวงเงินไม่เกิน 500,000 บาท ต้องเตรียมเอกสารอะไร', 'afp-procurement-procedure'],
    ['ขอคืนเงินประกันสัญญาใช้แบบฟอร์มอะไร', 'afp-payment-procedure'],
    ['ข้อร้องเรียนระดับ Major ต้องแก้ไขภายในกี่วัน', 'qms-complaint-management'],
    ['ขอแก้ไขเอกสารควบคุมต้องทำอย่างไร', 'qs-doc-control-procedure'],
    ['บันทึกคุณภาพต้องเก็บกี่ปี', 'qms-quality-record-control'],
    ['ตรวจติดตามคุณภาพภายในปีละกี่ครั้ง', 'qms-internal-audit'],
    ['ประชุมทบทวนฝ่ายบริหารมีวาระอะไรบ้าง', 'qms-management-review'],
    ['ออก NCR เมื่อไร', 'qms-nonconformity'],
    ['ประเมินระดับความเสี่ยงใช้เกณฑ์อะไร', 'qms-risk-management'],
    ['ขอบเขตระบบบริหารคุณภาพของ STeP ครอบคลุมอะไร', 'qms-quality-manual'],
  ]) {
    const found = await top(question);
    assert.equal(found?.id, id, `${question} => ${found?.id} § ${found?.heading}`);
    assert.ok(!/^ประวัติการ/.test(found!.heading), `${question} must not open on a revision-history table`);
  }
});

test('which revision is in force comes from the MIS register, not the converted copy', async () => {
  for (const question of ['QP การจัดซื้อจัดจ้างรุ่นล่าสุด', 'คู่มือคุณภาพรุ่นปัจจุบัน']) {
    assert.equal((await top(question))?.id, 'mis-iso-document-register', question);
  }
  // A question about changes still reaches the procedure's own history.
  const history = await top('กระบวนการจ่ายเงินมีประวัติการแก้ไขอะไรบ้าง');
  assert.equal(history?.id, 'afp-payment-procedure');
  assert.match(history!.heading, /^ประวัติการแก้ไข/);
});

test('a question naming a team only takes sections that mention that team', async () => {
  const found = await top('ฟอร์มขอใช้บริการของทีม CC รหัสอะไร');
  assert.ok(['mis-iso-document-register', 'cc-iso-document-register', 'qms-working-master-list'].includes(found!.id), found?.id);
});

test('words the procedures mention in passing do not make them answer unrelated requests', async () => {
  for (const question of ['ช่วยแปลเป็นภาษาอังกฤษ', 'ราคาทองวันนี้', 'ผลบอลเมื่อคืน']) {
    assert.deepEqual(await knowledge.search(question), [], question);
  }
});
