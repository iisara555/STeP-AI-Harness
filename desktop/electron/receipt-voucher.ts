import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  HeightRule,
  type IParagraphOptions,
} from 'docx';
import { embedDocumentFonts } from './document-fonts';
import {
  FM014_REFERENCE,
  PACKET_DOCUMENT_LABELS,
  voucherTotal,
  thaiBahtWords,
  formatSatang,
  packetAssessment,
  type ReceiptPacket,
  type ReceiptVoucher,
} from '../src/receipt-packet';
import { THAI_DOCUMENT_LANGUAGE } from '../src/thai-typography';

const FONT = 'TH Sarabun New';
const FOOTER = 'FM-AF-014 V.02 วันที่บังคับใช้เอกสาร 1 มิ.ย. 2568 (อายุการจัดเก็บเอกสาร 15 ปี)';
const DRAFT = 'ร่างสำหรับตรวจทานและลงนาม';
const blank = (text: string, length = 40) => text.trim() || '.'.repeat(length);
const html = (value: string) =>
  value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const multiline = (value: string) => html(value).replace(/\n/g, '<br>');

/** Rebuilt as native paragraphs and cells; no filled source page or signature image is embedded. */
export async function receiptVoucherDocx(voucher: ReceiptVoucher) {
  const run = (text: string, bold = false, size = 28) =>
    new TextRun({ text, bold, size, font: { name: FONT, hint: 'cs' }, language: THAI_DOCUMENT_LANGUAGE });
  const textRuns = (text: string) => text.split('\n').flatMap((line, index) => [...(index ? [new TextRun({ break: 1 })] : []), run(line)]);
  const p = (text: string, options: IParagraphOptions = {}) =>
    new Paragraph({ children: textRuns(text), spacing: { before: 0, after: 50, line: 260 }, ...options });
  const border = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const cell = (
    text: string,
    width: number,
    options: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; shade?: boolean } = {},
  ) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      margins: { top: 0, bottom: 0, left: 70, right: 70 },
      borders: { top: border, bottom: border, left: border, right: border },
      ...(options.shade ? { shading: { type: ShadingType.CLEAR, fill: 'E7E7E7' } } : {}),
      children: [
        new Paragraph({
          children: options.bold ? [run(text, true)] : textRuns(text),
          alignment: options.align || AlignmentType.LEFT,
          spacing: { before: 0, after: 0, line: 240 },
        }),
      ],
    });
  const widths = [650, 8150, 1800];
  const items = [...voucher.items];
  while (items.length < 20) items.push({ description: '', amount: '' });
  const total = voucherTotal(voucher);
  const rows = [
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      height: { value: 510, rule: HeightRule.ATLEAST },
      children: [
        cell('', widths[0]),
        cell('รายการ', widths[1], { bold: true, align: AlignmentType.CENTER }),
        cell('จำนวนเงิน (บาท)', widths[2], { bold: true, align: AlignmentType.CENTER }),
      ],
    }),
    ...items.map(
      (item, index) =>
        new TableRow({
          cantSplit: true,
          height: { value: 310, rule: HeightRule.ATLEAST },
          children: [
            cell(item.description || item.amount ? String(index + 1) : '', widths[0], { align: AlignmentType.CENTER }),
            cell(item.description, widths[1]),
            cell(item.amount, widths[2], { align: AlignmentType.RIGHT }),
          ],
        }),
    ),
    new TableRow({
      cantSplit: true,
      children: [
        new TableCell({
          columnSpan: 2,
          shading: { fill: 'E7E7E7' },
          borders: { top: border, bottom: border, left: border, right: border },
          children: [
            p(total === null ? 'จำนวนเงินตัวอักษร ........................................................' : thaiBahtWords(total)),
          ],
        }),
        cell(total === null ? 'รวมทั้งสิ้น ..........' : formatSatang(total), widths[2], { shade: true, align: AlignmentType.RIGHT }),
      ],
    }),
  ];
  const signature = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: none, bottom: none, left: none, right: none },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            borders: { top: none, bottom: none, left: none, right: none },
            children: [
              p('ลงชื่อ ........................................................ ผู้รับเงิน', {
                alignment: AlignmentType.CENTER,
                spacing: { before: 160, after: 0 },
              }),
              p(`(${blank(voucher.recipient, 45)})`, { alignment: AlignmentType.CENTER, spacing: { after: 130 } }),
              p('ลงชื่อ ........................................................ ผู้จ่ายเงิน', {
                alignment: AlignmentType.CENTER,
                spacing: { after: 0 },
              }),
              p(`(${blank(voucher.payerSignatory, 45)})`, { alignment: AlignmentType.CENTER }),
            ],
          }),
        ],
      }),
    ],
  });
  const document = new Document({
    title: 'ใบสำคัญรับเงิน FM-AF-014',
    description: DRAFT,
    creator: 'STeP Desktop',
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 28, language: THAI_DOCUMENT_LANGUAGE },
          paragraph: { spacing: { before: 0, after: 40, line: 260 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: { size: { width: 11906, height: 16838 }, margin: { top: 680, bottom: 680, left: 650, right: 650, footer: 280 } },
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(`${DRAFT} · ${FOOTER}`, false, 18)] })],
          }),
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            children: [run('ใบสำคัญรับเงิน', true, 36)],
            spacing: { before: 0, after: 160 },
          }),
          p('อุทยานวิทยาศาสตร์และเทคโนโลยี\nมหาวิทยาลัยเชียงใหม่', { alignment: AlignmentType.RIGHT, spacing: { after: 160 } }),
          p(`วันที่ ${blank(voucher.date, 55)}`, { alignment: AlignmentType.RIGHT, spacing: { after: 100 } }),
          p(`ข้าพเจ้า ${blank(voucher.recipient, 100)}`),
          p(`ที่อยู่ ${blank(voucher.address, 110)}`, { spacing: { after: 80 } }),
          p(`ได้รับเงินจาก ${blank(voucher.payer, 65)} ดังรายการต่อไปนี้`, { spacing: { after: 100 } }),
          new Table({ layout: TableLayoutType.FIXED, width: { size: 10600, type: WidthType.DXA }, columnWidths: widths, rows }),
          signature,
          p(
            'หมายเหตุ ........................................................................................................................',
          ),
        ],
      },
    ],
  });
  return (await embedDocumentFonts(await Packer.toBuffer(document))).bytes;
}

function printDocument(body: string, fontCss: string, css = '') {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:"><style>${fontCss}
    @page{size:A4;margin:12mm 11.5mm 15mm}*{box-sizing:border-box}body{margin:0;color:#000;font:14pt/1.2 '${FONT}';word-break:normal;overflow-wrap:break-word}
    h1{font-size:18pt;margin:0 0 8mm;text-align:center}p{margin:0 0 2mm}table{border-collapse:collapse;width:100%;table-layout:fixed}thead{display:table-header-group}
    th,td{border:.6pt solid #000;padding:0 3pt;vertical-align:top}th{font-weight:700;text-align:center}tr{break-inside:avoid}tfoot{display:table-row-group}footer{font-size:9pt;text-align:right;position:fixed;bottom:0;right:0;width:100%;white-space:nowrap}
    .signatures{break-inside:avoid;text-align:center;margin-top:6mm}.signatures p{margin-bottom:3mm}.agency{text-align:right;margin-bottom:5mm}.date{text-align:right;margin-bottom:3mm}
    .items tbody tr{height:15.5pt}.items th{height:25.5pt;vertical-align:middle}.amount{text-align:right}.total{background:#e7e7e7}.notice{font-size:11pt;color:#333}
    ${css}</style></head><body>${body}</body></html>`;
}
export function receiptVoucherHtml(voucher: ReceiptVoucher, fontCss: string) {
  const items = [...voucher.items];
  while (items.length < 20) items.push({ description: '', amount: '' });
  const total = voucherTotal(voucher);
  return printDocument(
    `<h1>ใบสำคัญรับเงิน</h1><p class="agency">อุทยานวิทยาศาสตร์และเทคโนโลยี<br>มหาวิทยาลัยเชียงใหม่</p>
    <p class="date">วันที่ ${html(blank(voucher.date, 55))}</p><p>ข้าพเจ้า ${html(blank(voucher.recipient, 100))}</p>
    <p>ที่อยู่ ${multiline(blank(voucher.address, 110))}</p><p>ได้รับเงินจาก ${html(blank(voucher.payer, 65))} ดังรายการต่อไปนี้</p>
    <table class="items"><colgroup><col style="width:6.1%"><col style="width:76.9%"><col style="width:17%"></colgroup>
    <thead><tr><th></th><th>รายการ</th><th>จำนวนเงิน (บาท)</th></tr></thead><tbody>${items
      .map(
        (item, index) =>
          `<tr><td>${item.description || item.amount ? index + 1 : ''}</td><td>${multiline(item.description)}</td><td class="amount">${html(item.amount)}</td></tr>`,
      )
      .join('')}</tbody>
    <tfoot><tr class="total"><td colspan="2">${total === null ? 'จำนวนเงินตัวอักษร ........................................................' : thaiBahtWords(total)}</td>
    <td class="amount">${total === null ? 'รวมทั้งสิ้น ..........' : formatSatang(total)}</td></tr></tfoot></table>
    <div class="signatures"><p>ลงชื่อ ........................................................ ผู้รับเงิน<br>(${html(blank(voucher.recipient, 45))})</p>
    <p>ลงชื่อ ........................................................ ผู้จ่ายเงิน<br>(${html(blank(voucher.payerSignatory, 45))})</p></div>
    <p>หมายเหตุ ........................................................................................................................</p><footer>${DRAFT} · ${FOOTER}</footer>`,
    fontCss,
  );
}

export function packetIndex(packet: ReceiptPacket, coverPages: number, voucherPages: number) {
  let cursor = coverPages + voucherPages + 1;
  return packet.documents.flatMap(doc => {
    const pages = doc.pages.filter(page => page.included);
    if (!pages.length) return [];
    const start = cursor;
    cursor += pages.length;
    return [
      {
        id: doc.id,
        name: doc.name,
        sourcePages: pages.map(page => page.number).join(', '),
        outputPages: start === cursor - 1 ? String(start) : `${start}–${cursor - 1}`,
        kinds: [...new Set(pages.map(page => PACKET_DOCUMENT_LABELS[page.kind]))].join(' / '),
        checked: pages.every(page => page.checked && page.kind !== 'other'),
      },
    ];
  });
}
export function receiptPacketCoverHtml(packet: ReceiptPacket, coverPages: number, voucherPages: number, fontCss: string) {
  const assessment = packetAssessment(packet),
    total = voucherTotal(packet.voucher);
  const index = packetIndex(packet, coverPages, voucherPages);
  return printDocument(
    `<h1>สรุปชุดเอกสารเบิกจ่าย</h1><p><b>เรื่อง</b> ${html(packet.title)}</p>
    <p><b>โครงการ</b> ${html(packet.project || 'ยังไม่ระบุ')}</p><p><b>วัตถุประสงค์</b> ${multiline(packet.purpose || 'ยังไม่ระบุ')}</p>
    <p><b>ประเภทงาน</b> ${packet.mode === 'paid' ? 'จ่ายแล้ว — เตรียมเบิกคืนหรือเคลียร์เงินยืม' : 'รอจ่าย — เตรียมเอกสารให้ฝ่ายการเงิน'}</p>
    <p><b>ผลตรวจข้อมูล</b> ${assessment.status === 'prepared-for-afp' ? 'ข้อมูลที่ระบุได้รับการตรวจเทียบแล้ว — รอ AFP ตรวจ' : 'ร่าง — ยังมีข้อมูลหรือหลักฐานรอตรวจ'}</p>
    <p class="notice">เป็นการจัดชุดและตรวจข้อมูลเบื้องต้น ไม่ใช่การยืนยันสิทธิ งบประมาณ หรือการอนุมัติจ่ายเงิน เอกสารที่ต้องใช้ขึ้นกับประเภทค่าใช้จ่ายและข้อกำหนดปัจจุบันของ AFP</p>
    ${
      packet.includeVoucher
        ? `<p>ร่างใบสำคัญรับเงิน ${FM014_REFERENCE.code} อยู่หน้า ${coverPages + 1}${voucherPages > 1 ? `–${coverPages + voucherPages}` : ''}
      · ยอดตามร่าง ${total === null ? 'ยังไม่ครบ' : formatSatang(total) + ' บาท'} · ${packet.voucher.checked ? 'ตรวจข้อมูลแล้ว' : 'รอตรวจข้อมูล'}</p>`
        : ''
    }
    <table><colgroup><col style="width:8%"><col style="width:38%"><col style="width:25%"><col style="width:17%"><col style="width:12%"></colgroup>
    <thead><tr><th>ลำดับ</th><th>เอกสาร</th><th>ประเภท / ผลตรวจ</th><th>หน้าต้นฉบับ</th><th>หน้าในชุด</th></tr></thead><tbody>${index
      .map(
        (entry, i) =>
          `<tr><td>${i + 1}</td><td>${html(entry.name)}</td><td>${html(entry.kinds)}<br>${entry.checked ? 'ตรวจเทียบแล้ว' : 'รอตรวจ'}</td><td>${entry.sourcePages}</td><td>${entry.outputPages}</td></tr>`,
      )
      .join('')}</tbody></table>
    <p class="notice">คงลำดับหน้าภายในต้นฉบับตามที่เลือกไว้ ไม่รวมยอดเงินจากเอกสารทุกประเภทเข้าด้วยกัน เพราะอาจเป็นหลักฐานของรายการเดียวกัน</p>
    <p class="notice">อ้างอิงขั้นตอน: QP-AF-003 ข้อ 4.2 และ QP-AF-004 ขั้นตอนของพนักงานการเงิน ฉบับควบคุมใน MIS มีผลเหนือข้อความที่บันทึกใน Harness</p>
    <footer>ชุดงาน ${html(packet.id)} · ฉบับ ${packet.revision} · รอ AFP ตรวจตามอำนาจหน้าที่</footer>`,
    fontCss,
    'body{font-size:16pt}h1{text-align:left;margin-bottom:6mm}td,th{padding:3pt 4pt}table{margin:5mm 0}.notice{margin-top:3mm}',
  );
}
