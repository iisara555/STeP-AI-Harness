import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVisionReading, compareField, receiptRuleChecks, thaiBahtWords } from '../src/receipt-vision';
import { visionFormSuggestions, receiptDetailRegions, receiptFocusStyle, receiptCropRectangle } from '../src/receipt-hybrid';
import { emptyReceiptForm, receiptFormReducer } from '../src/receipt-form';

test('handwritten Vision readings replace confident OCR while printed readings retain the existing comparison', () => {
  const reading = parseVisionReading(JSON.stringify({ fields: { total: { value: '808.00', is_handwritten: true, confidence: 0.95 } } }));
  const suggestions = visionFormSuggestions({ total: '880.00' }, {}, reading);
  assert.equal(suggestions.total, '808.00');
  assert.equal(
    visionFormSuggestions({ total: '880.00' }, {}, parseVisionReading('{"fields":{"total":{"value":"808.00"}}}')).total,
    undefined,
  );
  let state = receiptFormReducer(emptyReceiptForm, {
    type: 'load',
    sourceId: 'synthetic',
    values: { total: '880.00' },
    guessed: {},
    description: '',
  });
  state = receiptFormReducer(state, { type: 'edit', field: 'total', value: '809.00' });
  state = receiptFormReducer(state, { type: 'suggest', sourceId: 'synthetic', origin: 'vision', values: suggestions });
  assert.equal(state.values.total, '809.00');
});

test('Vision metadata is bounded and unknown confidence is never made certain', () => {
  const reading = parseVisionReading(
    JSON.stringify({
      is_handwritten: true,
      fields: {
        total: { value: '๘๐๘.๐๐', confidence: 0.8, region: { page: 1, x: 0.6, y: 0.8, width: 0.3, height: 0.1 } },
        merchant: {
          value: 'ร้านสังเคราะห์',
          confidence: 99,
          is_handwritten: 'true',
          region: { page: 1, x: -1, y: 0, width: 2, height: 1 },
        },
      },
    }),
  );
  assert.equal(reading.features.handwritten, true);
  assert.equal(reading.fields.total?.confidence, 0.8);
  assert.deepEqual(reading.fields.total?.region, { page: 1, x: 0.6, y: 0.8, width: 0.3, height: 0.1 });
  assert.equal(reading.fields.merchant?.confidence, null);
  assert.equal(reading.fields.merchant?.region, null);
  assert.throws(() => parseVisionReading('null'), /RECEIPT_VISION_UNREADABLE/);
  assert.throws(() => parseVisionReading('{"fields":[]}'), /RECEIPT_VISION_UNREADABLE/);
});

test('detail crops keep their original page coordinates and fit inside the source', () => {
  const regions = receiptDetailRegions(1);
  assert.equal(regions.length, 3);
  for (const region of regions) {
    assert.equal(region.page, 1);
    assert.ok(region.x >= 0 && region.y >= 0 && region.x + region.width <= 1 && region.y + region.height <= 1);
  }
  const style = receiptFocusStyle({ page: 1, x: 0.5, y: 0.7, width: 0.25, height: 0.1 });
  assert.equal(style.width, '400%');
  assert.equal(style.transform, 'translate(-50%, -70%)');
  assert.deepEqual(receiptCropRectangle(4000, 6000, regions[2]), { x: 0, y: 3900, width: 4000, height: 2100 });
  assert.throws(() => receiptCropRectangle(0, 6000, regions[2]), /RECEIPT_VISION_FORMAT/);
  assert.throws(() => receiptCropRectangle(20000, 20000, regions[2]), /ATTACH_TOO_LARGE/);
});

test('a one-satang mismatch and malformed amount remain review findings, never mathematical repair', () => {
  const codes = receiptRuleChecks({ subtotal: '100.00', vat: '7.00', total: '107.01' }).map(n => n.code);
  assert.ok(codes.includes('amounts_do_not_add_up'));
  assert.ok(receiptRuleChecks({ total: '1,07.00' }).some(n => n.code === 'invalid_money'));
  assert.ok(receiptRuleChecks({ total: '107.001' }).some(n => n.code === 'invalid_money'));
  assert.equal(compareField('total', '107.001', '107.00'), 'differ');
  assert.equal(compareField('date', '2 ต.ค. 2569', '2 ธ.ค. 2569'), 'differ');
  assert.equal(compareField('date', '02/10/2569', '2 ต.ค. 2569'), 'agree');
  assert.equal(compareField('merchant', 'ร้านสังเคราะห์', 'ร้านสังเคราะห์ สาขาสอง'), 'differ');
  assert.equal(compareField('taxId', 'x0105550123456', '0105550123456'), 'differ');
  assert.ok(Number.isNaN(thaiBahtWords('หนึ่งสองบาทถ้วน')));
  assert.ok(Number.isNaN(thaiBahtWords('หนึ่งสิบสองร้อยบาทถ้วน')));
});

test('table math uses only observed quantities, prices and an explicitly printed table total', () => {
  const reading = parseVisionReading(
    JSON.stringify({
      fields: {},
      itemsTotal: '100.00',
      items: [{ description: 'สินค้าสังเคราะห์', quantity: '๒', unitPrice: '50.00', amount: '90.00' }],
    }),
  );
  assert.equal(reading.items[0].quantity, '2');
  assert.equal(reading.items[0].amount, '90.00');
  assert.equal(
    reading.expenseDescription,
    'สินค้าสังเคราะห์',
    'observed item rows fill the expense description without guessing from the merchant',
  );
  const codes = receiptRuleChecks({}, reading).map(issue => issue.code);
  assert.ok(codes.includes('item_amount_mismatch'));
  assert.ok(codes.includes('items_total_mismatch'));
  const valid = parseVisionReading(
    JSON.stringify({
      fields: { total: '107.00' },
      items: [{ description: 'สินค้าสังเคราะห์', quantity: '2', unitPrice: '50.00', amount: '100.00' }],
    }),
  );
  assert.deepEqual(receiptRuleChecks({}, valid), [], 'no table total is inferred from the payable amount');
  assert.throws(
    () => parseVisionReading(JSON.stringify({ fields: {}, items: Array(101).fill({ amount: '1' }) })),
    /RECEIPT_VISION_UNREADABLE/,
  );
});

test('a buyer signature cannot satisfy the receiver field, and uncertain presence stays unknown', () => {
  const region = { page: 1, x: 0.1, y: 0.8, width: 0.4, height: 0.1 };
  const buyerOnly = parseVisionReading(
    JSON.stringify({
      fields: {},
      features: { receiverSigned: true },
      signatures: {
        buyer: { status: 'present', evidence: 'ลายเซ็นในช่องผู้ซื้อ', region, confidence: 0.9 },
      },
    }),
  );
  assert.equal(buyerOnly.features.receiverSigned, undefined);
  assert.equal(buyerOnly.signatures.buyer?.status, 'present');
  const receiver = parseVisionReading(
    JSON.stringify({
      fields: {},
      signatures: {
        receiver: { status: 'present', evidence: 'ลายเซ็นในช่องผู้รับเงิน', region, confidence: 0.9 },
        issuer: { status: 'present', evidence: '', region: null },
      },
    }),
  );
  assert.equal(receiver.features.receiverSigned, true);
  assert.equal(receiver.signatures.issuer?.status, 'uncertain');
  assert.equal(receiver.signatures.receiver?.confidence, 0.9);
  const unclear = parseVisionReading('{"fields":{},"features":{"receiverSigned":true},"signatures":{"receiver":{"status":"uncertain"}}}');
  assert.equal(unclear.features.receiverSigned, undefined);
});
