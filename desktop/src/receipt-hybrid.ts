import { RECEIPT_FIELDS, validReceiptRegion, type ReceiptField, type ReceiptRegion, type parseVisionReading } from './receipt-vision';
import { formValues } from './receipt-workflow';

/** Prefer image transcription for handwriting; the reducer still protects every manual edit. */
export function visionFormSuggestions(
  current: Record<string, string>,
  guessed: Record<string, unknown>,
  reading: ReturnType<typeof parseVisionReading>,
) {
  const normalized = formValues(Object.fromEntries(RECEIPT_FIELDS.map(key => [key, reading.fields[key]?.value || ''])));
  const values: Partial<Record<ReceiptField, string>> = {};
  for (const key of RECEIPT_FIELDS) {
    const field = reading.fields[key];
    const handwritten = field?.isHandwritten ?? reading.features.handwritten;
    if (normalized[key] && (!current[key]?.trim() || guessed[key] || handwritten === true)) values[key] = normalized[key];
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
