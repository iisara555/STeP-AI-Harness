import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { OrganizationKnowledge } from '../electron/knowledge';

const routing: any = await import('../../src/modules/router/service.js');
const knowledge = () => new OrganizationKnowledge(resolve('..'), routing.loadDocumentCatalog);

test('a chat turn searches with the first request, unless the new message says it changes the subject', async () => {
  const k = knowledge();
  assert.equal((await k.searchTurn('ลาพักร้อนได้ปีละกี่วัน', 'แล้วลาป่วยล่ะ'))[0]?.id, 'hr-personnel-welfare-2569');
  const earlier = 'ลาพักร้อนได้ปีละกี่วัน';
  const change = 'อีกเรื่อง FABLAB มีเครื่องอะไรบ้าง';
  assert.deepEqual(await k.search(`${earlier}\n${change}`), [], 'searched with the first request it finds nothing');
  assert.equal((await k.searchTurn(earlier, change))[0]?.id, 'step-facility-equipment-inventory-2020');
  assert.equal(
    (await k.searchTurn('ใครเป็นผู้อำนวยการ STeP', 'เปลี่ยนเรื่อง ระเบียบการเงินฉบับไหนใช้ก่อน'))[0]?.id,
    'afp-regulation-hierarchy',
  );
  // A follow-up without a subject of its own is never searched alone: "ขอสั้นกว่านี้" alone matches a career document.
  assert.deepEqual(await k.searchTurn('ช่วยเขียนอีเมลขอบคุณลูกค้า', 'ขอสั้นกว่านี้'), []);
  assert.equal((await k.searchTurn(undefined, 'ผอ. STeP ชื่ออะไร'))[0]?.id, 'step-executive-board');
});

test('pieces of a split question word do not make an unrelated question match a document', async () => {
  // The segmenter splits เท่าไหร่ into เท่า + ไหร่ and บาทละ into บาท + ละ; with วัน they matched the HR guardrails.
  assert.deepEqual(await knowledge().search('ทองคำบาทละเท่าไหร่วันนี้'), []);
  assert.ok(
    (await knowledge().search('จ่ายค่าวิทยากรได้ชั่วโมงละเท่าไร')).some(s => s.id === 'afp-operational-circulars'),
    'a real rate question still matches',
  );
});
