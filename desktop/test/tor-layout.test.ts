import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { exportDocument, pdfHtml } from '../electron/export';
import { torNumberedBlock, TOR_ORGANIZATION } from '../electron/tor-layout';
import { documentText, markdownDocument } from '../src/draft';
import { resolveDocumentLayout } from '../src/document-layout';
import { resolvePresentation } from '../src/document-presentation';

const source =
  '# ขอบเขตของงาน (Terms of Reference : TOR)\n\nจ้างจัดทำคู่มือการทำงาน — ตัวอย่างสังเคราะห์\n\nหน่วยงานสังเคราะห์\n\n## ๑. ความเป็นมา\n\nทีมต้องการคู่มือที่อ่านและแก้ไขได้ตามต้นเรื่องสังเคราะห์ รหัส 00123\n\n## ๒. ขอบเขตของงาน\n\n2.1 จัดเรียงเนื้อหาที่เจ้าของเรื่องจัดเตรียม\n\n2.1.1 เก็บ **ชื่อหัวข้อ** และข้อความเดิมให้ครบ\n\n| รายการ | หลักฐาน |\n|---|---|\n| S-01 คู่มือ | [รอยืนยัน: เกณฑ์ตรวจรับ] |\n\n(ลงชื่อ) ................................\n\n([รอยืนยัน: ผู้จัดทำ])\n\nผู้จัดทำ';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const attr = (p: Element, tag: string, key: string) => p.getElementsByTagNameNS(W, tag)[0]?.getAttributeNS(W, key);
const text = (p: Element) =>
  Array.from(p.getElementsByTagNameNS(W, 't'))
    .map(n => n.textContent)
    .join('');

test('STeP TOR defaults differ from standard letters and explicit saved choices win', () => {
  assert.equal(resolvePresentation({}, 'tor').pageNumber, 'arabic-total');
  assert.equal(resolvePresentation({}, 'tor').pageNumberPosition, 'footer-right');
  assert.equal(resolvePresentation({}, 'letter').pageNumber, 'thai');
  assert.equal(resolvePresentation({ pageNumber: 'none', pageNumberPosition: 'footer-center' }, 'tor').pageNumber, 'none');
});

test('TOR labels retain all source characters and emphasis without interpreting a leading year as a clause', () => {
  const doc = markdownDocument(source);
  const node = doc.content!.find(n => documentText(n).startsWith('2.1.1'))!;
  const split = torNumberedBlock(node)!;
  assert.equal(documentText(split.prefix) + documentText(split.body), documentText(node));
  assert.ok(split.body.content!.some(n => n.marks?.some(m => m.type === 'bold')));
  assert.equal(torNumberedBlock(markdownDocument('2569 เป็นปีจากต้นเรื่อง').content![0]), undefined);
  assert.equal(torNumberedBlock(markdownDocument('1'.repeat(40) + '. ข้อความ').content![0]), undefined);
});

test('TOR Word has a repeated STeP letterhead, matched typography, editable hanging clauses and live page fields', async () => {
  const document = markdownDocument(source);
  const file = join(await mkdtemp(join(tmpdir(), 'step-tor-')), 'tor.docx');
  await exportDocument(file, 'docx', documentText(document), async () => Buffer.alloc(0), document, {
    documentTool: 'tor',
    presentation: { embedFonts: false, thaiBreaks: false },
  });
  const zip = await JSZip.loadAsync(await readFile(file));
  const parse = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
  const body = parse(await zip.file('word/document.xml')!.async('string'));
  const paragraphs = Array.from(body.getElementsByTagNameNS(W, 'p'));
  const p = (prefix: string) => paragraphs.find(n => text(n).startsWith(prefix))!;
  assert.equal(attr(p('ขอบเขตของงาน'), 'sz', 'val'), '36');
  assert.equal(attr(p('๑. ความเป็นมา'), 'sz', 'val'), '32');
  assert.equal(attr(p('จ้างจัดทำ'), 'jc', 'val'), 'center');
  assert.equal(attr(p('หน่วยงานสังเคราะห์'), 'jc', 'val'), 'left');
  assert.equal(attr(p('ทีมต้องการ'), 'jc', 'val'), 'both');
  assert.equal(attr(p('ทีมต้องการ'), 'ind', 'firstLine'), '709');
  assert.ok(Number(attr(p('2.1.1'), 'ind', 'hanging')) > 0);
  assert.equal(p('2.1.1').getElementsByTagNameNS(W, 'tab').length, 2); // stop and actual tab
  assert.equal(text(p('2.1.1')), documentText(document.content!.find(n => documentText(n).startsWith('2.1.1'))!));
  assert.equal(attr(p('ผู้จัดทำ'), 'jc', 'val'), 'center');
  assert.ok(body.getElementsByTagNameNS(W, 'tblHeader').length);
  const header = await zip.file('word/header1.xml')!.async('string');
  assert.ok(header.includes(TOR_ORGANIZATION));
  assert.match(header, /w:drawing/);
  assert.match(header, /w:val="double"/);
  const footer = await zip.file('word/footer1.xml')!.async('string');
  assert.match(footer, /NUMPAGES/);
  assert.match(footer, /PAGE/);
  assert.ok(footer.includes('จ้างจัดทำคู่มือ'));
  assert.ok(!header.includes('ผู้จัดทำ') && !footer.includes('[รอยืนยัน: ผู้จัดทำ]'));
});

test('TOR PDF uses the same base measures and escapes optional header/footer content', async () => {
  const document = markdownDocument(source);
  const html = pdfHtml(document, resolveDocumentLayout('tor'));
  assert.match(html, /body\{font-size:16pt;line-height:1\.15\}/);
  assert.match(html, /text-indent:1\.25cm/);
  assert.match(html, /font-size:18pt/);
  assert.match(html, /counter\(page\).*counter\(pages\)/);
  assert.match(html, /class="tor-numbered"/);
  const file = join(await mkdtemp(join(tmpdir(), 'step-tor-pdf-')), 'tor.pdf');
  await exportDocument(
    file,
    'pdf',
    documentText(document),
    async (html, settings) => {
      assert.ok(settings?.headerTemplate.includes('&lt;script&gt;') && !settings.headerTemplate.includes('<script>'));
      assert.ok(settings?.footerTemplate.includes('&lt;script&gt;') && !settings.footerTemplate.includes('<script>'));
      assert.ok(html.includes('counter(page, thai)'));
      return Buffer.from('synthetic PDF');
    },
    document,
    { documentTool: 'tor', presentation: { headerText: '<script>', footerText: '<script>', pageNumber: 'thai' } },
  );
});
