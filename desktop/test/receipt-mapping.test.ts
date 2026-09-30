import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

async function loadReview() {
  const source = await readFile(new URL('../../experiments/local-thai-ocr/web/receipt-review.js', import.meta.url), 'utf8');
  const context: any = { window: {} };
  runInNewContext(source, context);
  return context.window.ReceiptReview;
}

test('AFP mapping fills fields when OCR splits labels and values into separate boxes', async () => {
  const review = await loadReview();
  const lines = [
    { text: 'ผู้ขาย', box: [80, 30, 180, 60] },
    { text: 'บริษัท ตัวอย่าง จำกัด', box: [240, 30, 620, 60] },
    { text: 'เลขที่ใบเสร็จ', box: [80, 90, 250, 120] },
    { text: 'RC-2048', box: [850, 90, 1040, 120] },
    { text: 'วันที่', box: [80, 140, 180, 170] },
    { text: '23/09/2569', box: [850, 140, 1040, 170] },
    { text: 'เลขประจำตัวผู้เสียภาษี', box: [80, 190, 380, 220] },
    { text: '0105559999999', box: [850, 190, 1080, 220] },
    { text: 'ยอดก่อนภาษี', box: [80, 300, 260, 330] },
    { text: '100.00', box: [900, 300, 1050, 330] },
    { text: 'ภาษีมูลค่าเพิ่ม', box: [80, 350, 280, 380] },
    { text: '7.00', box: [900, 350, 1050, 380] },
    { text: 'ยอดรวม', box: [80, 400, 220, 430] },
    { text: '107.00', box: [900, 400, 1050, 430] },
  ].map(line => ({ ...line, confidence: 0.95 }));

  const extracted = review.extractReceipt({ pages: [{ page: 1, source: 'ocr', lines }] });
  assert.equal(extracted.fields.merchant.value, 'บริษัท ตัวอย่าง จำกัด');
  assert.equal(extracted.fields.receiptNumber.value, 'RC-2048');
  assert.equal(extracted.fields.date.value, '23/09/2569');
  assert.equal(extracted.fields.taxId.value, '0105559999999');
  assert.equal(extracted.fields.subtotal.value, '100.00');
  assert.equal(extracted.fields.vat.value, '7.00');
  assert.equal(extracted.fields.total.value, '107.00');
  assert.equal(extracted.fields.total.mappingMethod, 'same-row');
  assert.equal(extracted.afpMapping.fields.total.status, 'mapped');
});

test('AFP mapping uses safe next-line fallback when OCR has no geometry', async () => {
  const review = await loadReview();
  const texts = [
    'ผู้ขาย',
    'ร้านเหนือ จำกัด',
    'เลขที่เอกสาร',
    'INV-7788',
    'วันที่',
    '30/09/2569',
    'เลขผู้เสียภาษี',
    '0105558888888',
    'ยอดก่อนภาษี',
    '1,000.00',
    'VAT',
    '70.00',
    'Grand Total',
    '1,070.00',
  ];
  const extracted = review.extractReceipt({
    pages: [{ page: 1, source: 'ocr', lines: texts.map(text => ({ text, confidence: 0.9 })) }],
  });

  assert.equal(extracted.fields.receiptNumber.value, 'INV-7788');
  assert.equal(extracted.fields.subtotal.value, '1,000.00');
  assert.equal(extracted.fields.vat.value, '70.00');
  assert.equal(extracted.fields.total.value, '1,070.00');
  assert.equal(extracted.fields.receiptNumber.mappingMethod, 'next-line');
});

test('ambiguous OCR values are offered as candidates instead of silently choosing one', async () => {
  const review = await loadReview();
  const extracted = review.extractReceipt({
    pages: [
      {
        page: 1,
        source: 'ocr',
        lines: [
          { text: 'ร้านตัวอย่าง จำกัด', confidence: 0.95 },
          { text: 'วันที่ 30/09/2569', confidence: 0.95 },
          { text: 'ยอดรวม 107.00', confidence: 0.95 },
          { text: 'ยอดสุทธิ 108.00', confidence: 0.95 },
        ],
      },
    ],
  });

  assert.equal(extracted.fields.total.value, '');
  assert.equal(extracted.fields.total.mappingStatus, 'ambiguous');
  assert.deepEqual(
    Array.from(extracted.fields.total.candidates, (candidate: any) => candidate.value),
    ['107.00', '108.00'],
  );
});

test('a missing value is not stolen from the next AFP field label and remains traceable', async () => {
  const review = await loadReview();
  const extracted = review.extractReceipt({
    pages: [
      {
        page: 1,
        source: 'ocr',
        lines: [
          { text: 'ร้านตัวอย่าง จำกัด', confidence: 0.95 },
          { text: 'วันที่ 30/09/2569', confidence: 0.95 },
          { text: 'ภาษีมูลค่าเพิ่ม', confidence: 0.95 },
          { text: 'ยอดสุทธิ 107.00', confidence: 0.95 },
        ],
      },
    ],
  });

  assert.equal(extracted.fields.vat.value, '');
  assert.equal(extracted.fields.total.value, '107.00');
  assert.ok(extracted.afpMapping.unresolved_field_lines.some((line: any) => line.text === 'ภาษีมูลค่าเพิ่ม'));
  assert.ok(extracted.afpMapping.unmapped_ocr_lines.some((line: any) => line.text === 'ภาษีมูลค่าเพิ่ม'));
});

test('Paddle and Tesseract disagreement becomes ambiguous instead of auto-filling', async () => {
  const review = await loadReview();
  const extracted = review.extractReceipt({
    pages: [
      {
        page: 1,
        source: 'ocr',
        lines: [
          { text: 'ร้านตัวอย่าง จำกัด', confidence: 0.95 },
          { text: 'วันที่ 30/09/2569', confidence: 0.95 },
          {
            text: 'ยอดรวม 107.00',
            confidence: 0.95,
            tesseract_candidate: 'ยอดรวม 108.00',
            tesseract_confidence: 0.91,
            tesseract_status: 'disagree',
            text_kind: 'printed-conflict',
          },
        ],
      },
    ],
  });

  assert.equal(extracted.fields.total.value, '');
  assert.equal(extracted.fields.total.mappingStatus, 'ambiguous');
  const candidates = Array.from(extracted.fields.total.candidates, (candidate: any) => [candidate.value, candidate.engine]);
  assert.deepEqual(candidates, [
    ['107.00', 'paddle'],
    ['108.00', 'tesseract'],
  ]);
});

test('handwriting-only candidate stays ambiguous until a person or AI filter chooses it', async () => {
  const review = await loadReview();
  const extracted = review.extractReceipt({
    pages: [
      {
        page: 1,
        source: 'ocr',
        lines: [
          { text: 'ร้านตัวอย่าง จำกัด', confidence: 0.95 },
          { text: 'วันที่ 30/09/2569', confidence: 0.95 },
          {
            text: 'ยอดรวม',
            confidence: 0.35,
            handwriting_candidate: 'ยอดรวม 109.00',
            text_kind: 'handwriting-likely',
            needs_review: true,
          },
        ],
      },
    ],
  });

  assert.equal(extracted.fields.total.value, '');
  assert.equal(extracted.fields.total.mappingStatus, 'ambiguous');
  assert.ok(extracted.fields.total.candidates.some((candidate: any) => candidate.value === '109.00' && candidate.engine === 'thai-trocr'));
});
