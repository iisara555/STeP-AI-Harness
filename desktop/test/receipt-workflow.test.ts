import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expenseCategorySuggestion, expenseDescriptionFromText, formValues, receiptAssessment } from '../src/receipt-workflow';

test('form filling formats only source-backed digits, dates and money without inventing absent VAT', () => {
  const values = formValues({
    merchant: ' ร้านตัวอย่าง ',
    receiptNumber: '๐๐๕',
    date: '2 ต.ค. 2569',
    total: '๘๐๘ บาท',
    vat: '',
    taxId: '๐-๑๒๓๔-๕๖๗๘๙-๐๑-๒',
  });
  assert.equal(values.merchant, 'ร้านตัวอย่าง');
  assert.equal(values.receiptNumber, '005');
  assert.equal(values.date, '02/10/2569');
  assert.equal(values.total, '808.00');
  assert.equal(values.vat, '');
  assert.equal(values.taxId, '0123456789012');
  assert.equal(formValues({ total: 'ไม่แน่ใจ', date: '31/02/2569' }).total, 'ไม่แน่ใจ');
  assert.equal(formValues({ date: '31/02/2569' }).date, '31/02/2569');
});

test('the circular supports drinking water B10 but not arbitrary drinks or a budget inferred from a merchant', () => {
  assert.equal(expenseCategorySuggestion('ค่าน้ำดื่ม 12 ขวด').code, 'B10');
  assert.equal(expenseCategorySuggestion('ค่าเครื่องดื่ม').category, 'unsure');
  assert.equal(expenseCategorySuggestion('กาแฟและสมูทตี้').code, '');
  assert.equal(expenseCategorySuggestion('ค่าน้ำดื่ม; ค่ากาแฟ').category, 'unsure');
  assert.equal(expenseCategorySuggestion('ค่าเครื่องดื่ม น้ำดื่ม กาแฟ').category, 'unsure');
  assert.equal(expenseCategorySuggestion('ค่าหนังสือ; ค่าครุภัณฑ์').category, 'unsure');
  const water = expenseCategorySuggestion('ค่าน้ำดื่ม');
  assert.equal(water.provenance, 'AI_RECOMMENDATION');
  assert.match(water.sourceRef, /afp-operational-circulars/);
  assert.equal(water.budget, null);
  assert.ok(water.nextSteps.some(step => step.includes('ผลรวม')));
});

test('overlapping expenses remain ambiguous; category scope is not inferred from a shop name', () => {
  assert.equal(expenseCategorySuggestion('ค่าหนังสือ').code, 'B7');
  assert.equal(expenseCategorySuggestion('ค่าน้ำดื่มและหนังสือ').category, 'unsure');
  assert.equal(expenseCategorySuggestion('ค่าจ้างเหมารถตู้รวมน้ำมัน', '', '02/10/2569').code, 'BV1');
  assert.equal(expenseCategorySuggestion('ค่าจ้างเหมารถตู้รวมน้ำมัน', '', '02/08/2569').category, 'unsure');
  assert.equal(expenseCategorySuggestion('ค่าวัตถุดิบ', 'จัดพิธีไหว้ศาล').code, 'B9.2');
  assert.ok(expenseCategorySuggestion('ค่าวัตถุดิบ', 'จัดพิธีไหว้ศาล').nextSteps.some(step => step.includes('รูปถ่าย')));
  assert.ok(
    expenseCategorySuggestion('ค่าจ้างเหมารถตู้รวมน้ำมัน', '', '02/10/2569').nextSteps.some(step => step.includes('จัดซื้อจัดจ้าง')),
  );
});

test('local extraction reads explicit item labels and never fills an expense from the merchant/header', () => {
  assert.equal(expenseDescriptionFromText('ร้านน้ำดื่มตัวอย่าง\nบิลเงินสด\nรายการ ค่าเครื่องดื่ม\nยอดรวม 210'), 'ค่าเครื่องดื่ม');
  assert.equal(expenseDescriptionFromText('รายการ DESCRIPTION\nค่าหนังสือ\nจำนวนเงิน 210'), 'ค่าหนังสือ');
  assert.equal(expenseDescriptionFromText('ร้านน้ำดื่มตัวอย่าง\nยอดรวม 210'), '');
});

test('receipt assessment cannot accept an invoice merely because fields are confirmed', () => {
  const result = receiptAssessment({
    type: 'invoice_or_quotation',
    values: { merchant: 'ร้านตัวอย่าง', date: '02/10/2569', total: '210.00' },
    items: [],
    hasRuleWarnings: false,
    checked: true,
  });
  assert.equal(result.status, 'needs-document');
  assert.equal(result.paymentApproved, false);
});

test('cash-bill source gaps and arithmetic warnings stay unresolved after human transcription confirmation', () => {
  const input = {
    type: 'cash_bill' as const,
    values: { merchant: 'ร้านตัวอย่าง', date: '02/10/2569', total: '210.00' },
    hasRuleWarnings: false,
    checked: true,
  };
  assert.equal(
    receiptAssessment({ ...input, items: [{ id: 'cash_bill', status: 'info', source: 'need-source', text: 'ขาดแหล่งยืนยัน' }] }).status,
    'needs-policy',
  );
  assert.equal(receiptAssessment({ ...input, items: [], hasRuleWarnings: true }).status, 'needs-correction');
  assert.equal(receiptAssessment({ ...input, values: { ...input.values, date: '31/02/2569' }, items: [] }).status, 'needs-correction');
  assert.equal(receiptAssessment({ ...input, items: [], checked: false }).status, 'awaiting-confirmation');
  assert.equal(receiptAssessment({ ...input, items: [] }).status, 'prepared');
  assert.equal(
    receiptAssessment({
      ...input,
      items: [{ id: 'report_deadline', ifCategoryB: true, status: 'warn', source: 'afp', text: 'ถ้าเบิก B ต้องตรวจวันส่ง' }],
    }).status,
    'prepared',
  );
  assert.equal(
    receiptAssessment({ ...input, items: [{ id: 'report_deadline', status: 'warn', source: 'afp', text: 'เลยกำหนดรายงาน' }] }).status,
    'needs-actions',
  );
  assert.equal(
    receiptAssessment({ ...input, items: [{ id: 'clearing_set', status: 'todo', source: 'afp', text: 'เตรียมชุดเบิก' }] }).status,
    'needs-actions',
  );
});
