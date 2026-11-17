// Layout lock for the saraban exports: each synthetic draft's Word paragraph geometry and PDF block styles are kept in
// a checked-in fingerprint, so a later change cannot quietly move a label, indent, spacing or page number.
// After an intended layout change, regenerate with UPDATE_SARABAN_LAYOUT=1 and review the fingerprint diff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { exportDocument, pdfHtml } from '../electron/export';
import { resolveDocumentLayout } from '../src/document-layout';
import { resolvePresentation } from '../src/document-presentation';
import { documentText, markdownDocument } from '../src/draft';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const FIXTURES = join(import.meta.dirname, 'fixtures', 'saraban');
const CASES = [
  ['memo', 'memo'],
  ['letter', 'letter'],
  ['minutes', 'minutes'],
] as const;

async function fingerprint(markdown: string, tool: string) {
  const document = markdownDocument(markdown);
  const path = join(await mkdtemp(join(tmpdir(), 'step-saraban-lock-')), 'draft.docx');
  // Thai break hints depend on the runtime's ICU data, so the lock measures layout without them.
  const presentation = { embedFonts: false, thaiBreaks: false };
  await exportDocument(path, 'docx', documentText(document), async () => Buffer.alloc(0), document, { documentTool: tool, presentation });
  const zip = await JSZip.loadAsync(await readFile(path));
  const dom = new DOMParser().parseFromString(await zip.file('word/document.xml')!.async('string'), 'application/xml');
  const first = (p: Element, tag: string, key: string) => p.getElementsByTagNameNS(W, tag)[0]?.getAttributeNS(W, key) || '';
  const word = Array.from(dom.getElementsByTagNameNS(W, 'p'))
    .filter(p => p.parentNode?.nodeName === 'w:body')
    .map(p => {
      const text = Array.from(p.getElementsByTagNameNS(W, 't'))
        .map(t => t.textContent)
        .join('');
      const geometry = [
        first(p, 'jc', 'val'),
        ['left', 'hanging', 'firstLine'].map(key => first(p, 'ind', key)).join('/'),
        first(p, 'spacing', 'before'),
        first(p, 'sz', 'val'),
        p.getElementsByTagNameNS(W, 'b').length ? 'b' : '',
        String(p.getElementsByTagNameNS(W, 'tab').length),
      ].join(' ');
      return `${Array.from(text).slice(0, 18).join('')} | ${geometry}`;
    });
  const parts = Object.keys(zip.files)
    .filter(name => /^word\/(?:header|footer)\d+\.xml$/.test(name))
    .sort();
  const furniture = await Promise.all(
    parts.map(async name => {
      const xml = await zip.file(name)!.async('string');
      return `${name.replace(/\d+\.xml$/, '')} ${/PAGE/.test(xml) ? 'page' : ''}${/<w:drawing>/.test(xml) ? 'garuda' : ''}`;
    }),
  );
  const html = pdfHtml(document, resolveDocumentLayout(tool), new Map(), resolvePresentation(presentation, tool));
  const pdf = Array.from(html.matchAll(/<div class="(block [^"]+)" style="([^"]*)">/g), m => `${m[1]} | ${m[2]}`);
  return { word, furniture: furniture.sort(), pdf, page: /@page:first\{@top-center\{content:none\}\}/.test(html) };
}

for (const [name, tool] of CASES)
  test(`${name}: Word and PDF layout match the locked saraban fingerprint`, async () => {
    const actual = await fingerprint(await readFile(join(FIXTURES, `${name}.md`), 'utf8'), tool);
    const file = join(FIXTURES, `${name}.layout.json`);
    if (process.env.UPDATE_SARABAN_LAYOUT) await writeFile(file, JSON.stringify(actual, null, 2) + '\n');
    assert.deepEqual(actual, JSON.parse(await readFile(file, 'utf8')));
  });
