import { writeFile } from 'node:fs/promises';
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { type DraftNode, documentMarkdown, documentText, plainDocument, validateDocument } from '../src/draft';

export const exportFormats = ['md', 'docx', 'pdf', 'xlsx', 'pptx'] as const;

// Thai official documents (หนังสือราชการ): TH Sarabun New 16 pt on A4, margins left 3 cm, right 2 cm, top 2.5 cm,
// bottom 2 cm. Word and PDF follow it; spreadsheets and slides keep a screen font.
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

function richHtml(node: DraftNode): string {
  if (node.type === 'text') {
    let text = escapeHtml(node.text || '');
    for (const mark of node.marks || []) text = mark.type === 'bold' ? `<strong>${text}</strong>` : `<em>${text}</em>`;
    return text;
  }
  if (node.type === 'hardBreak') return '<br>';
  const text = (node.content || []).map(richHtml).join('');
  if (node.type === 'table') return `<table>${text}</table>`;
  if (node.type === 'tableHeader' || node.type === 'tableCell') {
    const tag = node.type === 'tableHeader' ? 'th' : 'td';
    return `<${tag}>${text}</${tag}>`;
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

export function pdfHtml(document: DraftNode) {
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
    'body{font-family:"TH Sarabun New","TH SarabunPSK","STeP Fallback",sans-serif;font-size:16pt;line-height:1.35;overflow-wrap:anywhere;margin:0}',
    'p{white-space:pre-wrap;margin:0 0 6pt}h1{font-size:20pt}h2{font-size:18pt}h3{font-size:16pt}',
    'h1,h2,h3{margin:12pt 0 6pt;break-after:avoid}ul,ol{margin:0 0 6pt;padding-left:1.5em}',
    'table{border-collapse:collapse;width:100%;margin:6pt 0 10pt}tr{break-inside:avoid}thead{display:table-header-group}',
    'th,td{border:0.75pt solid #444;padding:2pt 5pt;vertical-align:top;text-align:left}th{background:#eee;font-weight:bold}',
    'th p,td p{margin:0}',
  ].join('');
  return `<!doctype html><html lang="th"><meta charset="utf-8"><style>${style}</style><body>${richHtml(document)}</body></html>`;
}

function runs(node: DraftNode, size: number, bold = false): ParagraphChild[] {
  return (node.content || []).map(child =>
    child.type === 'hardBreak'
      ? new TextRun({ break: 1 })
      : new TextRun({
          text: child.text || '',
          font: OFFICIAL_FONT,
          size,
          bold: bold || child.marks?.some(m => m.type === 'bold'),
          italics: child.marks?.some(m => m.type === 'italic'),
        }),
  );
}

function docxTable(table: DraftNode) {
  const rows = table.content || [];
  const width = Math.max(1, ...rows.map(row => (row.content || []).length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (row, index) =>
        new TableRow({
          tableHeader: index === 0,
          cantSplit: true,
          children: Array.from({ length: width }, (_, column) => {
            const cell = row.content?.[column];
            const header = cell?.type === 'tableHeader';
            return new TableCell({
              width: { size: Math.floor(5000 / width), type: WidthType.PERCENTAGE },
              shading: header ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EEEEEE' } : undefined,
              margins: { left: 100, right: 100 },
              children: (cell?.content?.length ? cell.content : [{ type: 'paragraph' }]).map(
                p => new Paragraph({ children: runs(p, 32, header) }),
              ),
            });
          }),
        }),
    ),
  });
}

function docxBlocks(node: DraftNode, prefix = '', depth = 0): (Paragraph | Table)[] {
  if (node.type === 'table') return [docxTable(node), new Paragraph({ children: [] })];
  if (node.type === 'paragraph' || node.type === 'heading') {
    const level = node.attrs?.level || 1;
    const size = node.type === 'heading' ? [40, 36, 32][level - 1] : 32;
    return [
      new Paragraph({
        heading: node.type === 'heading' ? [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][level - 1] : undefined,
        indent: depth ? { left: 360 * depth, hanging: prefix ? 360 : 0 } : undefined,
        children: [
          ...(prefix ? [new TextRun({ text: prefix, font: OFFICIAL_FONT, size })] : []),
          ...runs(node, size, node.type === 'heading'),
        ],
      }),
    ];
  }
  if (node.type === 'bulletList' || node.type === 'orderedList')
    return (node.content || []).flatMap((item, index) =>
      (item.content || []).flatMap((child, childIndex) =>
        docxBlocks(
          child,
          childIndex === 0 && child.type === 'paragraph'
            ? node.type === 'bulletList'
              ? '• '
              : `${(node.attrs?.start || 1) + index}. `
            : '',
          depth + 1,
        ),
      ),
    );
  return (node.content || []).flatMap(child => docxBlocks(child, '', depth));
}

function docx(document: DraftNode) {
  const heading = (size: number) => ({
    run: { font: OFFICIAL_FONT, size, bold: true, color: '000000' },
    paragraph: { spacing: { before: 120, after: 60 } },
  });
  return new Document({
    styles: {
      default: {
        document: { run: { font: OFFICIAL_FONT, size: 32 }, paragraph: { spacing: { after: 0, line: 240 } } },
        heading1: heading(40),
        heading2: heading(36),
        heading3: heading(32),
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: Math.round(2.5 * CM), bottom: 2 * CM, left: 3 * CM, right: 2 * CM },
          },
        },
        children: docxBlocks(document),
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
const NUMBER = /^-?(?:\d{1,3}(?:,\d{3})+|0|[1-9]\d{0,14})(?:\.\d+)?$/;
const cellValue = (text: string) => (NUMBER.test(text) ? Number(text.replace(/,/g, '')) : text);

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
        if (typeof cell.value === 'number' && /,/.test(cells[Number(cell.col) - 1] || '')) cell.numFmt = '#,##0.##';
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
  for (const entry of order) {
    if ('line' in entry) {
      const line = lines[entry.line];
      text += '  '.repeat(Math.max(line.depth - 1, 0)) + line.text + '\n';
      continue;
    }
    flush();
    const rows = tableRows(tables[entry.table]);
    const width = Math.max(1, ...rows.map(row => row.length));
    slide().addTable(
      rows.map((cells, index) =>
        Array.from({ length: width }, (_, column) => ({
          text: cells[column] || '',
          options: index === 0 ? { bold: true, fill: { color: 'EEEEEE' } } : {},
        })),
      ),
      {
        x: 0.6,
        y: 1,
        w: 12,
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
) {
  const rich = document ? validateDocument(document) : undefined;
  if (!exportFormats.includes(format as any)) throw new Error('INVALID_FORMAT');
  if (format === 'md') return writeFile(path, rich ? documentMarkdown(rich) : text, 'utf8');
  // A draft without structure is plain text: one paragraph per line, nothing read as Markdown.
  const content = rich || plainDocument(text);
  if (format === 'docx') return writeFile(path, await Packer.toBuffer(docx(content)));
  if (format === 'pdf') return writeFile(path, await pdf(pdfHtml(content)));
  if (format === 'xlsx') return xlsx(path, content);
  return pptx(path, content);
}
