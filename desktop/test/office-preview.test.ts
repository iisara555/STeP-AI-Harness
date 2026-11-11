import test from 'node:test';
import assert from 'node:assert/strict';
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun } from 'docx';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { filePreview, OPEN_EXTERNALLY, previewable } from '../electron/office-preview';
import { previewText } from '../src/file-preview';

const blocks = (preview: Awaited<ReturnType<typeof filePreview>>) => {
  assert.notEqual(preview.kind, 'image');
  return (preview as Extract<typeof preview, { blocks: unknown }>).blocks;
};

test('a Word file previews as headings, paragraphs and tables in order', async () => {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'ขอบเขตของงาน', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun('ข้อความ '), new TextRun({ text: 'ตัวหนา', bold: true })] }),
          new Table({
            rows: [
              new TableRow({
                children: [new TableCell({ children: [new Paragraph('รายการ')] }), new TableCell({ children: [new Paragraph('จำนวน')] })],
              }),
              new TableRow({
                children: [new TableCell({ children: [new Paragraph('กล้อง')] }), new TableCell({ children: [new Paragraph('2')] })],
              }),
            ],
          }),
        ],
      },
    ],
  });
  const preview = await filePreview(await Packer.toBuffer(doc), '.docx');
  assert.equal(preview.kind, 'document');
  assert.deepEqual(blocks(preview), [
    { kind: 'heading', text: 'ขอบเขตของงาน' },
    { kind: 'paragraph', text: 'ข้อความ ตัวหนา' },
    {
      kind: 'table',
      rows: [
        ['รายการ', 'จำนวน'],
        ['กล้อง', '2'],
      ],
    },
  ]);
  assert.match(previewText(preview), /ขอบเขตของงาน[\s\S]*กล้อง\t2/);
});

test('an Excel file previews each visible sheet with shown cell text, including cached formula results', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('ต้นทุน');
  sheet.addRow(['รายการ', 'ราคา']);
  sheet.addRow(['กล้อง', 1000]);
  sheet.addRow(['รวม', { formula: 'B2', result: 1000 }]);
  workbook.addWorksheet('ซ่อน', { state: 'veryHidden' }).addRow(['ไม่แสดง']);
  const preview = await filePreview(Buffer.from(await workbook.xlsx.writeBuffer()), '.xlsx');
  assert.equal(preview.kind, 'sheet');
  assert.deepEqual(blocks(preview), [
    { kind: 'section', title: 'ต้นทุน' },
    {
      kind: 'table',
      rows: [
        ['รายการ', 'ราคา'],
        ['กล้อง', '1000'],
        ['รวม', '1000'],
      ],
    },
  ]);
});

test('a PowerPoint file previews slide by slide, in slide order', async () => {
  const pptx = new PptxGenJS();
  pptx.addSlide().addText('สไลด์แรก', { x: 1, y: 1, w: 6, h: 1 });
  const second = pptx.addSlide();
  second.addText('หัวข้อที่สอง', { x: 1, y: 1, w: 6, h: 1 });
  second.addTable([[{ text: 'ก' }, { text: 'ข' }]], { x: 1, y: 3, w: 6 });
  const bytes = Buffer.from((await pptx.write({ outputType: 'nodebuffer' })) as ArrayBuffer);
  const preview = await filePreview(bytes, '.pptx');
  assert.equal(preview.kind, 'slides');
  const list = blocks(preview);
  assert.deepEqual(
    list.filter(b => b.kind === 'section').map(b => (b as { title: string }).title),
    ['1', '2'],
  );
  assert.ok(list.some(b => b.kind === 'paragraph' && b.text === 'สไลด์แรก'));
  assert.ok(list.some(b => b.kind === 'table' && b.rows[0].join() === 'ก,ข'));
  assert.match(previewText(preview), /สไลด์ที่ 2|Slide 2/);
});

test('pictures become data URLs; damaged, entity-laden and unknown files are refused', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const image = await filePreview(png, '.PNG');
  assert.equal(image.kind, 'image');
  assert.ok((image as { url: string }).url.startsWith('data:image/png;base64,'));
  await assert.rejects(filePreview(Buffer.from('not a zip'), '.docx'), /PREVIEW_UNREADABLE/);
  const zip = new JSZip();
  zip.file('word/document.xml', '<!DOCTYPE x [<!ENTITY a "aaaa">]><w:document xmlns:w="w"><w:body/></w:document>');
  await assert.rejects(filePreview(await zip.generateAsync({ type: 'nodebuffer' }), '.docx'), /PREVIEW_UNREADABLE/);
  await assert.rejects(filePreview(Buffer.from('x'), '.exe'), /PREVIEW_UNSUPPORTED/);
});

test('only documents, pictures and media may be opened in the computer’s own app', () => {
  for (const ext of ['.docx', '.xlsx', '.pptx', '.pdf', '.doc', '.png', '.mp4']) assert.ok(OPEN_EXTERNALLY.has(ext), ext);
  for (const ext of ['.exe', '.bat', '.cmd', '.ps1', '.lnk', '.url', '.js', '.vbs', '.msi', '.app', '.sh', '.html', '.svg'])
    assert.ok(!OPEN_EXTERNALLY.has(ext), ext);
  assert.ok(previewable('.docx') && previewable('.xlsx') && previewable('.pptx') && previewable('.jpg'));
  assert.ok(!previewable('.pdf') && !previewable('.doc'));
});
