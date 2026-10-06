import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trialReading, trialReport } from '../src/receipt-trial';

test('trial freezes the machine reading and measures against confirmed human values only', () => {
  const values = { total: '108.00', receiptNumber: '005', merchant: 'ร้านตัวอย่าง' };
  const reading = trialReading(values, ['total'], 123);
  values.total = '107.00';
  const pending = trialReport(reading, null, values, false);
  assert.equal(pending.ocr.fields.total.value, '108.00');
  assert.equal(pending.fields.total.ocr.match, null);
  assert.equal(pending.summary, null);
  const checked = trialReport(reading, null, values, true);
  assert.equal(checked.fields.total.ocr.match, false);
  assert.equal(checked.fields.total.ocr.reviewOutcome, 'caught-error');
  assert.equal(checked.fields.receiptNumber.ocr.match, true);
  assert.equal(checked.fields.vat.ocr.match, true);
  assert.equal(checked.fields.vat.human.provenance, 'SOURCE_FACT');
  assert.equal(checked.summary?.ocr.errors, 1);
  assert.equal(checked.summary?.ocr.potentialCriticalDifferences, 1);
  assert.equal(checked.ramBytes, null);
});

test('trial preserves identifiers and merchant distinctions and catches confidently wrong agreement', () => {
  const ocr = trialReading({ receiptNumber: '5', merchant: 'ร้านตัวอย่าง', total: '108' }, [], 50);
  const vision = trialReading({ receiptNumber: '5', total: '108' }, ['vat'], 60);
  const report = trialReport(ocr, vision, { receiptNumber: '005', merchant: 'ร้านตัวอย่าง จำกัด', total: '107' }, true);
  assert.equal(report.fields.receiptNumber.ocr.match, false);
  assert.equal(report.fields.merchant.ocr.match, false);
  assert.equal(report.fields.total.ocr.reviewOutcome, 'missed-error');
  assert.equal(report.fields.total.vision?.match, false);
  assert.equal(report.fields.vat.vision?.reviewOutcome, 'extra-warning');
  assert.equal(report.ocr.fields.total.provenance, 'EXTRACTED_UNVERIFIED');
});

test('trial uses conservative text exact match rather than the receipt UI agreement heuristic', () => {
  const report = trialReport(trialReading({ total: '๑๐๗.๐๐' }, [], 1), null, { total: '107.00' }, true);
  assert.equal(report.fields.total.ocr.match, false);
  assert.equal(report.comparison, 'NFC-trim-exact');
});
