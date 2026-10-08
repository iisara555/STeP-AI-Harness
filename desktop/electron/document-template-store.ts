import { createHash, randomUUID } from 'node:crypto';
import type { Store } from './store';
import type { Session, DocumentTemplateInfo } from '../src/types';
import type { DocumentToolId } from '../src/document-tools';
import { open } from 'node:fs/promises';

/** Read through an owned descriptor with a hard byte bound, including files that grow while being read. */
export async function readTemplateSnapshot(path: string): Promise<Buffer> {
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 8_000_000) throw new Error('DOCUMENT_TEMPLATE_LIMIT');
    const chunks: Buffer[] = [];
    let total = 0;
    while (total <= 8_000_000) {
      const chunk = Buffer.alloc(Math.min(65536, 8_000_001 - total));
      const { bytesRead } = await file.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > 8_000_000) throw new Error('DOCUMENT_TEMPLATE_LIMIT');
      chunks.push(chunk.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, total);
  } finally {
    await file.close();
  }
}

type Record = { sessionId: string; documentTool: DocumentToolId; sha256: string; data: string };
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
/** Private SQLite records, never renderer-supplied paths or public release assets. */
export class DocumentTemplates {
  constructor(private store: Store) {}
  save(sessionId: string, bytes: Uint8Array, documentTool: DocumentToolId, name: string, font: string): DocumentTemplateInfo {
    this.store.session(sessionId);
    if (bytes.length > 8_000_000) throw new Error('DOCUMENT_TEMPLATE_LIMIT');
    const key = randomUUID(),
      sha256 = digest(bytes);
    this.store.put('document-template', key, {
      sessionId,
      documentTool,
      sha256,
      data: Buffer.from(bytes).toString('base64'),
    } satisfies Record);
    return { key, sha256, name, font };
  }
  load(session: Session): Buffer {
    const info = session.documentTemplate;
    const record = info && this.store.get<Record>('document-template', info.key);
    if (
      !record ||
      record.sessionId !== session.id ||
      record.documentTool !== session.documentTool ||
      record.sha256 !== info?.sha256 ||
      typeof record.data !== 'string' ||
      record.data.length > 10_666_668
    )
      throw new Error('DOCUMENT_TEMPLATE_NOT_FOUND');
    const bytes = Buffer.from(record.data, 'base64');
    if (digest(bytes) !== record.sha256) throw new Error('DOCUMENT_TEMPLATE_NOT_FOUND');
    return bytes;
  }
  remove(sessionId: string) {
    // A key is stored with its session; delete all snapshots belonging to the removed task.
    for (const record of this.store.templateRecords())
      if (record.sessionId === sessionId) this.store.remove('document-template', record.key);
  }
}
