import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReceiptAiResolver, resolveReceiptAiResponse } from '../electron/receipt-ai';

test('AI OCR resolver hides candidate values behind local tokens', () => {
  const mapping = {
    schema: 'step-afp-receipt-precheck-mapping/v1',
    fields: {
      total: {
        label: 'ยอดรวมที่ชำระ',
        status: 'ambiguous',
        selected_value: '',
        evidence: 'ยอดรวม 107.00 หรือ 108.00',
        candidates: [
          { value: '107.00', evidence: 'ยอดรวม 107.00', method: 'same-line', engine: 'paddle', score: 1 },
          { value: '108.00', evidence: 'ยอดสุทธิ 108.00', method: 'same-line', engine: 'tesseract', score: 0.92 },
        ],
      },
      taxId: {
        label: 'เลขผู้เสียภาษีของผู้ออก',
        status: 'mapped',
        selected_value: '0105559999999',
        evidence: 'เลขผู้เสียภาษี 0105559999999',
        candidates: [],
      },
    },
    unresolved_field_lines: [{ text: 'โทร 081-234-5678', page: 1, confidence: 0.9 }],
  };
  const sanitize = (text: string) =>
    text.replace(/0105559999999/g, '[ID]').replace(/081-234-5678/g, '[PHONE]');
  const built = buildReceiptAiResolver(mapping, sanitize);

  assert.match(built.prompt, /C_total_1/);
  assert.match(built.prompt, /C_total_2/);
  assert.match(built.prompt, /C_taxId_1/);
  assert.doesNotMatch(built.prompt, /0105559999999/);
  assert.doesNotMatch(built.prompt, /081-234-5678/);
  assert.match(built.prompt, /\[PHONE\]/);
  assert.equal(built.tokens.get('C_total_1')?.value, '107.00');
  assert.equal(built.tokens.get('C_taxId_1')?.value, '0105559999999');
});

test('AI OCR resolver can return only OCR-created candidate tokens', () => {
  const mapping = {
    fields: {
      total: {
        label: 'ยอดรวมที่ชำระ',
        status: 'ambiguous',
        selected_value: '',
        candidates: [
          { value: '107.00', evidence: 'ยอดรวม 107.00', method: 'same-line', engine: 'paddle', score: 1 },
          { value: '108.00', evidence: 'ยอดสุทธิ 108.00', method: 'same-line', engine: 'tesseract', score: 0.92 },
        ],
      },
    },
  };
  const built = buildReceiptAiResolver(mapping, text => text);
  const decisions = resolveReceiptAiResponse(
    '{"decisions":{"total":{"choice":"C_total_2","reason":"Tesseract evidence is clearer"}}}',
    built.tokens,
    built.fields,
  );
  assert.deepEqual(decisions, [
    {
      field: 'total',
      status: 'suggested',
      value: '108.00',
      token: 'C_total_2',
      reason: 'Tesseract evidence is clearer',
    },
  ]);

  assert.throws(
    () =>
      resolveReceiptAiResponse(
        '{"decisions":{"total":{"choice":"109.00","reason":"invented"}}}',
        built.tokens,
        built.fields,
      ),
    /OCR_AI_INVALID_RESPONSE/,
  );
});

test('AI OCR resolver preserves uncertainty instead of forcing a field value', () => {
  const mapping = {
    fields: {
      total: {
        label: 'ยอดรวม',
        status: 'ambiguous',
        selected_value: '',
        candidates: [
          { value: '107.00', evidence: 'A', method: 'same-line', engine: 'paddle', score: 1 },
          { value: '108.00', evidence: 'B', method: 'same-line', engine: 'tesseract', score: 0.95 },
        ],
      },
      vat: {
        label: 'VAT',
        status: 'unmapped',
        selected_value: '',
        candidates: [],
      },
    },
  };
  const built = buildReceiptAiResolver(mapping, text => text);
  const decisions = resolveReceiptAiResponse(
    ```json
{"decisions":{"total":{"choice":"AMBIGUOUS","reason":"conflict"},"vat":{"choice":"UNMAPPED","reason":"no candidate"}}}
```,
    built.tokens,
    built.fields,
  );
  assert.deepEqual(decisions, [
    { field: 'total', status: 'ambiguous', reason: 'conflict' },
    { field: 'vat', status: 'unmapped', reason: 'no candidate' },
  ]);
});
