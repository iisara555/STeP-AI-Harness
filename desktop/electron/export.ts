import { writeFile } from 'node:fs/promises';
import {
  Document,
  HeadingLevel,
  Footer,
  Header,
  ImageRun,
  PageNumber,
  TableOfContents,
  NumberFormat,
  LevelFormat,
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
  type INumberingOptions,
} from 'docx';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { type DraftNode, documentMarkdown, documentText, plainDocument, validateDocument, documentImageIds } from '../src/draft';
import type { DocumentImage } from './document-assets';
import { documentLayoutRoles, resolveDocumentLayout, type DocumentLayout, type LayoutRole } from '../src/document-layout';
import { GARUDA_DATA_URI, GARUDA_PNG } from './garuda-image';
import { renderDocumentTemplate } from './document-template';
import { longestWordUnits, textUnits, THAI_DOCUMENT_CSS, THAI_DOCUMENT_LANGUAGE, withThaiBreaks } from '../src/thai-typography';
import { DOCUMENT_PRESETS, resolvePresentation, type DocumentPresentation } from '../src/document-presentation';
import { embedDocumentFonts } from './document-fonts';

export const exportFormats = ['md', 'docx', 'pdf', 'xlsx', 'pptx'] as const;

// Generic exports keep their existing font. Skill-backed DOCX uses a working document layout and an explicit face.
export const OFFICIAL_FONT = 'TH Sarabun New';
const SCREEN_FONT = 'Leelawadee UI';
const CM = 567; // twips per centimetre
/** printToPDF margins in inches, matching the Word page. */
export const PDF_MARGINS = { top: 2.5 / 2.54, bottom: 2 / 2.54, left: 3 / 2.54, right: 2 / 2.54 };

/** Front matter in a TOR is an agency/data block, not a centered title. */
const centerFrontMatter = (layout: DocumentLayout, role: LayoutRole | 'quote') => role === 'front' && layout.id === 'minutes';

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** A cell's or block's text on one line, for spreadsheets and slides. */
const flat = (node: DraftNode) => documentText(node).replace(/\s*\n\s*/g, ' ');
const tableRows = (table: DraftNode) => (table.content || []).map(row => (row.content || []).map(flat));
const hasPageBreak = (node: DraftNode): boolean => node.type === 'pageBreak' || Boolean(node.content?.some(hasPageBreak));
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
const visible = (text = '') => textUnits(text);

/**
 * Font size and column widths (twips) of a table, for Word and PDF alike. Each column first gets room for its longest
 * header word and its figures, which must not wrap; the rest of the line goes to columns with longer text. A table
 * whose header words do not fit at 16 pt drops to 14 or 12 pt, as Thai official documents do with wide tables.
 */
export function tableLayout(rows: string[][], textWidth = TEXT_WIDTH, bodyPoints = 16) {
  const count = Math.max(1, ...rows.map(row => row.length));
  const numeric = numericColumns(rows);
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const sized = (points: number) => {
    const span = (chars: number) => (chars + 1) * points * 20 * 0.55 + 220;
    const minimum = Array.from({ length: count }, (_, column) => {
      const figures = numeric[column] ? rows.slice(1).map(row => visible(row[column])) : [];
      // Reserve a whole date/reference token before allocating spare width to narrative columns.
      const codes = rows
        .slice(1)
        .flatMap(row => [...(row[column] || '').matchAll(/[A-Za-z0-9๐-๙][A-Za-z0-9๐-๙._:/%+-]*/g)])
        .filter(match => /[0-9๐-๙]/.test(match[0]))
        .map(match => Math.min(32, visible(match[0])));
      return span(Math.max(2, longestWordUnits(rows[0]?.[column] || ''), ...figures, ...codes));
    });
    const desired = minimum.map((least, column) => Math.max(least, span(Math.min(Math.max(...rows.map(row => visible(row[column]))), 40))));
    return { points, minimum, desired };
  };
  const { points, minimum, desired } =
    [bodyPoints, Math.max(12, bodyPoints - 2)].map(sized).find(size => sum(size.minimum) <= textWidth) || sized(12);
  let widths: number[];
  if (sum(desired) <= textWidth) widths = desired.map(width => (width * textWidth) / sum(desired));
  else if (sum(minimum) <= textWidth) {
    const spare = textWidth - sum(minimum),
      wanted = sum(desired) - sum(minimum);
    widths = minimum.map((least, column) => least + (spare * (desired[column] - least)) / wanted);
  } else widths = minimum.map(width => (width * textWidth) / sum(minimum));
  return { points, columns: widths.map(Math.floor) };
}

function richHtml(node: DraftNode, images: ReadonlyMap<string, DocumentImage> = new Map()): string {
  if (node.type === 'pageBreak') return '<div style="break-before:page"></div>';
  if (node.type === 'image') {
    const image = images.get(node.attrs!.assetId!);
    if (!image) throw new Error('DOCUMENT_IMAGE_NOT_FOUND');
    return (
      '<figure><img alt="' +
      escapeHtml(node.attrs?.alt || '') +
      '" src="data:image/png;base64,' +
      image.bytes.toString('base64') +
      '" style="width:' +
      (node.attrs?.widthCm || 12) +
      'cm;max-width:100%;height:auto"></figure>'
    );
  }
  if (node.type === 'caption') return '<p class="caption">' + (node.content || []).map(child => richHtml(child, images)).join('') + '</p>';

  if (node.type === 'text') {
    let text = escapeHtml(node.text || '');
    for (const mark of node.marks || []) text = mark.type === 'bold' ? `<strong>${text}</strong>` : `<em>${text}</em>`;
    return text;
  }
  if (node.type === 'hardBreak') return '<br>';
  const text = (node.content || []).map(child => richHtml(child, images)).join('');
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
            return `<${tag}${numeric[column] ? ' class="num"' : ''}>${(cell.content || []).map(child => richHtml(child, images)).join('')}</${tag}>`;
          })
          .join('')}</tr>`,
    );
    const colgroup = columns.map(width => `<col style="width:${((width * 100) / total).toFixed(2)}%">`).join('');
    return `<table style="font-size:${points}pt"><colgroup>${colgroup}</colgroup><thead>${rows[0] || ''}</thead><tbody>${rows.slice(1).join('')}</tbody></table>`;
  }
  const tag = (
    {
      paragraph: 'p',
      title: 'h1',
      blockquote: 'blockquote',
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
  return `<p class="memo-reference-row"><span class="memo-number">${number.map(node => richHtml(node)).join('')}</span><span class="memo-date">${value.map(node => richHtml(node)).join('')}</span></p>`;
}

export function pdfHtml(document: DraftNode, layout = resolveDocumentLayout(), images: ReadonlyMap<string, DocumentImage> = new Map()) {
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
    `body{font-family:"${layout.font}","STeP Fallback",sans-serif;font-size:16pt;line-height:1.35;${THAI_DOCUMENT_CSS}margin:0}`,
    'figure{margin:8pt 0;text-align:center;break-after:avoid}.caption{text-align:center;font-size:14pt;break-before:avoid}blockquote{margin:8pt 1.25cm}p{white-space:pre-wrap;margin:0 0 6pt;widows:2;orphans:2}h1{font-size:20pt}h2{font-size:18pt}h3{font-size:16pt}',
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
  const title =
    layout.id === 'memo' && layout.garudaHeightCm && ['heading', 'title'].includes(blocks[0]?.type || '') ? blocks[0] : undefined;
  const roles = documentLayoutRoles(document, layout.id);
  const content = layout.id
    ? blocks
        .map((node, index) => {
          if (node === title) return '';
          const role = roles[index];
          const css =
            ['title', 'signature', 'date'].includes(role) || centerFrontMatter(layout, role) ? 'text-align:center;' : 'text-align:left;';
          const indent = ['sender', 'signature'].includes(role)
            ? 'margin-left:8cm;'
            : role === 'body' && node.type === 'paragraph'
              ? 'text-indent:2.5cm;text-align:justify;'
              : '';
          return `<div class="block ${role}" style="${css}${indent}">${role === 'memo-reference' ? memoReferenceHtml(node) : richHtml(node, images)}</div>`;
        })
        .join('')
    : richHtml(document, images);
  const letterhead = layout.garudaHeightCm
    ? `<div class="letterhead ${layout.id}"><img alt="ตราครุฑ" src="${GARUDA_DATA_URI}" style="height:${layout.garudaHeightCm}cm;width:${layout.garudaHeightCm}cm">${title ? richHtml(title) : ''}</div>`
    : '';
  return `<!doctype html><html lang="th"><meta charset="utf-8"><style>${style}</style><body>${letterhead}${content}</body></html>`;
}

function runs(node: DraftNode, size: number, bold = false, font = OFFICIAL_FONT, dateTab = false, thaiBreaks = false): ParagraphChild[] {
  if (thaiBreaks) node = withThaiBreaks(node);
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
      italicsComplexScript: child.marks?.some(m => m.type === 'italic'),
      language: THAI_DOCUMENT_LANGUAGE,
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

type WordLayout = DocumentLayout & {
  presentation: DocumentPresentation;
  images: ReadonlyMap<string, DocumentImage>;
  lists: Map<DraftNode, string>;
};
const wordPreset = (layout: WordLayout) => DOCUMENT_PRESETS[layout.presentation.preset];
const wordWidth = (layout: WordLayout) => 11906 - Math.round((wordPreset(layout).margins.left + wordPreset(layout).margins.right) * CM);

function docxTable(table: DraftNode, layout: WordLayout) {
  const font = layout.font,
    textWidth = wordWidth(layout);
  const rows = table.content || [];
  const text = tableRows(table);
  const width = Math.max(1, ...rows.map(row => (row.content || []).length));
  const numeric = numericColumns(text);
  const { points, columns } = tableLayout(text, textWidth, wordPreset(layout).points);
  const size = points * 2;
  return new Table({
    width: { size: textWidth, type: WidthType.DXA },
    columnWidths: columns,
    layout: TableLayoutType.FIXED,
    rows: rows.map(
      (row, index) =>
        new TableRow({
          tableHeader: index === 0,
          cantSplit: index === 0,
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
                    alignment: numeric[column] ? AlignmentType.RIGHT : AlignmentType.LEFT,
                    widowControl: true,
                    children: runs(p, size, header, font, false, layout.presentation.thaiBreaks),
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
  layout: WordLayout,
  role: LayoutRole | 'quote' = 'body',
  numbering?: { reference: string; level: number },
  depth = 0,
  firstPageSpace = false,
  breakBefore = false,
): (Paragraph | Table)[] {
  if (node.type === 'pageBreak') return [new Paragraph({ pageBreakBefore: true, spacing: { line: 20, lineRule: LineRuleType.EXACT } })];
  if (node.type === 'image') {
    const image = layout.images.get(node.attrs!.assetId!);
    if (!image) throw new Error('DOCUMENT_IMAGE_NOT_FOUND');
    const preset = wordPreset(layout);
    const maxHeight = (16838 - Math.round((preset.margins.top + preset.margins.bottom) * CM)) / 15 - 72;
    const width = Math.min(((node.attrs?.widthCm || 12) * 96) / 2.54, wordWidth(layout) / 15, (maxHeight * image.width) / image.height);
    return [
      new Paragraph({
        pageBreakBefore: breakBefore,
        alignment: AlignmentType.CENTER,
        keepNext: true,
        children: [
          new ImageRun({
            type: 'png',
            data: image.bytes,
            transformation: { width, height: (width * image.height) / image.width },
            altText: { name: 'Document image', title: node.attrs?.alt || '', description: node.attrs?.alt || '' },
          }),
        ],
      }),
    ];
  }
  if (node.type === 'blockquote')
    return (node.content || []).flatMap((child, index) =>
      docxBlocks(child, layout, 'quote', undefined, depth, false, breakBefore && index === 0),
    );
  if (node.type === 'table')
    return [
      ...(breakBefore
        ? [
            new Paragraph({
              pageBreakBefore: true,
              keepNext: true,
              spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
            }),
          ]
        : []),
      docxTable(node, layout),
      new Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT }, children: [] }),
    ];
  if (['paragraph', 'heading', 'title', 'caption'].includes(node.type)) {
    const title = node.type === 'title' || role === 'title';
    const caption = node.type === 'caption';
    const level = node.attrs?.level || 1;
    const points = wordPreset(layout).points;
    const size = title
      ? layout.id === 'memo'
        ? 60
        : 44
      : caption
        ? (points - 2) * 2
        : node.type === 'heading'
          ? (points + [4, 2, 0][level - 1]) * 2
          : points * 2;
    const band = Math.floor(wordWidth(layout) / 2);
    const centered = title || caption || ['signature', 'date'].includes(role);
    const body = role === 'body' && node.type === 'paragraph' && !depth;
    return [
      new Paragraph({
        pageBreakBefore: breakBefore,
        ...(title
          ? { heading: HeadingLevel.TITLE }
          : node.type === 'heading'
            ? { heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][level - 1] }
            : caption
              ? { style: 'Caption' }
              : {}),
        numbering,
        alignment: centered || centerFrontMatter(layout, role) ? AlignmentType.CENTER : AlignmentType.LEFT,
        indent: numbering
          ? undefined
          : role === 'quote'
            ? { left: 720, right: 720 }
            : depth
              ? { left: 360 * depth }
              : ['signature', 'sender'].includes(role)
                ? { left: band }
                : body
                  ? { firstLine: Math.round(wordPreset(layout).indent * CM) }
                  : undefined,
        tabStops: role === 'memo-reference' ? [{ type: TabStopType.LEFT, position: band }] : undefined,
        keepNext:
          title ||
          node.type === 'heading' ||
          ['front', 'sender', 'date', 'memo-reference'].includes(role) ||
          (role === 'signature' && /^(?:\(|ขอแสดงความนับถือ)/.test(documentText(node))),
        keepLines: title || caption || node.type === 'heading' || role === 'signature',
        widowControl: true,
        spacing: {
          before: firstPageSpace ? Math.round(0.5 * CM) : title || node.type === 'heading' ? 120 : 0,
          after: node.type === 'paragraph' ? (role === 'body' && documentText(node).trim() ? wordPreset(layout).after * 20 : 0) : 60,
        },
        children: runs(
          node,
          size,
          title || node.type === 'heading',
          layout.font,
          role === 'memo-reference',
          layout.presentation.thaiBreaks,
        ),
      }),
    ];
  }
  if (node.type === 'bulletList' || node.type === 'orderedList')
    return (node.content || []).flatMap((item, itemIndex) =>
      (item.content || []).flatMap((child, index) =>
        docxBlocks(
          child,
          layout,
          'body',
          index === 0 && child.type === 'paragraph' ? { reference: layout.lists.get(node)!, level: Math.min(depth, 8) } : undefined,
          depth + 1,
          false,
          breakBefore && itemIndex === 0 && index === 0,
        ),
      ),
    );
  return (node.content || []).flatMap(child => docxBlocks(child, layout, 'body', undefined, depth));
}

function docx(document: DraftNode, layout: WordLayout) {
  const numberingConfig: INumberingOptions['config'][number][] = [];
  const collectLists = (node: DraftNode) => {
    if (['bulletList', 'orderedList'].includes(node.type)) {
      const reference = 'step-list-' + layout.lists.size;
      layout.lists.set(node, reference);
      numberingConfig.push({
        reference,
        levels: Array.from({ length: 9 }, (_, level) => ({
          level,
          format: node.type === 'bulletList' ? LevelFormat.BULLET : LevelFormat.DECIMAL,
          text: node.type === 'bulletList' ? ['•', '◦', '▪'][level % 3] : '%' + (level + 1) + '.',
          start: node.attrs?.start || 1,
          style: {
            run: { font: layout.font, size: wordPreset(layout).points * 2, sizeComplexScript: wordPreset(layout).points * 2 },
            paragraph: { indent: { left: 360 * (level + 1), hanging: 180 } },
          },
        })),
      });
    }
    (node.content || []).forEach(collectLists);
  };
  collectLists(document);
  const preset = wordPreset(layout);
  const heading = (size: number) => ({
    run: {
      font: layout.font,
      size,
      sizeComplexScript: size,
      bold: true,
      boldComplexScript: true,
      language: THAI_DOCUMENT_LANGUAGE,
      color: '000000',
    },
    paragraph: { spacing: { before: 120, after: 60 }, keepNext: true, keepLines: true },
  });
  const roles = documentLayoutRoles(document, layout.id);
  const blocks = document.content || [];
  const title =
    layout.id === 'memo' && layout.garudaHeightCm && ['heading', 'title'].includes(blocks[0]?.type || '') ? blocks[0] : undefined;
  const appearance = layout.presentation;
  const pageAt = (position: 'header' | 'footer') => appearance.pageNumber !== 'none' && appearance.pageNumberPosition.startsWith(position);
  const textLine = (text: string) =>
    new Paragraph({
      spacing: { before: 0, after: 0 },
      children: runs({ type: 'paragraph', content: [{ type: 'text', text }] }, 28, false, layout.font, false, appearance.thaiBreaks),
    });
  const numberLine = () =>
    new Paragraph({
      alignment: appearance.pageNumberPosition === 'footer-center' ? AlignmentType.CENTER : AlignmentType.RIGHT,
      spacing: { before: 0, after: 0 },
      children: [
        new TextRun({
          font: layout.font,
          size: 28,
          sizeComplexScript: 28,
          language: THAI_DOCUMENT_LANGUAGE,
          bold: false,
          boldComplexScript: false,
          italics: false,
          italicsComplexScript: false,
          children: appearance.pageNumber === 'thai' ? ['หน้า ', PageNumber.CURRENT] : [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES],
        }),
      ],
    });
  const headerLines = () => [
    ...(appearance.headerText ? [textLine(appearance.headerText)] : []),
    ...(pageAt('header') ? [numberLine()] : []),
  ];
  const footer = () =>
    new Footer({
      children: [...(appearance.footerText ? [textLine(appearance.footerText)] : []), ...(pageAt('footer') ? [numberLine()] : [])],
    });
  const hasHeader = Boolean(appearance.headerText || pageAt('header'));
  const hasFooter = Boolean(appearance.footerText || pageAt('footer'));
  const firstHeader = layout.garudaHeightCm
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
                altText: { name: 'Garuda', title: 'ตราครุฑ', description: 'Garuda' },
              }),
              ...(title
                ? [new TextRun({ children: [new Tab()] }), ...runs(title, 60, true, layout.font, false, appearance.thaiBreaks)]
                : []),
            ],
          }),
          ...headerLines(),
        ],
      })
    : undefined;
  const tocBlocks = appearance.toc
    ? [
        new Paragraph({
          style: 'TOCHeading',
          children: runs({ type: 'paragraph', content: [{ type: 'text', text: 'สารบัญ' }] }, (preset.points + 4) * 2, true, layout.font),
        }),
        new TableOfContents('Table of contents', { headingStyleRange: '1-3', hyperlink: true }),
      ]
    : [];
  const body: (Paragraph | Table | TableOfContents)[] = [];
  let breakBefore = false;
  for (const [index, node] of blocks.entries()) {
    if (node === title) continue;
    if (node.type === 'pageBreak') {
      if (breakBefore) body.push(...docxBlocks(node, layout));
      breakBefore = true;
      continue;
    }
    body.push(...docxBlocks(node, layout, roles[index], undefined, 0, Boolean(firstHeader && index === (title ? 1 : 0)), breakBefore));
    breakBefore = false;
  }
  if (breakBefore) body.push(...docxBlocks({ type: 'pageBreak' }, layout));
  const tocIndex = !title && blocks[0]?.type === 'title' ? 1 : 0;
  body.splice(tocIndex, 0, ...tocBlocks);
  return new Document({
    compatibility: { doNotExpandShiftReturn: true },
    features: { updateFields: true },
    numbering: { config: numberingConfig },
    styles: {
      paragraphStyles: [
        {
          id: 'Caption',
          name: 'Caption',
          basedOn: 'Normal',
          run: {
            font: layout.font,
            size: (preset.points - 2) * 2,
            sizeComplexScript: (preset.points - 2) * 2,
            language: THAI_DOCUMENT_LANGUAGE,
          },
          paragraph: { outlineLevel: 9 },
        },
        {
          id: 'TOCHeading',
          name: 'TOC Heading',
          basedOn: 'Normal',
          run: heading((preset.points + 4) * 2).run,
          paragraph: { outlineLevel: 9, keepNext: true },
        },
        ...[1, 2, 3].map(level => ({
          id: 'TOC' + level,
          name: 'toc ' + level,
          basedOn: 'Normal',
          run: { font: layout.font, size: preset.points * 2, sizeComplexScript: preset.points * 2, language: THAI_DOCUMENT_LANGUAGE },
          paragraph: { outlineLevel: 9, indent: { left: (level - 1) * 360 }, spacing: { before: 0, after: 0 } },
        })),
      ],
      default: {
        document: {
          run: { font: layout.font, size: preset.points * 2, sizeComplexScript: preset.points * 2, language: THAI_DOCUMENT_LANGUAGE },
          paragraph: { spacing: { before: 0, after: 0, line: Math.round(preset.line * 240), lineRule: LineRuleType.AUTO } },
        },
        heading1: heading((preset.points + 4) * 2),
        heading2: heading((preset.points + 2) * 2),
        heading3: heading(preset.points * 2),
        title: { ...heading(44), paragraph: { ...heading(44).paragraph, outlineLevel: 9 } },
      },
    },
    sections: [
      {
        properties: {
          ...(firstHeader ? { titlePage: true } : {}),
          page: {
            size: { width: 11906, height: 16838 },
            margin: {
              top: Math.round(preset.margins.top * CM),
              bottom: Math.round(preset.margins.bottom * CM),
              left: Math.round(preset.margins.left * CM),
              right: Math.round(preset.margins.right * CM),
              ...(firstHeader || hasHeader ? { header: Math.round((firstHeader ? 1.5 : 1) * CM) } : {}),
            },
            pageNumbers: { formatType: appearance.pageNumber === 'thai' ? NumberFormat.THAI_NUMBERS : NumberFormat.DECIMAL },
          },
        },
        ...(firstHeader || hasHeader
          ? {
              headers: {
                ...(hasHeader ? { default: new Header({ children: headerLines() }) } : {}),
                ...(firstHeader ? { first: firstHeader } : {}),
              },
            }
          : {}),
        ...(hasFooter ? { footers: { default: footer(), ...(firstHeader ? { first: footer() } : {}) } } : {}),
        children: body,
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
    } else if (['paragraph', 'heading', 'title', 'caption'].includes(node.type)) {
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

export type ExportDocumentOptions = {
  documentTool?: unknown;
  font?: unknown;
  garuda?: unknown;
  template?: Uint8Array;
  presentation?: unknown;
  images?: ReadonlyMap<string, DocumentImage>;
};

export async function exportDocument(
  path: string,
  format: string,
  text: string,
  pdf: (html: string) => Promise<Uint8Array>,
  document?: DraftNode,
  options: ExportDocumentOptions = {},
) {
  const rich = document ? validateDocument(document) : undefined;
  if (!exportFormats.includes(format as any)) throw new Error('INVALID_FORMAT');
  if (rich && documentImageIds(rich).length && !['docx', 'pdf'].includes(format)) throw new Error('UNSUPPORTED_EXPORT_ELEMENT');
  if (rich && hasPageBreak(rich) && ['xlsx', 'pptx'].includes(format)) throw new Error('UNSUPPORTED_EXPORT_ELEMENT');
  if (format !== 'docx' && options.presentation) {
    const p = resolvePresentation(options.presentation, Boolean(options.documentTool));
    if (
      p.toc ||
      p.headerText ||
      p.footerText ||
      (p.pageNumber !== 'none' && (p.pageNumber !== (options.documentTool ? 'thai' : 'none') || p.pageNumberPosition !== 'footer-center'))
    )
      throw new Error('DOCX_PRESENTATION_ONLY');
  }
  if (format === 'md') return writeFile(path, rich ? documentMarkdown(rich) : text, 'utf8');
  // A draft without structure is plain text: one paragraph per line, nothing read as Markdown.
  const content = rich || plainDocument(text);
  if (format === 'docx') {
    const presentation = resolvePresentation(options.presentation, Boolean(options.documentTool));
    if (
      options.template &&
      (presentation.toc ||
        presentation.headerText ||
        presentation.footerText ||
        presentation.pageNumber !== (options.documentTool ? 'thai' : 'none') ||
        presentation.pageNumberPosition !== 'footer-center')
    )
      throw new Error('DOCUMENT_TEMPLATE_LAYOUT_LOCKED');
    const bytes = options.template
      ? await renderDocumentTemplate(options.template, options.documentTool, content, presentation.thaiBreaks)
      : await Packer.toBuffer(
          docx(content, {
            ...resolveDocumentLayout(options.documentTool, options.font, options.garuda),
            presentation,
            images: options.images || new Map(),
            lists: new Map(),
          }),
        );
    const result = presentation.embedFonts
      ? await embedDocumentFonts(bytes)
      : { bytes, embedding: { status: 'disabled' as const, families: [] as string[] } };
    await writeFile(path, result.bytes);
    return {
      fontEmbedding: result.embedding,
      fieldsNeedUpdate: !options.template && (presentation.toc || presentation.pageNumber !== 'none'),
    };
  }
  if (format === 'pdf')
    return writeFile(
      path,
      await pdf(pdfHtml(content, resolveDocumentLayout(options.documentTool, options.font, options.garuda), options.images)),
    );
  if (format === 'xlsx') return xlsx(path, content);
  return pptx(path, content);
}
