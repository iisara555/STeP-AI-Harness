import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { receiptSourceText } from '../src/receipt-source';

test('receipt handoff serializes the reviewed JSON as persistent workspace source', () => {
  const source = receiptSourceText({
    schema: 'step-receipt-review/v1',
    filename: 'receipt.jpg',
    fields: { total: { value: '107.00', checked: true } },
  });
  assert.match(source, /persistent workspace source/);
  assert.match(source, /step-receipt-review\/v1/);
  assert.match(source, /"total"/);
  assert.match(source, /107\.00/);
});

test('receipt UI passes structured source through workspace send and consent replay', async () => {
  const receipt = await readFile(new URL('../src/receipt.tsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const main = await readFile(new URL('../electron/main.ts', import.meta.url), 'utf8');

  assert.match(receipt, /receiptSourceText\(draft\(\)\)/);
  assert.match(app, /start\(s\.id, text, \[\], undefined, undefined, allowIds, sourceText\)/);
  assert.match(app, /allowIdentifiers: allowIds, sourceText/);
  assert.match(app, /ask\.allowIds, ask\.sourceText/);
  assert.match(main, /combinedSource/);
  assert.match(main, /\.run\(id, text, combinedSource, true/);
});
