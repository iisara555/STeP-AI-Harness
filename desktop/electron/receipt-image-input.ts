import type { NativeImage } from 'electron';
import type { VisionInput } from '../src/types';
import type { ReceiptRegion } from '../src/receipt-vision';
import { receiptCropRectangle, receiptDetailRegions } from '../src/receipt-hybrid';

/** Build bounded images from the host's immutable source snapshot, never renderer paths or image URLs. */
export function receiptVisionImages(pages: NativeImage[], regions?: ReceiptRegion[]) {
  if (!pages.length) throw new Error('RECEIPT_VISION_FORMAT');
  if (pages.length > 3) throw new Error('ATTACH_SCANNED_TOO_LONG');
  const images: VisionInput[] = [];
  const descriptions: string[] = [];
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
  pages.forEach((image, index) => append(image, `full page ${index + 1}`));
  const details = regions ?? (pages.length === 1 ? receiptDetailRegions() : []);
  for (const region of details.slice(0, 3)) {
    const image = pages[region.page - 1];
    if (!image) continue;
    const size = image.getSize();
    const rect = receiptCropRectangle(size.width, size.height, region);
    append(image.crop(rect), `detail of page ${region.page}, full-page region ${JSON.stringify(region)}`, 2048);
  }
  return {
    images,
    description: descriptions.join('\n'),
    pagePreviews: images.slice(0, pages.length).map(image => `data:${image.mime};base64,${image.data}`),
  };
}
