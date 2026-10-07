import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

async function mapper() {
  const context: any = { window: {} };
  runInNewContext(await readFile(new URL('../../experiments/local-thai-ocr/web/receipt-review.js', import.meta.url), 'utf8'), context);
  return context.window.ReceiptReview;
}

test('adjacent totals rows use their own amount, independent of OCR record order', async () => {
  const review = await mapper();
  const lines = [
    { text: 'ยอดก่อนภาษี', box: [10, 100, 120, 120] },
    { text: '100.00', box: [180, 100, 250, 120] },
    { text: 'ภาษีมูลค่าเพิ่ม', box: [10, 125, 120, 145] },
    { text: '7.00', box: [180, 125, 250, 145] },
    { text: 'ยอดสุทธิ', box: [10, 150, 120, 170] },
    { text: '107.00', box: [180, 150, 250, 170] },
  ];
  for (const ordered of [lines, [lines[0], lines[2], lines[4], lines[1], lines[3], lines[5]]]) {
    const fields = review.extractReceipt({ pages: [{ page: 1, lines: ordered }] }).fields;
    assert.equal(fields.subtotal.value, '100.00');
    assert.equal(fields.vat.value, '7.00');
    assert.equal(fields.total.value, '107.00');
  }
});

test('a distant unrelated number cannot fill a label with missing value', async () => {
  const review = await mapper();
  const fields = review.extractReceipt({
    pages: [
      {
        page: 1,
        lines: [
          { text: 'ยอดสุทธิ', box: [10, 100, 120, 120] },
          { text: '999.00', box: [180, 600, 250, 620] },
        ],
      },
    ],
  }).fields;
  assert.equal(fields.total.value, '');
});

test('a next-line amount retains spatial evidence and reference zeroes', async () => {
  const review = await mapper();
  const fields = review.extractReceipt({
    pages: [
      {
        page: 1,
        lines: [
          { text: 'ยอดสุทธิ', box: [10, 100, 120, 120] },
          { text: '๑๐๗.๐๐', box: [10, 130, 90, 150] },
          { text: 'เลขที่ใบเสร็จ AB-0001', box: [10, 200, 250, 220] },
        ],
      },
    ],
  }).fields;
  assert.equal(fields.total.value, '107.00');
  assert.equal(fields.receiptNumber.value, 'AB-0001');
});

test('malformed decimal and comma groups are not truncated into a plausible amount', async () => {
  const review = await mapper();
  for (const value of ['107.001', '1,07.00', '1.070,00', '-107.00', '432.2B', '1O7.00', '107.00X']) {
    const result = review.extractReceipt({ pages: [{ page: 1, lines: [{ text: `ยอดสุทธิ ${value}` }] }] });
    assert.equal(result.fields.total.value, '', value);
  }
});

test('conflicting tile readings stay traceable candidates requiring source comparison', async () => {
  const review = await mapper();
  const result = review.extractReceipt({
    pages: [
      {
        page: 1,
        lines: [
          {
            text: 'ยอดสุทธิ 107.00',
            confidence: 0.95,
            needs_review: true,
            tile_candidates: [{ text: 'ยอดสุทธิ 1.07', confidence: 0.95 }],
          },
        ],
      },
    ],
  });
  assert.equal(result.fields.total.mappingStatus, 'ambiguous');
  assert.equal(result.fields.total.value, '');
  assert.ok(result.fields.total.candidates.some((value: any) => value.value === '1.07'));
  assert.equal(result.records[0].text, 'ยอดสุทธิ 107.00');
});

test('an explicitly labeled buyer ID in the seller tax row never becomes the seller ID', async () => {
  const review = await mapper();
  const result = review.extractReceipt({
    pages: [
      {
        page: 1,
        lines: [
          { text: 'ร้านสังเคราะห์ทดสอบ' },
          { text: 'เลขประจำตัวผู้เสียภาษี' },
          { text: 'เลขผู้ซื้อ: 1111111111111' },
          { text: 'ยอดรวม 107.00' },
        ],
      },
    ],
  });
  assert.equal(result.fields.taxId.value, '');
  assert.equal(result.buyerTaxIdExcluded, true);
});

test('skewed rows use detected text polygons without borrowing the adjacent total', async () => {
  const review = await mapper();
  const result = review.extractReceipt({
    pages: [
      {
        page: 1,
        lines: [
          { text: '713.69', box: [652, 729, 767, 770] },
          {
            text: 'ยอดรวม',
            box: [43, 754, 156, 791],
            polygon: [
              [43, 758],
              [156, 754],
              [156, 787],
              [43, 791],
            ],
          },
          { text: '999.00', box: [652, 779, 767, 820] },
        ],
      },
    ],
  });
  assert.equal(result.fields.total.value, '713.69');
});
