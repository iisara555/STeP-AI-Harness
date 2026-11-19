import {
  DOCUMENT_TYPE_LABELS,
  parseClaimCategory,
  parseDocumentType,
  parseReceiptDate,
  type ClaimCategory,
  type DocumentType,
} from './receipt-compliance';
import {
  blankPaymentVoucher,
  editPaymentVoucher,
  paymentVoucherAssessment,
  paymentVoucherSourceStale,
  type PaymentVoucher,
} from './afp-payment-voucher';
import {
  ACTIVITY_LABELS,
  FINANCE_LABELS,
  EVIDENCE_DOCUMENT_LABELS,
  blankEvidenceGuidance,
  storedEvidenceGuidance,
  type EvidenceGuidance,
  type EvidenceDocumentKind,
} from './afp-evidence';

export const FM014_REFERENCE = {
  code: 'FM-AF-014',
  revision: '02',
  effectiveDate: '2025-06-01',
  source: 'docs/knowledge/mis-master-lists.md',
} as const;
export const PACKET_LIMITS = { documents: 40, pages: 250, sourceBytes: 25 * 1024 * 1024, totalBytes: 100 * 1024 * 1024 };
export const PACKET_DOCUMENT_LABELS = { ...DOCUMENT_TYPE_LABELS, supporting: 'เอกสารประกอบ', ...EVIDENCE_DOCUMENT_LABELS };
export type PacketDocumentKind = DocumentType | 'supporting' | EvidenceDocumentKind;
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
  reviewedReceipt?: {
    comparedAt: string;
    values: Pick<ReviewedReceipt, 'recipient' | 'date' | 'description' | 'total'>;
    /** The category the person kept on the receipt check, and the sub-category code when the suggestion matched it. */
    category?: ClaimCategory;
    code?: string;
  };
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
  guidance: EvidenceGuidance;
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
  category?: ClaimCategory;
  code?: string;
};

/** Sub-category codes the receipt check can suggest (docs/knowledge/afp-operational-circulars.md section 3). */
export const parseExpenseCode = (value: unknown): string =>
  typeof value === 'string' && /^(?:B(?:[1-9]|1[0-2])(?:\.[1-9])?|BV[12]?)$/.test(value) ? value : '';

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
    guidance: blankEvidenceGuidance(),
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
  if (typeof value === 'string' && Object.hasOwn(EVIDENCE_DOCUMENT_LABELS, value)) return value as EvidenceDocumentKind;
  const kind = parseDocumentType(value);
  if (!kind) throw new Error('INVALID_INPUT');
  return kind;
}

function editGuidance(raw: unknown, current: EvidenceGuidance, documents: PacketSource[]): EvidenceGuidance {
  if (raw === undefined) return current;
  if (!raw || typeof raw !== 'object') throw new Error('INVALID_INPUT');
  const input = raw as EvidenceGuidance;
  const category = input.category === undefined ? current.category : parseClaimCategory(input.category);
  if (
    !category ||
    !Object.hasOwn(ACTIVITY_LABELS, input.activity) ||
    !Object.hasOwn(FINANCE_LABELS, input.finance) ||
    !['auto', 'yes', 'no'].includes(input.speaker) ||
    !Array.isArray(input.extra) ||
    input.extra.length > 20
  )
    throw new Error('INVALID_INPUT');
  const seen = new Set<string>();
  const extra = input.extra.map(item => {
    if (!item || typeof item !== 'object' || !/^[a-f0-9-]{36}$/i.test(item.id) || seen.has(item.id)) throw new Error('INVALID_INPUT');
    seen.add(item.id);
    const sourceId = packetText(item.sourceId, 80);
    if (sourceId && !documents.some(doc => doc.id === sourceId)) throw new Error('INVALID_INPUT');
    return { id: item.id, label: packetText(item.label, 180), sourceId };
  });
  return { activity: input.activity, category, finance: input.finance, speaker: input.speaker, extra };
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
  const previousGuidance = storedEvidenceGuidance(current.guidance);
  const guidance = editGuidance(input.guidance, previousGuidance, documents);
  if (
    ['title', 'project', 'purpose', 'mode'].some(key => input[key as keyof ReceiptPacket] !== current[key as keyof ReceiptPacket]) ||
    JSON.stringify(guidance) !== JSON.stringify(previousGuidance) ||
    JSON.stringify(documents.map(doc => ({ id: doc.id, pages: doc.pages }))) !==
      JSON.stringify(current.documents.map(doc => ({ id: doc.id, pages: doc.pages }))) ||
    paymentVoucherSourceStale(disbursement, voucher)
  )
    disbursement.checked = false;
  return {
    ...current,
    title: packetText(input.title, 200),
    project: packetText(input.project, 200),
    purpose: packetText(input.purpose, 1200),
    mode: input.mode,
    guidance,
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
  // Under one baht the words name only the satang (ห้าสิบสตางค์), as Thai baht text is written.
  if (!whole) return fraction ? thaiInteger(fraction) + 'สตางค์' : 'ศูนย์บาทถ้วน';
  return thaiInteger(whole) + 'บาท' + (fraction ? thaiInteger(fraction) + 'สตางค์' : 'ถ้วน');
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

// Pages that prove a payment. An invoice, quotation, transfer slip or payment voucher for the same purchase is not
// counted, so one purchase is never added twice.
const PAYMENT_PROOF_KINDS: PacketDocumentKind[] = ['tax_invoice', 'abbreviated_tax_invoice', 'receipt', 'cash_bill', 'receipt_voucher'];
const CAP_SATANG = 1_000_000;
export type CategoryTotal = {
  key: string;
  category: Extract<ClaimCategory, 'B' | 'BV' | 'emergency'>;
  code: string;
  receipts: number;
  unreadable: number;
  total: number;
  status: 'within' | 'over' | 'check';
};

/**
 * AFP caps category B at 10,000 baht per sub-category summed over every item (circular section 3.1), BV per driver per
 * activity and the emergency category at 10,000 baht. Only receipts compared on the receipt check carry a category and
 * amount, so this sums those; a receipt without a sub-category is grouped apart and never called over the cap.
 */
export function packetCategoryTotals(packet: ReceiptPacket): CategoryTotal[] {
  const packetCategory = parseClaimCategory(packet.guidance?.category);
  const groups = new Map<string, CategoryTotal>();
  for (const doc of packet.documents) {
    const reviewed = doc.reviewedReceipt;
    if (!reviewed || !doc.pages.some(page => page.included && PAYMENT_PROOF_KINDS.includes(page.kind))) continue;
    const kept = parseClaimCategory(reviewed.category);
    const category = kept && kept !== 'unsure' ? kept : packetCategory;
    if (category !== 'B' && category !== 'BV' && category !== 'emergency') continue;
    const code = parseExpenseCode(reviewed.code);
    // B9.2 and B9.1 share the B9 cap; BV1 and BV2 are both BV.
    const top = category === 'B' ? code.match(/^B\d+/)?.[0] || '' : '';
    const key = category === 'B' ? top || 'B?' : category;
    const group = groups.get(key) || { key, category, code: top, receipts: 0, unreadable: 0, total: 0, status: 'within' as const };
    const amount = moneySatang(reviewed.values.total);
    if (amount === null) group.unreadable++;
    else {
      group.receipts++;
      group.total += amount;
    }
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(group => ({
      ...group,
      status: (group.total > CAP_SATANG
        ? group.key === 'B?' || group.category === 'BV'
          ? 'check'
          : 'over'
        : 'within') as CategoryTotal['status'],
    }))
    .sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true }));
}

/** Receipts whose category on the receipt check differs from the packet's; shown so the person decides, never merged. */
export function packetCategoryConflicts(packet: ReceiptPacket) {
  const packetCategory = parseClaimCategory(packet.guidance?.category);
  if (!packetCategory || packetCategory === 'unsure') return [];
  return packet.documents.flatMap(doc => {
    const kept = parseClaimCategory(doc.reviewedReceipt?.category);
    return kept && kept !== 'unsure' && kept !== packetCategory ? [{ id: doc.id, name: doc.name, category: kept }] : [];
  });
}
