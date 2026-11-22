// Reading the files added to a disbursement case: which kind of evidence each one is, from the words printed on it.
// The text is read on this computer (a PDF's text layer, or local OCR); only the kind and the heading word that
// decided it leave the main process. A kind found here is a suggestion: the person applies it, and every page
// still needs its own check against the original.
import { EVIDENCE_PATTERNS } from './afp-evidence';
import { PACKET_DOCUMENT_LABELS, type PacketDocumentKind, type ReceiptPacket } from './receipt-packet';

/** Document titles, most specific first: at the same position the earlier entry wins. */
const TITLES: [PacketDocumentKind, RegExp][] = [
  ['abbreviated_tax_invoice', /ใบกำกับภาษีอย่างย่อ|abbreviated\s*tax\s*invoice|tax\s*invoice\s*\(?\s*abb/i],
  ['tax_invoice', /ใบกำกับภาษี|tax\s*invoice/i],
  ['receipt_voucher', /ใบสำคัญรับเงิน|FM[ _-]?AF[ _-]?014/i],
  ['disbursement_voucher', /ใบสำคัญจ่าย|payment\s*voucher/i],
  ['receipt', /ใบเสร็จรับเงิน|ใบเสร็จ|\breceipt\b/i],
  ['cash_bill', /บิลเงินสด|cash\s*bill/i],
  ['invoice_or_quotation', /ใบแจ้งหนี้|ใบเสนอราคา|ใบส่งของ|\binvoice\b|\bquotation\b/i],
  ['transfer_slip', /โอนเงินสำเร็จ|ทำรายการสำเร็จ|รายการสำเร็จ|transfer\s*success|promptpay|พร้อมเพย์/i],
  ...EVIDENCE_PATTERNS,
];
/** A title is printed near the top; a long document's later words are its body, not its kind. */
const HEAD = 4000;
/** "ใบเสร็จรับเงิน/ใบกำกับภาษี" is one combined document, read as the tax invoice. */
const COMBINED = 40;

export type EvidenceReading = { kind: PacketDocumentKind; cue: string };

/** The kind whose title appears first in the text, or null when no known title is printed. */
export function classifyEvidenceText(text: string): EvidenceReading | null {
  const head = String(text || '')
    .slice(0, HEAD)
    .replace(/[​ ]/g, ' ');
  const found: { kind: PacketDocumentKind; index: number; cue: string }[] = [];
  for (const [kind, pattern] of TITLES) {
    const match = new RegExp(pattern.source, pattern.flags.replace('g', '')).exec(head);
    if (match) found.push({ kind, index: match.index, cue: match[0].replace(/\s+/g, ' ').trim().slice(0, 40) });
  }
  if (!found.length) return null;
  const first = found.reduce((best, item) => (item.index < best.index ? item : best));
  const tax = found.find(item => item.kind === 'tax_invoice' || item.kind === 'abbreviated_tax_invoice');
  const pick = first.kind === 'receipt' && tax && tax.index - first.index <= COMBINED + first.cue.length ? tax : first;
  return { kind: pick.kind, cue: pick.cue };
}

/** What reading one file found, as the main process answers it. */
export type SourceReading = {
  kind: PacketDocumentKind | null;
  cue?: string;
  /** How the text was read: the PDF's own text, local OCR, or not at all. */
  via: 'text' | 'ocr' | 'none';
  /** Why nothing was read: no text on the file, or a picture with local OCR not running. */
  reason?: 'no-text' | 'ocr-off';
};

export type ReadingItem = {
  sourceId: string;
  name: string;
  state: 'waiting' | 'reading' | 'done' | 'failed';
  result?: SourceReading;
  error?: string;
};

/** One drop or pick of files in a case, read one file at a time. */
export type ReadingBatch = { id: string; items: ReadingItem[]; settled?: 'applied' | 'dismissed' };

type Translate = (text: string, ...values: (string | number)[]) => string;

/** The one line under a file in the reading card. */
export function readingLine(item: ReadingItem, translate: Translate) {
  if (item.state === 'waiting') return translate('รออ่าน');
  if (item.state === 'reading') return translate('กำลังอ่านในเครื่อง…');
  if (item.state === 'failed') return item.error || translate('อ่านไม่สำเร็จ');
  const result = item.result!;
  if (result.kind)
    return translate(
      result.via === 'ocr' ? '{0} · อ่านด้วย OCR ในเครื่อง พบ “{1}”' : '{0} · พบ “{1}” ในเนื้อหา',
      translate(PACKET_DOCUMENT_LABELS[result.kind]),
      result.cue || '',
    );
  if (result.reason === 'ocr-off') return translate('เป็นภาพ อ่านในเครื่องไม่ได้เพราะยังไม่ได้เปิด OCR · เลือกประเภทเอง');
  if (result.reason === 'no-text') return translate('ไม่พบข้อความในไฟล์ · เลือกประเภทเอง');
  return translate('ไม่พบหัวเอกสารที่รู้จัก · เลือกประเภทเอง');
}

/** Files whose kind was read and whose pages still wait for one: what "use these kinds" would change. */
export function pendingReadings(packet: ReceiptPacket, items: ReadingItem[]) {
  return items.filter(
    item =>
      item.state === 'done' &&
      item.result?.kind &&
      packet.documents.some(doc => doc.id === item.sourceId && doc.pages.some(page => page.kind === 'other')),
  );
}

/** Sets each read kind on that file's unclassified pages; pages the person already typed keep their kind. */
export function applyReadings(packet: ReceiptPacket, items: ReadingItem[]): ReceiptPacket {
  const kinds = new Map(pendingReadings(packet, items).map(item => [item.sourceId, item.result!.kind!]));
  if (!kinds.size) return packet;
  return {
    ...packet,
    documents: packet.documents.map(doc => {
      const kind = kinds.get(doc.id);
      return kind ? { ...doc, pages: doc.pages.map(page => (page.kind === 'other' ? { ...page, kind, checked: false } : page)) } : doc;
    }),
  };
}
