import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { resolveDocumentLayout } from '../src/document-layout';
import { exportDocument } from '../electron/export';
import { markdownDocument, documentText } from '../src/draft';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const sourceHash = 'b04394193c54c754c53eb91d30df47adc3f745124ed241283a732f9b2e526be0';
const draft = markdownDocument(
  '# บันทึกข้อความ **(ร่าง)**\n\nที่ 0007/๖๙ วันที่ [รอยืนยัน: วันที่]\n\nเรียน [รอยืนยัน: ผู้รับ]\n\nสาระสังเคราะห์\n\n| รหัส | งบ |\n|---|---|\n| 00123 | [รอยืนยัน: งบประมาณ] |',
);
const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const texts = (dom: Document) =>
  Array.from(dom.getElementsByTagNameNS(W, 't'))
    .map(n => n.textContent)
    .join('');
const attr = (dom: Document, element: string, name: string) => dom.getElementsByTagNameNS(W, element)[0]?.getAttributeNS(W, name);
async function word(documentTool?: string, garuda?: string, font?: string, document = draft) {
  const path = join(await mkdtemp(join(tmpdir(), 'step-garuda-')), 'draft.docx');
  await exportDocument(path, 'docx', documentText(document), async () => Buffer.alloc(0), document, { documentTool, garuda, font });
  const zip = await JSZip.loadAsync(await readFile(path), { checkCRC32: true });
  const body = parse(await zip.file('word/document.xml')!.async('string'));
  const headers = await Promise.all(
    Object.keys(zip.files)
      .filter(p => /^word\/header\d+\.xml$/.test(p))
      .map(async p => parse(await zip.file(p)!.async('string'))),
  );
  return { zip, body, headers };
}

test('Garuda height follows the stored document type; opt-out never enables it on unrelated profiles', () => {
  assert.equal(resolveDocumentLayout('memo').garudaHeightCm, 1.5);
  assert.equal(resolveDocumentLayout('letter').garudaHeightCm, 3);
  for (const id of [undefined, 'tor', 'project', 'minutes']) assert.equal(resolveDocumentLayout(id).garudaHeightCm, undefined);
  assert.equal(resolveDocumentLayout('memo', undefined, 'none').garudaHeightCm, undefined);
  for (const input of [true, false, '3', 'https://example.com/icon.png', '../../private', {}, null])
    assert.throws(() => resolveDocumentLayout('memo', undefined, input), /INVALID_EXPORT_GARUDA/);
});

test('DOCX embeds a pinned high-resolution graphic at its physical height on the first page only, with live first-page footer', async () => {
  for (const [id, height] of [
    ['memo', 1.5],
    ['letter', 3],
  ] as const) {
    const { zip, body, headers } = await word(id);
    assert.equal(headers.length, 1);
    const extent = headers[0].getElementsByTagNameNS(WP, 'extent')[0];
    assert.ok(extent);
    assert.equal(Number(extent.getAttribute('cy')), height * 360000);
    assert.equal(Number(extent.getAttribute('cx')), height * 360000);
    assert.equal(body.getElementsByTagNameNS(W, 'drawing').length, 0);
    assert.equal(body.getElementsByTagNameNS(W, 'tbl').length, 1);
    assert.equal(attr(body, 'headerReference', 'type'), 'first');
    assert.equal(body.getElementsByTagNameNS(W, 'titlePg').length, 1);
    assert.equal(attr(body, 'pgMar', 'top'), '1418');
    const media = Object.keys(zip.files).filter(p => p.startsWith('word/media/') && !zip.files[p].dir);
    assert.equal(media.length, 1);
    const png = await zip.file(media[0])!.async('nodebuffer');
    assert.equal(createHash('sha256').update(png).digest('hex'), sourceHash);
    assert.equal(png.readUInt32BE(16), 800);
    assert.equal(png.readUInt32BE(20), 800);
    const footers = Object.keys(zip.files).filter(p => /^word\/footer\d+\.xml$/.test(p));
    assert.equal(footers.length, 2);
    for (const footer of footers) assert.match(await zip.file(footer)!.async('string'), /PAGE/);
    for (const part of Object.keys(zip.files).filter(p => p.endsWith('.rels')))
      assert.doesNotMatch(await zip.file(part)!.async('string'), /TargetMode="External"/);
    const actual = (id === 'memo' ? texts(headers[0]) : '') + texts(body);
    assert.equal(actual.replace(/\s/g, ''), documentText(draft).replace(/\s/g, ''));
  }
});

test('memo header keeps the source title editable and gives Thai and Latin the same 30 pt bold face', async () => {
  for (const font of ['TH Sarabun PSK', 'TH Sarabun New']) {
    const { headers } = await word('memo', 'auto', font);
    const header = headers[0];
    assert.equal(texts(header), 'บันทึกข้อความ (ร่าง)');
    assert.equal(attr(header, 'sz', 'val'), '60');
    assert.equal(attr(header, 'szCs', 'val'), '60');
    assert.equal(attr(header, 'rFonts', 'cs'), font);
    assert.ok(header.getElementsByTagNameNS(W, 'bCs').length);
  }
  const plain = markdownDocument('ส่วนราชการ [รอยืนยัน: หน่วยงาน]\n\nเนื้อหาสังเคราะห์');
  const { body, headers } = await word('memo', 'auto', undefined, plain);
  assert.equal(texts(headers[0]), '');
  assert.equal(texts(body).replace(/\s/g, ''), documentText(plain).replace(/\s/g, ''));
});

test('opt-out and unrelated DOCX exports have no emblem and retain native source text', async () => {
  for (const id of [undefined, 'memo', 'letter', 'tor', 'project', 'minutes']) {
    const { zip, body, headers } = await word(id, id === 'memo' || id === 'letter' ? 'none' : 'auto');
    assert.equal(headers.length, 0);
    assert.ok(!Object.keys(zip.files).some(p => p.startsWith('word/media/')));
    assert.equal(texts(body).replace(/\s/g, ''), documentText(draft).replace(/\s/g, ''));
  }
  await assert.rejects(word('memo', '../../private.png'), /INVALID_EXPORT_GARUDA/);
});

test('PDF export passes a local graphic, actual selected font and unchanged facts to the sandboxed printer', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'step-garuda-pdf-')), 'draft.pdf');
  for (const id of ['memo', 'letter', 'tor', 'project', 'minutes', undefined]) {
    await exportDocument(
      path,
      'pdf',
      documentText(draft),
      async html => {
        assert.match(html, new RegExp(`font-family:"${id && id !== 'memo' ? 'TH Sarabun PSK' : 'TH Sarabun New'}"`));
        assert.match(html, /00123/);
        assert.match(html, /\[รอยืนยัน: งบประมาณ\]/);
        assert.doesNotMatch(html, /<script|src="https?:|position:fixed/);
        const encoded = /src="data:image\/png;base64,([^"]+)"/.exec(html);
        if (id === 'memo' || id === 'letter') {
          assert.ok(encoded);
          assert.equal(createHash('sha256').update(Buffer.from(encoded[1], 'base64')).digest('hex'), sourceHash);
          assert.match(html, new RegExp(`height:${id === 'memo' ? '1.5' : '3'}cm`));
          assert.match(html, /@page:first\{margin-top:1.5cm/);
          assert.equal((html.match(/<img\b/g) || []).length, 1);
        } else assert.equal(encoded, null);
        return Buffer.from('%PDF-synthetic');
      },
      draft,
      { documentTool: id },
    );
  }
  await exportDocument(
    path,
    'pdf',
    documentText(draft),
    async html => {
      assert.doesNotMatch(html, /<img\b/);
      assert.match(html, /font-family:"TH Sarabun New"/);
      return Buffer.from('%PDF-synthetic');
    },
    draft,
    { documentTool: 'memo', garuda: 'none', font: 'TH Sarabun New' },
  );
});
