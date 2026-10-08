import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receiptVisionImages } from '../electron/receipt-image-input';

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
  assert.equal(receiptVisionImages([image, image, image]).images.length, 3);
  assert.throws(() => receiptVisionImages([image, image, image, image]), /ATTACH_SCANNED_TOO_LONG/);
});
