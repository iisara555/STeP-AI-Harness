// Output checks against the saraban print explanation (คำอธิบายการพิมพ์หนังสือราชการ) for memo, external letter and
// minutes drafts as the model returns them from the working templates. Synthetic data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { exportDocument, pdfHtml } from '../electron/export';
import { documentLayoutRoles, resolveDocumentLayout, sarabanSpacing } from '../src/document-layout';
import { resolvePresentation } from '../src/document-presentation';
import { documentText, markdownDocument } from '../src/draft';
import { createReceiptPacket } from '../src/receipt-packet';
import { paymentVoucherHtml } from '../electron/afp-payment-voucher';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

async function word(markdown: string, documentTool: string, presentation: object = {}) {
  const path = join(await mkdtemp(join(tmpdir(), 'step-saraban-')), 'draft.docx');
  const document = markdownDocument(markdown);
  await exportDocument(path, 'docx', documentText(document), async () => Buffer.alloc(0), document, {
    documentTool,
    presentation: { embedFonts: false, ...presentation },
  });
  const zip = await JSZip.loadAsync(await readFile(path));
  const dom = new DOMParser().parseFromString(await zip.file('word/document.xml')!.async('string'), 'application/xml');
  const paragraphs = Array.from(dom.getElementsByTagNameNS(W, 'p'));
  const text = (p: Element) =>
    Array.from(p.getElementsByTagNameNS(W, 't'))
      .map(t => t.textContent)
      .join('')
      .replaceAll('​', '');
  const paragraph = (start: string) => paragraphs.find(p => text(p).startsWith(start))!;
  const attr = (p: Element, element: string, name: string) => p.getElementsByTagNameNS(W, element)[0]?.getAttributeNS(W, name) ?? undefined;
  return { zip, paragraph, attr, text };
}

const minutes = [
  '# รายงานการประชุมคณะทำงานสังเคราะห์',
  '',
  'ครั้งที่ ๑/๒๕๖๙',
  'เมื่อ วันที่ ๑๐ พฤศจิกายน ๒๕๖๙',
  'ณ ห้องประชุมสังเคราะห์',
  'ผู้มาประชุม',
  '๑. [รอยืนยัน: ชื่อ] ประธาน',
  'ผู้ไม่มาประชุม [รอยืนยัน: รายชื่อ]',
  'เริ่มประชุมเวลา ๑๓.๓๐ น.',
  '',
  '## ระเบียบวาระที่ ๑ เรื่องแจ้งเพื่อทราบ',
  '',
  'สาระสำคัญ ประธานแจ้งเรื่องสังเคราะห์',
  'ข้อเสนอที่ยังไม่ตกลง จำนวนผู้เข้าอบรม',
  'มติ ที่ประชุมรับทราบ',
  '',
  'เลิกประชุมเวลา ๑๕.๐๐ น.',
  'ผู้จดรายงาน [รอยืนยัน: ผู้จด]',
  'ผู้ตรวจรายงาน [รอยืนยัน: ผู้ตรวจ]',
].join('\n');

test('minutes fields typed on consecutive lines stay separate paragraphs, so มติ is never merged into สาระสำคัญ', () => {
  const lines = markdownDocument(minutes).content!.map(node => documentText(node));
  for (const start of [
    'ครั้งที่',
    'เมื่อ',
    'ณ ',
    'ผู้มาประชุม',
    'ผู้ไม่มาประชุม',
    'สาระสำคัญ',
    'ข้อเสนอที่ยังไม่ตกลง',
    'มติ',
    'ผู้จดรายงาน',
    'ผู้ตรวจรายงาน',
  ])
    assert.equal(lines.filter(line => line.startsWith(start)).length, 1, start);
  assert.ok(lines.some(line => line === 'มติ ที่ประชุมรับทราบ'));
  const roles = documentLayoutRoles(markdownDocument(minutes), 'minutes');
  const doc = markdownDocument(minutes).content!;
  for (const start of ['ครั้งที่', 'เมื่อ', 'ณ '])
    assert.equal(roles[doc.findIndex(n => documentText(n).startsWith(start))], 'front', start);
  // Prose that merely starts with "เมื่อวันที่" (no space) is still joined as one soft-wrapped paragraph.
  assert.equal(markdownDocument('เมื่อวันที่ ๑ มกราคม ทีมได้ประชุม\nและตกลงร่วมกัน').content!.length, 1);
});

const memo = [
  '# บันทึกข้อความ',
  '',
  'ส่วนงาน ทีมสังเคราะห์ โทร. ๐ ๕๓๒๐ ๐๐๐๐',
  'ที่ [รอยืนยัน: เลขหนังสือ] วันที่ ๑๘ พฤศจิกายน ๒๕๖๙',
  'เรื่อง ขออนุมัติจัดซื้อวัสดุสังเคราะห์',
  'เรียน ผู้อำนวยการ',
  '',
  'ด้วยทีมสังเคราะห์มีกำหนดจัดกิจกรรม',
  '',
  'จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติ',
  '',
  '(ลงชื่อ) ................................',
  '([รอยืนยัน: ชื่อเต็มผู้ลงนาม])',
  'ตำแหน่ง [รอยืนยัน: ตำแหน่ง]',
].join('\n');

test('memo: date tab survives Thai line breaks, labels print bold 20 pt, narrative indents 2.5 cm, signing room above the signature', async () => {
  const doc = await word(memo, 'memo');
  const reference = doc.paragraph('ที่ [รอยืนยัน');
  assert.ok(Array.from(reference.getElementsByTagNameNS(W, 'tab')).some(tab => tab.parentNode?.nodeName === 'w:r'));
  for (const [start, label] of [
    ['ส่วนงาน', 'ส่วนงาน'],
    ['ที่ [รอยืนยัน', 'ที่'],
    ['เรื่อง', 'เรื่อง'],
  ]) {
    const run = Array.from(doc.paragraph(start).getElementsByTagNameNS(W, 'r'))[0];
    assert.equal(doc.text(run as Element), label, start);
    assert.equal(doc.attr(run as Element, 'sz', 'val'), '40', start);
    assert.ok((run as Element).getElementsByTagNameNS(W, 'b').length, start);
  }
  const dateLabel = Array.from(reference.getElementsByTagNameNS(W, 'r')).find(run => doc.text(run) === 'วันที่');
  assert.ok(dateLabel && doc.attr(dateLabel, 'sz', 'val') === '40');
  // Values and เรียน keep the body size.
  assert.equal(doc.attr(Array.from(doc.paragraph('เรียน').getElementsByTagNameNS(W, 'r'))[0], 'sz', 'val'), '32');
  assert.equal(doc.attr(doc.paragraph('ด้วยทีม'), 'ind', 'firstLine'), '1418');
  assert.equal(doc.attr(doc.paragraph('ด้วยทีม'), 'spacing', 'before'), '120');
  assert.equal(doc.attr(doc.paragraph('(ลงชื่อ)'), 'spacing', 'before'), '480');
  // A spaced phone number is kept on one line in the exported copy.
  assert.ok(doc.text(doc.paragraph('ส่วนงาน')).includes('๐ ๕๓๒๐ ๐๐๐๐'));
  const html = pdfHtml(markdownDocument(memo), resolveDocumentLayout('memo'), new Map(), resolvePresentation({}, 'memo'));
  assert.match(html, /<b class="memo-label">ส่วนงาน<\/b>/);
  assert.match(html, /<b class="memo-label">วันที่<\/b>/);
  assert.match(html, /\.memo-label\{font-size:20pt\}/);
  assert.match(html, /font-size:29pt/);
});

const letter = [
  'ที่ [รอยืนยัน: เลขหนังสือ]',
  '',
  'หน่วยงานสังเคราะห์\\',
  '๑ ถนนตัวอย่าง',
  '',
  '๑๘ พฤศจิกายน ๒๕๖๙',
  '',
  'เรื่อง ขอความอนุเคราะห์สังเคราะห์',
  '',
  'เรียน ผู้รับสังเคราะห์',
  '',
  'ด้วยหน่วยงานสังเคราะห์มีกำหนดจัดกิจกรรม',
  '',
  'จึงเรียนมาเพื่อโปรดพิจารณา',
  '',
  'ขอแสดงความนับถือ',
  '',
  '([รอยืนยัน: ชื่อเต็มผู้ลงนาม])',
  '',
  'รองผู้อำนวยการสังเคราะห์',
  '',
  'ทีมสังเคราะห์',
  '',
  'โทร. [รอยืนยัน: หมายเลขโทรศัพท์]',
].join('\n');

test('external letter: any sender name, a bare date, the position and the closing contact lines take their places', async () => {
  const document = markdownDocument(letter);
  const roles = documentLayoutRoles(document, 'letter');
  const role = (start: string) => roles[document.content!.findIndex(n => documentText(n).startsWith(start))];
  assert.equal(role('หน่วยงานสังเคราะห์'), 'sender');
  assert.equal(role('๑๘ พฤศจิกายน'), 'date');
  assert.equal(role('รองผู้อำนวยการ'), 'signature');
  assert.equal(role('ทีมสังเคราะห์'), 'field');
  assert.equal(role('โทร.'), 'field');
  const spacing = sarabanSpacing(document, 'letter');
  const before = (start: string) => spacing[document.content!.findIndex(n => documentText(n).startsWith(start))];
  assert.equal(before('ขอแสดงความนับถือ'), 12);
  assert.equal(before('([รอยืนยัน'), 54);
  assert.equal(before('ทีมสังเคราะห์'), 54);
  assert.equal(before('เรียน'), 6);
  const doc = await word(letter, 'letter');
  assert.equal(doc.attr(doc.paragraph('หน่วยงานสังเคราะห์'), 'ind', 'left'), '4535');
  assert.equal(doc.attr(doc.paragraph('รองผู้อำนวยการ'), 'jc', 'val'), 'center');
  assert.equal(doc.attr(doc.paragraph('ทีมสังเคราะห์'), 'ind', 'firstLine'), undefined);
  assert.equal(doc.attr(doc.paragraph('([รอยืนยัน'), 'spacing', 'before'), '1080');
});

test('saraban documents number continuation pages "- ๒ -" at the top and never page 1; TOR and invitations keep theirs', async () => {
  for (const tool of ['memo', 'letter', 'minutes', 'project', 'other'])
    assert.equal(resolvePresentation({}, tool).pageNumber, 'saraban', tool);
  assert.equal(resolvePresentation({}, 'tor').pageNumber, 'arabic-total');
  assert.equal(resolvePresentation({ pageNumber: 'thai' }, 'memo').pageNumber, 'thai');
  const html = (tool: string, presentation = {}) =>
    pdfHtml(markdownDocument(memo), resolveDocumentLayout(tool), new Map(), resolvePresentation(presentation, tool));
  assert.match(html('memo'), /@top-center\{content:"- " counter\(page, thai\) " -"/);
  assert.match(html('memo'), /@page:first\{@top-center\{content:none\}\}/);
  assert.doesNotMatch(html('tor'), /@top-center/);
  assert.doesNotMatch(html('memo', { pageNumber: 'thai' }), /@top-center/);
  const doc = await word(memo, 'minutes');
  const headers = await Promise.all(
    Object.keys(doc.zip.files)
      .filter(p => /^word\/header\d+\.xml$/.test(p))
      .map(p => doc.zip.file(p)!.async('string')),
  );
  assert.equal(headers.filter(xml => /PAGE/.test(xml)).length, 1);
  assert.match(
    headers.find(xml => /PAGE/.test(xml))!,
    /- <\/w:t>[\s\S]*PAGE[\s\S]*> -<\/w:t>/,
  );
  const body = await doc.zip.file('word/document.xml')!.async('string');
  assert.match(body, /<w:titlePg\/>/);
  assert.match(body, /w:fmt="thaiNumbers"/);
});

test('payment voucher prints every figure with two decimals like its totals', () => {
  const packet = createReceiptPacket('synthetic', '2026-11-16T00:00:00.000Z');
  packet.disbursement = {
    ...packet.disbursement,
    items: [{ description: 'ค่าสังเคราะห์', gross: '1200', withholding: '36', deduction: '0' }],
  };
  const html = paymentVoucherHtml(packet, '');
  assert.match(html, /<td>1,200\.00<\/td><td>36\.00<\/td><td>0\.00<\/td>/);
});
