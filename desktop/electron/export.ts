import { writeFile } from 'node:fs/promises';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { type DraftNode, documentMarkdown, validateDocument } from '../src/draft';

export const exportFormats = ['md', 'docx', 'pdf', 'xlsx', 'pptx'] as const;
export function escapeHtml(text: string) { return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }
function richHtml(node: DraftNode): string {
  if (node.type === 'text') {
    let text = escapeHtml(node.text || '');
    for (const mark of node.marks || []) text = mark.type === 'bold' ? `<strong>${text}</strong>` : `<em>${text}</em>`;
    return text;
  }
  if (node.type === 'hardBreak') return '<br>';
  const text = (node.content || []).map(richHtml).join('');
  const tag = ({ paragraph: 'p', bulletList: 'ul', orderedList: 'ol', listItem: 'li', heading: `h${node.attrs?.level || 1}` } as Record<string, string>)[node.type];
  return tag ? `<${tag}${node.type === 'orderedList' ? ` start="${node.attrs?.start || 1}"` : ''}>${text}</${tag}>` : text;
}
function richParagraphs(node: DraftNode, prefix = ''): Paragraph[] {
  if (node.type === 'paragraph' || node.type === 'heading') return [new Paragraph({
    heading: node.type === 'heading' ? [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][(node.attrs?.level || 1) - 1] : undefined,
    children: [new TextRun({ text: prefix, font: 'Leelawadee UI', size: 24 }), ...(node.content || []).map(child => child.type === 'hardBreak' ? new TextRun({ break: 1 }) : new TextRun({ text: child.text || '', font: 'Leelawadee UI', size: node.type === 'heading' ? 32 : 24, bold: child.marks?.some(m => m.type === 'bold'), italics: child.marks?.some(m => m.type === 'italic') }))], spacing: { after: 100 },
  })];
  if (node.type === 'bulletList' || node.type === 'orderedList') return (node.content || []).flatMap((item, index) => (item.content || []).flatMap((child, childIndex) => richParagraphs(child, childIndex === 0 ? (node.type === 'bulletList' ? '• ' : `${(node.attrs?.start || 1) + index}. `) : '')));
  return (node.content || []).flatMap(child => richParagraphs(child));
}
export async function exportDocument(path: string, format: string, text: string, pdf: (html: string) => Promise<Uint8Array>, document?: DraftNode) {
  const rich = document ? validateDocument(document) : undefined;
  if (!exportFormats.includes(format as any)) throw new Error('INVALID_FORMAT');
  if (format === 'md') return writeFile(path, rich ? documentMarkdown(rich) : text, 'utf8');
  if (format === 'docx') {
    const document = new Document({ sections: [{ children: rich ? richParagraphs(rich) : text.split('\n').map(line => new Paragraph({ children: [new TextRun({ text: line, font: 'Leelawadee UI', size: 24 })], spacing: { after: 100 } })) }] });
    return writeFile(path, await Packer.toBuffer(document));
  }
  if (format === 'pdf') return writeFile(path, await pdf(`<html lang="th"><meta charset="utf-8"><style>body{font-family:"Leelawadee UI","Thonburi",sans-serif;font-size:12pt;line-height:1.65;overflow-wrap:anywhere}p{white-space:pre-wrap}h1,h2,h3{break-after:avoid}</style><body>${rich ? richHtml(rich) : `<p>${escapeHtml(text)}</p>`}</body></html>`));
  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('Draft');
    for (const line of text.split('\n')) {
      const values = line.includes('\t') ? line.split('\t') : line.startsWith('|') ? line.replace(/^\||\|$/g, '').split('|').map(v => v.trim()) : [line];
      sheet.addRow(values);
    }
    sheet.columns.forEach(col => { col.width = 35; });
    sheet.eachRow(row => { row.font = { name: 'Leelawadee UI', size: 12 }; row.alignment = { wrapText: true, vertical: 'top' }; });
    await workbook.xlsx.writeFile(path); return;
  }
  const deck = new PptxGenJS(); deck.layout = 'LAYOUT_WIDE'; deck.author = 'STeP'; deck.subject = 'Draft';
  // Deliberate text pagination; never silently crop long drafts.
  const chunks = text.match(/[\s\S]{1,600}(?:\n|$)|[\s\S]{1,600}/g) || [''];
  chunks.forEach((chunk, index) => { const slide = deck.addSlide(); slide.addText(`STeP · ${index + 1}`, { x: 0.6, y: 0.3, w: 12, h: 0.4, fontSize: 16, color: '275D55' }); slide.addText(chunk, { x: 0.6, y: 1, w: 12, h: 5.8, fontFace: 'Leelawadee UI', fontSize: 19, breakLine: false, valign: 'top', fit: 'shrink' }); });
  await deck.writeFile({ fileName: path });
}
