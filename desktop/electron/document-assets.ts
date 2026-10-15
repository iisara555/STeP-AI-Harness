import { createHash, randomUUID } from 'node:crypto';
import type { Store } from './store';
import { documentImageIds, type DraftNode } from '../src/draft';
import { open, realpath, lstat } from 'node:fs/promises';

export async function readDocumentImage(path: string, allow: (path: string) => void) {
  allow(path);
  const resolved = await realpath(path);
  allow(resolved);
  if ((await lstat(path)).isSymbolicLink()) throw new Error('DOCUMENT_IMAGE_INVALID');
  const file = await open(resolved, 'r');
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || before.size > 8_000_000n) throw new Error('DOCUMENT_IMAGE_LIMIT');
    const buffer = Buffer.alloc(8_000_001);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const after = await lstat(resolved, { bigint: true }),
      current = await file.stat({ bigint: true });
    allow(path);
    allow(resolved);
    if (
      offset > 8_000_000 ||
      (await realpath(path)) !== resolved ||
      after.isSymbolicLink() ||
      after.ino !== before.ino ||
      after.dev !== before.dev ||
      current.size !== before.size ||
      current.mtimeNs !== before.mtimeNs ||
      BigInt(offset) !== before.size
    )
      throw new Error('DOCUMENT_IMAGE_INVALID');
    return buffer.subarray(0, offset);
  } finally {
    await file.close();
  }
}

/** Bound dimensions before the native image decoder allocates pixel buffers. */
export function documentImageDimensions(bytes: Buffer) {
  let width = 0,
    height = 0;
  if (bytes.length >= 24 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && bytes.toString('ascii', 12, 16) === 'IHDR') {
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    for (let offset = 2; offset + 4 < bytes.length;) {
      if (bytes[offset++] !== 255) throw new Error('DOCUMENT_IMAGE_INVALID');
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 216)) continue;
      if (offset + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) throw new Error('DOCUMENT_IMAGE_INVALID');
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 8) {
        height = bytes.readUInt16BE(offset + 3);
        width = bytes.readUInt16BE(offset + 5);
        break;
      }
      offset += length;
    }
  }
  if (!width || !height || width > 20000 || height > 20000 || width * height > 40_000_000) throw new Error('DOCUMENT_IMAGE_INVALID');
  return { width, height };
}

export type DocumentImage = { bytes: Buffer; mime: 'image/png'; width: number; height: number };
export type DocumentAssetRecord = { key: string; sessionId: string; sha256: string; width: number; height: number; data: string };
export class DocumentAssets {
  constructor(private store: Store) {}
  save(sessionId: string, image: DocumentImage) {
    this.store.session(sessionId);
    if (
      !image.bytes.length ||
      image.bytes.length > 8_000_000 ||
      !Number.isInteger(image.width) ||
      !Number.isInteger(image.height) ||
      image.width < 1 ||
      image.height < 1 ||
      image.width * image.height > 40_000_000 ||
      image.bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    )
      throw new Error('DOCUMENT_IMAGE_INVALID');
    const dimensions = documentImageDimensions(image.bytes);
    if (dimensions.width !== image.width || dimensions.height !== image.height) throw new Error('DOCUMENT_IMAGE_INVALID');
    const current = this.store.list<DocumentAssetRecord>('document-asset').filter(r => r.sessionId === sessionId);
    if (current.length >= 50 || current.reduce((n, r) => n + r.data.length, 0) + (image.bytes.length * 4) / 3 > 86_000_000)
      throw new Error('DOCUMENT_IMAGE_LIMIT');
    const key = randomUUID();
    this.store.put('document-asset', key, {
      key,
      sessionId,
      sha256: createHash('sha256').update(image.bytes).digest('hex'),
      width: image.width,
      height: image.height,
      data: image.bytes.toString('base64'),
    } satisfies DocumentAssetRecord);
    return { assetId: key, widthCm: 12, alt: '' };
  }
  load(sessionId: string, assetId: string): DocumentImage {
    this.store.session(sessionId);
    const image = this.store.get<DocumentAssetRecord>('document-asset', assetId);
    if (!image || image.sessionId !== sessionId || typeof image.data !== 'string' || image.data.length > 10_666_668)
      throw new Error('DOCUMENT_IMAGE_NOT_FOUND');
    const bytes = Buffer.from(image.data, 'base64');
    if (createHash('sha256').update(bytes).digest('hex') !== image.sha256 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
      throw new Error('DOCUMENT_IMAGE_INVALID');
    const dimensions = documentImageDimensions(bytes);
    if (dimensions.width !== image.width || dimensions.height !== image.height) throw new Error('DOCUMENT_IMAGE_INVALID');
    return { bytes, mime: 'image/png', ...dimensions };
  }
  resolve(sessionId: string, document: DraftNode): Map<string, DocumentImage> {
    return new Map(documentImageIds(document).map(id => [id, this.load(sessionId, id)]));
  }
  remove(sessionId: string) {
    for (const asset of this.store.list<DocumentAssetRecord>('document-asset'))
      if (asset.sessionId === sessionId) this.store.remove('document-asset', asset.key);
  }
}
