import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
type Face = { file: string; sha256: string };
type Family = { family: string; files: Record<'regular' | 'bold' | 'italic' | 'boldItalic', Face> };
export type FontEmbedding = { status: 'embedded' | 'disabled' | 'unavailable'; families: string[] };

function directory() {
  const candidates = [
    join((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath || '', 'document-fonts'),
    join(process.cwd(), 'assets/document-fonts'),
    join(process.cwd(), 'desktop/assets/document-fonts'),
    ...(typeof __dirname === 'string' ? [join(__dirname, 'document-fonts')] : []),
  ];
  const found = candidates.find(path => existsSync(join(path, 'manifest.json')));
  if (!found) throw new Error('DOCUMENT_FONT_UNAVAILABLE');
  return found;
}

/** Merge font parts into the package; preserve unrelated fonts, relationships and agency sections. */
export async function embedDocumentFonts(bytes: Uint8Array): Promise<{ bytes: Buffer; embedding: FontEmbedding }> {
  const zip = await JSZip.loadAsync(bytes);
  const parser = new DOMParser(),
    serializer = new XMLSerializer();
  const parse = (xml: string) => parser.parseFromString(xml, 'application/xml');
  const manifestBytes = await readFile(join(directory(), 'manifest.json'));
  if (
    createHash('sha256').update(manifestBytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex') !==
    '8bafe458cc795cbb0f8f7b973ef1a6baceb19458dd015010d73d56a0dfedc9d1'
  )
    throw new Error('DOCUMENT_FONT_UNAVAILABLE');
  const manifest: Family[] = JSON.parse(manifestBytes.toString('utf8'));
  const used = new Set<string>();
  for (const entry of Object.values(zip.files)) {
    if (/^word\/(?:document|styles|header\d*|footer\d*)\.xml$/.test(entry.name)) {
      const doc = parse(await entry.async('string'));
      for (const font of Array.from(doc.getElementsByTagNameNS(W, 'rFonts')))
        for (const key of ['ascii', 'hAnsi', 'cs', 'eastAsia']) {
          const name = font.getAttributeNS(W, key);
          if (name) used.add(name);
        }
    }
  }
  const selected = manifest.filter(f => used.has(f.family));
  if (!selected.length) return { bytes: Buffer.from(bytes), embedding: { status: 'unavailable', families: [] } };
  const table = parse((await zip.file('word/fontTable.xml')?.async('string')) || `<w:fonts xmlns:w="${W}" xmlns:r="${R}"/>`);
  table.documentElement.setAttribute('xmlns:r', R);
  const rels = parse((await zip.file('word/_rels/fontTable.xml.rels')?.async('string')) || `<Relationships xmlns="${PR}"/>`);
  const types = parse(await zip.file('[Content_Types].xml')!.async('string'));
  const tags = { regular: 'embedRegular', bold: 'embedBold', italic: 'embedItalic', boldItalic: 'embedBoldItalic' };
  for (const family of selected) {
    let font = Array.from(table.getElementsByTagNameNS(W, 'font')).find(f => f.getAttributeNS(W, 'name') === family.family);
    if (!font) {
      font = table.createElementNS(W, 'w:font');
      font.setAttributeNS(W, 'w:name', family.family);
      table.documentElement.appendChild(font);
    }
    for (const [style, face] of Object.entries(family.files)) {
      const raw = await readFile(join(directory(), face.file));
      if (createHash('sha256').update(raw).digest('hex') !== face.sha256) throw new Error('DOCUMENT_FONT_UNAVAILABLE');
      const id = randomUUID(),
        key = Buffer.from(id.replace(/-/g, ''), 'hex'),
        obfuscated = Buffer.from(raw);
      for (let i = 0; i < 32; i++) obfuscated[i] ^= key[15 - (i % 16)];
      const filename = `step-${id}.odttf`,
        rid = `stepFont-${id}`;
      zip.file(`word/fonts/${filename}`, obfuscated);
      const tag = tags[style as keyof typeof tags];
      for (const old of Array.from(font.getElementsByTagNameNS(W, tag))) font.removeChild(old);
      const embedded = table.createElementNS(W, `w:${tag}`);
      embedded.setAttributeNS(R, 'r:id', rid);
      embedded.setAttributeNS(W, 'w:fontKey', `{${id.toUpperCase()}}`);
      font.appendChild(embedded);
      const rel = rels.createElementNS(PR, 'Relationship');
      rel.setAttribute('Id', rid);
      rel.setAttribute('Type', `${R}/font`);
      rel.setAttribute('Target', `fonts/${filename}`);
      rels.documentElement.appendChild(rel);
    }
  }
  if (!Array.from(types.getElementsByTagNameNS(CT, 'Default')).some(e => e.getAttribute('Extension') === 'odttf')) {
    const type = types.createElementNS(CT, 'Default');
    type.setAttribute('Extension', 'odttf');
    type.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.obfuscatedFont');
    types.documentElement.appendChild(type);
  }
  if (!Array.from(types.getElementsByTagNameNS(CT, 'Override')).some(e => e.getAttribute('PartName') === '/word/fontTable.xml')) {
    const type = types.createElementNS(CT, 'Override');
    type.setAttribute('PartName', '/word/fontTable.xml');
    type.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml');
    types.documentElement.appendChild(type);
  }
  const docRels = parse(await zip.file('word/_rels/document.xml.rels')!.async('string'));
  if (!Array.from(docRels.getElementsByTagNameNS(PR, 'Relationship')).some(e => e.getAttribute('Type') === `${R}/fontTable`)) {
    const rel = docRels.createElementNS(PR, 'Relationship');
    rel.setAttribute('Id', `stepFontTable-${randomUUID()}`);
    rel.setAttribute('Type', `${R}/fontTable`);
    rel.setAttribute('Target', 'fontTable.xml');
    docRels.documentElement.appendChild(rel);
  }
  const settings = parse((await zip.file('word/settings.xml')?.async('string')) || `<w:settings xmlns:w="${W}"/>`);
  for (const tag of ['embedTrueTypeFonts', 'saveSubsetFonts']) {
    for (const e of Array.from(settings.getElementsByTagNameNS(W, tag))) e.parentNode!.removeChild(e);
    const element = settings.createElementNS(W, `w:${tag}`);
    element.setAttributeNS(W, 'w:val', tag === 'embedTrueTypeFonts' ? '1' : '0');
    settings.documentElement.appendChild(element);
  }
  for (const [path, doc] of [
    ['word/fontTable.xml', table],
    ['word/_rels/fontTable.xml.rels', rels],
    ['[Content_Types].xml', types],
    ['word/_rels/document.xml.rels', docRels],
    ['word/settings.xml', settings],
  ] as const)
    zip.file(path, serializer.serializeToString(doc));
  return {
    bytes: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
    embedding: { status: 'embedded', families: selected.map(f => f.family) },
  };
}
