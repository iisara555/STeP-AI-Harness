// The receipt's second reading: a vision model reads the image on its own, then each field is compared with the local
// OCR reading. Shared by the main process (prompt and parsing) and the receipt page (comparison and rule checks).

export const RECEIPT_FIELDS = ['merchant', 'receiptNumber', 'date', 'taxId', 'subtotal', 'vat', 'total'] as const;
export type ReceiptField = (typeof RECEIPT_FIELDS)[number];
export type VisionReading = Partial<Record<ReceiptField, { value: string; evidence: string }>>;
/** agree: both readings match · differ: both read, different · ai-only / ocr-only: one reading · empty: neither. */
export type FieldMatch = 'agree' | 'differ' | 'ai-only' | 'ocr-only' | 'empty';

export const RECEIPT_VISION_SYSTEM = `You read Thai and English receipts and tax invoices from images for an expense pre-check. You only transcribe what is printed; you never guess, complete or calculate a value.
Return ONLY one JSON object, no prose, no code fence:
{"fields":{"merchant":{"value":"","evidence":""},"receiptNumber":{...},"date":{...},"taxId":{...},"subtotal":{...},"vat":{...},"total":{...}},"buyerTaxId":"","notes":""}
- merchant: the seller / issuer name as printed (company or shop), not the buyer.
- receiptNumber: the receipt or tax-invoice number (เลขที่).
- date: the document date exactly as printed, keeping a Buddhist year (พ.ศ.) as it is.
- taxId: the SELLER's 13-digit tax ID (เลขประจำตัวผู้เสียภาษี of the issuer). A buyer's tax ID goes in buyerTaxId, never in taxId.
- subtotal: the amount before VAT; vat: the VAT amount; total: the amount paid. Digits only with a decimal point (e.g. 1250.00): no currency, no commas.
- evidence: the printed line the value comes from, copied as it appears.
- Use Arabic digits for every number (convert Thai digits ๐-๙).
- When a value is not printed, unreadable, cut off or you are unsure, use "" for value. An empty field is correct; a guessed one is a defect.
- notes: one short line about anything a reviewer should check (handwriting, stamps, damaged areas), or "".`;

const clip = (value: unknown, max = 200) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const thaiDigits = (value: string) => value.replace(/[๐-๙]/g, d => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d)));

/** The model's JSON reply as field values; anything outside the seven fields, or not text, is dropped. */
export function parseVisionReading(reply: string): { fields: VisionReading; buyerTaxId: string; notes: string } {
  const start = reply.indexOf('{'),
    end = reply.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('RECEIPT_VISION_UNREADABLE');
  let data: any;
  try {
    data = JSON.parse(reply.slice(start, end + 1));
  } catch {
    throw new Error('RECEIPT_VISION_UNREADABLE');
  }
  const fields: VisionReading = {};
  for (const key of RECEIPT_FIELDS) {
    const raw = data?.fields?.[key];
    const value = thaiDigits(clip(typeof raw === 'string' ? raw : raw?.value));
    if (value) fields[key] = { value, evidence: clip(raw?.evidence, 300) };
  }
  return { fields, buyerTaxId: thaiDigits(clip(data?.buyerTaxId, 40)), notes: clip(data?.notes, 300) };
}

const digits = (value: string) => thaiDigits(value).replace(/\D/g, '');
/** An amount as a number: Thai digits, commas, spaces, ฿ and บาท removed; NaN when it is not one amount. */
export function amount(value: string) {
  const text = thaiDigits(value)
    .replace(/บาท|฿|thb|,|\s/gi, '')
    .trim();
  return /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
}
const loose = (value: string) =>
  thaiDigits(value)
    .toLowerCase()
    .replace(/บริษัท|จำกัด|\(มหาชน\)|co\.?|ltd\.?|limited|company|[\s.,()"'-]/g, '');

/** Whether two readings of one field say the same thing, compared the way the field is written. */
export function sameValue(field: ReceiptField, a: string, b: string) {
  if (['subtotal', 'vat', 'total'].includes(field)) {
    const x = amount(a),
      y = amount(b);
    return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 0.005;
  }
  if (field === 'taxId' || field === 'date') return digits(a) !== '' && digits(a) === digits(b);
  if (field === 'receiptNumber') return a.replace(/\s/g, '').toUpperCase() === b.replace(/\s/g, '').toUpperCase();
  const x = loose(a),
    y = loose(b);
  return Boolean(x && y && (x === y || x.includes(y) || y.includes(x)));
}

export function compareField(field: ReceiptField, ocr: string, ai: string): FieldMatch {
  const o = ocr.trim(),
    v = ai.trim();
  if (!o && !v) return 'empty';
  if (!o) return 'ai-only';
  if (!v) return 'ocr-only';
  return sameValue(field, o, v) ? 'agree' : 'differ';
}

/** A Thai 13-digit tax ID passes its check digit (the Revenue Department's mod-11 rule). */
export function validThaiTaxId(value: string) {
  const d = digits(value);
  if (d.length !== 13) return false;
  const sum = [...d.slice(0, 12)].reduce((total, n, i) => total + Number(n) * (13 - i), 0);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}

/**
 * Checks that need no AI: the seller's tax ID check digit, VAT at 7% of the amount before VAT, and the amounts adding
 * up. Advisory only; the receipt page's own review rules still decide what blocks.
 */
export function receiptRuleChecks(values: Partial<Record<ReceiptField, string>>) {
  const notes: { code: string; field: ReceiptField }[] = [];
  if (values.taxId?.trim() && digits(values.taxId).length === 13 && !validThaiTaxId(values.taxId))
    notes.push({ code: 'tax_id_checksum', field: 'taxId' });
  const subtotal = amount(values.subtotal || ''),
    vat = amount(values.vat || ''),
    total = amount(values.total || '');
  if (Number.isFinite(subtotal) && Number.isFinite(vat) && subtotal > 0 && Math.abs(vat - subtotal * 0.07) > 0.05)
    notes.push({ code: 'vat_not_7_percent', field: 'vat' });
  if (Number.isFinite(subtotal) && Number.isFinite(vat) && Number.isFinite(total) && Math.abs(subtotal + vat - total) > 0.01)
    notes.push({ code: 'amounts_do_not_add_up', field: 'total' });
  return notes;
}
