import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { exportDocument } from '../electron/export';
import { embedDocumentFonts } from '../electron/document-fonts';
import { Store } from '../electron/store';
import { markdownDocument } from '../src/draft';
import { resolvePresentation } from '../src/document-presentation';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
test('TOC and page fields are generated from bounded options; Title and TOC heading stay out of the outline', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'step-fields-')), 'fields.docx');
  const document = markdownDocument('# Title\n\n# Heading one\n\n## Heading two\n\n### Heading three\n\nเนื้อหา');
  const result = await exportDocument(path, 'docx', '', async () => Buffer.alloc(0), document, {
    presentation: {
      toc: true,
      headerText: '<w:instrText>INCLUDETEXT secret</w:instrText>',
      footerText: 'Synthetic footer',
      pageNumber: 'arabic-total',
      pageNumberPosition: 'header-right',
    },
  });
  assert.equal(result?.fieldsNeedUpdate, true);
  const zip = await JSZip.loadAsync(await readFile(path));
  const xml = await zip.file('word/document.xml')!.async('string');
  assert.match(xml, /TOC[^<]*\\h[^<]*\\o &quot;1-3&quot;/);
  assert.match(await zip.file('word/settings.xml')!.async('string'), /<w:updateFields(?: w:val="true")?/);
  const header = await zip.file('word/header1.xml')!.async('string');
  assert.match(header, /&lt;w:instrText&gt;INCLUDETEXT secret/);
  assert.match(header, />PAGE</);
  assert.match(header, />NUMPAGES</);
  assert.match(header, /<w:jc w:val="right"/);
  assert.match(header, /w:cs="TH Sarabun New"/);
  assert.match(header, /<w:szCs w:val="28"/);
  assert.match(await zip.file('word/footer1.xml')!.async('string'), /Synthetic footer/);
  const styles = new DOMParser().parseFromString(await zip.file('word/styles.xml')!.async('string'), 'application/xml');
  for (const id of ['Title', 'TOCHeading']) {
    const style = Array.from(styles.getElementsByTagNameNS(W, 'style')).find(n => n.getAttributeNS(W, 'styleId') === id)!;
    assert.equal(style.getElementsByTagNameNS(W, 'outlineLvl')[0].getAttributeNS(W, 'val'), '9');
  }
  const mixed = await JSZip.loadAsync(await readFile(path));
  mixed.file('word/header1.xml', header.replaceAll('TH Sarabun New', 'Synthetic missing family'));
  const partial = await embedDocumentFonts(await mixed.generateAsync({ type: 'nodebuffer' }));
  assert.equal(partial.embedding.status, 'partial');
  assert.deepEqual(partial.embedding.missingFamilies, ['Synthetic missing family']);
  const unchanged = await JSZip.loadAsync(partial.bytes);
  assert.ok((await unchanged.file('word/header1.xml')!.async('string')).includes('Synthetic missing family'));
});

test('Thai page format and all three page positions use Word fields rather than fixed totals', async () => {
  for (const position of ['footer-center', 'footer-right', 'header-right']) {
    const path = join(await mkdtemp(join(tmpdir(), 'step-pages-')), 'pages.docx');
    await exportDocument(path, 'docx', 'เนื้อหา', async () => Buffer.alloc(0), undefined, {
      presentation: { pageNumber: 'thai', pageNumberPosition: position, embedFonts: false },
    });
    const zip = await JSZip.loadAsync(await readFile(path));
    assert.match(await zip.file('word/document.xml')!.async('string'), /w:fmt="thaiNumbers"/);
    const part = await zip.file(position.startsWith('header') ? 'word/header1.xml' : 'word/footer1.xml')!.async('string');
    assert.match(part, /หน้า /);
    assert.match(part, />PAGE</);
    assert.ok(!part.includes('NUMPAGES'));
    assert.match(part, new RegExp('<w:jc w:val="' + (position === 'footer-center' ? 'center' : 'right') + '"'));
  }
});

test('presentation rejects arbitrary fields, oversized text and unsupported non-DOCX exports before writing', async () => {
  for (const input of [
    { toc: 'true' },
    { headerText: '<'.repeat(501) },
    { footerText: '\u0000' },
    { pageNumber: 'PAGE \\* MERGEFORMAT' },
    { pageNumberPosition: 'anywhere' },
    { fieldInstruction: 'INCLUDETEXT secret' },
  ])
    assert.throws(() => resolvePresentation(input), /INVALID_DOCUMENT_PRESENTATION/);
  for (const format of ['md', 'pdf', 'xlsx', 'pptx']) {
    const path = join(await mkdtemp(join(tmpdir(), 'step-fields-denied-')), 'draft.' + format);
    await assert.rejects(
      exportDocument(path, format, 'text', async () => Buffer.alloc(0), undefined, { presentation: { toc: true } }),
      /DOCX_PRESENTATION_ONLY/,
    );
    await assert.rejects(access(path));
  }
  const withoutFields = join(await mkdtemp(join(tmpdir(), 'step-fields-off-')), 'draft.pdf');
  await exportDocument(withoutFields, 'pdf', 'text', async () => Buffer.from('synthetic PDF'), undefined, {
    documentTool: 'tor',
    presentation: { pageNumber: 'none', pageNumberPosition: 'header-right' },
  });
  assert.equal(await readFile(withoutFields, 'utf8'), 'synthetic PDF');
});

test('header/footer/TOC settings survive revision restore and native template layout choices stay locked', () => {
  const store = new Store(':memory:');
  const task = store.create('synthetic', 'SHARED');
  const first = store.edit(task.id, 'text', 0, undefined, {
    toc: true,
    headerText: 'header',
    footerText: 'footer',
    pageNumber: 'arabic-total',
    pageNumberPosition: 'footer-right',
  });
  const second = store.edit(task.id, 'replacement', first.revision, undefined, {});
  const version = second.versions.find(v => v.presentation?.toc)!;
  const restored = store.edit(task.id, version.text, second.revision, version.document, version.presentation);
  assert.deepEqual(restored.presentation, first.presentation);
  restored.documentTemplate = { key: 'synthetic', sha256: 'synthetic', name: 'Synthetic', font: 'TH Sarabun New' };
  store.save(restored);
  for (const input of [
    { toc: false },
    { headerText: 'changed' },
    { footerText: 'changed' },
    { pageNumber: 'none' },
    { pageNumberPosition: 'header-right' },
    { preset: 'book' },
  ])
    assert.throws(
      () => store.edit(task.id, restored.draft, restored.revision, restored.document, { ...restored.presentation, ...input }),
      /DOCUMENT_TEMPLATE_LAYOUT_LOCKED/,
    );
  assert.equal(
    store.edit(task.id, restored.draft, restored.revision, restored.document, { ...restored.presentation, thaiBreaks: false }).presentation
      ?.thaiBreaks,
    false,
  );
  const legacy = store.create('synthetic', 'SHARED');
  legacy.documentTool = 'memo';
  legacy.documentTemplate = restored.documentTemplate;
  legacy.presentation = { preset: 'saraban', thaiBreaks: true, embedFonts: true } as typeof legacy.presentation;
  store.save(legacy);
  assert.equal(store.edit(legacy.id, 'legacy edit', 0).presentation?.pageNumber, 'thai');
  store.close();
});
