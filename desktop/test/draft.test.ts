import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../electron/store';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';
import { exportDocument, pdfHtml } from '../electron/export';
import { documentMarkdown, documentText, markdownDocument, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, validateDocument } from '../src/draft';

const rich = validateDocument({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Meeting' }] },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '<Review>', marks: [{ type: 'bold' }] }] }] },
      ],
    },
  ],
});
test('formatting persists across restart and restore and participates in conflict checks', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'step-rich-')), 'store.sqlite');
  let store = new Store(path);
  const s = store.create('test', '');
  store.edit(s.id, 'Ignored renderer text', 0, rich);
  assert.equal(store.session(s.id).draft, documentText(rich));
  store.close();
  store = new Store(path);
  assert.deepEqual(store.session(s.id).document, rich);
  store.edit(s.id, documentText(rich), 1);
  const previous = store.session(s.id).versions[1];
  store.edit(s.id, previous.text, 2, previous.document);
  assert.deepEqual(store.session(s.id).document, rich);
  assert.throws(() => store.edit(s.id, '', 2, rich), /DRAFT_CONFLICT/);
  store.close();
});
test('document boundary rejects executable content and unsupported nesting', () => {
  for (const value of [
    { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://invalid.example' } }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'link', marks: [{ type: 'link' }] }] }] },
    { type: 'doc', content: [{ type: 'heading', attrs: { level: 99 } }] },
    { type: 'doc', content: [{ type: 'text', text: 'invalid child' }] },
  ])
    assert.throws(() => validateDocument(value), /INVALID_DOCUMENT/);
});
test('structured Markdown and PDF preserve formatting and escape source text', async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-rich-export-'));
  await exportDocument(join(home, 'draft.md'), 'md', documentText(rich), async () => Buffer.alloc(0), rich);
  assert.match(await readFile(join(home, 'draft.md'), 'utf8'), /## Meeting/);
  await exportDocument(
    join(home, 'draft.pdf'),
    'pdf',
    documentText(rich),
    async html => {
      assert.match(html, /<h2>Meeting<\/h2>/);
      assert.match(html, /<ul><li><p><strong>&lt;Review&gt;<\/strong>/);
      return Buffer.from('%PDF-test');
    },
    rich,
  );
});

test('model Markdown becomes a bounded, formatted draft', () => {
  const doc = markdownDocument(
    '# บรีฟงาน\n\nเป้าหมาย **ชัดเจน** และ *วัดผลได้*\n\n- ข้อแรก\n  - ข้อย่อย\n- ข้อสอง\n\n3. ลำดับสาม\n4. ลำดับสี่\n\n| หัวข้อ | รายละเอียด |\n|---|---|\n| งบ | 50,000 |\n\n[ลิงก์](https://example.com) `code` <b>html</b>',
  );
  assert.deepEqual(validateDocument(doc), doc);
  const [h, p, bullets, ordered, table, last] = doc.content!;
  assert.equal(table.type, 'table');
  assert.equal(table.content![0].content![0].type, 'tableHeader');
  assert.equal(documentText(table), 'หัวข้อ\tรายละเอียด\nงบ\t50,000');
  assert.deepEqual(h, { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'บรีฟงาน' }] });
  assert.deepEqual(
    p.content!.map(n => n.marks?.[0]?.type || 'plain'),
    ['plain', 'bold', 'plain', 'italic'],
  );
  assert.equal(bullets.type, 'bulletList');
  assert.equal(bullets.content!.length, 2);
  assert.equal(bullets.content![0].content![1].type, 'bulletList');
  assert.deepEqual(ordered.attrs, { start: 3 });
  // Links keep only their text and raw HTML stays inert text.
  assert.equal(documentText(last), 'ลิงก์ code <b>html</b>');
});

test('accepting a Markdown proposal keeps its structure in the draft', () => {
  const store = new Store(':memory:');
  const s = store.create('c', 'cc');
  s.proposals.push({ id: 'p', text: '## หัวข้อ\n- รายการ', baseRevision: 0, sources: [], at: '' });
  store.save(s);
  const accepted = store.accept(s.id, 'p');
  assert.equal(accepted.document?.content?.[0].type, 'heading');
  assert.equal(accepted.draft, 'หัวข้อ\nรายการ');
  store.close();
});

test('Markdown tables become draft tables and round-trip; rows without a rule stay text', () => {
  const doc = markdownDocument('| งาน | ผู้รับผิดชอบ |\n| :-- | --: |\n| ร่าง **โปสเตอร์** | คุณเอ |\n| a \\| b |\n\n| ไม่ใช่ | ตาราง |');
  assert.deepEqual(validateDocument(doc), doc);
  const [table, plain] = doc.content!;
  assert.equal(table.content!.length, 3);
  // Short rows are padded to the header's width; an escaped pipe stays inside its cell.
  assert.equal(table.content![2].content!.length, 2);
  assert.equal(documentText(table.content![2]), 'a | b\t');
  assert.equal(table.content![1].content![0].content![0].content![1].marks![0].type, 'bold');
  assert.equal(documentText(plain), 'ไม่ใช่ · ตาราง');
  assert.deepEqual(markdownDocument(documentMarkdown(doc)), doc);
});

test('tables are bounded and only hold paragraphs', () => {
  const cell = { type: 'tableCell', content: [{ type: 'paragraph' }] };
  const row = (cells: number) => ({ type: 'tableRow', content: Array.from({ length: cells }, () => cell) });
  assert.throws(
    () => validateDocument({ type: 'doc', content: [{ type: 'table', content: [row(MAX_TABLE_COLUMNS + 1)] }] }),
    /INVALID_DOCUMENT/,
  );
  assert.throws(
    () =>
      validateDocument({ type: 'doc', content: [{ type: 'table', content: Array.from({ length: MAX_TABLE_ROWS + 1 }, () => row(1)) }] }),
    /INVALID_DOCUMENT/,
  );
  assert.throws(
    () =>
      validateDocument({
        type: 'doc',
        content: [{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'table' }] }] }] }],
      }),
    /INVALID_DOCUMENT/,
  );
  assert.throws(() => validateDocument({ type: 'doc', content: [{ type: 'tableRow', content: [] }] }), /INVALID_DOCUMENT/);
});

test('exports keep tables as tables and use the Thai official page', async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-table-export-'));
  const doc = markdownDocument(
    '# รายงาน\n\nสรุปงบประมาณ\n\n| รายการ | จำนวน | รหัส |\n|---|---|---|\n| ป้าย <A> | 1,500 | 007 |\n| =SUM(A1) | 20 | x |',
  );
  const text = documentText(doc);
  const html = pdfHtml(doc);
  // The header row repeats on every page; the figures column is right-aligned.
  assert.match(html, /<thead><tr><th><p>รายการ<\/p><\/th><th class="num"><p>จำนวน<\/p><\/th>/);
  assert.match(html, /<td class="num"><p>1,500<\/p><\/td>/);
  assert.match(html, /<td><p>ป้าย &lt;A&gt;<\/p><\/td>/);
  assert.match(html, /TH Sarabun New/);
  assert.match(html, /font-size:16pt/);
  for (const format of ['docx', 'xlsx', 'pptx'])
    await exportDocument(join(home, 'd.' + format), format, text, async () => Buffer.alloc(0), doc);
  const JSZip = createRequire(import.meta.url)('jszip');
  const word = await (await JSZip.loadAsync(await readFile(join(home, 'd.docx')))).file('word/document.xml').async('string');
  assert.match(word, /<w:tbl>/);
  assert.match(word, /<w:tblHeader\/>/);
  assert.match(word, /w:cs="TH Sarabun New"/);
  assert.match(word, /<w:szCs w:val="32"\/>/);
  assert.match(word, /<w:pgSz w:w="11906" w:h="16838"/);
  assert.match(word, /w:left="1701"/);
  assert.match(word, /<w:tblLayout w:type="fixed"\/>/);
  assert.match(word, /<w:jc w:val="right"\/>/);
  // Single line spacing: an exact 12 pt line would overlap 16 pt Thai text.
  assert.doesNotMatch(word, /w:line="240"/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(join(home, 'd.xlsx'));
  assert.deepEqual(
    workbook.worksheets.map(sheet => sheet.name),
    ['ตาราง 1', 'ข้อความ'],
  );
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getCell('A1').value, 'รายการ');
  assert.equal(sheet.getCell('A1').font.bold, true);
  assert.equal(sheet.getCell('B2').value, 1500);
  assert.equal(sheet.getCell('B2').numFmt, '#,##0');
  // Codes keep their leading zero and formula-like text stays text.
  assert.equal(sheet.getCell('C2').value, '007');
  assert.equal(sheet.getCell('A3').value, '=SUM(A1)');
  assert.equal(sheet.getCell('A3').type, ExcelJS.ValueType.String);
  assert.ok(sheet.autoFilter);
  const rest = workbook.worksheets[1];
  assert.equal(rest.getCell('A1').value, 'รายงาน');
  assert.equal(rest.getCell('A2').value, 'สรุปงบประมาณ');
  assert.equal(rest.rowCount, 2);
  const deck = await JSZip.loadAsync(await readFile(join(home, 'd.pptx')));
  const slides = await Promise.all(
    Object.keys(deck.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .map(name => deck.file(name).async('string')),
  );
  assert.ok(slides.some(xml => /<a:tbl>/.test(xml) && /รายการ/.test(xml)));
  assert.ok(slides.some(xml => /สรุปงบประมาณ/.test(xml)));
});

test('tables share one layout across Word and PDF and spreadsheets keep figures as written', async () => {
  const { tableLayout } = await import('../electron/export');
  const narrow = tableLayout([
    ['ลำดับ', 'รายการ', 'ราคา (บาท)'],
    ['1', 'ป้ายไวนิล ขนาด 1x3 เมตร', '1,500'],
  ]);
  assert.equal(narrow.points, 16);
  // The description column gets most of the line; the widths fill the A4 text width (16 cm).
  assert.ok(narrow.columns[1] > narrow.columns[0] * 2);
  assert.ok(Math.abs(narrow.columns.reduce((a, b) => a + b) - 9072) < 4);
  const header = ['โครงการ', 'ผู้รับผิดชอบ', 'ไตรมาส 1', 'ไตรมาส 2', 'ไตรมาส 3', 'ไตรมาส 4', 'สถานะ', 'หมายเหตุ'];
  // Eight columns do not fit at 16 pt without breaking header words, so the table drops to a smaller size.
  assert.ok(tableLayout([header, header.map(() => 'x')]).points < 16);

  const home = await mkdtemp(join(tmpdir(), 'step-figures-'));
  const doc = markdownDocument(
    '## สรุป\n\n| งาน | ราคา | สัดส่วน | ปี |\n|---|---|---|---|\n| ก | 650.50 | 25% | 2570 |\n| ข | 1,000.5 | 12.5% | 2571 |',
  );
  await exportDocument(join(home, 'f.xlsx'), 'xlsx', documentText(doc), async () => Buffer.alloc(0), doc);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(join(home, 'f.xlsx'));
  const sheet = workbook.worksheets[0];
  assert.deepEqual([sheet.getCell('B2').value, sheet.getCell('B2').numFmt], [650.5, '0.00']);
  assert.deepEqual([sheet.getCell('B3').value, sheet.getCell('B3').numFmt], [1000.5, '#,##0.0']);
  assert.deepEqual([sheet.getCell('C2').value, sheet.getCell('C2').numFmt], [0.25, '0%']);
  assert.deepEqual([sheet.getCell('C3').value, sheet.getCell('C3').numFmt], [0.125, '0.0%']);
  assert.deepEqual([sheet.getCell('D2').value, sheet.getCell('D2').numFmt], [2570, '0']);

  // A heading right before a table titles the table's slide rather than taking a slide of its own.
  await exportDocument(join(home, 'f.pptx'), 'pptx', documentText(doc), async () => Buffer.alloc(0), doc);
  const deck = await createRequire(import.meta.url)('jszip').loadAsync(await readFile(join(home, 'f.pptx')));
  const slides = Object.keys(deck.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  assert.equal(slides.length, 1);
  const xml = await deck.file(slides[0]).async('string');
  assert.match(xml, /สรุป/);
  assert.match(xml, /<a:tbl>/);
});
