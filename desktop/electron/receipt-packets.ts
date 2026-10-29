import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, dirname, basename, sep } from 'node:path';
import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib';
import {
  createReceiptPacket,
  editReceiptPacket,
  PACKET_LIMITS,
  packetText,
  packetKind,
  type ReceiptPacket,
  type PacketListItem,
  type ReviewedReceipt,
  type PacketSource,
} from '../src/receipt-packet';
import { blankPaymentVoucher, paymentVoucherFromReceipt } from '../src/afp-payment-voucher';
import { blankEvidenceGuidance } from '../src/afp-evidence';

type Records = {
  get<T>(kind: string, id: string): T | undefined;
  put(kind: string, id: string, value: unknown): void;
  list<T>(kind: string): T[];
  transaction?<T>(action: () => T): T;
};
type SelectedSource = { name: string; extension: string; bytes: Buffer; originalPath?: string };
const KIND = 'receipt-packet';
const identifier = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new Error('INVALID_INPUT');
  return value;
};
export const receiptSourceToken = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export async function loadPacketPdf(bytes: Uint8Array) {
  try {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
    if (
      pdf.isEncrypted ||
      pdf.getPageCount() < 1 ||
      pdf.getPageCount() > PACKET_LIMITS.pages ||
      pdf.context.enumerateIndirectObjects().length > 100_000
    )
      throw new Error('PACKET_PDF_LIMIT');
    return pdf;
  } catch (error) {
    if (error instanceof Error && error.message === 'PACKET_PDF_LIMIT') throw error;
    throw new Error('PACKET_PDF_UNREADABLE');
  }
}

/** Store local immutable sources; renderer payloads cannot select paths or replace source metadata. */
export class ReceiptPackets {
  constructor(
    private records: Records,
    private root: string,
    private now = () => new Date().toISOString(),
  ) {}
  list(): PacketListItem[] {
    return this.records
      .list<ReceiptPacket>(KIND)
      .map(packet => ({
        id: packet.id,
        title: packet.title,
        revision: packet.revision,
        updatedAt: packet.updatedAt,
        documentCount: packet.documents.length,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  create() {
    const packet = createReceiptPacket(randomUUID(), this.now());
    this.records.put(KIND, packet.id, packet);
    return packet;
  }
  get(id: unknown, revision?: unknown): ReceiptPacket {
    const packet = this.records.get<ReceiptPacket>(KIND, identifier(id));
    if (!packet) throw new Error('PACKET_NOT_FOUND');
    if (revision !== undefined && packet.revision !== revision) throw new Error('PACKET_CONFLICT');
    return {
      ...packet,
      disbursement: packet.disbursement || blankPaymentVoucher(),
      includeDisbursement: Boolean(packet.includeDisbursement),
      guidance: packet.guidance || blankEvidenceGuidance(),
    };
  }
  save(raw: ReceiptPacket) {
    const current = this.get(raw?.id);
    const next = editReceiptPacket(current, raw, this.now());
    this.records.put(KIND, next.id, next);
    return next;
  }
  importDisbursement(id: unknown, revision: unknown) {
    const current = this.get(id, revision);
    const next = {
      ...current,
      disbursement: paymentVoucherFromReceipt(current.disbursement, current.voucher),
      revision: current.revision + 1,
      updatedAt: this.now(),
      paymentApproved: false as const,
    };
    this.records.put(KIND, next.id, next);
    return next;
  }
  private sourcePath(id: string, source: PacketSource) {
    if (!['pdf', 'png', 'jpg'].includes(source.extension)) throw new Error('INVALID_INPUT');
    return join(this.root, identifier(id), identifier(source.id) + '.' + source.extension);
  }
  path(id: unknown, sourceId: unknown) {
    const packet = this.get(id);
    const source = packet.documents.find(doc => doc.id === identifier(sourceId));
    if (!source) throw new Error('PACKET_SOURCE_NOT_FOUND');
    return this.sourcePath(packet.id, source);
  }
  async sourceBytes(packet: ReceiptPacket, source: PacketSource) {
    const bytes = await readFile(this.sourcePath(packet.id, source));
    if (bytes.length !== source.bytes || receiptSourceToken(bytes) !== source.sha256) throw new Error('PACKET_SOURCE_CHANGED');
    return bytes;
  }
  async assertDestination(packet: ReceiptPacket, destination: string) {
    const canonical = async (path: string) => {
      const full = await realpath(path).catch(async () =>
        join(await realpath(dirname(path)).catch(() => resolve(dirname(path))), basename(path)),
      );
      return process.platform === 'win32' ? full.toLowerCase() : full;
    };
    const target = await canonical(destination),
      root = await canonical(this.root);
    const inside = relative(root, target);
    if (!inside || (inside !== '..' && !inside.startsWith('..' + sep) && !isAbsolute(inside))) throw new Error('PACKET_EXPORT_SOURCE');
    for (const source of packet.documents) {
      const origin = this.records.get<string>('receipt-packet-origin', source.id);
      if (origin && (await canonical(origin)) === target) throw new Error('PACKET_EXPORT_SOURCE');
    }
  }
  async add(id: unknown, revision: unknown, selected: SelectedSource[], reviewed?: ReviewedReceipt) {
    const current = this.get(id, revision);
    if (!selected.length || current.documents.length + selected.length > PACKET_LIMITS.documents) throw new Error('PACKET_DOCUMENT_LIMIT');
    const hashes = new Set(current.documents.map(doc => doc.sha256));
    const documents: PacketSource[] = [];
    let bytes = current.documents.reduce((sum, doc) => sum + doc.bytes, 0);
    let pages = current.documents.reduce((sum, doc) => sum + doc.pages.length, 0);
    for (const source of selected) {
      if (!['pdf', 'png', 'jpg'].includes(source.extension) || !source.bytes.length || source.bytes.length > PACKET_LIMITS.sourceBytes)
        throw new Error('PACKET_SOURCE_LIMIT');
      bytes += source.bytes.length;
      if (bytes > PACKET_LIMITS.totalBytes) throw new Error('PACKET_SOURCE_LIMIT');
      const hash = receiptSourceToken(source.bytes);
      if (hashes.has(hash)) throw new Error('PACKET_DUPLICATE_SOURCE');
      hashes.add(hash);
      const count = source.extension === 'pdf' ? (await loadPacketPdf(source.bytes)).getPageCount() : 1;
      if ((pages += count) > PACKET_LIMITS.pages) throw new Error('PACKET_PAGE_LIMIT');
      const kind = reviewed?.kind ? packetKind(reviewed.kind) : 'other';
      documents.push({
        id: randomUUID(),
        name: packetText(source.name.split(/[\\/]/).pop() || 'document', 240),
        extension: source.extension as PacketSource['extension'],
        sha256: hash,
        bytes: source.bytes.length,
        pages: Array.from({ length: count }, (_, index) => ({ number: index + 1, kind, included: true, checked: false })),
      });
    }
    if (reviewed) {
      if (selected.length !== 1 || reviewed.checked !== true || reviewed.sourceToken !== documents[0].sha256)
        throw new Error('PACKET_REVIEW_STALE');
      documents[0].reviewedReceipt = {
        comparedAt: this.now(),
        values: {
          recipient: packetText(reviewed.recipient, 200),
          date: packetText(reviewed.date, 80),
          description: packetText(reviewed.description, 1200),
          total: packetText(reviewed.total, 40),
        },
      };
    }
    const written: string[] = [];
    try {
      await mkdir(join(this.root, current.id), { recursive: true, mode: 0o700 });
      for (let i = 0; i < documents.length; i++) {
        const path = this.sourcePath(current.id, documents[i]);
        await writeFile(path, selected[i].bytes, { flag: 'wx', mode: 0o600 });
        written.push(path);
      }
      // Parsing and disk writes must not overwrite an edit committed while they were running.
      this.get(current.id, current.revision);
      const next: ReceiptPacket = {
        ...current,
        documents: [...current.documents, ...documents],
        disbursement: { ...current.disbursement, checked: false },
        revision: current.revision + 1,
        updatedAt: this.now(),
        paymentApproved: false,
      };
      if (reviewed) {
        next.voucher = { ...current.voucher, checked: false };
        if (!next.voucher.recipient) next.voucher.recipient = reviewed.recipient;
        if (!next.voucher.date) next.voucher.date = reviewed.date;
        if (next.voucher.items.length === 1 && !next.voucher.items[0].description && !next.voucher.items[0].amount)
          next.voucher.items = [{ description: reviewed.description, amount: reviewed.total }];
      }
      const commit = () => {
        documents.forEach((source, index) => {
          if (selected[index].originalPath) this.records.put('receipt-packet-origin', source.id, selected[index].originalPath);
        });
        this.records.put(KIND, next.id, next);
      };
      if (this.records.transaction) this.records.transaction(commit);
      else commit();
      return next;
    } catch (error) {
      await Promise.all(written.map(path => rm(path, { force: true })));
      throw error;
    }
  }
  async remove(id: unknown, revision: unknown, sourceId: unknown) {
    const current = this.get(id, revision);
    const source = current.documents.find(doc => doc.id === identifier(sourceId));
    if (!source) throw new Error('PACKET_SOURCE_NOT_FOUND');
    const next = {
      ...current,
      documents: current.documents.filter(doc => doc.id !== source.id),
      guidance: {
        ...current.guidance,
        extra: current.guidance.extra.map(item => (item.sourceId === source.id ? { ...item, sourceId: '' } : item)),
      },
      disbursement: { ...current.disbursement, checked: false },
      revision: current.revision + 1,
      updatedAt: this.now(),
      paymentApproved: false as const,
    };
    this.records.put(KIND, next.id, next);
    // Only the app-owned copy is removed; the selected original is never modified.
    await rm(this.sourcePath(current.id, source), { force: true });
    return next;
  }
}

/** Preserve page contents and visible annotations while removing interactive actions from copied pages. */
function passivePages(pdf: PDFDocument) {
  try {
    pdf.getForm().flatten({ updateFieldAppearances: false });
  } catch {
    throw new Error('PACKET_PDF_UNREADABLE');
  }
  const cleanField = (dict: PDFDict, seen = new Set<PDFDict>()) => {
    if (seen.has(dict)) return;
    seen.add(dict);
    for (const key of ['A', 'AA', 'OpenAction', 'JS', 'FS', 'RichMediaContent', 'RichMediaSettings']) dict.delete(PDFName.of(key));
    const parent = pdf.context.lookup(dict.get(PDFName.of('Parent')));
    if (parent instanceof PDFDict) cleanField(parent, seen);
  };
  for (const page of pdf.getPages()) {
    page.node.delete(PDFName.of('AA'));
    page.node.delete(PDFName.of('A'));
    const annotations = pdf.context.lookup(page.node.get(PDFName.of('Annots')));
    if (annotations instanceof PDFArray)
      for (let index = 0; index < annotations.size(); index++) {
        const annotation = pdf.context.lookup(annotations.get(index));
        if (annotation instanceof PDFDict) cleanField(annotation);
      }
  }
}

export async function mergePacketPdf(
  cover: Uint8Array,
  voucher: Uint8Array | undefined,
  sources: { source: PacketSource; bytes: Uint8Array }[],
  disbursement?: Uint8Array,
) {
  const output = await PDFDocument.create();
  const append = async (bytes: Uint8Array, indices?: number[]) => {
    const pdf = await loadPacketPdf(bytes);
    passivePages(pdf);
    for (const page of await output.copyPages(pdf, indices || pdf.getPageIndices())) output.addPage(page);
  };
  await append(cover);
  if (voucher) await append(voucher);
  if (disbursement) await append(disbursement);
  for (const { source, bytes } of sources) {
    const pages = source.pages.filter(page => page.included).map(page => page.number - 1);
    if (!pages.length) continue;
    if (source.extension === 'pdf') await append(bytes, pages);
    else {
      const image = source.extension === 'png' ? await output.embedPng(bytes) : await output.embedJpg(bytes);
      if (image.width * image.height > 40_000_000) throw new Error('PACKET_SOURCE_LIMIT');
      const page = output.addPage([595.28, 841.89]);
      const scale = Math.min(555.28 / image.width, 801.89 / image.height);
      const width = image.width * scale,
        height = image.height * scale;
      page.drawImage(image, { x: (595.28 - width) / 2, y: (841.89 - height) / 2, width, height });
    }
  }
  output.setTitle('STeP receipt document packet draft');
  output.setProducer('STeP Desktop');
  return Buffer.from(await output.save());
}
