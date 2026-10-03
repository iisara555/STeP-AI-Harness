import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amount, compareField, parseVisionReading, receiptRuleChecks, thaiBahtWords, validThaiTaxId } from '../src/receipt-vision';

// A 13-digit ID with a correct check digit, built with the Revenue Department's mod-11 rule.
const withCheckDigit = (twelve: string) => {
  const sum = [...twelve].reduce((total, n, i) => total + Number(n) * (13 - i), 0);
  return twelve + ((11 - (sum % 11)) % 10);
};
const TAX_ID = withCheckDigit('010555012345');

test('parseVisionReading keeps the seven fields, converts Thai digits and drops the rest', () => {
  const reading = parseVisionReading(
    'Here it is:\n```json\n' +
      JSON.stringify({
        fields: {
          merchant: { value: ' ร้าน  กาแฟดี ', evidence: 'ร้านกาแฟดี สาขานิมมาน' },
          total: { value: '๑๐๗.๐๐', evidence: 'รวม ๑๐๗.๐๐' },
          vat: { value: '', evidence: '' },
          taxId: TAX_ID,
          password: { value: 'x' },
        },
        buyerTaxId: '0994000123456',
        notes: 'มีลายมือแก้ยอด',
      }) +
      '\n```',
  );
  assert.deepEqual(Object.keys(reading.fields).sort(), ['merchant', 'taxId', 'total']);
  assert.equal(reading.fields.merchant?.value, 'ร้าน กาแฟดี');
  assert.equal(reading.fields.total?.value, '107.00');
  assert.equal(reading.fields.taxId?.value, TAX_ID);
  assert.equal(reading.buyerTaxId, '0994000123456');
  assert.equal(reading.notes, 'มีลายมือแก้ยอด');
  assert.throws(() => parseVisionReading('sorry, I cannot read this'), /RECEIPT_VISION_UNREADABLE/);
  assert.throws(() => parseVisionReading('{not json}'), /RECEIPT_VISION_UNREADABLE/);
});

test('compareField compares each field the way it is written', () => {
  assert.equal(compareField('total', '1,250.00 บาท', '1250'), 'agree');
  assert.equal(compareField('total', '1250.00', '1520.00'), 'differ');
  assert.equal(compareField('taxId', '0-1055-50123-45-6', '0105550123456'), 'agree');
  assert.equal(compareField('merchant', 'บริษัท กาแฟดี จำกัด', 'กาแฟดี'), 'agree');
  assert.equal(compareField('merchant', 'กาแฟดี', 'ชาเย็น'), 'differ');
  assert.equal(compareField('receiptNumber', 'inv 001', 'INV001'), 'agree');
  assert.equal(compareField('date', '', '12/03/2569'), 'ai-only');
  assert.equal(compareField('date', '12/03/2569', ''), 'ocr-only');
  assert.equal(compareField('vat', ' ', ''), 'empty');
  assert.ok(Number.isNaN(amount('12 และ 13')));
});

test('validThaiTaxId checks the mod-11 check digit', () => {
  assert.equal(validThaiTaxId(TAX_ID), true);
  assert.equal(validThaiTaxId(TAX_ID.slice(0, 12) + ((Number(TAX_ID[12]) + 1) % 10)), false);
  assert.equal(validThaiTaxId('12345'), false);
});

test('receiptRuleChecks flags a bad check digit, VAT that is not 7% and amounts that do not add up', () => {
  assert.deepEqual(receiptRuleChecks({ taxId: TAX_ID, subtotal: '100.00', vat: '7.00', total: '107.00' }), []);
  const codes = receiptRuleChecks({
    taxId: TAX_ID.slice(0, 12) + ((Number(TAX_ID[12]) + 1) % 10),
    subtotal: '100',
    vat: '10',
    total: '107',
  }).map(r => r.code);
  assert.deepEqual(codes, ['tax_id_checksum', 'vat_not_7_percent', 'amounts_do_not_add_up']);
  assert.deepEqual(receiptRuleChecks({ taxId: '123', vat: '5' }), [], 'nothing to check is not a finding');
});

test('thaiBahtWords reads the total written in Thai words', () => {
  assert.equal(thaiBahtWords('แปดร้อยแปดบาทถ้วน'), 808);
  assert.equal(thaiBahtWords('(หนึ่งพันสองร้อยห้าสิบบาทถ้วน)'), 1250);
  assert.equal(thaiBahtWords('สิบเอ็ดบาท'), 11);
  assert.equal(thaiBahtWords('ยี่สิบเอ็ดบาทห้าสิบสตางค์'), 21.5);
  assert.equal(thaiBahtWords('หนึ่งล้านสองแสนบาทถ้วน'), 1_200_000);
  assert.equal(thaiBahtWords('หนึ่งร้อยเจ็ดบาทตัว'), 107);
  assert.ok(Number.isNaN(thaiBahtWords('ขอบคุณที่อุดหนุน')));
  assert.ok(Number.isNaN(thaiBahtWords('')));
});

test('a handwritten cash bill: a government-body tax ID in the issuer box and the total in words', () => {
  // The pattern of a real cash bill: no VAT, the customer (a university unit) has a 0994… tax ID, and the shop wrote
  // it in its own box. Values here are synthetic.
  const governmentId = withCheckDigit('099400012345');
  const values = { merchant: 'ร้านตัวอย่าง Smoothies', receiptNumber: 'เล่ม 001 เลขที่ 005', taxId: governmentId, total: '808.00' };
  assert.deepEqual(
    receiptRuleChecks(values, { amountInWords: 'แปดร้อยแปดบาทถ้วน' }).map(r => r.code),
    ['tax_id_may_be_buyer'],
  );
  assert.deepEqual(
    receiptRuleChecks({ ...values, taxId: TAX_ID }, { amountInWords: 'แปดร้อยแปดบาทถ้วน' }).map(r => r.code),
    [],
    'a shop ID with words that match is clean',
  );
  assert.deepEqual(
    receiptRuleChecks({ ...values, taxId: TAX_ID, total: '880.00' }, { amountInWords: 'แปดร้อยแปดบาทถ้วน' }).map(r => r.code),
    ['amount_words_differ'],
  );
  assert.deepEqual(
    receiptRuleChecks({ taxId: TAX_ID }, { buyerTaxId: TAX_ID }).map(r => r.code),
    ['tax_id_may_be_buyer'],
    "the same ID as the buyer is the buyer's",
  );
  assert.equal(parseVisionReading('{"fields":{},"amountInWords":"แปดร้อยแปดบาทถ้วน"}').amountInWords, 'แปดร้อยแปดบาทถ้วน');
});
