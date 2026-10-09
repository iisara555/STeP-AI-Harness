import { RECEIPT_FIELDS, validReceiptRegion, type ReceiptField, type ReceiptRegion, type parseVisionReading } from './receipt-vision';
import { formValues } from './receipt-workflow';

const AMOUNT_FIELDS: ReceiptField[] = ['subtotal', 'vat', 'total'];

/** A Vision value the form can take as is: amounts formatted to two decimals, a 13-digit tax ID. Anything else stays for review. */
function wellFormed(key: ReceiptField, value: string) {
  if (AMOUNT_FIELDS.includes(key)) return /^\d+\.\d{2}$/.test(value);
  if (key === 'taxId') return /^\d{13}$/.test(value);
  return true;
}

/**
 * The image reading fills the form: it reads printed and handwritten receipts more reliably than local OCR.
 * OCR keeps a field only when Vision left it empty, marked it for review or was unsure (confidence below 0.5)
 * while OCR had a value, or when Vision's amount or tax ID is malformed. The reducer still protects every manual edit.
 */
export function visionFormSuggestions(
  current: Record<string, string>,
  guessed: Record<string, unknown>,
  reading: ReturnType<typeof parseVisionReading>,
) {
  const normalized = formValues(Object.fromEntries(RECEIPT_FIELDS.map(key => [key, reading.fields[key]?.value || ''])));
  const values: Partial<Record<ReceiptField, string>> = {};
  for (const key of RECEIPT_FIELDS) {
    const field = reading.fields[key];
    const value = normalized[key];
    if (!value || !wellFormed(key, value)) continue;
    const ocrHolds = Boolean(current[key]?.trim()) && !guessed[key];
    const unsure = field?.needsReview === true || (typeof field?.confidence === 'number' && field.confidence < 0.5);
    if (ocrHolds && unsure) continue;
    values[key] = value;
  }
  return values;
}

/** Overlapping header, item and total views retain source pixels; they are not additional documents. */
export function receiptDetailRegions(page = 1): ReceiptRegion[] {
  return [
    { page, x: 0, y: 0, width: 1, height: 0.45 },
    { page, x: 0, y: 0.25, width: 1, height: 0.55 },
    { page, x: 0, y: 0.65, width: 1, height: 0.35 },
  ];
}

export function receiptFocusStyle(region: ReceiptRegion) {
  return { width: `${Math.min(800, 100 / region.width)}%`, transform: `translate(-${region.x * 100}%, -${region.y * 100}%)` };
}

/** Refuse oversized decoded images and invalid rectangles before making additional crop buffers. */
export function receiptCropRectangle(width: number, height: number, region: ReceiptRegion) {
  if (![width, height].every(v => Number.isInteger(v) && v > 0) || !validReceiptRegion(region)) throw new Error('RECEIPT_VISION_FORMAT');
  if (width * height > 24_000_000) throw new Error('ATTACH_TOO_LARGE');
  const x = Math.floor(region.x * width),
    y = Math.floor(region.y * height);
  return {
    x,
    y,
    width: Math.min(width - x, Math.ceil(region.width * width)),
    height: Math.min(height - y, Math.ceil(region.height * height)),
  };
}
