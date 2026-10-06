import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseThaiDate, formatThaiDate } from '../src/thai-date';
import { parseReceiptDate } from '../src/receipt-compliance';
import { formValues } from '../src/receipt-workflow';
import { documentRequest } from '../src/document-tools';

const iso = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

test('date parsing respects explicit era and Thai digits, and validates the calendar', () => {
  for (const [input, expected] of [
    ['วันที่ ๒ ตุลาคม พ.ศ. ๒๕๖๙', '2026-10-02'],
    ['02/10/2569', '2026-10-02'],
    ['2 Oct 2026', '2026-10-02'],
    ['2026-10-02', '2026-10-02'],
    ['29 ก.พ. พ.ศ. 2567', '2024-02-29'],
    ['2 ต.ค. ค.ศ. 2026', '2026-10-02'],
  ]) {
    assert.equal(iso(parseThaiDate(input)), expected, input);
    assert.equal(iso(parseReceiptDate(input)), expected, input);
  }
  for (const input of [
    '31/02/2569',
    '29/02/2569',
    '00/10/2569',
    '1/13/2569',
    '1 ม.ค. 70',
    '2/10/69',
    '2 ต.ค. ค.ศ. 2569',
    '2 ต.ค. พ.ศ. 2026',
    '2026-10-02 or 2026-10-03',
    '2 Octoberly 2026',
    '1 ม.ค. พ.ศ. 2483',
    '1940-01-01',
  ]) {
    assert.equal(parseThaiDate(input), null, input);
    assert.equal(parseReceiptDate(input), null, input);
    assert.equal(formValues({ date: input }).date, input, 'unresolved source readings stay visible');
  }
});

test('formatting is independent of local timezone and never changes a document number', () => {
  const date = parseThaiDate('2026-10-02')!;
  assert.equal(formatThaiDate(date, 'short'), '02/10/2569');
  assert.equal(formatThaiDate(date, 'official'), '2 ตุลาคม 2569');
  assert.throws(() => formatThaiDate(new Date('invalid')), /INVALID_DATE/);
  const source = JSON.parse(documentRequest('memo', { number: '๐๐๗/๖๙', date: '๒ ต.ค. พ.ศ. ๒๕๖๙' }).sourceText);
  assert.equal(source.fields.number.value, '๐๐๗/๖๙');
  assert.equal(source.fields.date.value, '๒ ต.ค. พ.ศ. ๒๕๖๙');
  assert.equal(source.fields.date.formatted, '2 ตุลาคม 2569');
  assert.equal(source.fields.date.provenance, 'USER_INPUT');
});

test('an ambiguous form date is passed for review without an invented year', () => {
  const source = JSON.parse(documentRequest('letter', { date: '1 ม.ค. 70' }).sourceText);
  assert.equal(source.fields.date.value, '1 ม.ค. 70');
  assert.equal(source.fields.date.formatted, undefined);
  assert.equal(source.fields.date.review, 'DATE_NEEDS_REVIEW');
  assert.equal(source.fields.number.value, null);
});
