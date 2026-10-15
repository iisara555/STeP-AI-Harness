import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { Store } from '../electron/store';
import { DocumentAssets, documentImageDimensions } from '../electron/document-assets';
import { documentText, markdownDocument, documentMarkdown, validateDocument, type DraftNode } from '../src/draft';
import { exportDocument, pdfHtml } from '../electron/export';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMw7Vz8HwAEuQJhv9Bd3QAAAABJRU5ErkJggg==', 'base64');
test('new document elements stay bounded and local image tokens round-trip without fetching URLs', () => {
  const doc = markdownDocument(
    '# Title\n\n## Heading\n\n> Quoted **evidence**\n> continuing\n\n\f\n\n![Example](step-asset:00000000-0000-0000-0000-000000000001)',
  );
  assert.deepEqual(
    doc.content!.map(n => n.type),
    ['title', 'heading', 'blockquote', 'pageBreak', 'image'],
  );
  assert.deepEqual(validateDocument(doc), doc);
  assert.deepEqual(markdownDocument(documentMarkdown(doc)), doc);
  for (const attrs of [
    { src: 'https://example.test/image.png' },
    { assetId: '../../secret', widthCm: 12 },
    { assetId: '00000000-0000-0000-0000-000000000001', widthCm: Infinity },
  ])
    assert.throws(() => validateDocument({ type: 'doc', content: [{ type: 'image', attrs }] }), /INVALID_DOCUMENT/);
  assert.equal(
    documentText(markdownDocument('![External](https://example.test/image.png)')),
    '![External](https://example.test/image.png)',
  );
});

test('Word uses Title separately from headings and actual native list numbering with nested levels/start values', async () => {
  const document = markdownDocument(
    '# ชื่อเรื่อง\n\n## หัวข้อย่อย\n\n3. ขั้นตอนแรก\n   7. ข้อย่อย\n      - รายการชั้นสาม\n4. ขั้นตอนถัดไป\n\n> ข้อความอ้างอิง\n\n\f\n\nเนื้อหาหน้าใหม่',
  );
  const path = join(await mkdtemp(join(tmpdir(), 'step-elements-')), 'draft.docx');
  await exportDocument(path, 'docx', documentText(document), async () => Buffer.alloc(0), document, {
    presentation: { embedFonts: false },
  });
  const zip = await JSZip.loadAsync(await readFile(path));
  const xml = await zip.file('word/document.xml')!.async('string');
  assert.match(xml, /<w:pStyle w:val="Title"/);
  assert.match(xml, /<w:pStyle w:val="Heading2"/);
  assert.match(xml, /<w:numPr>/);
  assert.match(xml, /<w:ilvl w:val="2"/);
  assert.match(xml, /<w:pageBreakBefore/);
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  const paragraphs = Array.from(parsed.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'p'));
  const nextPage = paragraphs.find(p => p.textContent!.replaceAll('\u200b', '').includes('เนื้อหาหน้าใหม่'))!;
  assert.ok(nextPage.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'pageBreakBefore').length);
  assert.match(xml, /<w:ind w:left="720" w:right="720"/);
  const numbering = await zip.file('word/numbering.xml')!.async('string');
  assert.match(numbering, /<w:start w:val="3"/);
  assert.match(numbering, /<w:start w:val="7"/);
  assert.ok(!xml.includes('3. ขั้นตอนแรก'));
  for (const format of ['xlsx', 'pptx']) {
    const unsupported = path + '.' + format;
    await assert.rejects(
      exportDocument(unsupported, format, '', async () => Buffer.alloc(0), document),
      /UNSUPPORTED_EXPORT_ELEMENT/,
    );
    await assert.rejects(access(unsupported));
  }
});

test('owned image bytes survive restart and version restore; cross-task and corrupt references fail before writing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-image-assets-')),
    file = join(root, 'workspace.sqlite');
  let store = new Store(file),
    assets = new DocumentAssets(store);
  const task = store.create('synthetic', 'SHARED'),
    other = store.create('other', 'SHARED');
  const attrs = assets.save(task.id, { bytes: png, mime: 'image/png', width: 1, height: 1 });
  const doc: DraftNode = {
    type: 'doc',
    content: [
      { type: 'image', attrs },
      { type: 'caption', content: [{ type: 'text', text: 'คำบรรยายสังเคราะห์' }] },
    ],
  };
  const initial = store.edit(task.id, '', 0, doc);
  assert.throws(() => store.edit(other.id, '', 0, doc), /DOCUMENT_IMAGE_NOT_FOUND/);
  assert.throws(() => assets.load(other.id, attrs.assetId), /DOCUMENT_IMAGE_NOT_FOUND/);
  store.edit(task.id, '', initial.revision, markdownDocument('Temporary replacement'));
  store.close();
  store = new Store(file);
  assets = new DocumentAssets(store);
  const current = store.session(task.id),
    version = current.versions.find(v => v.document?.content?.[0].type === 'image')!;
  const restored = store.edit(task.id, version.text, current.revision, version.document);
  const path = join(root, 'image.docx');
  await exportDocument(path, 'docx', restored.draft, async () => Buffer.alloc(0), restored.document, {
    images: assets.resolve(task.id, restored.document!),
    presentation: { embedFonts: false },
  });
  const zip = await JSZip.loadAsync(await readFile(path));
  assert.ok(Object.keys(zip.files).some(k => /^word\/media\//.test(k)));
  const xml = await zip.file('word/document.xml')!.async('string');
  assert.match(xml, /<w:drawing>/);
  assert.match(xml, /<w:pStyle w:val="Caption"/);
  const html = pdfHtml(restored.document!, undefined, assets.resolve(task.id, restored.document!));
  assert.ok(html.includes('src="data:image/png;base64,'));
  for (const format of ['md', 'xlsx', 'pptx'])
    await assert.rejects(
      exportDocument(join(root, 'unsupported.' + format), format, restored.draft, async () => Buffer.alloc(0), restored.document),
      /UNSUPPORTED_EXPORT_ELEMENT/,
    );
  const missing = join(root, 'missing.docx');
  await assert.rejects(
    exportDocument(missing, 'docx', restored.draft, async () => Buffer.alloc(0), restored.document),
    /DOCUMENT_IMAGE_NOT_FOUND/,
  );
  await assert.rejects(access(missing));
  const forked = store.fork(task.id);
  const forkAssetId = forked.document!.content![0].attrs!.assetId!;
  assert.notEqual(forkAssetId, attrs.assetId);
  assert.deepEqual(assets.load(forked.id, forkAssetId).bytes, png);
  assert.ok(forked.versions.some(v => v.document?.content?.[0].attrs?.assetId === forkAssetId));
  const record = store.get<any>('document-asset', attrs.assetId);
  record.data = Buffer.from('corrupted').toString('base64');
  store.put('document-asset', attrs.assetId, record);
  assert.throws(() => assets.load(task.id, attrs.assetId), /DOCUMENT_IMAGE_INVALID/);
  assets.remove(task.id);
  assert.throws(() => assets.load(task.id, attrs.assetId), /DOCUMENT_IMAGE_NOT_FOUND/);
  assert.deepEqual(assets.load(forked.id, forkAssetId).bytes, png);
  store.close();
});

test('image dimensions reject malformed files and decompression bombs before native decoding', () => {
  assert.deepEqual(documentImageDimensions(png), { width: 1, height: 1 });
  const oversized = Buffer.from(png);
  oversized.writeUInt32BE(100000, 16);
  assert.throws(() => documentImageDimensions(oversized), /DOCUMENT_IMAGE_INVALID/);
  for (const bytes of [Buffer.from('<svg/>'), Buffer.from([255, 216, 255, 192, 0, 255])])
    assert.throws(() => documentImageDimensions(bytes), /DOCUMENT_IMAGE_INVALID/);
});
