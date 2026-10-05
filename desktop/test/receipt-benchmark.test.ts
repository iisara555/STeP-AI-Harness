import { test } from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkReadings } from '../scripts/receipt-benchmark';

test('benchmark measures both agreeing wrong readings without treating agreement as truth', () => {
  const result = benchmarkReadings(
    { pages: [{ page: 1, lines: [{ text: 'ยอดรวม 108.00', confidence: 0.99 }] }] },
    JSON.stringify({ fields: { total: { value: '108.00', evidence: 'ยอดรวม 108.00' } } }),
  );
  assert.equal(result.ocr.fields.total, '108.00');
  assert.equal(result.vision.fields.total, '108.00');
  assert.equal(result.combined.fields.total, '108.00');
  assert.ok(!result.combined.review.includes('total'));
});

test('combined reading keeps a mapped OCR value, fills only open guesses and flags disagreement', () => {
  const result = benchmarkReadings(
    { pages: [{ page: 1, lines: [{ text: 'ยอดรวม 107.00', confidence: 0.99 }] }] },
    JSON.stringify({ fields: { total: { value: '108.00' }, date: { value: '23/09/2569' } } }),
  );
  assert.equal(result.combined.fields.total, '107.00');
  assert.equal(result.combined.fields.date, '23/09/2569');
  assert.ok(result.combined.review.includes('total'));
});
