import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { exportDocument } from '../electron/export';
import { markdownDocument, documentText, type DraftNode } from '../src/draft';
import { withThaiBreaks } from '../src/thai-typography';
import { DOCUMENT_PRESETS, resolvePresentation } from '../src/document-presentation';
import { resolveDocumentLayout } from '../src/document-layout';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
test('Markdown soft wrapping differs from paragraphs and explicit hard breaks; emphasis nests', () => {
  const doc = markdownDocument('ข้อความบรรทัดแรก\nต่อในย่อหน้าเดียว\n\n**ตัวหนา *และเอียง* ต่อ**  \nบรรทัดที่ตั้งใจขึ้นใหม่');
  assert.equal(doc.content?.length, 2);
  assert.equal(documentText(doc.content![0]), 'ข้อความบรรทัดแรก ต่อในย่อหน้าเดียว');
  assert.ok(doc.content![1].content?.some(n => n.type === 'hardBreak'));
  const combined = doc.content![1].content!.find(n => n.text === 'และเอียง')!;
  assert.deepEqual(combined.marks?.map(m => m.type).sort(), ['bold', 'italic']);
});

test('Thai boundaries cross emphasis safely without changing source or protected tokens', () => {
  const paragraph: DraftNode = {
    type: 'paragraph',
    content: [
      { type: 'text', text: 'การดำเนิน' },
      { type: 'text', text: 'งานและจัดทำรายงาน', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' https://example.test/ภาษาไทย team@example.test DOC-001 ๐๐๑๒๓ 👨‍👩‍👧‍👦' },
    ],
  };
  const before = JSON.stringify(paragraph),
    copy = withThaiBreaks(paragraph);
  assert.equal(JSON.stringify(paragraph), before);
  assert.ok(documentText(copy).includes('\u200b'));
  assert.equal(documentText(copy).replaceAll('\u200b', ''), documentText(paragraph));
  assert.ok(documentText(copy).includes('https://example.test/ภาษาไทย'));
  assert.ok(documentText(copy).includes('team@example.test DOC-001 ๐๐๑๒๓ 👨‍👩‍👧‍👦'));
  assert.deepEqual(withThaiBreaks(copy), copy);
});

test('font aliases and presentation defaults are bounded', () => {
  assert.equal(resolveDocumentLayout('tor', 'TH Sarabun PSK').font, 'TH SarabunPSK');
  assert.equal(resolvePresentation().preset, 'report');
  assert.equal(resolvePresentation({}, true).preset, 'saraban');
  for (const value of [{ preset: '__proto__' }, { thaiBreaks: 'false' }, { embedFonts: 0 }, { arbitraryXml: '<w:instrText/>' }])
    assert.throws(() => resolvePresentation(value), /INVALID_DOCUMENT_PRESENTATION/);
});

test('default DOCX adds Thai break opportunities and embeds four genuine font faces per selected family', async () => {
  for (const font of ['TH Sarabun New', 'TH SarabunPSK']) {
    const doc = markdownDocument('การดำเนินงานและจัดทำรายงาน **ตัวหนา** *ตัวเอียง*');
    const path = join(await mkdtemp(join(tmpdir(), 'step-thai-core-')), 'draft.docx');
    const output = await exportDocument(path, 'docx', documentText(doc), async () => Buffer.alloc(0), doc, { font });
    assert.equal(output?.fontEmbedding.status, 'embedded');
    const zip = await JSZip.loadAsync(await readFile(path));
    assert.match(await zip.file('word/document.xml')!.async('string'), /\u200b/);
    assert.ok(!documentText(doc).includes('\u200b'));
    const table = parse(await zip.file('word/fontTable.xml')!.async('string'));
    const entry = Array.from(table.getElementsByTagNameNS(W, 'font')).find(f => f.getAttributeNS(W, 'name') === font)!;
    const manifest = JSON.parse(await readFile('assets/document-fonts/manifest.json', 'utf8')).find((f: any) => f.family === font);
    const rels = parse(await zip.file('word/_rels/fontTable.xml.rels')!.async('string'));
    for (const [style, tag] of Object.entries({
      regular: 'embedRegular',
      bold: 'embedBold',
      italic: 'embedItalic',
      boldItalic: 'embedBoldItalic',
    })) {
      const face = entry.getElementsByTagNameNS(W, tag)[0];
      assert.ok(face, tag);
      const id = face.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      const relationship = Array.from(rels.getElementsByTagName('Relationship')).find(r => r.getAttribute('Id') === id)!;
      const raw = await zip.file('word/' + relationship.getAttribute('Target'))!.async('nodebuffer');
      const key = Buffer.from((face.getAttributeNS(W, 'fontKey') || '').replace(/[{}-]/g, ''), 'hex');
      for (let i = 0; i < 32; i++) raw[i] ^= key[15 - (i % 16)];
      assert.equal(createHash('sha256').update(raw).digest('hex'), manifest.files[style].sha256);
    }
  }
});

test('presets control actual page geometry and disabling breaks preserves literal DOCX text', async () => {
  for (const [preset, expected] of Object.entries(DOCUMENT_PRESETS)) {
    const doc = markdownDocument('ข้อความภาษาไทยต่อเนื่องสำหรับตรวจการจัดหน้า');
    const path = join(await mkdtemp(join(tmpdir(), 'step-preset-')), 'draft.docx');
    await exportDocument(path, 'docx', documentText(doc), async () => Buffer.alloc(0), doc, {
      presentation: { preset, thaiBreaks: false, embedFonts: false },
    });
    const zip = await JSZip.loadAsync(await readFile(path)),
      xml = await zip.file('word/document.xml')!.async('string');
    assert.ok(xml.includes(documentText(doc)));
    const margin = parse(xml).getElementsByTagNameNS(W, 'pgMar')[0];
    assert.equal(margin.getAttributeNS(W, 'left'), String(Math.round(expected.margins.left * 567)));
    const styles = parse(await zip.file('word/styles.xml')!.async('string'));
    assert.equal(
      styles.getElementsByTagNameNS(W, 'rPrDefault')[0].getElementsByTagNameNS(W, 'szCs')[0].getAttributeNS(W, 'val'),
      String(expected.points * 2),
    );
    assert.equal(Object.keys(zip.files).filter(p => p.endsWith('.odttf')).length, 0);
  }
});
