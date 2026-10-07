import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createRequire } from 'node:module';
import { sheetWorker } from '../electron/sheets';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const signal = () => new AbortController().signal;
const spec = {
  sheets: [
    {
      name: 'แผนงาน',
      columns: [
        { label: 'รหัส', type: 'text' },
        { label: 'ค่าใช้จ่าย', type: 'currency' },
      ],
      rows: [
        ['00123', 100],
        ['00007', 200],
      ],
      formulas: [{ cell: 'B4', formula: 'SUM(B2:B3)' }],
      source: 'ข้อมูลสังเคราะห์',
    },
  ],
};

test('create a Thai workbook with typed identifiers, actual formulas and explicit recalculation status', async () => {
  const value = await sheetWorker(Buffer.alloc(0), { operation: 'sheet_create', spec }, signal());
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(value.binary, 'base64') as any);
  const sheet = book.getWorksheet('แผนงาน')!;
  assert.equal(sheet.getCell('A2').value, '00123');
  assert.equal(sheet.getCell('B2').value, 100);
  assert.deepEqual(sheet.getCell('B4').value, { formula: 'SUM(B2:B3)' });
  assert.ok(sheet.getCell('B2').numFmt.includes('0.00'));
  assert.equal(value.recalculation, 'required-in-spreadsheet-application');
  assert.equal(value.humanConfirmed, false);
});

test('cell edits preserve drawings and opaque ZIP parts, protect formulas and reject merged non-anchor edits', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('ข้อมูล');
  sheet.getCell('A1').value = '00123';
  sheet.getCell('B1').value = { formula: 'SUM(B2:B3)', result: 300 };
  sheet.getCell('B2').value = 100;
  sheet.getCell('B3').value = 200;
  sheet.mergeCells('D1:E1');
  const zip = await JSZip.loadAsync(await book.xlsx.writeBuffer());
  const opaque = '<synthetic>This part must survive exactly.</synthetic>';
  zip.file('customXml/item1.xml', opaque);
  zip.file('xl/charts/chart1.xml', opaque);
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  const edited = await sheetWorker(bytes, { sheet: 'ข้อมูล', edits: [{ cell: 'B2', value: 150 }] }, signal());
  const after = await JSZip.loadAsync(Buffer.from(edited.binary, 'base64'));
  for (const path of Object.keys(zip.files).filter(p => !['xl/worksheets/sheet1.xml', 'xl/workbook.xml'].includes(p)))
    assert.deepEqual(await after.file(path)?.async('nodebuffer'), await zip.file(path)?.async('nodebuffer'), path);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(Buffer.from(edited.binary, 'base64') as any);
  assert.equal(reopened.worksheets[0].getCell('B2').value, 150);
  assert.equal((reopened.worksheets[0].getCell('B1').value as any).formula, 'SUM(B2:B3)');
  assert.equal(edited.recalculation, 'required-in-spreadsheet-application');
  assert.ok(!edited.before.includes('<c'));
  await assert.rejects(sheetWorker(bytes, { edits: [{ cell: 'B1', value: 1 }] }, signal()), /FORMULA_CELL_PROTECTED/);
  await assert.rejects(sheetWorker(bytes, { edits: [{ cell: 'E1', value: 1 }] }, signal()), /MERGED_CELL_PROTECTED/);
  await assert.rejects(sheetWorker(bytes, { edits: [{ cell: 'XFE1', value: 1 }] }, signal()), /INVALID_INPUT/);
});

test('read exposes formulas separately from cached values without claiming calculation verification', async () => {
  const book = new ExcelJS.Workbook();
  book.addWorksheet('Test').getCell('A1').value = { formula: '1+1', result: 2 };
  const value = await sheetWorker(Buffer.from(await book.xlsx.writeBuffer()), { range: 'A1' }, signal());
  assert.deepEqual(value.formulas, [{ cell: 'A1', formula: '1+1', cachedResult: 2 }]);
  assert.equal(value.cacheStatus, 'not-verified');
});

test('PowerPoint creates editable Thai text, native table/chart and speaker notes', async () => {
  const spec = {
    title: 'โครงการสังเคราะห์',
    slides: [
      { title: 'ความคืบหน้า', bullets: ['เสร็จแล้วสองขั้นตอน', 'รอยืนยันกำหนดส่ง'], notes: 'ข้อมูลสำหรับทดสอบ', source: 'synthetic' },
      { title: 'ตารางงาน', table: { headers: ['งาน', 'สถานะ'], rows: [['ทดสอบ', 'ร่าง']] } },
      { title: 'ผลสังเคราะห์', chart: { type: 'bar', categories: ['รอบแรก', 'รอบสอง'], series: [{ name: 'จำนวน', values: [2, 3] }] } },
    ],
  };
  const result = await sheetWorker(Buffer.alloc(0), { operation: 'slides_create', spec }, signal());
  const zip = await JSZip.loadAsync(Buffer.from(result.binary, 'base64'));
  assert.match(await zip.file('ppt/slides/slide1.xml').async('string'), /ความคืบหน้า/);
  assert.match(await zip.file('ppt/slides/slide1.xml').async('string'), /IBM Plex Sans Thai/);
  assert.match(await zip.file('ppt/slides/slide2.xml').async('string'), /<a:tbl>/);
  assert.ok(zip.file('ppt/charts/chart1.xml'));
  assert.match(await zip.file('ppt/notesSlides/notesSlide1.xml').async('string'), /synthetic/);
  assert.equal(result.visualReview, 'required');
  await assert.rejects(
    sheetWorker(Buffer.alloc(0), { operation: 'slides_create', spec: { slides: [{ title: 'x', bullets: Array(8).fill('x') }] } }, signal()),
    /SLIDE_CONTENT_LIMIT/,
  );
});

test('creation rejects external formulas and unsupported values before returning bytes', async () => {
  for (const formula of ['WEBSERVICE("https://example.org")', '[other.xlsx]Sheet1!A1', 'DDE("x")', 'SUM(A1:A2', 'IFERROR(A1)', '1+*2'])
    await assert.rejects(
      sheetWorker(
        Buffer.alloc(0),
        {
          operation: 'sheet_create',
          spec: {
            sheets: [{ name: 'x', columns: [{ label: 'x' }], rows: [[1]], formulas: [{ cell: 'A3', formula }] }],
          },
        },
        signal(),
      ),
      /FORMULA_UNSUPPORTED/,
    );
});
