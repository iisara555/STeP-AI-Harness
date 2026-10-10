import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { OrganizationKnowledge, knowledgeText } from '../electron/knowledge';

// The MIS ISO document register (docs/knowledge/mis-iso-document-register.md) is only useful if the real Desktop search
// reaches it for the way staff ask, and hands the model the row that answers. Negative controls make sure a register of
// 1,200 document titles does not swallow unrelated questions or the documents that answer them today.
const routing: any = await import('../../src/modules/router/service.js');
const knowledge = new OrganizationKnowledge(resolve('..'), routing.loadDocumentCatalog);
const REGISTER = 'mis-iso-document-register';

async function answerFor(question: string) {
  const found = await knowledge.search(question);
  return { top: found[0]?.id, ids: found.map(s => s.id), text: knowledgeText(found) };
}
const row = (text: string, number: string) => text.split('\n').find(line => line.startsWith(`| ${number} |`)) || '';

test('MIS register answers revision and effective-date questions with the matching row', async () => {
  const cases: [string, string, RegExp][] = [
    ['แบบฟอร์มคำขอให้จัดซื้อรุ่นล่าสุด', 'FM-AF-020', /\| V\.03 \| 2025-06-01 \| ใบคำขอให้จัดซื้อ \| ใช้อยู่ \|/],
    ['FM-AF-020 ใช้ rev อะไร', 'FM-AF-020', /\| V\.03 \|/],
    ['QP-AF-001 มีผลวันไหน', 'QP-AF-001', /\| V\.02 \| 2026-10-01 \|/],
    ['คู่มือคุณภาพรุ่นปัจจุบัน', 'QM-QM-001', /\| V\.03 \| 2025-07-16 \| คู่มือคุณภาพ \|/],
    ['FM-AF-002 ชื่อแบบฟอร์มอะไร', 'FM-AF-002', /ใบขออนุมัติจัดโครงการและเดินทางไปปฏิบัติงาน/],
    ['QP การจัดซื้อจัดจ้างรุ่นล่าสุด', 'QP-AF-001', /\| V\.02 \| 2026-10-01 \| การดำเนินการจัดซื้อจัดจ้าง \|/],
    ['ฟอร์มยืมเงินใช้ฉบับไหน', 'FM-AF-001', /\| V\.02 \| 2025-06-01 \| สัญญายืมเงิน \|/],
  ];
  for (const [question, number, expected] of cases) {
    const { top, text } = await answerFor(question);
    assert.equal(top, REGISTER, `${question} => ${top}`);
    assert.match(row(text, number), expected, `${question}: row ${number} not handed to the model`);
  }
});

test('CC form questions reach a register that carries the MIS revision', async () => {
  // The CC working pages also carry the MIS revision since 2026-10-10, so any of the three may answer.
  const cc = [REGISTER, 'cc-iso-document-register', 'qms-working-master-list'];
  const quote = await answerFor('ใบเสนอราคา FM-CC-005 rev ล่าสุด');
  assert.ok(cc.includes(quote.top!), `top ${quote.top}`);
  assert.match(quote.text, /FM-CC-005[^\n]*V\.03/);
  assert.doesNotMatch(quote.text, /FM-CC-005[^\n]*REV\.02 \|[^\n]*ใช้อยู่/);
});

test('team form questions reach a register that lists the team current forms', async () => {
  const { top, text } = await answerFor('แบบฟอร์มทีม CC ที่ใช้อยู่');
  assert.ok([REGISTER, 'cc-iso-document-register'].includes(top!), `top ${top}`);
  assert.match(text, /FM-CC-010[^\n]*V\.01/);
  const les = await answerFor('แบบฟอร์มของทีม LES มีอะไรบ้าง');
  assert.equal(les.top, REGISTER);
  assert.match(les.text, /\| FM-LE-\d+ \|/);
});

test('the MIS register does not take over unrelated questions or the documents that answer them', async () => {
  for (const q of [
    'ราคาทองวันนี้',
    'สูตรต้มยำกุ้ง',
    'ผลบอลเมื่อคืน',
    'จองตั๋วเครื่องบินไปกรุงเทพ',
    'สภาพอากาศพรุ่งนี้',
    'ช่วยออกแบบโปสเตอร์งานสัมมนา',
  ])
    assert.deepEqual((await answerFor(q)).ids, [], q);
  const expected: [string, string][] = [
    ['ลาพักผ่อนประจำปีได้กี่วัน', 'hr-personnel-welfare-2569'],
    ['เบิกค่ารักษาพยาบาลได้เท่าไร', 'hr-personnel-welfare-2569'],
    ['ส่งเอกสารเบิกให้ AFP ล่วงหน้ากี่วัน', 'afp-operational-circulars'],
    ['ใครเป็นผู้อำนวยการ STeP', 'step-executive-board'],
    ['ISO 9001 ข้อกำหนดไหนใช้เอกสารอะไร', 'qms-working-reference'],
    ['ขอใบลาป่วย', 'hr-personnel-welfare-2569'],
    ['สรุปประชุมให้หน่อย', 'step-ai-employee-guide'],
  ];
  for (const [q, id] of expected) assert.equal((await answerFor(q)).top, id, q);
});
