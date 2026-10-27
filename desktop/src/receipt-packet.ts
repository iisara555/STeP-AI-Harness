import { DOCUMENT_TYPE_LABELS, parseDocumentType, parseReceiptDate, type DocumentType } from './receipt-compliance';
import {
  blankPaymentVoucher,
  editPaymentVoucher,
  paymentVoucherAssessment,
  paymentVoucherSourceStale,
  type PaymentVoucher,
} from './afp-payment-voucher';

export const FM014_REFERENCE = {
  code: 'FM-AF-014',
  revision: '02',
  effectiveDate: '2025-06-01',
  source: 'docs/knowledge/mis-master-lists.md',
} as const;
export const PACKET_LIMITS = { documents: 40, pages: 250, sourceBytes: 25 * 1024 * 1024, totalBytes: 100 * 1024 * 1024 };
export const PACKET_DOCUMENT_LABELS = { ...DOCUMENT_TYPE_LABELS, supporting: 'เอกสารประกอบ' };
export type PacketDocumentKind = DocumentType | 'supporting';
export type VoucherItem = { description: string; amount: string };
export type ReceiptVoucher = {
  date: string;
  recipient: string;
  address: string;
  payer: string;
  payerSignatory: string;
  items: VoucherItem[];
  checked: boolean;
};
export type PacketSource = {
  id: string;
  name: string;
  extension: 'pdf' | 'png' | 'jpg';
  sha256: string;
  bytes: number;
  reviewedReceipt?: { comparedAt: string; values: Pick<ReviewedReceipt, 'recipient' | 'date' | 'description' | 'total'> };
  pages: { number: number; kind: PacketDocumentKind; included: boolean; checked: boolean }[];
};
export type ReceiptPacket = {
  schema: 'step-receipt-packet/v1';
  id: string;
  revision: number;
  title: string;
  project: string;
  purpose: string;
  mode: 'paid' | 'awaiting-payment';
  voucher: ReceiptVoucher;
  includeVoucher: boolean;
  disbursement: PaymentVoucher;
  includeDisbursement: boolean;
  documents: PacketSource[];
  createdAt: string;
  updatedAt: string;
  paymentApproved: false;
};
export type PacketListItem = Pick<ReceiptPacket, 'id' | 'title' | 'updatedAt' | 'revision'> & { documentCount: number };
export type ReviewedReceipt = {
  sourceToken: string;
  checked: boolean;
  recipient: string;
  date: string;
  description: string;
  total: string;
  kind: DocumentType | '';
};

export const blankReceiptVoucher = (): ReceiptVoucher => ({
  date: '',
  recipient: '',
  address: '',
  payer: 'อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่',
  payerSignatory: '',
  items: [{ description: '', amount: '' }],
  checked: false,
});

export function createReceiptPacket(id: string, now: string): ReceiptPacket {
  return {
    schema: 'step-receipt-packet/v1',
    id,
    revision: 0,
    title: 'ชุดเอกสารใหม่',
    project: '',
    purpose: '',
    mode: 'paid',
    voucher: blankReceiptVoucher(),
    includeVoucher: false,
    disbursement: blankPaymentVoucher(),
    includeDisbursement: false,
    documents: [],
    createdAt: now,
    updatedAt: now,
    paymentApproved: false,
  };
}

export function packetText(value: unknown, limit: number): string {
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))
    throw new Error('INVALID_INPUT');
  return value;
}

export function packetKind(value: unknown): PacketDocumentKind {
  if (value === 'supporting') return value;
  const kind = parseDocumentType(value);
  if (!kind) throw new Error('INVALID_INPUT');
  return kind;
}

/** Edits never turn an earlier source comparison into a confirmation of new content. */
export function editReceiptPacket(current: ReceiptPacket, raw: unknown, now: string): ReceiptPacket {
  if (!raw || typeof raw !== 'object') throw new Error('INVALID_INPUT');
  const input = raw as ReceiptPacket;
  if (input.id !== current.id || input.revision !== current.revision) throw new Error('PACKET_CONFLICT');
  if (
    !['paid', 'awaiting-payment'].includes(input.mode) ||
    !input.voucher ||
    !Array.isArray(input.voucher.items) ||
    input.voucher.items.length < 1 ||
    input.voucher.items.length > 30 ||
    typeof input.includeVoucher !== 'boolean' ||
    (input.includeDisbursement !== undefined && typeof input.includeDisbursement !== 'boolean')
  )
    throw new Error('INVALID_INPUT');
  const voucher: ReceiptVoucher = {
    date: packetText(input.voucher.date, 80),
    recipient: packetText(input.voucher.recipient, 200),
    address: packetText(input.voucher.address, 600),
    payer: packetText(input.voucher.payer, 300),
    payerSignatory: packetText(input.voucher.payerSignatory, 200),
    items: input.voucher.items.map(item => ({ description: packetText(item.description, 1200), amount: packetText(item.amount, 40) })),
    checked: false,
  };
  const unchanged = JSON.stringify({ ...voucher, checked: false }) === JSON.stringify({ ...current.voucher, checked: false });
  voucher.checked = unchanged && input.voucher.checked === true;
  if (!Array.isArray(input.documents) || input.documents.length !== current.documents.length) throw new Error('INVALID_INPUT');
  const seen = new Set<string>();
  const documents = input.documents.map(doc => {
    const original = current.documents.find(source => source.id === doc.id);
    if (!original || seen.has(doc.id) || !Array.isArray(doc.pages) || doc.pages.length !== original.pages.length)
      throw new Error('INVALID_INPUT');
    seen.add(doc.id);
    return {
      ...original,
      pages: doc.pages.map((page, i) => {
        const old = original.pages[i];
        if (page.number !== old.number || typeof page.included !== 'boolean' || typeof page.checked !== 'boolean')
          throw new Error('INVALID_INPUT');
        const kind = packetKind(page.kind);
        return { number: old.number, kind, included: page.included, checked: kind === old.kind && page.checked };
      }),
    };
  });
  const disbursement = editPaymentVoucher(
    current.disbursement || blankPaymentVoucher(),
    input.disbursement || current.disbursement || blankPaymentVoucher(),
  );
  if (
    ['title', 'project', 'purpose', 'mode'].some(key => input[key as keyof ReceiptPacket] !== current[key as keyof ReceiptPacket]) ||
    paymentVoucherSourceStale(disbursement, voucher)
  )
    disbursement.checked = false;
  return {
    ...current,
    title: packetText(input.title, 200),
    project: packetText(input.project, 200),
    purpose: packetText(input.purpose, 1200),
    mode: input.mode,
    voucher,
    includeVoucher: input.includeVoucher,
    disbursement,
    includeDisbursement: input.includeDisbursement === undefined ? Boolean(current.includeDisbursement) : input.includeDisbursement,
    documents,
    revision: current.revision + 1,
    updatedAt: now,
    paymentApproved: false,
  };
}

/** Decimal arithmetic in satang; reject malformed grouping, exponents and negative readings. */
export function moneySatang(value: string): number | null {
  const text = value.trim().replace(/[๐-๙]/g, digit => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit)));
  if (!/^(?:\d{1,11}|\d{1,3}(?:,\d{3}){1,3})(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.replace(/,/g, '').split('.');
  const satang = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(satang) && satang <= 9_999_999_999_999 ? satang : null;
}
export const formatSatang = (value: number) =>
  (value / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function voucherTotal(voucher: ReceiptVoucher): number | null {
  const populated = voucher.items.filter(item => item.description.trim() || item.amount.trim());
  if (!populated.length) return null;
  let total = 0;
  for (const item of populated) {
    const value = moneySatang(item.amount);
    if (!item.description.trim() || value === null) return null;
    total += value;
  }
  return Number.isSafeInteger(total) && total <= 9_999_999_999_999 ? total : null;
}

function thaiInteger(value: number, higher = false): string {
  if (value >= 1_000_000)
    return thaiInteger(Math.floor(value / 1_000_000)) + 'ล้าน' + (value % 1_000_000 ? thaiInteger(value % 1_000_000, true) : '');
  const names = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  const digits = String(value).split('').map(Number);
  return digits
    .map((digit, index) => {
      if (!digit) return '';
      const place = digits.length - index - 1;
      if (place === 1) return (digit === 1 ? '' : digit === 2 ? 'ยี่' : names[digit]) + 'สิบ';
      if (place === 0 && digit === 1 && (value > 1 || higher)) return 'เอ็ด';
      return names[digit] + units[place];
    })
    .join('');
}
export function thaiBahtWords(satang: number): string {
  if (!Number.isSafeInteger(satang) || satang < 0 || satang > 9_999_999_999_999) throw new Error('INVALID_INPUT');
  const whole = Math.floor(satang / 100),
    fraction = satang % 100;
  return (whole ? thaiInteger(whole) : 'ศูนย์') + 'บาท' + (fraction ? thaiInteger(fraction) + 'สตางค์' : 'ถ้วน');
}

export function packetAssessment(packet: ReceiptPacket) {
  const pages = packet.documents.flatMap(doc => doc.pages.filter(page => page.included));
  const missing: string[] = [];
  if (!packet.title.trim() || !packet.project.trim() || !packet.purpose.trim()) missing.push('case-details');
  if (!pages.length) missing.push('documents');
  if (pages.some(page => !page.checked || page.kind === 'other')) missing.push('source-review');
  if (
    packet.includeVoucher &&
    (!packet.voucher.recipient.trim() ||
      !parseReceiptDate(packet.voucher.date) ||
      !packet.voucher.address.trim() ||
      !packet.voucher.payer.trim() ||
      !packet.voucher.checked ||
      voucherTotal(packet.voucher) === null ||
      voucherTotal(packet.voucher) === 0)
  )
    missing.push('voucher-review');
  if (
    packet.includeDisbursement &&
    paymentVoucherAssessment(packet.disbursement || blankPaymentVoucher(), packet.voucher).status === 'needs-review'
  )
    missing.push('disbursement-review');
  return {
    status: missing.length ? ('needs-review' as const) : ('prepared-for-afp' as const),
    missing,
    paymentApproved: false as const,
    policyVerified: false as const,
    includedPages: pages.length,
  };
}
