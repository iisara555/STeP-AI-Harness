import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECEIPT_VISION_PAGES, receiptAlternateImageMime, receiptVisionImages } from '../electron/receipt-image-input';

test('high-resolution detail images use source pixels, are bounded and carry full-page coordinates', () => {
  const operations: unknown[] = [];
  const image: any = {
    isEmpty: () => false,
    getSize: () => ({ width: 3000, height: 4000 }),
    crop: (rect: unknown) => {
      operations.push(rect);
      return image;
    },
    resize: (size: unknown) => {
      operations.push(size);
      return image;
    },
    toJPEG: () => Buffer.from('synthetic-image'),
  };
  const result = receiptVisionImages([image]);
  assert.equal(result.images.length, 4);
  assert.match(result.description, /full page 1/);
  assert.match(result.description, /detail of page 1/);
  assert.ok(operations.some((v: any) => v.y === 2600));
  assert.ok(operations.some((v: any) => v.quality === 'best'));
  const tooLarge: any = { ...image, toJPEG: () => Buffer.alloc(4_000_001) };
  tooLarge.resize = () => tooLarge;
  tooLarge.crop = () => tooLarge;
  assert.throws(() => receiptVisionImages([tooLarge]), /ATTACH_TOO_LARGE/);
});

test('multiple-page input keeps every full page and refuses silent omission', () => {
  const image: any = { isEmpty: () => false, getSize: () => ({ width: 100, height: 200 }), toJPEG: () => Buffer.from('synthetic') };
  const pages = Array.from({ length: RECEIPT_VISION_PAGES }, () => image);
  assert.equal(receiptVisionImages(pages).images.length, RECEIPT_VISION_PAGES);
  assert.throws(() => receiptVisionImages([...pages, image]), /RECEIPT_VISION_PAGE_LIMIT/);
});

test('alternate image dimensions are bounded before decoding and TIFF has a receipt-specific fallback', () => {
  const bmp = Buffer.alloc(54);
  bmp.write('BM');
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(1280, 18);
  bmp.writeInt32LE(-900, 22);
  assert.equal(receiptAlternateImageMime(bmp, 'bmp'), 'image/bmp');
  bmp.writeInt32LE(200_000, 18);
  assert.throws(() => receiptAlternateImageMime(bmp, 'bmp'), /RECEIPT_VISION_IMAGE_UNSUPPORTED/);
  const webp = Buffer.alloc(30);
  webp.write('RIFF', 0);
  webp.write('WEBPVP8X', 8);
  webp.writeUIntLE(599, 24, 3);
  webp.writeUIntLE(399, 27, 3);
  assert.equal(receiptAlternateImageMime(webp, 'webp'), 'image/webp');
  webp[20] = 2;
  assert.throws(() => receiptAlternateImageMime(webp, 'webp'), /RECEIPT_VISION_IMAGE_UNSUPPORTED/);
  for (const extension of ['tif', 'tiff', 'webp', 'bmp'])
    assert.throws(() => receiptAlternateImageMime(Buffer.from('synthetic invalid bytes'), extension), /RECEIPT_VISION_IMAGE_UNSUPPORTED/);
});
