import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { documentText, validateDocument, type DraftNode } from '../src/draft';
import { documentTool, type DocumentToolId } from '../src/document-tools';
import { documentLayoutRoles } from '../src/document-layout';
import { posix } from 'node:path';

// Agency files remain local. Only a sample-free outline goes to the selected AI.
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const SERIALIZER = new XMLSerializer();
const elements = (node: Element | Document, tag: string): Element[] => Array.from(node.getElementsByTagNameNS(W, tag));
const children = (node: Node): Element[] => Array.from(node.childNodes).filter(n => n.nodeType === 1) as Element[];
const text = (node: Element) =>
  elements(node, 't')
    .map(t => t.textContent || '')
    .join('')
    .trim();
const label = (value: string) =>
  value
    .replace(/^[\d๐-๙]+[.)]\s*/, '')
    .replace(/\s+/g, '')
    .slice(0, 80);
function columnMeaning(value: string): string | undefined {
  const normalized = value.replace(/\s+/g, '').toLowerCase();
  for (const [key, pattern] of [
    ['ผู้จดรายงาน', /ผู้จด|ผู้บันทึกรายงาน/],
    ['ผู้ตรวจรายงาน', /ผู้ตรวจรายงาน/],
    ['ผู้รับผิดชอบ', /ผู้รับผิดชอบ|owner/],
    ['กำหนดเสร็จ', /กำหนดเสร็จ|กำหนดเวลา|due/],
    ['ผู้ให้ข้อมูล', /ผู้ให้ข้อมูล/],
    ['สิ่งที่แก้ไขแล้ว', /แก้ไข.*แล้ว|ดำเนินการ.*แล้ว/],
    ['สิ่งที่ต้องทำเพิ่ม', /ทำเพิ่ม|ดำเนินการ.*ต่อ/],
    ['รายละเอียด', /รายละเอียด|detail/],
    ['ประเด็น', /ประเด็น|issue/],
    ['ลำดับ', /ลำดับ|^no\.?$/],
    ['ชื่อ-สกุล', /ชื่อ.*สกุล|^ชื่อ$|^name$/],
    ['ตำแหน่ง', /ตำแหน่ง|position/],
    ['ราคาต่อหน่วย', /ราคาต่อหน่วย|หน่วยละ|unitprice/],
    ['รวมเป็นเงิน', /รวม|จำนวนเงิน|total|amount/],
    ['จำนวน', /จำนวน|quantity|qty/],
    ['รายการ', /รายการ|description|item/],
  ] as const)
    if (pattern.test(normalized)) return key;
}
function fail(code: string): never {
  throw new Error(code);
}
function parse(value: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(value)) fail('DOCUMENT_TEMPLATE_UNSAFE');
  let invalid = false;
  const doc = new DOMParser({
    errorHandler: {
      warning: () => {
        invalid = true;
      },
      error: () => {
        invalid = true;
      },
      fatalError: () => {
        invalid = true;
      },
    },
  }).parseFromString(value, 'application/xml');
  if (invalid || !doc.documentElement) fail('DOCUMENT_TEMPLATE_UNSAFE');
  if (doc.getElementsByTagName('*').length > 100_000) fail('DOCUMENT_TEMPLATE_LIMIT');
  return doc;
}
async function open(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > 8_000_000) fail('DOCUMENT_TEMPLATE_LIMIT');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    return fail('DOCUMENT_TEMPLATE_UNSAFE');
  }
  const entries = Object.values(zip.files);
  if (entries.length > 2000 || entries.reduce((n, entry) => n + ((entry as any)._data?.uncompressedSize || 0), 0) > 32_000_000)
    fail('DOCUMENT_TEMPLATE_LIMIT');
  for (const entry of entries) {
    if (
      entry.name.startsWith('/') ||
      entry.name.includes('\\') ||
      /^[a-z]:/i.test(entry.name) ||
      entry.name.split('/').includes('..') ||
      ((entry as any).unsafeOriginalName && (entry as any).unsafeOriginalName !== entry.name) ||
      /(?:vbaProject|embeddings\/|activeX\/|_xmlsignatures\/)/i.test(entry.name)
    )
      fail('DOCUMENT_TEMPLATE_UNSAFE');
    if (!/\.(?:xml|rels)$/i.test(entry.name)) continue;
    const xml = parse(await entry.async('string'));
    if (entry.name === '[Content_Types].xml' && /macroEnabled|vbaProject|oleObject/i.test(SERIALIZER.serializeToString(xml)))
      fail('DOCUMENT_TEMPLATE_UNSAFE');
    if (entry.name.endsWith('.rels')) {
      for (const rel of Array.from(xml.getElementsByTagNameNS('*', 'Relationship'))) {
        const type = rel.getAttribute('Type') || '';
        if (/(?:oleObject|attachedTemplate|aFChunk|package|control)$/i.test(type)) fail('DOCUMENT_TEMPLATE_UNSAFE');
        if (rel.getAttribute('TargetMode') === 'External' && !type.endsWith('/hyperlink')) fail('DOCUMENT_TEMPLATE_UNSAFE');
        if (!type.endsWith('/hyperlink') && rel.getAttribute('TargetMode') !== 'External') {
          const target = rel.getAttribute('Target') || '';
          if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.includes('\\')) fail('DOCUMENT_TEMPLATE_UNSAFE');
          const resolved = target.startsWith('/')
            ? target.slice(1)
            : posix.normalize(posix.join(posix.dirname(posix.dirname(entry.name)), target));
          if (resolved.startsWith('../') || resolved === '..') fail('DOCUMENT_TEMPLATE_UNSAFE');
        }
        if (
          rel.getAttribute('TargetMode') === 'External' ||
          /(?:core-properties|extended-properties|custom-properties|comments|customXml|people)$/i.test(type)
        )
          rel.parentNode!.removeChild(rel);
      }
      zip.file(entry.name, SERIALIZER.serializeToString(xml));
    }
    if (entry.name.startsWith('word/') && entry.name.endsWith('.xml')) {
      if (['object', 'altChunk', 'sdt', 'ins', 'del', 'documentProtection'].some(t => elements(xml, t).length))
        fail('DOCUMENT_TEMPLATE_UNSAFE');
      for (const field of [...elements(xml, 'instrText'), ...elements(xml, 'fldSimple')]) {
        const code = field.localName === 'fldSimple' ? field.getAttributeNS(W, 'instr') || '' : field.textContent || '';
        if (!/^\s*(?:PAGE|NUMPAGES|SECTION|SECTIONPAGES)\b[^"<>]*$/i.test(code)) fail('DOCUMENT_TEMPLATE_UNSAFE');
      }
      const hyperlinks = elements(xml, 'hyperlink');
      for (const hyperlink of hyperlinks) {
        // Keep visible text; never emit an external link in the new document.
        while (hyperlink.firstChild) hyperlink.parentNode!.insertBefore(hyperlink.firstChild, hyperlink);
        hyperlink.parentNode!.removeChild(hyperlink);
      }
      if (hyperlinks.length) zip.file(entry.name, SERIALIZER.serializeToString(xml));
    }
  }
  // Remove source author metadata, comments and custom data instead of inheriting old task facts.
  for (const entry of entries)
    if (/^(?:docProps\/|customXml\/)|^word\/(?:comments|people|footnotes|endnotes)/.test(entry.name)) zip.remove(entry.name);
  const types = zip.file('[Content_Types].xml');
  if (!types || !zip.file('word/document.xml')) fail('DOCUMENT_TEMPLATE_UNSAFE');
  const contentTypes = parse(await types.async('string'));
  for (const part of Array.from(contentTypes.getElementsByTagNameNS('*', 'Override'))) {
    const name = (part.getAttribute('PartName') || '').replace(/^\//, '');
    if (name && !zip.file(name)) part.parentNode!.removeChild(part);
  }
  zip.file('[Content_Types].xml', SERIALIZER.serializeToString(contentTypes));
  const doc = parse(await zip.file('word/document.xml')!.async('string'));
  const body = elements(doc, 'body')[0];
  if (!body || children(body).some(n => !['p', 'tbl', 'sectPr'].includes(n.localName))) fail('DOCUMENT_TEMPLATE_UNSUPPORTED');
  return { zip, doc, body };
}

function role(value: string, first = false): string {
  if (first || /^(?:บันทึกข้อความ|ข้อเสนอโครงการ|รายงานการประชุม)/.test(value)) return 'title';
  if (/^ส่วน(?:งาน|ราชการ)/.test(value)) return 'unit';
  if (/^ที่\s/.test(value)) return 'reference';
  if (/^วันที่\s/.test(value)) return 'date';
  if (/^รายชื่อผู้เข้าร่วมประชุม/.test(value)) return 'attendees';
  if (/^เริ่มประชุม/.test(value)) return 'meeting-start';
  if (/^เลิกประชุม/.test(value)) return 'meeting-end';
  if (/^สถานที่\s/.test(value)) return 'meeting-place';
  if (/^เรื่อง\s/.test(value)) return 'subject';
  if (/^เรียน\s/.test(value)) return 'recipient';
  if (/^(?:อ้างถึง|สิ่งที่ส่งมาด้วย)/.test(value)) return value.startsWith('อ้างถึง') ? 'references' : 'attachments';
  if (/^(?:\(|ขอแสดงความนับถือ|ผู้จดรายงาน|ผู้ตรวจรายงาน)/.test(value)) return 'signature';
  if (/^(?:[\d๐-๙]+[.)]\s|วาระที่\s)/.test(value)) return 'heading';
  return 'body';
}
function describe(body: Element, doc: Document, id: unknown) {
  const profile = documentTool(id);
  if (!profile || profile.id === 'tor') fail('DOCUMENT_TEMPLATE_UNSUPPORTED');
  const paragraphs = children(body).filter(n => n.localName === 'p');
  const all = paragraphs.map(text).join('\n');
  const match = {
    memo: /บันทึกข้อความ/,
    letter: /เรื่อง[\s\S]*เรียน/,
    project: /หลักการและเหตุผล[\s\S]*วัตถุประสงค์[\s\S]*งบประมาณ/,
    minutes: /รายงานการประชุม/,
  }[profile.id as Exclude<DocumentToolId, 'tor'>];
  if (!match.test(all)) fail('DOCUMENT_TEMPLATE_MISMATCH');
  const nativeTables = children(body).filter(n => n.localName === 'tbl');
  const headers = nativeTables.map(tbl => {
    const row = children(tbl).find(n => n.localName === 'tr');
    if (!row) fail('DOCUMENT_TEMPLATE_UNSUPPORTED');
    return children(row)
      .filter(n => n.localName === 'tc')
      .map(cell => columnMeaning(text(cell)));
  });
  const tables = children(body)
    .filter(n => n.localName === 'tbl')
    .map(tbl => {
      const rows = children(tbl).filter(n => n.localName === 'tr');
      return Math.max(...rows.map(row => children(row).filter(n => n.localName === 'tc').length));
    });
  if (tables.length > 12 || tables.some(n => n < 1 || n > 30)) fail('DOCUMENT_TEMPLATE_UNSUPPORTED');
  const font =
    elements(doc, 'rFonts')
      .flatMap(n => ['cs', 'eastAsia', 'ascii', 'hAnsi'].map(a => n.getAttributeNS(W, a)))
      .find(f => f && /^TH\s?Sarabun/i.test(f)) || 'TH Sarabun PSK';
  // Only recognized field/heading labels: filled template prose, people and numbers never enter model context.
  const headings = paragraphs.map(text).flatMap(value => {
    const numbered =
      /^([\d๐-๙]+)[.)]\s*(หลักการและเหตุผล|วัตถุประสงค์|ความสอดคล้องกับยุทธศาสตร์|ผู้ร่วมโครงการ|วัน\s*เวลา\s*และสถานที่|งบประมาณ|ผลที่คาดว่าจะได้รับ)/.exec(
        value,
      );
    if (numbered) return [`${numbered[1]}. ${numbered[2]}`];
    const agenda = /^วาระที่\s*([\d๐-๙]+)/.exec(value);
    return agenda ? [`วาระที่ ${agenda[1]}`] : [];
  });
  const context = [
    'Agency DOCX selected for this task. Use its outline ahead of the working template, with the primary Skill for fact/source checks. Filled examples have been withheld.',
    'Keep all legitimate editable content in document_draft. No export or Skill-check commentary there. Missing task facts stay [รอยืนยัน: ชื่อช่อง].',
    ...(headings.length ? ['Agency section labels:\n' + headings.join('\n')] : []),
    ...(tables.length
      ? [
          `Include exactly ${tables.length} Markdown tables in this order, with column counts ${tables.join(', ')}. Preserve column meaning and blank confirmation cells; never replace a table with prose.`,
          ...headers.map(
            (columns, index) => `Table ${index + 1} column meanings: ${columns.map((name, i) => name || 'ช่องที่ ' + (i + 1)).join(' | ')}`,
          ),
        ]
      : []),
    profile.id === 'minutes' &&
      'Use the department meeting form: participant table, agenda content, follow-up table, then a two-column recorder/reviewer signature table. Preserve Decision/Action/Information/Proposal distinctions; never invent agreements.',
    profile.id === 'project' &&
      'Use the agency proposal sections. Put activities/targets in rationale or participants and indicators with expected outcomes if the form has no separate slot. The budget table contains description, quantity, unit price and total; missing figures stay pending confirmation. Strategic alignment needs a supplied source, never mark a choice as approved.',
    profile.id === 'letter' &&
      'Start with the reference and sender block rather than adding a new decorative title; preserve subject, recipient, references, attachments, body, closing, signature and supplied contact details.',
    profile.id === 'memo' &&
      'Use บันทึกข้อความ, ส่วนงาน, ที่ … วันที่ … on one line, เรื่อง, เรียน, narrative body and signature space. Filled agency example names and positions are not task facts.',
  ]
    .filter(Boolean)
    .join('\n');
  return { documentTool: profile.id, font, tables, headers, context };
}
export async function inspectDocumentTemplate(bytes: Uint8Array, id: unknown) {
  const { body, doc } = await open(bytes);
  return describe(body, doc, id);
}

/** Reflow editable content using the selected template's native styles, frames, tables and sections. */
export async function renderDocumentTemplate(bytes: Uint8Array, id: unknown, input: DraftNode) {
  const rich = validateDocument(input);
  const { zip, doc, body } = await open(bytes);
  const info = describe(body, doc, id);
  const original = children(body),
    paragraphs = original.filter(n => n.localName === 'p');
  const firstText = paragraphs.find(n => text(n));
  const prototypes = new Map<string, Element>();
  for (const p of paragraphs) {
    const key = role(text(p), p === firstText && info.documentTool !== 'letter');
    if (!prototypes.has(key)) prototypes.set(key, p);
  }
  if (info.documentTool === 'letter') {
    const reference = paragraphs.indexOf(firstText!);
    const subject = paragraphs.findIndex(p => role(text(p)) === 'subject');
    if (subject > reference + 1) {
      prototypes.set('sender', paragraphs[reference + 1]);
      prototypes.set('date', paragraphs[subject - 1]);
    }
    const closing = paragraphs.find(p => text(p) === 'ขอแสดงความนับถือ');
    if (closing) prototypes.set('closing', closing);
  }
  const namedSignature = paragraphs.find(p => /^\(/.test(text(p)));
  if (namedSignature) prototypes.set('signature', namedSignature);
  const recipientAt = paragraphs.findIndex(p => role(text(p)) === 'recipient');
  const headingAt = paragraphs.findIndex(p => role(text(p)) === 'heading');
  const narrative =
    recipientAt >= 0 ? paragraphs.slice(recipientAt + 1).find(p => /^(?:ด้วย|ตามที่|ข้าพเจ้า|เนื่อง)/.test(text(p))) : undefined;
  const bodyPrototype =
    narrative ||
    paragraphs.slice(Math.max(0, headingAt + 1)).find(p => !text(p) && !elements(p, 'sectPr').length) ||
    paragraphs.find(p => !text(p) && !elements(p, 'sectPr').length) ||
    prototypes.get('body') ||
    firstText!;
  const nativeTables = original.filter(n => n.localName === 'tbl');
  const draftTables = (rich.content || []).filter(n => n.type === 'table');
  if (
    draftTables.some((table, i) =>
      table.content?.[0]?.content?.some((cell, c) => info.headers[i]?.[c] && columnMeaning(documentText(cell)) !== info.headers[i][c]),
    )
  )
    fail('DOCUMENT_TEMPLATE_TABLE_MISMATCH');
  if (
    draftTables.length !== nativeTables.length ||
    draftTables.some((table, i) => table.content?.some(row => row.content?.length !== info.tables[i]))
  )
    fail('DOCUMENT_TEMPLATE_TABLE_MISMATCH');
  const create = (tag: string) => doc.createElementNS(W, 'w:' + tag);
  const properties = (source: Element, tag: string) =>
    children(source)
      .find(n => n.localName === tag)
      ?.cloneNode(true) as Element | undefined;
  const blank = (source: Element) => {
    const p = create('p'),
      props = properties(source, 'pPr');
    if (props) {
      for (const section of elements(props, 'sectPr')) section.parentNode!.removeChild(section);
      p.appendChild(props);
    }
    return p;
  };
  const inline = (p: Element, nodes: DraftNode[], source: Element, fieldValue = false) => {
    for (const node of nodes) {
      const run = create('r'),
        textRun = children(source).find(n => n.localName === 'r' && text(n));
      const props =
        !fieldValue && textRun
          ? properties(textRun, 'rPr')
          : properties(children(source).find(n => n.localName === 'pPr') || source, 'rPr');
      if (props) run.appendChild(props);
      for (const mark of node.marks || []) {
        const style = create(mark.type === 'bold' ? 'b' : 'i');
        run.firstChild ? run.firstChild.appendChild(style) : run.appendChild(create('rPr')).appendChild(style);
      }
      if (node.type === 'hardBreak') run.appendChild(create('br'));
      else {
        const t = create('t');
        t.setAttribute('xml:space', 'preserve');
        t.appendChild(doc.createTextNode(node.text || ''));
        run.appendChild(t);
      }
      p.appendChild(run);
    }
  };
  const field = (p: Element, value: string, source: Element) => {
    const parts = /^(ส่วนงาน|ส่วนราชการ|ที่|วันที่|เรื่อง|เรียน|อ้างถึง|สิ่งที่ส่งมาด้วย)(\s+)([\s\S]*)$/.exec(value);
    if (!parts) return inline(p, [{ type: 'text', text: value }], source);
    inline(p, [{ type: 'text', text: parts[1] + parts[2] }], source);
    inline(p, [{ type: 'text', text: parts[3] }], source, true);
  };
  const newParagraph = (node: DraftNode, source: Element) => {
    const p = blank(source);
    inline(p, node.content || [], source);
    return p;
  };
  const out: Element[] = [];
  const roles = documentLayoutRoles(rich, info.documentTool);
  let tableIndex = 0;
  const frameTaken = new Set<Element>();
  let signatureSpace = false;
  const appendFrames = (target: Element, source: Element) => {
    for (const run of children(source).filter(n => n.localName === 'r' && (elements(n, 'drawing').length || elements(n, 'pict').length))) {
      const frame = run.cloneNode(true) as Element;
      for (const token of Array.from(frame.getElementsByTagNameNS('*', 't'))) token.textContent = '';
      target.appendChild(frame);
    }
  };
  const appendPrefix = (target: Element, source: Element) => {
    let prefix = '';
    for (const run of children(source).filter(n => n.localName === 'r')) {
      for (const token of children(run)) {
        if (token.localName === 'tab') {
          inline(target, [{ type: 'text', text: prefix }], source);
          prefix = '';
          const r = create('r');
          r.appendChild(create('tab'));
          target.appendChild(r);
        } else if (token.localName === 't') {
          const value = token.textContent || '',
            spaces = /^\s*/.exec(value)![0];
          prefix += spaces;
          if (value.trim()) {
            if (prefix) inline(target, [{ type: 'text', text: prefix }], source);
            return;
          }
        }
      }
    }
  };
  // Empty letterhead spacers/drawings remain before content; no old text is copied.
  for (const p of paragraphs) {
    if (p === firstText) break;
    const frame = blank(p);
    appendFrames(frame, p);
    out.push(frame);
    frameTaken.add(p);
  }
  const renderTable = (node: DraftNode, source: Element) => {
    const tbl = create('tbl');
    for (const tag of ['tblPr', 'tblGrid']) {
      const property = properties(source, tag);
      if (property) tbl.appendChild(property);
    }
    const rows = children(source).filter(n => n.localName === 'tr');
    const width = info.tables[tableIndex];
    const detail = rows.slice(1).find(row => children(row).filter(n => n.localName === 'tc').length === width) || rows[0];
    for (const [index, row] of (node.content || []).entries()) {
      const values = row.content || [];
      const total = index > 0 && /^รวม/.test(documentText(values[0])) && values.slice(1, -1).every(cell => !documentText(cell).trim());
      const last = rows.at(-1)!;
      const mergedTotal = total && children(last).filter(n => n.localName === 'tc').length === 2 && width > 2;
      const proto = index === 0 ? rows[0] : mergedTotal ? last : detail,
        tr = create('tr'),
        props = properties(proto, 'trPr');
      if (props) tr.appendChild(props);
      const cells = children(proto).filter(n => n.localName === 'tc');
      const editable = mergedTotal ? [values[0], values.at(-1)!] : values;
      if (cells.length !== editable.length) fail('DOCUMENT_TEMPLATE_UNSUPPORTED');
      for (const [col, cell] of editable.entries()) {
        const tc = create('tc'),
          cp = properties(cells[col], 'tcPr');
        if (cp) tc.appendChild(cp);
        const p = elements(cells[col], 'p')[0] || bodyPrototype;
        for (const paragraph of cell.content || []) tc.appendChild(newParagraph(paragraph, p));
        if (!tc.getElementsByTagNameNS(W, 'p').length) tc.appendChild(blank(p));
        tr.appendChild(tc);
      }
      tbl.appendChild(tr);
      if (index === 0) {
        // Merged category bands are structural. Copy their properties, never filled sample text.
        for (const band of rows.slice(1, rows.indexOf(detail))) {
          const bandRow = create('tr'),
            propertiesRow = properties(band, 'trPr');
          if (propertiesRow) bandRow.appendChild(propertiesRow);
          for (const cell of children(band).filter(n => n.localName === 'tc')) {
            const tc = create('tc'),
              cp = properties(cell, 'tcPr');
            if (cp) tc.appendChild(cp);
            const title = /^(?:รายรับ|รายจ่าย)$/.test(text(cell)) ? text(cell) : '';
            tc.appendChild(
              newParagraph({ type: 'paragraph', content: [{ type: 'text', text: title }] }, elements(cell, 'p')[0] || bodyPrototype),
            );
            bandRow.appendChild(tc);
          }
          tbl.appendChild(bandRow);
        }
      }
    }
    return tbl;
  };
  const flattenList = (node: DraftNode, indent = '') => {
    for (const [index, item] of (node.content || []).entries())
      for (const child of item.content || []) {
        if (child.type === 'paragraph')
          out.push(
            newParagraph(
              {
                ...child,
                content: [
                  { type: 'text', text: indent + (node.type === 'orderedList' ? (node.attrs?.start || 1) + index + '. ' : '• ') },
                  ...(child.content || []),
                ],
              },
              bodyPrototype,
            ),
          );
        else flattenList(child, indent + '  ');
      }
  };
  for (const [index, node] of (rich.content || []).entries()) {
    if (node.type === 'table') {
      out.push(renderTable(node, nativeTables[tableIndex]));
      tableIndex++;
      continue;
    }
    if (['orderedList', 'bulletList'].includes(node.type)) {
      flattenList(node);
      continue;
    }
    const value = documentText(node).trim();
    const key =
      node.type === 'heading' && index === 0
        ? 'title'
        : value === 'ขอแสดงความนับถือ'
          ? 'closing'
          : roles[index] === 'signature'
            ? 'signature'
            : roles[index] === 'sender'
              ? 'sender'
              : roles[index] === 'date'
                ? 'date'
                : role(value);
    const matchingHeading = key === 'heading' ? paragraphs.find(p => label(text(p)) === label(value)) : undefined;
    const source = matchingHeading || (key === 'body' ? bodyPrototype : prototypes.get(key)) || bodyPrototype;
    if (key === 'signature' && !signatureSpace && namedSignature) {
      const spaces: Element[] = [];
      for (
        let before = paragraphs.indexOf(namedSignature) - 1;
        before >= 0 && !text(paragraphs[before]) && !elements(paragraphs[before], 'sectPr').length;
        before--
      )
        spaces.unshift(blank(paragraphs[before]));
      out.push(...spaces);
      signatureSpace = true;
    }
    const p = blank(source);
    if (!frameTaken.has(source) && ['title', 'unit', 'reference', 'date', 'subject', 'recipient', 'sender'].includes(key)) {
      appendFrames(p, source);
      frameTaken.add(source);
    }
    appendPrefix(p, source);
    if (info.documentTool === 'memo' && key === 'reference' && /\sวันที่\s/.test(value)) {
      const match = /^(.*?)\s+(วันที่\s[\s\S]*)$/.exec(value)!;
      field(p, match[1], source);
      const run = create('r');
      run.appendChild(create('tab'));
      p.appendChild(run);
      field(p, match[2], source);
    } else if (['unit', 'reference', 'date', 'subject', 'recipient', 'references', 'attachments'].includes(key)) field(p, value, source);
    else inline(p, node.content || [], source);
    out.push(p);
  }
  // Keep each intermediate section before the corresponding next table/agenda, plus the final section.
  for (const [i, p] of original.entries()) {
    if (p.localName !== 'p') continue;
    const section = elements(p, 'sectPr')[0];
    if (!section) continue;
    const nextHeading = original.slice(i + 1).find(n => n.localName === 'p' && role(text(n)) === 'heading');
    const nextTable = original.slice(i + 1).find(n => n.localName === 'tbl');
    const matching = nextHeading && out.find(n => n.localName === 'p' && label(text(n)) === label(text(nextHeading)));
    let at = matching
      ? out.indexOf(matching)
      : nextTable
        ? out.indexOf(out.filter(n => n.localName === 'tbl')[nativeTables.indexOf(nextTable)])
        : out.length;
    if (at < 0) fail('DOCUMENT_TEMPLATE_UNSUPPORTED');
    if (!matching && nextTable) {
      while (at > 0 && role(text(out[at - 1])) === 'heading') at--;
    }
    const boundary = create('p'),
      props = create('pPr');
    props.appendChild(section.cloneNode(true));
    boundary.appendChild(props);
    out.splice(at, 0, boundary);
  }
  const finalSection = original.find(n => n.localName === 'sectPr');
  if (!finalSection) fail('DOCUMENT_TEMPLATE_UNSUPPORTED');
  while (body.firstChild) body.removeChild(body.firstChild);
  for (const node of out) body.appendChild(node);
  body.appendChild(finalSection.cloneNode(true));
  zip.file('word/document.xml', SERIALIZER.serializeToString(doc));
  // Example signatures/photos in old body paragraphs are not task facts. Remove unused image bytes as well.
  const media = new Set<string>();
  for (const entry of Object.values(zip.files).filter(e => e.name.endsWith('.rels'))) {
    const owner = posix.join(posix.dirname(posix.dirname(entry.name)), posix.basename(entry.name).replace(/\.rels$/, ''));
    const part = zip.file(owner),
      ids = new Set<string>();
    if (part) {
      const xml = parse(await part.async('string'));
      for (const element of Array.from(xml.getElementsByTagName('*')))
        for (const attribute of Array.from(element.attributes)) {
          if (attribute.namespaceURI === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships') ids.add(attribute.value);
        }
    }
    const rels = parse(await entry.async('string'));
    let changed = false;
    for (const rel of Array.from(rels.getElementsByTagNameNS('*', 'Relationship'))) {
      if (!(rel.getAttribute('Type') || '').endsWith('/image')) continue;
      if (!ids.has(rel.getAttribute('Id') || '')) {
        rel.parentNode!.removeChild(rel);
        changed = true;
        continue;
      }
      const target = rel.getAttribute('Target') || '';
      media.add(target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join(posix.dirname(owner), target)));
    }
    if (changed) zip.file(entry.name, SERIALIZER.serializeToString(rels));
  }
  for (const entry of Object.values(zip.files))
    if (entry.name.startsWith('word/media/') && !entry.dir && !media.has(entry.name)) zip.remove(entry.name);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
