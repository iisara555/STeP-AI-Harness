import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { exportDocument, pdfHtml } from '../electron/export';
import { resolveDocumentLayout } from '../src/document-layout';
import { markdownDocument, documentText } from '../src/draft';

test('memo narrative, unit label and all signature lines use their own layout without spreading short lines', async () => {
  const doc = await word(
    '# บันทึกข้อความ\n\nส่วนงาน หน่วยงานสังเคราะห์\n\nที่ [รอยืนยัน: เลขหนังสือ] วันที่ [รอยืนยัน: วันที่]\n\nเรื่อง ขอพิจารณา\n\nเรียน [รอยืนยัน: ผู้รับ]\n\nข้าพเจ้าขอเสนอการจัดกิจกรรมตามข้อมูลสังเคราะห์\n\nจึงเรียนมาเพื่อโปรดพิจารณา\n\n(ผู้เสนอสมมติ)\n\nผู้ดูแลโครงการ\n\n(ผู้ตรวจสมมติ)\n\nหัวหน้าทีม\n\nความเห็นผู้พิจารณา ................................\n\n(ผู้พิจารณาสมมติ)\n\nผู้อำนวยการ',
    { documentTool: 'memo' },
  );
  assert.match(doc.xml, /w:cs="TH Sarabun New"/);
  assert.equal(attr(doc.paragraph('ส่วนงาน'), 'ind', 'firstLine'), undefined);
  assert.equal(attr(doc.paragraph('ข้าพเจ้า'), 'jc', 'val'), 'both');
  for (const label of ['(ผู้เสนอสมมติ)', 'ผู้ดูแลโครงการ', '(ผู้ตรวจสมมติ)', 'หัวหน้าทีม', '(ผู้พิจารณาสมมติ)', 'ผู้อำนวยการ']) {
    assert.equal(attr(doc.paragraph(label), 'jc', 'val'), 'center', label);
    assert.ok(!attr(doc.paragraph(label), 'ind', 'firstLine'), label);
  }
});

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

test('PDF memo separates reference and date into columns while preserving rich labels and uncertain dates', () => {
  const doc = markdownDocument(
    '# บันทึกข้อความ\n\n**ที่** **0007/๖๙** **วันที่** [รอยืนยัน: ปีเต็มของ 1 ม.ค. 70]\n\nเรียน [รอยืนยัน: ผู้รับ]',
  );
  const html = pdfHtml(doc, resolveDocumentLayout('memo'));
  assert.match(html, /grid-template-columns:1fr 1fr/);
  assert.match(html, /<span class="memo-number"><strong>ที่<\/strong> <strong>0007\/๖๙<\/strong><\/span>/);
  assert.match(html, /<span class="memo-date"><strong>วันที่<\/strong> \[รอยืนยัน: ปีเต็มของ 1 ม.ค. 70\]<\/span>/);
  assert.ok(!html.includes('วันที่ 2570'));
});
async function word(markdown: string, options?: { documentTool?: string; font?: string }) {
  const path = join(await mkdtemp(join(tmpdir(), 'step-document-layout-')), 'draft.docx');
  const document = markdownDocument(markdown);
  await exportDocument(path, 'docx', documentText(document), async () => Buffer.alloc(0), document, options);
  const zip = await JSZip.loadAsync(await readFile(path), { checkCRC32: true });
  const xml = await zip.file('word/document.xml')!.async('string');
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  const headers = await Promise.all(
    Object.keys(zip.files)
      .filter(p => /^word\/header\d+\.xml$/.test(p))
      .map(async p => new DOMParser().parseFromString(await zip.file(p)!.async('string'), 'application/xml')),
  );
  const paragraphs = [
    ...headers.flatMap(h => Array.from(h.getElementsByTagNameNS(W, 'p'))),
    ...Array.from(dom.getElementsByTagNameNS(W, 'p')),
  ];
  const text = (p: Element) =>
    Array.from(p.getElementsByTagNameNS(W, 't'))
      .map(t => t.textContent)
      .join('');
  const paragraph = (start: string) => {
    const p = paragraphs.find(p => text(p).startsWith(start));
    assert.ok(p, start);
    return p;
  };
  return { zip, xml, paragraphs, paragraph, text };
}
const attr = (p: Element, element: string, name: string) => p.getElementsByTagNameNS(W, element)[0]?.getAttributeNS(W, name);

test('five document profiles export native editable content with their selected font and live page numbers', async () => {
  for (const documentTool of ['tor', 'memo', 'letter', 'project', 'minutes']) {
    const doc = await word(
      '# ร่างสังเคราะห์\n\n## ๑. หัวข้อ\n\nรหัส **00123**\n\n[รอยืนยัน: งบประมาณ]\n\n| รายการ | สถานะ |\n|---|---|\n| ทดสอบ | รอยืนยัน |',
      { documentTool },
    );
    assert.ok(doc.xml.includes(`w:cs="${documentTool === 'memo' ? 'TH Sarabun New' : 'TH Sarabun PSK'}"`));
    assert.equal(attr(doc.paragraph('ร่างสังเคราะห์'), 'jc', 'val'), documentTool === 'memo' ? 'left' : 'center', documentTool);
    assert.equal(attr(doc.paragraph('๑. หัวข้อ'), 'sz', 'val'), '32');
    assert.match(doc.xml, /<w:pgNumType[^>]*w:fmt="thaiNumbers"/);
    assert.match(doc.xml, /<w:footerReference/);
    const footer = await doc.zip.file('word/footer1.xml')!.async('string');
    assert.match(footer, /PAGE/);
    assert.ok(doc.xml.includes('00123') && doc.xml.includes('[รอยืนยัน: งบประมาณ]'));
    assert.equal((doc.xml.match(/<w:tbl>/g) || []).length, 1);
    assert.doesNotMatch(doc.xml, /<w:(?:drawing|documentProtection|ins|del)\b/);
  }
});

test('headings stay with the next paragraph or table and preserve source characters', async () => {
  const doc = await word(
    '# ร่าง\n\n## ๑๑. คุณสมบัติ\n\n[รอยืนยัน: คุณสมบัติและแหล่ง]\n\n## ๑๒. ตรวจรับ\n\n| รหัส | เกณฑ์ |\n|---|---|\n| 0007/๖๙ | รอยืนยัน |',
    { documentTool: 'tor' },
  );
  for (const title of ['ร่าง', '๑๑. คุณสมบัติ', '๑๒. ตรวจรับ']) {
    const p = doc.paragraph(title);
    assert.ok(p.getElementsByTagNameNS(W, 'keepNext').length, title);
    assert.ok(p.getElementsByTagNameNS(W, 'keepLines').length, title);
  }
  assert.match(doc.xml, /0007\/๖๙/);
  assert.match(doc.xml, /<w:tblHeader\/>/);
});

test('memo fields, letter sender/date and signatures receive distinct layouts without adding facts', async () => {
  const markdown =
    '# ร่างหนังสือ\n\nส่วนราชการ หน่วยงานสังเคราะห์\n\nที่ 0007/๖๙ วันที่ [รอยืนยัน: วันที่]\n\nหน่วยงานและที่อยู่ [รอยืนยัน: ผู้ส่ง]\n\nวันที่ [รอยืนยัน: วันที่]\n\nเรื่อง สังเคราะห์\n\nเรียน [รอยืนยัน: ผู้รับ]\n\nสาระจากต้นเรื่องสังเคราะห์\n\n(ลงชื่อ) [รอยืนยัน: ผู้ลงนาม]\n\nตำแหน่ง [รอยืนยัน: ตำแหน่ง]';
  const memo = await word(markdown, { documentTool: 'memo' });
  assert.ok(Array.from(memo.paragraph('ที่ 0007/๖๙').getElementsByTagNameNS(W, 'tab')).some(tab => tab.parentNode?.nodeName === 'w:r'));
  assert.equal(attr(memo.paragraph('สาระจากต้นเรื่อง'), 'ind', 'firstLine'), '1418');
  assert.equal(attr(memo.paragraph('(ลงชื่อ)'), 'jc', 'val'), 'center');
  assert.equal(attr(memo.paragraph('(ลงชื่อ)'), 'ind', 'left'), '4535');
  const letter = await word(markdown, { documentTool: 'letter' });
  assert.equal(attr(letter.paragraph('หน่วยงานและที่อยู่'), 'ind', 'left'), '4535');
  assert.equal(attr(letter.paragraph('วันที่'), 'jc', 'val'), 'center');
  assert.equal(attr(letter.paragraph('เรียน'), 'ind', 'firstLine'), undefined);
  const expected = documentText(markdownDocument(markdown)).replace(/\s/g, '');
  for (const doc of [memo, letter]) assert.equal(doc.paragraphs.map(doc.text).join('').replace(/\s/g, ''), expected);
});

test('TOR front matter and minutes title fields are centered while source labels remain editable', async () => {
  const tor = await word('# ร่าง TOR\n\nหน่วยงานสังเคราะห์\n\n## ๑. วัตถุประสงค์\n\nสาระจากต้นทาง', { documentTool: 'tor' });
  assert.equal(attr(tor.paragraph('หน่วยงานสังเคราะห์'), 'jc', 'val'), 'center');
  assert.equal(attr(tor.paragraph('สาระจากต้นทาง'), 'jc', 'val'), 'both');
  const minutes = await word(
    '# รายงานการประชุม\n\nชื่อการประชุม สังเคราะห์\n\nครั้งที่ [รอยืนยัน: ครั้งที่]\n\nวัน เวลา สถานที่ [รอยืนยัน: วัน เวลา สถานที่]\n\nผู้มาประชุม [รอยืนยัน: รายชื่อ]\n\n## ระเบียบวาระที่ ๑\n\nมติ [รอยืนยัน: มติ]',
    { documentTool: 'minutes' },
  );
  assert.equal(attr(minutes.paragraph('ชื่อการประชุม'), 'jc', 'val'), 'center');
  assert.equal(attr(minutes.paragraph('ครั้งที่'), 'jc', 'val'), 'center');
  assert.notEqual(attr(minutes.paragraph('ผู้มาประชุม'), 'jc', 'val'), 'center');
});

test('memo reference/date tabs survive bold labels and values without altering an unknown date', async () => {
  const doc = await word(
    '# บันทึกข้อความ\n\n**ที่** **0007/๖๙** **วันที่** [รอยืนยัน: วันที่ — 1 ม.ค. 70]\n\nเรื่อง ทดสอบ\n\nเรียน [รอยืนยัน: ผู้รับ]',
    { documentTool: 'memo' },
  );
  const reference = doc.paragraph('ที่ 0007/๖๙');
  const runs = Array.from(reference.getElementsByTagNameNS(W, 'r'));
  const tab = runs.findIndex(run => Array.from(run.childNodes).some(child => child.nodeName === 'w:tab'));
  assert.ok(tab >= 0);
  assert.equal(runs.slice(0, tab).map(doc.text).join('').replace(/\s/g, ''), 'ที่0007/๖๙');
  assert.equal(doc.text(reference).replace(/\s/g, ''), 'ที่0007/๖๙วันที่[รอยืนยัน:วันที่—1ม.ค.70]');
  assert.ok(reference.getElementsByTagNameNS(W, 'b').length);
});

test('font overrides are allowlisted and invalid profile/font input cannot silently export', async () => {
  const override = await word('# ร่าง\n\nทดสอบ', { documentTool: 'memo', font: 'TH Sarabun New' });
  assert.match(override.xml, /w:cs="TH Sarabun New"/);
  await assert.rejects(word('ทดสอบ', { documentTool: '../../template' }), /INVALID_DOCUMENT_TOOL/);
  await assert.rejects(word('ทดสอบ', { documentTool: 'memo', font: 'Unverified Font' }), /INVALID_EXPORT_FONT/);
  const generic = await word('# Generic\n\n00123');
  assert.match(generic.xml, /w:cs="TH Sarabun New"/);
  assert.doesNotMatch(generic.xml, /<w:footerReference/);
});
