import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  TableLayoutType,
  HeightRule,
} from 'docx';
import { embedDocumentFonts } from './document-fonts';
import { printDocument } from './receipt-voucher';
import { formatSatang, moneySatang, thaiBahtWords, type ReceiptPacket } from '../src/receipt-packet';
import { PAYMENT_METHOD_LABELS, paymentVoucherAmounts, paymentVoucherAssessment, type PaymentVoucher } from '../src/afp-payment-voucher';
import { THAI_DOCUMENT_LANGUAGE } from '../src/thai-typography';

const TITLE = 'ร่างใบสำคัญจ่ายสำหรับ AFP ตรวจ';
const NOTICE = 'ร่างข้อมูลเพื่อ AFP ตรวจ ไม่ใช่การอนุมัติหรือคำสั่งจ่ายเงิน';
const SOURCE = 'โครงร่างจาก QP-AF-004 · ต้องเทียบแบบควบคุมของ AFP';
const esc = (text: string) =>
  text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const lines = (text: string) => esc(text).replace(/\n/g, '<br>');
const missing = (text: string) => text.trim() || '........................................................';
const amount = (value: number | null) => (value === null ? 'รอยืนยัน' : formatSatang(value));
const itemNet = (item: PaymentVoucher['items'][number]) => {
  const g = moneySatang(item.gross),
    w = moneySatang(item.withholding),
    d = moneySatang(item.deduction);
  return g === null || w === null || d === null || w + d > g ? null : g - w - d;
};
const mode = (packet: ReceiptPacket) =>
  !packet.title && !packet.project && !packet.purpose
    ? 'รอ AFP ระบุ'
    : packet.mode === 'paid'
      ? 'เบิกคืน / เคลียร์เงินยืม (ผู้ยื่นจ่ายไปแล้ว)'
      : 'เตรียมจ่ายให้ผู้รับเงิน';
const reviewText = (packet: ReceiptPacket, voucher: PaymentVoucher) =>
  paymentVoucherAssessment(voucher, packet.voucher).status === 'prepared-for-afp'
    ? 'ข้อมูลที่ระบุตรวจเทียบแล้ว — รอ AFP ตรวจตามอำนาจหน้าที่'
    : 'ยังมีข้อมูลหรือยอดหักรอตรวจเทียบหลักฐาน';

export async function paymentVoucherDocx(packet: ReceiptPacket, voucher = packet.disbursement) {
  const run = (text: string, bold = false, size = 28) =>
    new TextRun({ text, bold, size, font: { name: 'TH Sarabun New', hint: 'cs' }, language: THAI_DOCUMENT_LANGUAGE });
  const p = (text: string, bold = false) =>
    new Paragraph({
      children: text.split('\n').flatMap((line, index) => [...(index ? [new TextRun({ break: 1 })] : []), run(line, bold)]),
      spacing: { before: 0, after: 70, line: 260 },
    });
  const border = { style: BorderStyle.SINGLE, color: '000000', size: 6 };
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const widths = [4400, 1550, 1550, 1550, 1550];
  const cell = (text: string, index: number, bold = false) =>
    new TableCell({
      width: { size: widths[index], type: WidthType.DXA },
      borders: { top: border, bottom: border, left: border, right: border },
      margins: { top: 30, bottom: 30, left: 70, right: 70 },
      children: [
        new Paragraph({
          children: [run(text, bold, 26)],
          alignment: index ? AlignmentType.RIGHT : AlignmentType.LEFT,
          spacing: { before: 0, after: 0, line: 260 },
        }),
      ],
    });
  const totals = paymentVoucherAmounts(voucher);
  const table = new Table({
    width: { size: 10600, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: widths,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: ['รายการจ่าย', 'ยอดรายการ', 'หัก ณ ที่จ่าย', 'หักอื่น', 'สุทธิ'].map((text, i) => cell(text, i, true)),
      }),
      ...voucher.items.map(
        item =>
          new TableRow({
            cantSplit: true,
            height: { value: 340, rule: HeightRule.ATLEAST },
            children: [
              cell(item.description, 0),
              cell(item.gross, 1),
              cell(item.withholding, 2),
              cell(item.deduction, 3),
              cell(itemNet(item) === null ? '' : amount(itemNet(item)), 4),
            ],
          }),
      ),
      new TableRow({
        cantSplit: true,
        children: ['รวม (บาท)', amount(totals.gross), amount(totals.withholding), amount(totals.deduction), amount(totals.net)].map(
          (text, i) => cell(text, i, true),
        ),
      }),
    ],
  });
  const signature = (role: string, name: string) =>
    new TableCell({
      borders: { top: none, bottom: none, left: none, right: none },
      children: [p(role, true), p('ลงชื่อ ........................................................'), p(`(${missing(name)})`)],
    });
  const signing = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: none, bottom: none, left: none, right: none },
    rows: [
      new TableRow({ cantSplit: true, children: [signature('ผู้จัดทำ', voucher.preparedBy), signature('ผู้ตรวจสอบ', voucher.checkedBy)] }),
      new TableRow({ cantSplit: true, children: [signature('ผู้อนุมัติ', voucher.approvedBy), signature('ผู้จ่ายเงิน', voucher.paidBy)] }),
      new TableRow({
        cantSplit: true,
        children: [
          signature('ผู้รับเงิน', voucher.receivedBy),
          new TableCell({
            borders: { top: none, bottom: none, left: none, right: none },
            children: [p('')],
          }),
        ],
      }),
    ],
  });
  const document = new Document({
    title: TITLE,
    creator: 'STeP Desktop',
    description: NOTICE,
    styles: { default: { document: { run: { font: 'TH Sarabun New', size: 28, language: THAI_DOCUMENT_LANGUAGE } } } },
    sections: [
      {
        properties: {
          page: { size: { width: 11906, height: 16838 }, margin: { top: 680, bottom: 760, left: 650, right: 650, footer: 300 } },
        },
        footers: {
          default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(SOURCE, false, 18)] })] }),
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            children: [run(TITLE, true, 36)],
            spacing: { after: 160 },
          }),
          p(NOTICE, true),
          p(`เลขที่ ${voucher.number.trim() || '[รอ AFP ออกเลข]'}     วันที่ ${missing(voucher.date)}`),
          p(`ผู้จ่ายเงิน / หน่วยงาน ${missing(voucher.payer)}`),
          p(`ผู้รับเงิน ${missing(voucher.payee)}`),
          p(`เรื่อง ${missing(packet.title)}`),
          p(`โครงการ / หน่วยงาน ${missing(packet.project)}`),
          p(`วัตถุประสงค์ ${missing(packet.purpose)}`),
          p(`ลักษณะเรื่อง ${mode(packet)}`),
          p(`วิธีจ่าย ${PAYMENT_METHOD_LABELS[voucher.method]}     รหัสบัญชี / งบประมาณ ${missing(voucher.accountCode)}`),
          p(`เอกสารอ้างอิง ${missing(voucher.reference)}`),
          table,
          p(
            totals.net === null ? 'จำนวนเงินสุทธิเป็นตัวอักษร [รอยืนยันยอดหัก]' : `จำนวนเงินสุทธิเป็นตัวอักษร ${thaiBahtWords(totals.net)}`,
          ),
          p(reviewText(packet, voucher)),
          p('เอกสารประกอบ: ตามหน้าสรุปชุดและรายการหลักฐานที่เลือกไว้'),
          ...(voucher.note ? [p(`หมายเหตุ ${voucher.note}`)] : []),
          signing,
          p('ชื่อที่พิมพ์ใต้ช่องลงนามไม่ใช่ลายมือชื่อหรือการอนุมัติ'),
        ],
      },
    ],
  });
  return (await embedDocumentFonts(await Packer.toBuffer(document))).bytes;
}

export function paymentVoucherHtml(packet: ReceiptPacket, fontCss: string) {
  const voucher = packet.disbursement,
    totals = paymentVoucherAmounts(voucher);
  const signature = (role: string, name: string) =>
    `<div><b>${role}</b><p>ลงชื่อ ........................................................<br>(${esc(missing(name))})</p></div>`;
  return printDocument(
    `<h1>${TITLE}</h1><p><b>${NOTICE}</b></p>
    <p>เลขที่ ${esc(voucher.number.trim() || '[รอ AFP ออกเลข]')} &nbsp; วันที่ ${esc(missing(voucher.date))}</p>
    <p>ผู้จ่ายเงิน / หน่วยงาน ${esc(missing(voucher.payer))}</p><p>ผู้รับเงิน ${esc(missing(voucher.payee))}</p>
    <p>เรื่อง ${esc(missing(packet.title))}</p><p>โครงการ / หน่วยงาน ${esc(missing(packet.project))}</p>
    <p>วัตถุประสงค์ ${lines(missing(packet.purpose))}</p><p>ลักษณะเรื่อง ${mode(packet)}</p>
    <p>วิธีจ่าย ${PAYMENT_METHOD_LABELS[voucher.method]} &nbsp; รหัสบัญชี / งบประมาณ ${esc(missing(voucher.accountCode))}</p>
    <p>เอกสารอ้างอิง ${esc(missing(voucher.reference))}</p>
    <table class="payment-items"><colgroup><col style="width:41.5%"><col style="width:14.625%"><col style="width:14.625%"><col style="width:14.625%"><col style="width:14.625%"></colgroup>
    <thead><tr><th>รายการจ่าย</th><th>ยอดรายการ</th><th>หัก ณ ที่จ่าย</th><th>หักอื่น</th><th>สุทธิ</th></tr></thead>
    <tbody>${voucher.items.map(item => `<tr><td>${lines(item.description)}</td><td>${esc(item.gross)}</td><td>${esc(item.withholding)}</td><td>${esc(item.deduction)}</td><td>${itemNet(item) === null ? '' : amount(itemNet(item))}</td></tr>`).join('')}
    <tr><td><b>รวม (บาท)</b></td><td>${amount(totals.gross)}</td><td>${amount(totals.withholding)}</td><td>${amount(totals.deduction)}</td><td>${amount(totals.net)}</td></tr></tbody></table>
    <p>${totals.net === null ? 'จำนวนเงินสุทธิเป็นตัวอักษร [รอยืนยันยอดหัก]' : 'จำนวนเงินสุทธิเป็นตัวอักษร ' + thaiBahtWords(totals.net)}</p>
    <p>${reviewText(packet, voucher)}</p><p>เอกสารประกอบ: ตามหน้าสรุปชุดและรายการหลักฐานที่เลือกไว้</p>
    ${voucher.note ? `<p>หมายเหตุ ${lines(voucher.note)}</p>` : ''}
    <div class="payment-signatures">${signature('ผู้จัดทำ', voucher.preparedBy)}${signature('ผู้ตรวจสอบ', voucher.checkedBy)}${signature('ผู้อนุมัติ', voucher.approvedBy)}${signature('ผู้จ่ายเงิน', voucher.paidBy)}${signature('ผู้รับเงิน', voucher.receivedBy)}</div>
    <p class="notice">ชื่อที่พิมพ์ใต้ช่องลงนามไม่ใช่ลายมือชื่อหรือการอนุมัติ</p><footer>${SOURCE}</footer>`,
    fontCss,
    '.payment-items{margin:3mm 0;font-size:13pt}.payment-items td{padding:2pt 3pt}.payment-items td:not(:first-child){text-align:right}.payment-signatures{display:grid;grid-template-columns:1fr 1fr;gap:5mm 8mm;margin-top:6mm;break-inside:avoid}h1{margin-bottom:5mm}',
  );
}
