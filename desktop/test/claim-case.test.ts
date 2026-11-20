import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyClaimUpdate,
  caseContext,
  caseListStatus,
  claimUpdateRows,
  pendingClaimUpdate,
  readClaimUpdate,
  splitClaimReply,
} from '../src/claim-case';
import { createReceiptPacket } from '../src/receipt-packet';

const packet = () => {
  const value = createReceiptPacket('11111111-1111-4111-8111-111111111111', '2026-11-20T00:00:00.000Z');
  value.title = 'ประชุมคณะทำงาน ข้อมูลสมมติ';
  value.purpose = 'ซื้อน้ำดื่มให้ผู้เข้าประชุม นายสมมติ ใจดี';
  return value;
};

test('case context uses fixed labels and counts, never the typed title, purpose or file names', () => {
  const value = packet();
  value.guidance = { ...value.guidance, category: 'B', finance: 'b_clearance', activity: 'meeting' };
  value.documents = [
    {
      id: 'a',
      name: 'ใบเสร็จร้านสมมติ.pdf',
      sha256: 'x',
      size: 10,
      pages: [{ number: 1, kind: 'receipt', included: true, checked: false }],
    } as any,
  ];
  const text = caseContext(value);
  assert.match(text, /หมวด: หมวด B \(B1–B12\)/);
  assert.match(text, /กรณีการเงิน: เคลียร์เงินยืม/);
  assert.match(text, /กิจกรรม: ประชุม/);
  assert.match(text, /ชื่อเรื่อง: กรอกแล้ว/);
  assert.match(text, /- ใบเสร็จรับเงิน: 1 หน้า/);
  assert.match(text, /ใบเซ็นชื่อเข้าร่วม FM-AF-015: ยังไม่มี/);
  assert.doesNotMatch(text, /ประชุมคณะทำงาน|น้ำดื่ม|สมมติ|\.pdf/);
});

test('a proposal keeps only known fields and values from the fixed lists', () => {
  assert.deepEqual(
    readClaimUpdate(
      JSON.stringify({
        title: '  เบิกค่าน้ำดื่ม  ประชุม ',
        category: 'B',
        finance: 'b_clearance',
        activity: 'meeting',
        mode: 'paid',
        amount: 800,
        recipient: 'ร้านสมมติ',
      }),
    ),
    { title: 'เบิกค่าน้ำดื่ม ประชุม', category: 'B', finance: 'b_clearance', activity: 'meeting', mode: 'paid' },
  );
  assert.equal(readClaimUpdate(JSON.stringify({ category: 'A', finance: 'approve', activity: 'auto' })), null);
  assert.equal(readClaimUpdate(JSON.stringify({ title: 'x'.repeat(201) })), null);
  assert.equal(readClaimUpdate('not json'), null);
  assert.equal(readClaimUpdate('[1]'), null);
});

test('the reply shows without its proposal block, and the last readable block wins', () => {
  const reply = [
    'ค่าน้ำดื่มประชุมอยู่ในหมวด B10 ตามแนวปฏิบัติ AFP ข้อ 3.1',
    '```claim-update\n{"category":"BV"}\n```',
    'ถ้าเคลียร์เงินยืม ให้แนบใบเสร็จ',
    '```claim-update\n{"category":"B","finance":"b_clearance"}\n```',
  ].join('\n\n');
  const split = splitClaimReply(reply);
  assert.equal(split.text, 'ค่าน้ำดื่มประชุมอยู่ในหมวด B10 ตามแนวปฏิบัติ AFP ข้อ 3.1\n\nถ้าเคลียร์เงินยืม ให้แนบใบเสร็จ');
  assert.deepEqual(split.update, { category: 'B', finance: 'b_clearance' });
  assert.deepEqual(splitClaimReply('```claim-update\n{oops}\n```').update, null);
  assert.equal(splitClaimReply('ไม่มีข้อเสนอ').update, null);
});

test('only changed fields are proposed, and applying one fills the case like the form', () => {
  const value = packet();
  value.guidance = { ...value.guidance, category: 'B' };
  assert.deepEqual(pendingClaimUpdate(value, { category: 'B', finance: 'b_advance' }), { finance: 'b_advance' });
  assert.equal(pendingClaimUpdate(value, { category: 'B' }), null);
  assert.equal(pendingClaimUpdate(value, null), null);
  const next = applyClaimUpdate(value, { finance: 'reserve_claim', activity: 'training', project: 'โครงการสมมติ', mode: 'paid' });
  assert.equal(next.guidance.finance, 'reserve_claim');
  assert.equal(next.guidance.activity, 'training');
  assert.equal(next.guidance.category, 'B');
  assert.equal(next.project, 'โครงการสมมติ');
  assert.equal(next.title, value.title);
  assert.equal(pendingClaimUpdate(next, { finance: 'reserve_claim' }), null);
  assert.deepEqual(
    claimUpdateRows({ category: 'emergency', finance: 'reserve_claim' }).map(row => `${row.label}: ${row.value}`),
    ['หมวด: หมวดฉุกเฉิน', 'กรณีการเงิน: สำรองจ่ายเอง — ขอเบิกคืน'],
  );
});

test('the case list says the category and how much evidence a case holds', () => {
  const base = { id: 'a', title: 'x', revision: 1, updatedAt: '' };
  assert.equal(caseListStatus({ ...base, documentCount: 0 }), 'ยังไม่ระบุหมวด · ยังไม่มีหลักฐาน');
  assert.equal(caseListStatus({ ...base, documentCount: 3, category: 'B' }), 'หมวด B (B1–B12) · หลักฐาน 3 ไฟล์');
});
