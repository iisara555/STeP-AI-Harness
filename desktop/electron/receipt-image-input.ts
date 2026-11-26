import type { ReceiptCloudManifest } from './receipt-cloud';
import type { NativeImage } from 'electron';
import type { VisionInput } from '../src/types';
import type { ReceiptRegion } from '../src/receipt-vision';
import { receiptCropRectangle, receiptDetailRegions } from '../src/receipt-hybrid';

export const RECEIPT_VISION_PAGES = 3;

/** Check alternate-format dimensions before asking Chromium to decode an employee-picked receipt. */
export function receiptAlternateImageMime(bytes: Buffer, extension: string): 'image/webp' | 'image/bmp' {
  let width = 0,
    height = 0;
  if (extension === 'bmp' && bytes.length >= 26 && bytes.toString('ascii', 0, 2) === 'BM') {
    const headerSize = bytes.readUInt32LE(14);
    if (headerSize === 12) {
      width = bytes.readUInt16LE(18);
      height = bytes.readUInt16LE(20);
    } else if (headerSize >= 40 && headerSize <= bytes.length - 14) {
      width = bytes.readInt32LE(18);
      height = Math.abs(bytes.readInt32LE(22));
    }
  } else if (
    extension === 'webp' &&
    bytes.length >= 30 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const kind = bytes.toString('ascii', 12, 16);
    if (kind === 'VP8X') {
      // The receipt reader accepts a single still, so it cannot silently omit later frames.
      if (bytes[20] & 2) throw new Error('RECEIPT_VISION_IMAGE_UNSUPPORTED');
      width = bytes.readUIntLE(24, 3) + 1;
      height = bytes.readUIntLE(27, 3) + 1;
    } else if (kind === 'VP8L' && bytes[20] === 0x2f) {
      const dimensions = bytes.readUInt32LE(21);
      width = (dimensions & 0x3fff) + 1;
      height = ((dimensions >>> 14) & 0x3fff) + 1;
    } else if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      width = bytes.readUInt16LE(26) & 0x3fff;
      height = bytes.readUInt16LE(28) & 0x3fff;
    }
  }
  if (width < 1 || height < 1 || width * height > 40_000_000) throw new Error('RECEIPT_VISION_IMAGE_UNSUPPORTED');
  return extension === 'webp' ? 'image/webp' : 'image/bmp';
}

/** Build bounded images from the host's immutable source snapshot, never renderer paths or image URLs. */
export function receiptVisionImages(pages: NativeImage[], regions?: ReceiptRegion[]) {
  if (!pages.length) throw new Error('RECEIPT_VISION_FORMAT');
  if (pages.length > RECEIPT_VISION_PAGES) throw new Error('RECEIPT_VISION_PAGE_LIMIT');
  const images: VisionInput[] = [];
  const descriptions: string[] = [];
  const manifest: ReceiptCloudManifest = [];
  let bytes = 0;
  const append = (image: NativeImage, description: string, longest = 1800) => {
    if (image.isEmpty()) throw new Error('RECEIPT_VISION_FORMAT');
    const size = image.getSize();
    receiptCropRectangle(size.width, size.height, { page: 1, x: 0, y: 0, width: 1, height: 1 });
    const scale = Math.min(1, longest / Math.max(size.width, size.height));
    const fitted = scale < 1 ? image.resize({ width: Math.max(1, Math.round(size.width * scale)), quality: 'best' }) : image;
    const jpeg = fitted.toJPEG(95);
    bytes += jpeg.length;
    if (jpeg.length > 4_000_000 || bytes > 12_000_000) throw new Error('ATTACH_TOO_LARGE');
    images.push({ mime: 'image/jpeg', data: jpeg.toString('base64') });
    descriptions.push(`Image ${images.length}: ${description}`);
  };
  pages.forEach((image, index) => {
    append(image, `full page ${index + 1}`);
    manifest.push({ page: index + 1 });
  });
  const details = regions ?? (pages.length === 1 ? receiptDetailRegions() : []);
  for (const region of details.slice(0, 3)) {
    const image = pages[region.page - 1];
    if (!image) continue;
    const size = image.getSize();
    const rect = receiptCropRectangle(size.width, size.height, region);
    manifest.push({ page: region.page, region });
    append(image.crop(rect), `detail of page ${region.page}, full-page region ${JSON.stringify(region)}`, 2048);
  }
  return {
    images,
    manifest,
    description: descriptions.join('\n'),
    pagePreviews: images.slice(0, pages.length).map(image => `data:${image.mime};base64,${image.data}`),
  };
}
