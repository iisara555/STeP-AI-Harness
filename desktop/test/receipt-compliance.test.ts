import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addWorkingDays,
  classifyFromText,
  complianceChecklist,
  complianceSummary,
  receiptCompleteness,
  parseReceiptDate,
  thaiDate,
} from '../src/receipt-compliance';
import { parseVisionReading } from '../src/receipt-vision';

const iso = (d: Date | null) => d?.toISOString().slice(0, 10);

test('parseReceiptDate reads Thai and Christian dates as printed', () => {
  assert.equal(iso(parseReceiptDate('2 ต.ค. 2569')), '2026-10-02');
  assert.equal(iso(parseReceiptDate('๒ ตุลาคม ๒๕๖๙')), '2026-10-02');
  assert.equal(iso(parseReceiptDate('วันที่ 02/10/2569')), '2026-10-02');
  assert.equal(parseReceiptDate('2/10/69'), null, 'a two-digit year requires confirmation of the full year');
  assert.equal(iso(parseReceiptDate('2026-10-02')), '2026-10-02');
  assert.equal(iso(parseReceiptDate('2 Oct 2026')), '2026-10-02');
  assert.equal(parseReceiptDate('31/02/2569'), null);
  assert.equal(parseReceiptDate('ไม่มีวันที่'), null);
});

test('addWorkingDays skips weekends; thaiDate prints the Buddhist year', () => {
  const friday = parseReceiptDate('2 ต.ค. 2569')!;
  assert.equal(thaiDate(addWorkingDays(friday, 3)), '7 ต.ค. 2569');
  assert.equal(thaiDate(addWorkingDays(friday, 5)), '9 ต.ค. 2569');
});

test('classifyFromText takes the most specific printed heading', () => {
  assert.equal(classifyFromText('บิลเงินสด\nCASH SALE เล่มที่ 001'), 'cash_bill');
  assert.equal(classifyFromText('ใบเสร็จรับเงิน/ใบกำกับภาษี'), 'tax_invoice');
  assert.equal(classifyFromText('ใบกำกับภาษีอย่างย่อ TAX INVOICE (ABB)'), 'abbreviated_tax_invoice');
  assert.equal(classifyFromText('ใบเสร็จรับเงิน'), 'receipt');
  assert.equal(classifyFromText('ใบแจ้งหนี้ / ใบวางบิล'), 'invoice_or_quotation');
  assert.equal(classifyFromText('โอนเงินสำเร็จ 15 ก.ย. 69'), 'transfer_slip');
  // The heading wins over words further down, such as a quotation's terms mentioning a receipt.
  assert.equal(
    classifyFromText(
      'cnx\nใบเสนอราคา\n/ Quotation\nเลขที่ QT26-0022\nวันที่ 20 สิงหาคม 2569\nลูกโป่งเชียงใหม่\nโทร 098-8187883\nลูกค้า / Customer\nรายการ\nยืนราคา 30 วัน ออกใบเสร็จเมื่อชำระเงิน',
    ),
    'invoice_or_quotation',
  );
  assert.equal(classifyFromText('ร้านตัวอย่าง\nCASH SALE\nAbbott Laboratories'), 'cash_bill', 'a word containing "abb" is not ABB');
  assert.equal(classifyFromText('ขอบคุณที่อุดหนุน'), '');
});

// The pattern of a real handwritten cash bill: signed, buyer named, total in words, dated on a Friday.
const cashBill = {
  type: 'cash_bill' as const,
  features: { handwritten: true, receiverSigned: true, buyerNamed: true, itemsListed: true },
  values: { merchant: 'ร้านตัวอย่าง', date: '2 ต.ค. 2569', total: '808' },
  amountInWords: 'แปดร้อยแปดบาทถ้วน',
};

test('a signed handwritten cash bill: nothing missing, and the category B deadline when the category is not chosen', () => {
  const items = complianceChecklist({ ...cashBill, category: 'unsure', today: new Date(2026, 9, 3) });
  const byId = Object.fromEntries(items.map(i => [i.id, i]));
  assert.equal(complianceSummary(items).missing, 0);
  for (const id of ['payee', 'date', 'items', 'amount', 'signature']) assert.equal(byId[id].status, 'ok', id);
  assert.equal(byId.report_deadline.status, 'todo');
  assert.deepEqual(byId.report_deadline.vars, [3, '7 ต.ค. 2569']);
  assert.equal(byId.report_deadline.ifCategoryB, true);
  assert.equal(byId.clearing_set.source, 'afp');
  assert.equal(byId.cash_bill.source, 'need-source', 'whether a cash bill is accepted is not made up');
  assert.equal(byId.handwritten.status, 'info');
  assert.equal(byId.buyer.source, 'need-source');
});

test('deadlines, caps and the emergency category follow the AFP circular', () => {
  const late = complianceChecklist({ ...cashBill, category: 'B', today: new Date(2026, 9, 8) });
  const deadline = late.find(i => i.id === 'report_deadline')!;
  assert.equal(deadline.status, 'warn');
  assert.equal(deadline.ifCategoryB, undefined, 'a chosen category needs no "if"');
  const big = complianceChecklist({ ...cashBill, values: { ...cashBill.values, total: '12,500.00' }, category: 'B' });
  assert.ok(big.some(i => i.id === 'over_cap' && i.status === 'warn'));
  const emergency = complianceChecklist({ ...cashBill, category: 'emergency', today: new Date(2026, 9, 3) });
  assert.deepEqual(emergency.find(i => i.id === 'report_deadline')!.vars, [5, '9 ต.ค. 2569']);
  assert.ok(emergency.some(i => i.id === 'emergency_approval'));
  assert.ok(!emergency.some(i => i.id === 'clearing_set'));
  const other = complianceChecklist({ ...cashBill, category: 'other' });
  assert.ok(other.some(i => i.id === 'other_category' && i.source === 'need-source'));
  assert.ok(!other.some(i => i.id === 'report_deadline'));
});

test('slips and invoices are not proof of payment; missing elements and AFP to-dos show', () => {
  const slip = complianceChecklist({ type: 'transfer_slip', features: {}, values: { total: '500' }, category: 'B' });
  assert.equal(slip[0].id, 'not_proof_of_payment');
  assert.equal(slip[0].status, 'missing');
  assert.ok(!slip.some(i => i.id === 'payee'));
  const bare = complianceChecklist({
    type: 'abbreviated_tax_invoice',
    features: { receiverSigned: false, foreignLanguage: true, inappropriateDrinks: true },
    values: { total: '120' },
    category: 'B',
  });
  const ids = (status: string) => bare.filter(i => i.status === status).map(i => i.id);
  assert.deepEqual(ids('missing'), ['payee', 'date', 'signature']);
  assert.ok(ids('todo').includes('thermal_copy'), 'abbreviated tax invoices are thermal slips');
  assert.ok(ids('todo').includes('translation'));
  assert.ok(ids('warn').includes('drinks'));
  assert.equal(bare.find(i => i.id === 'amount')!.status, 'warn', 'figures without words');
});

test('the vision reading carries the document type and only boolean features', () => {
  const reading = parseVisionReading(
    JSON.stringify({ fields: {}, documentType: 'cash_bill', features: { handwritten: true, thermalPaper: 'no', receiverSigned: false } }),
  );
  assert.equal(reading.documentType, 'cash_bill');
  assert.deepEqual(reading.features, { handwritten: true, receiverSigned: false });
  assert.equal(parseVisionReading('{"fields":{},"documentType":"approved"}').documentType, '');
});

test('basic receipt completeness includes an issuer address and unknown signatures rather than silently passing them', () => {
  const unknown = complianceChecklist({
    type: 'receipt',
    features: {},
    values: { merchant: 'ร้านสังเคราะห์', date: '2/10/2569', total: '100' },
    amountInWords: 'หนึ่งร้อยบาทถ้วน',
    category: 'other',
  });
  for (const id of ['payee_address', 'items', 'signature']) assert.equal(unknown.find(item => item.id === id)?.status, 'warn', id);
  assert.equal(receiptCompleteness(unknown).status, 'uncertain');
  const complete = complianceChecklist({
    ...cashBill,
    values: { ...cashBill.values, merchantAddress: 'ที่อยู่สังเคราะห์สำหรับทดสอบ' },
    category: 'other',
  });
  assert.equal(receiptCompleteness(complete).status, 'complete');
  assert.equal(receiptCompleteness(complete).presentCount, 5);
  const unsigned = complianceChecklist({
    ...cashBill,
    features: { ...cashBill.features, receiverSigned: false },
    values: { ...cashBill.values, merchantAddress: 'ที่อยู่สังเคราะห์สำหรับทดสอบ' },
    category: 'other',
  });
  assert.equal(receiptCompleteness(unsigned).status, 'incomplete');
  assert.ok(receiptCompleteness(unsigned).missingIds.includes('signature'));
});
