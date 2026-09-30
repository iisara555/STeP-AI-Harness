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

test('receipt UI passes structured source through workspace send and consent replay', async () => {
  const receipt = await readFile(new URL('../src/receipt.tsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const main = await readFile(new URL('../electron/main.ts', import.meta.url), 'utf8');

  assert.match(receipt, /receiptSourceText\(draft\(\)\)/);
  assert.match(app, /start\(s\.id, text, \[\], undefined, undefined, allowIds, sourceText, 'draft'\)/);
  assert.match(app, /allowIdentifiers: allowIds,\s*sourceText/);
  assert.match(app, /ask\.allowIds,\s*ask\.sourceText/);
  assert.match(app, /handoff=\{\(text, sourceText, allowIds\).*receiptHandoff\(text, sourceText, allowIds\)/s);
  assert.match(main, /combinedSource/);
  assert.match(main, /\.run\(\s*id,\s*text,\s*combinedSource,\s*true/);
});
