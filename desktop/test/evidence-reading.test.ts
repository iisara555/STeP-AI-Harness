import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyReadings, classifyEvidenceText, pendingReadings, readingLine, type ReadingItem } from '../src/evidence-reading';
import { createReceiptPacket } from '../src/receipt-packet';

const plain = (text: string, ...values: (string | number)[]) =>
  values.reduce<string>((value, part, i) => value.replace(`{${i}}`, String(part)), text);

test('the title printed first decides the kind, in Thai or English', () => {
  const kind = (text: string) => classifyEvidenceText(text)?.kind ?? null;
  assert.equal(kind('ร้านสมมติ จำกัด\nใบเสร็จรับเงิน\nเลขที่ 001\nน้ำดื่ม 20 ขวด 200.00'), 'receipt');
  assert.equal(kind('บริษัท สมมติ จำกัด\nใบเสร็จรับเงิน/ใบกำกับภาษี\nเลขประจำตัวผู้เสียภาษี'), 'tax_invoice');
  assert.equal(kind('RECEIPT / TAX INVOICE\nSynthetic Shop'), 'tax_invoice');
  assert.equal(kind('ใบกำกับภาษีอย่างย่อ\nTAX INV (ABB)'), 'abbreviated_tax_invoice');
  assert.equal(kind('ใบเสนอราคา\nQuotation no. Q-1\nเงื่อนไข: ไม่ใช่ใบเสร็จรับเงิน'), 'invoice_or_quotation');
  assert.equal(kind('Transfer successful\nPromptPay\n500.00 THB'), 'transfer_slip');
  assert.equal(kind('ใบสำคัญรับเงิน\nFM-AF-014\nเลขบัตรประชาชน'), 'receipt_voucher');
  assert.equal(kind('แบบฟอร์ม FM-AF-015 ใบเซ็นชื่อเข้าร่วมประชุม'), 'attendance');
  assert.equal(kind('บิลเงินสด\nร้านสมมติ'), 'cash_bill');
  assert.equal(kind('บันทึกข้อความ เรื่อง ขอบคุณ'), null);
  assert.equal(kind(''), null);
  // A title far below the top of a long body is not read as the document's kind.
  assert.equal(kind('ก'.repeat(5000) + 'ใบเสร็จรับเงิน'), null);
  assert.equal(classifyEvidenceText('  TAX   INVOICE  ')?.cue, 'TAX INVOICE');
});

test('read kinds fill only unclassified pages, and only when the person applies them', () => {
  const packet = createReceiptPacket('11111111-1111-4111-8111-111111111111', '2026-11-20T00:00:00.000Z');
  const page = (kind: string, number = 1) => ({ number, kind, included: true, checked: true }) as any;
  packet.documents = [
    { id: 'a', name: 'a.pdf', pages: [page('other'), page('transfer_slip', 2)] },
    { id: 'b', name: 'b.png', pages: [page('receipt')] },
    { id: 'c', name: 'c.png', pages: [page('other')] },
  ] as any;
  const items: ReadingItem[] = [
    { sourceId: 'a', name: 'a.pdf', state: 'done', result: { kind: 'receipt', cue: 'ใบเสร็จรับเงิน', via: 'text' } },
    { sourceId: 'b', name: 'b.png', state: 'done', result: { kind: 'tax_invoice', cue: 'TAX INVOICE', via: 'ocr' } },
    { sourceId: 'c', name: 'c.png', state: 'done', result: { kind: null, via: 'none', reason: 'ocr-off' } },
  ];
  assert.deepEqual(
    pendingReadings(packet, items).map(item => item.sourceId),
    ['a'],
  );
  const next = applyReadings(packet, items);
  assert.deepEqual(
    next.documents[0].pages.map(p => [p.kind, p.checked]),
    [
      ['receipt', false],
      ['transfer_slip', true],
    ],
  );
  assert.equal(next.documents[1].pages[0].kind, 'receipt');
  assert.equal(next.documents[2].pages[0].kind, 'other');
  assert.equal(pendingReadings(next, items).length, 0);
  assert.equal(applyReadings(next, items), next);
});

test('each file says what reading found, and why when nothing was read', () => {
  const line = (item: Partial<ReadingItem>) => readingLine({ sourceId: 'a', name: 'a', state: 'done', ...item } as ReadingItem, plain);
  assert.equal(line({ result: { kind: 'receipt', cue: 'ใบเสร็จรับเงิน', via: 'text' } }), 'ใบเสร็จรับเงิน · พบ “ใบเสร็จรับเงิน” ในเนื้อหา');
  assert.match(line({ result: { kind: 'tax_invoice', cue: 'TAX INVOICE', via: 'ocr' } }), /OCR ในเครื่อง/);
  assert.match(line({ result: { kind: null, via: 'none', reason: 'ocr-off' } }), /ยังไม่ได้เปิด OCR/);
  assert.match(line({ result: { kind: null, via: 'text' } }), /ไม่พบหัวเอกสารที่รู้จัก/);
  assert.equal(line({ state: 'waiting' }), 'รออ่าน');
  assert.equal(line({ state: 'failed', error: 'อ่าน PDF นี้ไม่ได้' }), 'อ่าน PDF นี้ไม่ได้');
});
