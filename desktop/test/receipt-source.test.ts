import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { receiptSourceText } from '../src/receipt-source';

test('receipt handoff serializes the reviewed JSON as persistent workspace source', () => {
  const source = receiptSourceText({
    schema: 'step-receipt-review/v1',
    filename: 'receipt.jpg',
    fields: { total: { value: '107.00', checked: true } },
    afp_mapping: { fields: { total: { status: 'mapped', selected_value: '107.00' } }, unmapped_ocr_lines: [] },
  });
  assert.match(source, /persistent workspace source/);
  assert.match(source, /step-receipt-review\/v1/);
  assert.match(source, /"total"/);
  assert.match(source, /107\.00/);
  assert.match(source, /afp_mapping/);
  assert.match(source, /blank field may still have OCR candidates or unmapped lines/);
});

test('large OCR handoff fits host source limits without losing confirmed values or hiding omitted evidence', () => {
  const source = receiptSourceText({
    source_id: 'synthetic',
    fields: { total: { value: '107.00', checked: true } },
    ocr: { text: 'synthetic line\n'.repeat(20000), lines: Array.from({ length: 2000 }, () => ({ text: 'synthetic line', page: 1 })) },
    afp_mapping: { fields: { total: { selected_value: '107.00', candidates: Array.from({ length: 1000 }, () => ({ value: '107.00' })) } } },
  });
  assert.ok(source.length <= 90_000);
  const data = JSON.parse(source.slice(source.indexOf('{')));
  assert.equal(data.fields.total.value, '107.00');
  assert.equal(data.fields.total.provenance, 'SOURCE_FACT');
  assert.equal(data.fields.total.verification, 'human-source-comparison');
  assert.equal(data.ocr.provenance, 'EXTRACTED_UNVERIFIED');
  assert.ok(data.handoff_evidence_limit.omitted);
  assert.match(source, /not proof that omitted evidence was absent/);
});

test('receipt UI passes structured source through workspace send and consent replay', async () => {
  const receipt = await readFile(new URL('../src/receipt.tsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const main = await readFile(new URL('../electron/main.ts', import.meta.url), 'utf8');

  assert.match(receipt, /receiptSourceText\(draft\(\)\)/);
  assert.match(app, /start\(\s*s\.id,\s*text,\s*\[\],\s*undefined,\s*undefined,\s*allowIds,\s*sourceText,\s*'chat'/);
  assert.match(app, /allowIdentifiers: allowIds,\s*sourceText/);
  assert.match(app, /ask\.allowIds,\s*ask\.sourceText/);
  assert.match(app, /handoff=\{receiptHandoff\}/);
  assert.match(main, /combinedSource/);
  assert.match(main, /\.run\(\s*id,\s*text,\s*combinedSource,\s*true/);
});
