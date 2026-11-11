// Read-only previews for the workspace Files tab: Word, Excel and PowerPoint files are turned into plain structured
// text (never HTML), and pictures into a data URL, so staff can look at a file without leaving the app. Nothing here
// edits, sends or executes the file. Macros, embedded objects and remote links are never followed.
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { DOMParser } from '@xmldom/xmldom';

export type PreviewBlock =
  { kind: 'heading' | 'paragraph'; text: string } | { kind: 'table'; rows: string[][] } | { kind: 'section'; title: string };
export type FilePreview =
  { kind: 'document' | 'sheet' | 'slides'; blocks: PreviewBlock[]; truncated: boolean } | { kind: 'image'; url: string };

import { IMAGE_TYPES as IMAGES } from '../src/file-kinds';
export { OPEN_EXTERNALLY, previewable } from '../src/file-kinds';

export const PREVIEW_LIMITS = {
  bytes: 25_000_000,
  entries: 2000,
  xmlBytes: 20_000_000,
  characters: 400_000,
  rows: 300,
  cols: 40,
  slides: 200,
};

class Budget {
  characters = 0;
  truncated = false;
  take(text: string) {
    if (this.characters >= PREVIEW_LIMITS.characters) {
      this.truncated = true;
      return '';
    }
    const kept = text.slice(0, PREVIEW_LIMITS.characters - this.characters);
    if (kept.length < text.length) this.truncated = true;
    this.characters += kept.length;
    return kept;
  }
}

async function unzip(bytes: Buffer, wanted: (name: string) => boolean) {
  const zip = await JSZip.loadAsync(bytes).catch(() => {
    throw new Error('PREVIEW_UNREADABLE');
  });
  const names = Object.keys(zip.files);
  if (names.length > PREVIEW_LIMITS.entries) throw new Error('PREVIEW_LIMIT');
  const parts = new Map<string, string>();
  let total = 0;
  for (const name of names.filter(wanted)) {
    const text = await zip.file(name)!.async('string');
    total += text.length;
    if (total > PREVIEW_LIMITS.xmlBytes) throw new Error('PREVIEW_LIMIT');
    parts.set(name, text);
  }
  return parts;
}

function xml(source: string) {
  // Entity declarations could expand without bound; Office files never need them.
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('PREVIEW_UNREADABLE');
  return new DOMParser().parseFromString(source, 'application/xml');
}
const local = (node: Node) => (node as Element).localName || node.nodeName.split(':').pop() || '';
const children = (node: Node, name: string) => Array.from(node.childNodes || []).filter(n => local(n) === name) as Element[];
function textOf(node: Node, tags = new Set(['t'])): string {
  let out = '';
  for (const child of Array.from(node.childNodes || [])) {
    const name = local(child);
    if (child.nodeType === 3) continue;
    if (tags.has(name)) out += child.textContent || '';
    else if (name === 'tab') out += '\t';
    else if (name === 'br' || name === 'cr') out += '\n';
    else out += textOf(child, tags);
  }
  return out;
}

async function docx(bytes: Buffer): Promise<FilePreview> {
  const parts = await unzip(bytes, name => name === 'word/document.xml');
  const source = parts.get('word/document.xml');
  if (!source) throw new Error('PREVIEW_UNREADABLE');
  const body = xml(source).getElementsByTagNameNS('*', 'body')[0];
  if (!body) throw new Error('PREVIEW_UNREADABLE');
  const budget = new Budget(),
    blocks: PreviewBlock[] = [];
  for (const node of Array.from(body.childNodes || [])) {
    if (budget.truncated) break;
    const name = local(node);
    if (name === 'p') {
      const style = (node as Element).getElementsByTagNameNS('*', 'pStyle')[0]?.getAttribute('w:val') || '';
      const text = budget.take(textOf(node));
      if (text.trim()) blocks.push({ kind: /^(?:Heading|Title|หัวเรื่อง)/i.test(style) ? 'heading' : 'paragraph', text });
    } else if (name === 'tbl') {
      const rows = children(node, 'tr').map(row => children(row, 'tc').map(cell => budget.take(textOf(cell).trim())));
      if (rows.length) blocks.push({ kind: 'table', rows: rows.slice(0, PREVIEW_LIMITS.rows) });
    }
  }
  return { kind: 'document', blocks, truncated: budget.truncated };
}

async function xlsx(bytes: Buffer): Promise<FilePreview> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never).catch(() => {
    throw new Error('PREVIEW_UNREADABLE');
  });
  const budget = new Budget(),
    blocks: PreviewBlock[] = [];
  let truncated = false;
  for (const sheet of workbook.worksheets) {
    if (sheet.state === 'veryHidden') continue;
    blocks.push({ kind: 'section', title: sheet.name });
    const rows: string[][] = [];
    const lastRow = Math.min(sheet.actualRowCount ? sheet.rowCount : 0, PREVIEW_LIMITS.rows);
    const lastCol = Math.min(sheet.columnCount, PREVIEW_LIMITS.cols);
    if (sheet.rowCount > PREVIEW_LIMITS.rows || sheet.columnCount > PREVIEW_LIMITS.cols) truncated = true;
    for (let r = 1; r <= lastRow; r++) {
      const row = sheet.getRow(r);
      // A cell's shown text (its value or a formula's cached result); formulas are not recalculated here.
      rows.push(Array.from({ length: lastCol }, (_, c) => budget.take(row.getCell(c + 1).text || '')));
    }
    while (rows.length && rows.at(-1)!.every(cell => !cell)) rows.pop();
    blocks.push(rows.length ? { kind: 'table', rows } : { kind: 'paragraph', text: '' });
    if (budget.truncated) break;
  }
  return { kind: 'sheet', blocks, truncated: truncated || budget.truncated };
}

async function pptx(bytes: Buffer): Promise<FilePreview> {
  const slide = /^ppt\/slides\/slide(\d+)\.xml$/;
  const parts = await unzip(bytes, name => slide.test(name));
  const order = [...parts.keys()].sort((a, b) => Number(slide.exec(a)![1]) - Number(slide.exec(b)![1]));
  const budget = new Budget(),
    blocks: PreviewBlock[] = [];
  for (const [index, name] of order.slice(0, PREVIEW_LIMITS.slides).entries()) {
    blocks.push({ kind: 'section', title: String(index + 1) });
    const doc = xml(parts.get(name)!);
    for (const shape of Array.from(doc.getElementsByTagNameNS('*', 'sp'))) {
      const title = /title/i.test(shape.getElementsByTagNameNS('*', 'ph')[0]?.getAttribute('type') || '');
      for (const paragraph of Array.from(shape.getElementsByTagNameNS('*', 'p'))) {
        const text = budget.take(textOf(paragraph));
        if (text.trim()) blocks.push({ kind: title ? 'heading' : 'paragraph', text });
      }
    }
    for (const table of Array.from(doc.getElementsByTagNameNS('*', 'tbl'))) {
      const rows = children(table, 'tr').map(row => children(row, 'tc').map(cell => budget.take(textOf(cell).trim())));
      if (rows.length) blocks.push({ kind: 'table', rows });
    }
    if (budget.truncated) break;
  }
  return { kind: 'slides', blocks, truncated: budget.truncated || order.length > PREVIEW_LIMITS.slides };
}

/** A read-only preview of one workspace file's bytes, chosen by its extension. */
export async function filePreview(bytes: Buffer, extension: string): Promise<FilePreview> {
  const ext = extension.toLowerCase();
  if (bytes.length > PREVIEW_LIMITS.bytes) throw new Error('FILE_LIMIT');
  if (ext in IMAGES) return { kind: 'image', url: `data:${IMAGES[ext]};base64,${bytes.toString('base64')}` };
  if (ext === '.docx' || ext === '.docm') return docx(bytes);
  if (ext === '.xlsx' || ext === '.xlsm') return xlsx(bytes);
  if (ext === '.pptx' || ext === '.pptm') return pptx(bytes);
  throw new Error('PREVIEW_UNSUPPORTED');
}
