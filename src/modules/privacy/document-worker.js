import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { evaluatePrivacyGate } from './index.js';
import { unavailableDocument } from './document.js';

const { bytes, extension, includeRedacted, limits } = workerData;
// The parsers receive bytes only. Remote assets, links and XML entities are never fetched.
globalThis.fetch = async () => { throw new Error('network-disabled'); };
let parserWarnings = false;
const quiet = () => {};
console.log = console.warn = console.error = quiet;

function enforce(condition, code) { if (!condition) throw new Error(code); }
function decode(data) { return new TextDecoder('utf-8', { fatal: true }).decode(data); }

async function pdfText() {
  enforce(new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-'), 'invalid-document');
  const { getDocument, GlobalWorkerOptions } = await import('../../vendor/privacy/pdf.mjs');
  GlobalWorkerOptions.workerSrc = new URL('../../vendor/privacy/pdf.worker.mjs', import.meta.url).href;
  // Ignore optional rendering-polyfill warnings on import; record parsing warnings.
  console.log = console.warn = console.error = () => { parserWarnings = true; };
  class LocalFonts {
    async fetch({ filename }) {
      enforce(/^[a-zA-Z0-9_-]+\.(?:pfb|ttf)$/.test(filename), 'invalid-document');
      return new Uint8Array(await readFile(new URL(`../../vendor/privacy/standard_fonts/${filename}`, import.meta.url)));
    }
  }
  class LocalCMaps {
    async fetch({ name }) {
      enforce(/^[a-zA-Z0-9_-]+$/.test(name), 'invalid-document');
      return { cMapData: new Uint8Array(await readFile(new URL(`../../vendor/privacy/cmaps/${name}.bcmap`, import.meta.url))), compressionType: 1 };
    }
  }
  const loading = getDocument({ data: bytes, isEvalSupported: false, useWasm: false,
    useSystemFonts: false, disableFontFace: true, isOffscreenCanvasSupported: false,
    useWorkerFetch: false, CMapReaderFactory: LocalCMaps, StandardFontDataFactory: LocalFonts,
    verbosity: 1, stopAtErrors: true, maxImageSize: 0 });
  let doc;
  try {
    doc = await loading.promise;
    enforce(doc.numPages <= limits.pages, 'page-limit');
    const parts = [];
    let characters = 0;
    let pagesWithoutText = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item) => typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('');
      if (!text.trim()) pagesWithoutText++;
      characters += text.length;
      enforce(characters <= limits.characters, 'text-size-limit');
      parts.push(text);
      page.cleanup();
    }
    return { text: parts.join('\n'), pages: doc.numPages, pagesWithoutText,
      extractionScope: 'pdf-text-layer-only', reviewReasons: ['images-annotations-attachments-and-metadata-not-scanned',
        ...(pagesWithoutText ? ['pages-without-text'] : []), ...(parserWarnings ? ['parser-warning'] : [])],
      incomplete: pagesWithoutText > 0 || parserWarnings };
  } finally { await loading.destroy(); }
}

async function docxText() {
  const { unzipSync } = await import('../../vendor/privacy/fflate.mjs');
  const { default: xml } = await import('../../vendor/privacy/fxp.cjs');
  let entries = 0;
  let expanded = 0;
  let embedded = false;
  const parts = unzipSync(bytes, { filter: (entry) => {
    enforce(++entries <= limits.entries, 'archive-entry-limit');
    enforce(!entry.name.includes('..') && !entry.name.startsWith('/'), 'invalid-document');
    if (/^word\/(?:media|embeddings|activeX)\//.test(entry.name)) embedded = true;
    const include = /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/.test(entry.name);
    if (include) {
      expanded += entry.originalSize;
      enforce(expanded <= limits.expandedBytes, 'archive-size-limit');
    }
    return include;
  } });
  enforce(Boolean(parts['word/document.xml']), 'invalid-document');
  const parser = new xml.XMLParser({ preserveOrder: true, ignoreAttributes: true, trimValues: false,
    parseTagValue: false, processEntities: true, htmlEntities: false });
  const output = [];
  let characters = 0;
  function append(value) {
    characters += value.length;
    enforce(characters <= limits.characters, 'text-size-limit');
    output.push(value);
  }
  function walk(nodes, depth = 0, textNode = false) {
    enforce(depth < 100, 'xml-depth-limit');
    for (const node of nodes) {
      for (const [key, value] of Object.entries(node)) {
        const local = key.split(':').at(-1);
        if (key === '#text' && textNode) append(String(value));
        else if (Array.isArray(value)) {
          if (['altChunk', 'drawing', 'pict', 'object'].includes(local)) embedded = true;
          walk(value, depth + 1, ['t', 'delText', 'instrText'].includes(local));
          if (['p', 'tr', 'br', 'cr'].includes(local)) append('\n');
          if (['tc', 'tab'].includes(local)) append('\t');
        }
      }
    }
  }
  for (const data of Object.values(parts)) {
    enforce(data.length <= limits.expandedBytes, 'archive-size-limit');
    const source = decode(data);
    enforce(!/<!DOCTYPE|<!ENTITY/i.test(source), 'xml-entities-disabled');
    enforce(xml.XMLValidator.validate(source) === true, 'invalid-document');
    walk(parser.parse(source));
    append('\n');
  }
  return { text: output.join(''), extractionScope: 'docx-word-text-only', incomplete: embedded,
    reviewReasons: ['layout-images-metadata-and-embedded-content-not-scanned', ...(embedded ? ['embedded-content'] : [])] };
}

try {
  const document = extension === '.pdf' || extension === '.docx';
  const extraction = extension === '.pdf' ? await pdfText() : extension === '.docx' ? await docxText()
    : { text: decode(bytes), extractionScope: 'utf8-text', reviewReasons: [], incomplete: false };
  enforce(extraction.text.length <= limits.characters, 'text-size-limit');
  enforce(extraction.text.trim().length > 0, 'no-extractable-text');
  enforce(!extraction.text.includes('\0'), 'invalid-text-encoding');
  const gate = evaluatePrivacyGate(extraction.text);
  const { text, incomplete, ...metadata } = extraction;
  const { redactedText, logSafeMetadata, hash, ...report } = gate;
  const action = gate.action === 'block-external' ? gate.action : document ? 'human-confirm' : gate.action;
  parentPort.postMessage({ ...report, ...metadata, action,
    classification: document && ['public', 'internal'].includes(gate.classification) ? 'restricted' : gate.classification,
    requiresHumanConfirmation: document || gate.requiresHumanConfirmation,
    extractionStatus: incomplete ? 'partial' : 'text-extracted', originalFileSanitized: false,
    ...(includeRedacted && !incomplete && !gate.unresolvedIdentifiers && !['human-confirm', 'block-external'].includes(gate.action)
      ? { redactedText } : {}),
  });
} catch (error) {
  const safeCodes = new Set(['invalid-document', 'page-limit', 'text-size-limit', 'archive-entry-limit',
    'archive-size-limit', 'xml-depth-limit', 'xml-entities-disabled', 'no-extractable-text', 'invalid-text-encoding']);
  parentPort.postMessage(unavailableDocument(safeCodes.has(error.message) ? error.message : 'parser-failed'));
}
