import { writeFile } from 'node:fs/promises';
import {
  Document,
  HeadingLevel,
  Footer,
  Header,
  ImageRun,
  PageNumber,
  NumberFormat,
  Packer,
  Paragraph,
  AlignmentType,
  LineRuleType,
  ShadingType,
  Table,
  TableLayoutType,
  TableCell,
  TableRow,
  TextRun,
  Tab,
  TabStopType,
  WidthType,
  type ParagraphChild,
} from 'docx';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { type DraftNode, documentMarkdown, documentText, plainDocument, validateDocument } from '../src/draft';
import { documentLayoutRoles, resolveDocumentLayout, type DocumentLayout, type LayoutRole } from '../src/document-layout';
import { GARUDA_DATA_URI, GARUDA_PNG } from './garuda-image';
import { renderDocumentTemplate } from './document-template';

export const exportFormats = ['md', 'docx', 'pdf', 'xlsx', 'pptx'] as const;

// Generic exports keep their existing font. Skill-backed DOCX uses a working document layout and an explicit face.
export const OFFICIAL_FONT = 'TH Sarabun New';
const SCREEN_FONT = 'Leelawadee UI';
const CM = 567; // twips per centimetre
/** printToPDF margins in inches, matching the Word page. */
export const PDF_MARGINS = { top: 2.5 / 2.54, bottom: 2 / 2.54, left: 3 / 2.54, right: 2 / 2.54 };

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** A cell's or block's text on one line, for spreadsheets and slides. */
const flat = (node: DraftNode) => documentText(node).replace(/\s*\n\s*/g, ' ');
const tableRows = (table: DraftNode) => (table.content || []).map(row => (row.content || []).map(flat));
const AMOUNT = /^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?$/;
/** Columns whose body cells are all amounts (at least one), right-aligned as figures are in Thai official tables. */
const numericColumns = (rows: string[][]) =>
  Array.from({ length: Math.max(0, ...rows.map(row => row.length)) }, (_, column) => {
    const body = rows
      .slice(1)
      .map(row => (row[column] || '').trim())
      .filter(Boolean);
    return body.length > 0 && body.every(text => AMOUNT.test(text));
  });

const TEXT_WIDTH = 11906 - 3 * CM - 2 * CM; // A4 width less the official margins, in twips
// Thai vowel and tone marks take no width of their own.
const visible = (text = '') => text.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '').length;

/**
 * Font size and column widths (twips) of a table, for Word and PDF alike. Each column first gets room for its longest
 * header word and its figures, which must not wrap; the rest of the line goes to columns with longer text. A table
 * whose header words do not fit at 16 pt drops to 14 or 12 pt, as Thai official documents do with wide tables.
 */
export function tableLayout(rows: string[][]) {
  const count = Math.max(1, ...rows.map(row => row.length));
  const numeric = numericColumns(rows);
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const sized = (points: number) => {
    const span = (chars: number) => (chars + 1) * points * 20 * 0.55 + 220;
    const minimum = Array.from({ length: count }, (_, column) => {
      const header = (rows[0]?.[column] || '').split(/\s+/).map(visible);
      const figures = numeric[column] ? rows.slice(1).map(row => visible(row[column])) : [];
      return span(Math.max(2, ...header, ...figures));
    });
    const desired = minimum.map((least, column) => Math.max(least, span(Math.min(Math.max(...rows.map(row => visible(row[column]))), 40))));
    return { points, minimum, desired };
  };
  const { points, minimum, desired } = [16, 14].map(sized).find(size => sum(size.minimum) <= TEXT_WIDTH) || sized(12);
  let widths: number[];
  if (sum(desired) <= TEXT_WIDTH) widths = desired.map(width => (width * TEXT_WIDTH) / sum(desired));
  else if (sum(minimum) <= TEXT_WIDTH) {
    const spare = TEXT_WIDTH - sum(minimum),
      wanted = sum(desired) - sum(minimum);
    widths = minimum.map((least, column) => least + (spare * (desired[column] - least)) / wanted);
  } else widths = minimum.map(width => (width * TEXT_WIDTH) / sum(minimum));
  return { points, columns: widths.map(Math.floor) };
}

function richHtml(node: DraftNode): string {
  if (node.type === 'text') {
    let text = escapeHtml(node.text || '');
    for (const mark of node.marks || []) text = mark.type === 'bold' ? `<strong>${text}</strong>` : `<em>${text}</em>`;
    return text;
  }
  if (node.type === 'hardBreak') return '<br>';
  const text = (node.content || []).map(richHtml).join('');
  if (node.type === 'table') {
    const text = tableRows(node);
    const numeric = numericColumns(text);
    const { points, columns } = tableLayout(text);
    const total = columns.reduce((sum, width) => sum + width, 0);
    const rows = (node.content || []).map(
      row =>
        `<tr>${(row.content || [])
          .map((cell, column) => {
            const tag = cell.type === 'tableHeader' ? 'th' : 'td';
            return `<${tag}${numeric[column] ? ' class="num"' : ''}>${(cell.content || []).map(richHtml).join('')}</${tag}>`;
          })
          .join('')}</tr>`,
    );
    const colgroup = columns.map(width => `<col style="width:${((width * 100) / total).toFixed(2)}%">`).join('');
    return `<table style="font-size:${points}pt"><colgroup>${colgroup}</colgroup><thead>${rows[0] || ''}</thead><tbody>${rows.slice(1).join('')}</tbody></table>`;
  }
  const tag = (
    {
      paragraph: 'p',
      bulletList: 'ul',
      orderedList: 'ol',
      listItem: 'li',
      tableRow: 'tr',
      heading: `h${node.attrs?.level || 1}`,
    } as Record<string, string>
  )[node.type];
  return tag ? `<${tag}${node.type === 'orderedList' ? ` start="${node.attrs?.start || 1}"` : ''}>${text}</${tag}>` : text;
}

function memoReferenceHtml(node: DraftNode) {
  const date = /[ \t]+(วันที่[ \t])/.exec(documentText(node));
  if (!date) return richHtml(node);
  const labelStart = date.index + date[0].length - date[1].length;
  const number: DraftNode[] = [],
    value: DraftNode[] = [];
  let offset = 0;
  for (const child of node.content || []) {
    const text = documentText(child);
    if (child.type === 'hardBreak') {
      if (offset < date.index) number.push(child);
      if (offset >= labelStart) value.push(child);
    } else {
      const before = text.slice(0, Math.max(0, date.index - offset));
      const after = text.slice(Math.max(0, labelStart - offset));
      if (before) number.push({ ...child, text: before });
      if (after) value.push({ ...child, text: after });
    }
    offset += text.length;
  }
  return `<p class="memo-reference-row"><span class="memo-number">${number.map(richHtml).join('')}</span><span class="memo-date">${value.map(richHtml).join('')}</span></p>`;
}

export function pdfHtml(document: DraftNode, layout = resolveDocumentLayout()) {
  // TH Sarabun New when installed (the family brings its real bold); otherwise a common Thai font scaled down to the
  // same visual size, since TH Sarabun is drawn much smaller than other fonts at the same point size.
  const face = (weight: number, names: string[]) =>
    `@font-face{font-family:"STeP Fallback";font-weight:${weight};size-adjust:72%;src:${names.map(name => `local("${name}")`).join(',')}}`;
  const style = [
    face(400, [
      'Sarabun Regular',
      'Sarabun-Regular',
      'Leelawadee UI',
      'LeelawadeeUI',
      'Thonburi',
      'Noto Sans Thai',
      'NotoSansThai-Regular',
    ]),
    face(700, [
      'Sarabun Bold',
      'Sarabun-Bold',
      'Leelawadee UI Bold',
      'LeelawadeeUI-Bold',
      'Thonburi Bold',
      'Thonburi-Bold',
      'Noto Sans Thai Bold',
      'NotoSansThai-Bold',
    ]),
    `body{font-family:"${layout.font}","STeP Fallback",sans-serif;font-size:16pt;line-height:1.35;overflow-wrap:anywhere;margin:0}`,
    'p{white-space:pre-wrap;margin:0 0 6pt}h1{font-size:20pt}h2{font-size:18pt}h3{font-size:16pt}',
    'h1,h2,h3{margin:12pt 0 6pt;break-after:avoid}ul,ol{margin:0 0 6pt;padding-left:1.5em}',
    'table{border-collapse:collapse;width:100%;table-layout:fixed;margin:6pt 0 10pt}tr{break-inside:avoid}thead{display:table-header-group}',
    'th,td{border:0.75pt solid #444;padding:2pt 5pt;vertical-align:top;text-align:left}th{background:#eee;font-weight:bold}',
    'th p,td p{margin:0}th.num,td.num{text-align:right}',
    ...(layout.id
      ? [
          '@page{size:A4;margin:2.5cm 2cm 2cm 3cm}body{line-height:1.15}.block p{margin:0}h1,h2,h3{font-size:16pt;margin:6pt 0 3pt}.block:has(h1,h2,h3){break-after:avoid}',
          '.block.sender,.block.date,.block.front,.block.signature{break-after:avoid}',
          '.memo-reference-row{display:grid;grid-template-columns:1fr 1fr;break-inside:avoid}',
          `.block.title :is(h1,h2,h3){font-size:${layout.id === 'memo' ? 30 : 18}pt}`,
        ]
      : []),
    ...(layout.garudaHeightCm
      ? [
          '@page:first{margin-top:1.5cm}',
          '.letterhead{break-inside:avoid;margin-bottom:.5cm}.letterhead.letter{text-align:center;margin-left:-1cm}',
          '.letterhead.memo{position:relative;min-height:1.5cm;display:flex;align-items:flex-end;justify-content:center}',
          '.letterhead.memo img{position:absolute;left:0;bottom:0}.letterhead.memo :is(h1,h2,h3){font-size:30pt;margin:0 2cm;line-height:1.1}',
        ]
      : []),
  ].join('');
  const blocks = document.content || [];
  const title = layout.id === 'memo' && layout.garudaHeightCm && blocks[0]?.type === 'heading' ? blocks[0] : undefined;
  const roles = documentLayoutRoles(document, layout.id);
  const content = layout.id
    ? blocks
        .map((node, index) => {
          if (node === title) return '';
          const role = roles[index];
          const css = ['title', 'front', 'signature', 'date'].includes(role) ? 'text-align:center;' : '';
          const indent = ['sender', 'signature'].includes(role)
            ? 'margin-left:8cm;'
            : role === 'body' && node.type === 'paragraph'
              ? 'text-indent:2.5cm;text-align:justify;'
              : '';
          return `<div class="block ${role}" style="${css}${indent}">${role === 'memo-reference' ? memoReferenceHtml(node) : richHtml(node)}</div>`;
        })
        .join('')
    : richHtml(document);
  const letterhead = layout.garudaHeightCm
    ? `<div class="letterhead ${layout.id}"><img alt="ตราครุฑ" src="${GARUDA_DATA_URI}" style="height:${layout.garudaHeightCm}cm;width:${layout.garudaHeightCm}cm">${title ? richHtml(title) : ''}</div>`
    : '';
  return `<!doctype html><html lang="th"><meta charset="utf-8"><style>${style}</style><body>${letterhead}${content}</body></html>`;
}

function runs(node: DraftNode, size: number, bold = false, font = OFFICIAL_FONT, dateTab = false): ParagraphChild[] {
  // Locate the label across rich-text runs, rather than matching a word inside its placeholder/value.
  const date = dateTab ? /[ \t]+(วันที่[ \t])/.exec(documentText(node).split(/\r\n?|\n/)[0]) : null;
  const spaceStart = date?.index ?? -1;
  const labelStart = date ? date.index + date[0].length - date[1].length : -1;
  let offset = 0;
  return (node.content || []).flatMap(child => {
    if (child.type === 'hardBreak') {
      offset++;
      return [new TextRun({ break: 1 })];
    }
    const style = {
      font,
      size,
      bold: bold || child.marks?.some(m => m.type === 'bold'),
      sizeComplexScript: size,
      boldComplexScript: bold || child.marks?.some(m => m.type === 'bold'),
      italics: child.marks?.some(m => m.type === 'italic'),
    };
    const text = child.text || '';
    const textRuns = (value: string): ParagraphChild[] =>
      value
        .split(/(\t|\r\n?|\n)/)
        .filter(Boolean)
        .map(
          part =>
            new TextRun({
              ...style,
              ...(part === '\t' ? { children: [new Tab()] } : /^[\r\n]/.test(part) ? { break: 1 } : { text: part }),
            }),
        );
    const start = offset;
    offset += text.length;
    // Layout only: retain all field characters, including unknown dates and leading zeroes.
    return date && start < labelStart && offset > spaceStart
      ? [
          ...textRuns(text.slice(0, Math.max(0, spaceStart - start))),
          ...(start <= spaceStart ? [new TextRun({ ...style, children: [new Tab()] })] : []),
          ...textRuns(text.slice(Math.max(0, labelStart - start))),
        ]
      : textRuns(text);
  });
}

function docxTable(table: DraftNode, font: string) {
  const rows = table.content || [];
  const text = tableRows(table);
  const width = Math.max(1, ...rows.map(row => (row.content || []).length));
  const numeric = numericColumns(text);
  const { points, columns } = tableLayout(text);
  const size = points * 2;
  return new Table({
    width: { size: TEXT_WIDTH, type: WidthType.DXA },
    columnWidths: columns,
    layout: TableLayoutType.FIXED,
    rows: rows.map(
      (row, index) =>
        new TableRow({
          tableHeader: index === 0,
          cantSplit: true,
          children: Array.from({ length: width }, (_, column) => {
            const cell = row.content?.[column];
            const header = cell?.type === 'tableHeader';
            return new TableCell({
              width: { size: columns[column], type: WidthType.DXA },
              shading: header ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EEEEEE' } : undefined,
              margins: { left: 100, right: 100 },
              children: (cell?.content?.length ? cell.content : [{ type: 'paragraph' }]).map(
                p =>
                  new Paragraph({
                    alignment: numeric[column] ? AlignmentType.RIGHT : undefined,
                    widowControl: true,
                    children: runs(p, size, header, font),
                  }),
              ),
            });
          }),
        }),
    ),
  });
}

function docxBlocks(
  node: DraftNode,
  layout: DocumentLayout,
  role: LayoutRole = 'body',
  prefix = '',
  depth = 0,
  firstPageSpace = false,
): (Paragraph | Table)[] {
  if (node.type === 'table') return [docxTable(node, layout.font), new Paragraph({ children: [] })];
  if (node.type === 'paragraph' || node.type === 'heading') {
    const level = node.attrs?.level || 1;
    const size = layout.id
      ? role === 'title'
        ? layout.id === 'memo'
          ? 60
          : 36
        : 32
      : node.type === 'heading'
        ? [40, 36, 32][level - 1]
        : 32;
    const band = Math.floor(TEXT_WIDTH / 2);
    const centered = ['title', 'front', 'signature', 'date'].includes(role);
    const body = layout.id && role === 'body' && node.type === 'paragraph' && !depth;
    return [
      new Paragraph({
        heading: node.type === 'heading' ? [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][level - 1] : undefined,
        alignment: centered ? AlignmentType.CENTER : body ? AlignmentType.JUSTIFIED : undefined,
        indent: depth
          ? { left: 360 * depth, hanging: prefix ? 360 : 0 }
          : ['signature', 'sender'].includes(role)
            ? { left: band }
            : body
              ? { firstLine: Math.round(2.5 * CM) }
              : undefined,
        tabStops: role === 'memo-reference' ? [{ type: TabStopType.LEFT, position: band }] : undefined,
        keepNext:
          node.type === 'heading' ||
          ['front', 'sender', 'date', 'memo-reference'].includes(role) ||
          (role === 'signature' && /^(?:\(|ขอแสดงความนับถือ)/.test(documentText(node))),
        keepLines: node.type === 'heading' || role === 'signature',
        widowControl: true,
        ...(node.type === 'paragraph'
          ? { spacing: { before: firstPageSpace ? Math.round(0.5 * CM) : 0, after: body && documentText(node).trim() ? 120 : 0 } }
          : firstPageSpace
            ? { spacing: { before: Math.round(0.5 * CM) } }
            : {}),
        children: [
          ...(prefix ? [new TextRun({ text: prefix, font: layout.font, size })] : []),
          ...runs(node, size, node.type === 'heading', layout.font, role === 'memo-reference'),
        ],
      }),
    ];
  }
  if (node.type === 'bulletList' || node.type === 'orderedList')
    return (node.content || []).flatMap((item, index) =>
      (item.content || []).flatMap((child, childIndex) =>
        docxBlocks(
          child,
          layout,
          'body',
          childIndex === 0 && child.type === 'paragraph'
            ? node.type === 'bulletList'
              ? '• '
              : `${(node.attrs?.start || 1) + index}. `
            : '',
          depth + 1,
        ),
      ),
    );
  return (node.content || []).flatMap(child => docxBlocks(child, layout, 'body', '', depth));
}

function docx(document: DraftNode, layout: DocumentLayout) {
  const heading = (size: number) => ({
    run: { font: layout.font, size, bold: true, color: '000000' },
    paragraph: { spacing: { before: 120, after: 60 }, keepNext: true, keepLines: true },
  });
  const roles = documentLayoutRoles(document, layout.id);
  const blocks = document.content || [];
  const title = layout.id === 'memo' && layout.garudaHeightCm && blocks[0]?.type === 'heading' ? blocks[0] : undefined;
  const footer = () =>
    new Footer({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ font: layout.font, size: 28, children: ['หน้า ', PageNumber.CURRENT] })],
        }),
      ],
    });
  const header = layout.garudaHeightCm
    ? new Header({
        children: [
          new Paragraph({
            alignment: layout.id === 'memo' ? AlignmentType.LEFT : AlignmentType.CENTER,
            indent: { left: layout.id === 'letter' ? -CM : 0, firstLine: 0 },
            spacing: { before: 0, after: 0 },
            tabStops: layout.id === 'memo' ? [{ type: TabStopType.CENTER, position: 8 * CM }] : undefined,
            children: [
              new ImageRun({
                type: 'png',
                data: GARUDA_PNG,
                transformation: { width: (layout.garudaHeightCm * 96) / 2.54, height: (layout.garudaHeightCm * 96) / 2.54 },
                altText: { name: 'Garuda', title: 'ตราครุฑ', description: `สูง ${layout.garudaHeightCm} ซม.` },
              }),
              ...(title ? [new TextRun({ children: [new Tab()] }), ...runs(title, 60, true, layout.font)] : []),
            ],
          }),
        ],
      })
    : undefined;
  return new Document({
    compatibility: { doNotExpandShiftReturn: true },
    styles: {
      default: {
        document: {
          run: { font: layout.font, size: 32 },
          paragraph: { spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO } },
        },
        heading1: heading(layout.id ? 32 : 40),
        heading2: heading(layout.id ? 32 : 36),
        heading3: heading(32),
      },
    },
    sections: [
      {
        properties: {
          ...(header ? { titlePage: true } : {}),
          page: {
            size: { width: 11906, height: 16838 },
            margin: {
              top: Math.round(2.5 * CM),
              bottom: 2 * CM,
              left: 3 * CM,
              right: 2 * CM,
              ...(header ? { header: Math.round(1.5 * CM) } : {}),
            },
            ...(layout.id ? { pageNumbers: { formatType: NumberFormat.THAI_NUMBERS } } : {}),
          },
        },
        ...(header ? { headers: { first: header } } : {}),
        ...(layout.id
          ? {
              footers: {
                default: footer(),
                ...(header ? { first: footer() } : {}),
              },
            }
          : {}),
        children: blocks.flatMap((node, index) =>
          node === title ? [] : docxBlocks(node, layout, roles[index], '', 0, Boolean(header && index === (title ? 1 : 0))),
        ),
      },
    ],
  });
}

/** Text lines of everything but tables, with list markers; tables are returned separately. */
function outline(document: DraftNode) {
  const lines: { text: string; kind: 'heading' | 'paragraph' | 'item'; depth: number }[] = [];
  const tables: DraftNode[] = [];
  const order: ({ table: number } | { line: number })[] = [];
  const walk = (node: DraftNode, depth: number, prefix = '') => {
    if (node.type === 'table') {
      order.push({ table: tables.length });
      tables.push(node);
    } else if (node.type === 'paragraph' || node.type === 'heading') {
      order.push({ line: lines.length });
      lines.push({ text: prefix + documentText(node), kind: node.type === 'heading' ? 'heading' : prefix ? 'item' : 'paragraph', depth });
    } else if (node.type === 'bulletList' || node.type === 'orderedList')
      (node.content || []).forEach((item, index) =>
        (item.content || []).forEach((child, childIndex) =>
          walk(
            child,
            depth + 1,
            childIndex === 0 && child.type === 'paragraph'
              ? node.type === 'bulletList'
                ? '• '
                : `${(node.attrs?.start || 1) + index}. `
              : '',
          ),
        ),
      );
    else (node.content || []).forEach(child => walk(child, depth));
  };
  walk(document, 0);
  return { lines, tables, order };
}

// A cell that is plainly a number becomes one, so sums and sorting work; codes with a leading zero stay text.
const NUMBER = /^-?(?:\d{1,3}(?:,\d{3})+|0|[1-9]\d{0,14})(?:\.(\d{1,6}))?$/;
const PERCENT = /^-?(?:0|[1-9]\d{0,5})(?:\.(\d{1,4}))?%$/;
const cellValue = (text: string) =>
  NUMBER.test(text) ? Number(text.replace(/,/g, '')) : PERCENT.test(text) ? Number(text.slice(0, -1)) / 100 : text;
/** The number format that shows a figure as it was written: thousands separators, decimal places and percent. */
const numberFormat = (text: string) => {
  const percent = PERCENT.exec(text);
  const decimals = (percent || NUMBER.exec(text))?.[1]?.length || 0;
  const places = decimals ? '.' + '0'.repeat(decimals) : '';
  return percent ? '0' + places + '%' : (text.includes(',') ? '#,##0' : '0') + places;
};

async function xlsx(path: string, document: DraftNode) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'STeP';
  const { lines, tables } = outline(document);
  const font = { name: SCREEN_FONT, size: 12 };
  const border = { style: 'thin' as const, color: { argb: 'FF999999' } };
  // Tables first, one per sheet with a header row, filter and frozen header: ready to open in Google Sheets.
  tables.forEach((table, index) => {
    const rows = tableRows(table);
    const sheet = workbook.addWorksheet(`ตาราง ${index + 1}`, { views: [{ state: 'frozen', ySplit: 1 }] });
    rows.forEach((cells, rowIndex) => {
      const row = sheet.addRow(rowIndex === 0 ? cells : cells.map(cellValue));
      row.eachCell({ includeEmpty: true }, cell => {
        cell.font = rowIndex === 0 ? { ...font, bold: true } : font;
        cell.border = { top: border, bottom: border, left: border, right: border };
        cell.alignment = { wrapText: true, vertical: 'top' };
        if (rowIndex === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
        if (typeof cell.value === 'number') cell.numFmt = numberFormat(cells[Number(cell.col) - 1]);
      });
    });
    const width = Math.max(1, ...rows.map(row => row.length));
    for (let column = 1; column <= width; column++) {
      const longest = Math.max(...rows.map(row => (row[column - 1] || '').length));
      sheet.getColumn(column).width = Math.min(Math.max(longest + 4, 10), 60);
    }
    if (rows.length > 1) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: width } };
  });
  // The rest of the draft as clean text, one line per row; a tab still splits a line into columns.
  if (lines.some(line => line.text.trim()) || !tables.length) {
    const sheet = workbook.addWorksheet(tables.length ? 'ข้อความ' : 'เอกสาร');
    let columns = 1;
    for (const line of lines) {
      const values = line.text.split('\t');
      columns = Math.max(columns, values.length);
      const row = sheet.addRow(values);
      row.eachCell(cell => {
        cell.font = line.kind === 'heading' ? { ...font, size: 14, bold: true } : font;
        cell.alignment = { wrapText: true, vertical: 'top', indent: line.kind === 'item' ? Math.min(line.depth, 4) : 0 };
      });
    }
    sheet.getColumn(1).width = columns > 1 ? 40 : 100;
    for (let column = 2; column <= columns; column++) sheet.getColumn(column).width = 20;
  }
  await workbook.xlsx.writeFile(path);
}

async function pptx(path: string, document: DraftNode) {
  const deck = new PptxGenJS();
  deck.layout = 'LAYOUT_WIDE';
  deck.author = 'STeP';
  deck.subject = 'Draft';
  const { lines, tables, order } = outline(document);
  let page = 0;
  const slide = () => {
    const next = deck.addSlide();
    next.addText(`STeP · ${++page}`, { x: 0.6, y: 0.3, w: 12, h: 0.4, fontSize: 16, color: '275D55' });
    return next;
  };
  let text = '';
  // Deliberate text pagination; never silently crop long drafts.
  const flush = () => {
    if (!text.trim()) return void (text = '');
    for (const chunk of text.match(/[\s\S]{1,600}(?:\n|$)|[\s\S]{1,600}/g) || [])
      slide().addText(chunk, {
        x: 0.6,
        y: 1,
        w: 12,
        h: 5.8,
        fontFace: SCREEN_FONT,
        fontSize: 19,
        breakLine: false,
        valign: 'top',
        fit: 'shrink',
      });
    text = '';
  };
  // A heading right before a table titles the table's slide instead of sitting alone on a slide of its own.
  let heading: { text: string; at: number } | undefined;
  for (const entry of order) {
    if ('line' in entry) {
      const line = lines[entry.line];
      heading = line.kind === 'heading' ? { text: line.text, at: text.length } : undefined;
      text += '  '.repeat(Math.max(line.depth - 1, 0)) + line.text + '\n';
      continue;
    }
    const title = heading?.text;
    if (heading) text = text.slice(0, heading.at);
    heading = undefined;
    flush();
    const rows = tableRows(tables[entry.table]);
    const width = Math.max(1, ...rows.map(row => row.length));
    const numeric = numericColumns(rows);
    const { columns } = tableLayout(rows);
    const total = columns.reduce((sum, column) => sum + column, 0);
    const target = slide();
    if (title) target.addText(title, { x: 0.6, y: 0.75, w: 12, h: 0.5, fontFace: SCREEN_FONT, fontSize: 22, bold: true });
    target.addTable(
      rows.map((cells, index) =>
        Array.from({ length: width }, (_, column) => ({
          text: cells[column] || '',
          options: {
            ...(index === 0 ? { bold: true, fill: { color: 'EEEEEE' } } : {}),
            ...(numeric[column] ? { align: 'right' as const } : {}),
          },
        })),
      ),
      {
        x: 0.6,
        y: title ? 1.35 : 1,
        w: 12,
        colW: columns.map(column => (12 * column) / total),
        fontFace: SCREEN_FONT,
        fontSize: 14,
        border: { type: 'solid', pt: 0.75, color: '999999' },
        valign: 'top',
        autoPage: true,
        autoPageRepeatHeader: true,
        autoPageHeaderRows: 1,
      },
    );
  }
  flush();
  if (!page) slide();
  await deck.writeFile({ fileName: path });
}

export async function exportDocument(
  path: string,
  format: string,
  text: string,
  pdf: (html: string) => Promise<Uint8Array>,
  document?: DraftNode,
  options: { documentTool?: unknown; font?: unknown; garuda?: unknown; template?: Uint8Array } = {},
) {
  const rich = document ? validateDocument(document) : undefined;
  if (!exportFormats.includes(format as any)) throw new Error('INVALID_FORMAT');
  if (format === 'md') return writeFile(path, rich ? documentMarkdown(rich) : text, 'utf8');
  // A draft without structure is plain text: one paragraph per line, nothing read as Markdown.
  const content = rich || plainDocument(text);
  if (format === 'docx' && options.template)
    return writeFile(path, await renderDocumentTemplate(options.template, options.documentTool, content));
  if (format === 'docx')
    return writeFile(path, await Packer.toBuffer(docx(content, resolveDocumentLayout(options.documentTool, options.font, options.garuda))));
  if (format === 'pdf')
    return writeFile(path, await pdf(pdfHtml(content, resolveDocumentLayout(options.documentTool, options.font, options.garuda))));
  if (format === 'xlsx') return xlsx(path, content);
  return pptx(path, content);
}
