import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import JSZip from 'jszip';
import { Store } from '../electron/store';
import { ReceiptPackets, receiptSourceToken, mergePacketPdf } from '../electron/receipt-packets';
import { receiptVoucherDocx, receiptVoucherHtml, receiptPacketCoverHtml, packetIndex } from '../electron/receipt-voucher';
import { documentPrintFontCss } from '../electron/document-fonts';
import {
  blankReceiptVoucher,
  createReceiptPacket,
  editReceiptPacket,
  moneySatang,
  voucherTotal,
  thaiBahtWords,
  packetAssessment,
} from '../src/receipt-packet';
import { classifyFromText, parseDocumentType } from '../src/receipt-compliance';
import { receiptAssessment } from '../src/receipt-workflow';

const id = '11111111-1111-4111-8111-111111111111';
const now = '2026-10-27T00:00:00Z';
async function pdfBytes(widths = [301, 302, 303]) {
  const pdf = await PDFDocument.create();
  for (const width of widths) pdf.addPage([width, 500]);
  return Buffer.from(await pdf.save());
}
async function fixture(action: (packets: ReceiptPackets, root: string, store: Store) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'step-packet-unit-'));
  const store = new Store(join(root, 'workspace.sqlite'));
  try {
    await action(new ReceiptPackets(store, join(root, 'sources'), () => now), root, store);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
}

test('FM-AF-014 and disbursement vouchers are distinct, including legacy persisted readings', () => {
  assert.equal(classifyFromText('ใบสำคัญรับเงิน FM-AF-014'), 'receipt_voucher');
  assert.equal(classifyFromText('ใบสำคัญจ่าย Payment Voucher'), 'disbursement_voucher');
  assert.equal(parseDocumentType('payment_voucher'), 'receipt_voucher');
  const assessment = receiptAssessment({ type: 'disbursement_voucher', values: {}, items: [], hasRuleWarnings: false, checked: true });
  assert.equal(assessment.status, 'needs-document');
  assert.equal(assessment.paymentApproved, false);
});

test('satang arithmetic and Thai words do not round or silently accept malformed amounts', () => {
  for (const invalid of ['1,00', '1e3', '-2', '0.001', 'Infinity', '100บาท', '', '1,234,56'])
    assert.equal(moneySatang(invalid), null, invalid);
  assert.equal(moneySatang('๑,๒๓๔.๕๐'), 123450);
  const voucher = blankReceiptVoucher();
  voucher.items = [
    { description: 'Synthetic item A', amount: '0.10' },
    { description: 'Synthetic item B', amount: '0.20' },
  ];
  assert.equal(voucherTotal(voucher), 30);
  assert.equal(thaiBahtWords(30), 'ศูนย์บาทสามสิบสตางค์');
  assert.equal(thaiBahtWords(2101), 'ยี่สิบเอ็ดบาทหนึ่งสตางค์');
  assert.equal(thaiBahtWords(10100), 'หนึ่งร้อยเอ็ดบาทถ้วน');
  assert.equal(thaiBahtWords(100000100), 'หนึ่งล้านเอ็ดบาทถ้วน');
  voucher.items.push({ description: 'Missing amount', amount: '' });
  assert.equal(voucherTotal(voucher), null);
});

test('editing clears source comparison and renderer payloads cannot invent source metadata or approval', () => {
  const packet = createReceiptPacket(id, now);
  packet.voucher.checked = true;
  packet.documents = [
    {
      id,
      name: 'original.pdf',
      extension: 'pdf',
      sha256: 'a'.repeat(64),
      bytes: 10,
      pages: [{ number: 1, kind: 'receipt', checked: true, included: true }],
    },
  ];
  const input = structuredClone(packet);
  input.voucher.recipient = 'Synthetic recipient';
  input.documents[0].name = 'forged.pdf';
  input.documents[0].sha256 = 'b'.repeat(64);
  input.documents[0].pages[0].kind = 'transfer_slip';
  (input as any).paymentApproved = true;
  const next = editReceiptPacket(packet, input, now);
  assert.equal(next.voucher.checked, false);
  assert.equal(next.documents[0].pages[0].checked, false);
  assert.equal(next.documents[0].name, 'original.pdf');
  assert.equal(next.documents[0].sha256, 'a'.repeat(64));
  assert.equal(next.paymentApproved, false);
  input.documents[0].pages[0].number = 2;
  assert.throws(() => editReceiptPacket(packet, input, now), /INVALID_INPUT/);
  assert.throws(() => editReceiptPacket(next, packet, now), /PACKET_CONFLICT/);
  assert.equal(packetAssessment(next).policyVerified, false);
});

test('snapshots survive original edits and restart, reject duplicates, path injection and overwriting originals', async () =>
  fixture(async (packets, root, store) => {
    const bytes = await pdfBytes(),
      original = join(root, 'original.pdf');
    await writeFile(original, bytes);
    let packet = packets.create();
    packet = await packets.add(packet.id, packet.revision, [{ name: 'original.pdf', extension: 'pdf', bytes, originalPath: original }]);
    const source = packet.documents[0];
    const restarted = new ReceiptPackets(store, join(root, 'sources'));
    assert.equal(restarted.get(packet.id).documents[0].pages.length, 3);
    await assert.rejects(
      packets.add(packet.id, packet.revision, [{ name: 'renamed.pdf', extension: 'pdf', bytes }]),
      /PACKET_DUPLICATE_SOURCE/,
    );
    await assert.rejects(packets.assertDestination(packet, original), /PACKET_EXPORT_SOURCE/);
    await assert.rejects(packets.assertDestination(packet, packets.path(packet.id, source.id)), /PACKET_EXPORT_SOURCE/);
    assert.throws(() => packets.get('../elsewhere'), /INVALID_INPUT/);
    await writeFile(original, 'changed original');
    assert.deepEqual(await packets.sourceBytes(packet, source), bytes);
    await writeFile(packets.path(packet.id, source.id), 'tampered snapshot');
    await assert.rejects(packets.sourceBytes(packet, source), /PACKET_SOURCE_CHANGED/);
  }));

test('checked OCR reuse binds to snapshot content and preserves manual voucher data', async () =>
  fixture(async packets => {
    const bytes = await pdfBytes(),
      token = receiptSourceToken(bytes);
    let packet = packets.create();
    const review = {
      sourceToken: token,
      checked: true,
      recipient: 'Synthetic payee',
      date: '27/10/2569',
      description: 'Synthetic expense',
      total: '100.25',
      kind: 'receipt' as const,
    };
    await assert.rejects(
      packets.add(packet.id, packet.revision, [{ name: 'test.pdf', extension: 'pdf', bytes }], { ...review, sourceToken: 'wrong' }),
      /PACKET_REVIEW_STALE/,
    );
    packet.voucher.recipient = 'Manual payee';
    packet = packets.save(packet);
    packet = await packets.add(packet.id, packet.revision, [{ name: 'test.pdf', extension: 'pdf', bytes }], review);
    assert.equal(packet.voucher.recipient, 'Manual payee');
    assert.equal(packet.voucher.items[0].amount, '100.25');
    assert.equal(packet.voucher.checked, false);
    assert.equal(packet.documents[0].pages[0].checked, false);
    assert.equal(packet.documents[0].reviewedReceipt?.values.total, '100.25');
    assert.equal(packet.documents[0].sha256, token);
  }));

test('failed batch imports and concurrent edits leave no half-imported source set', async () =>
  fixture(async (packets, root) => {
    const packet = packets.create(),
      bytes = await pdfBytes();
    await assert.rejects(
      packets.add(packet.id, packet.revision, [
        { name: 'good.pdf', extension: 'pdf', bytes },
        { name: 'bad.pdf', extension: 'pdf', bytes: Buffer.from('bad PDF') },
      ]),
      /PACKET_PDF_UNREADABLE/,
    );
    assert.equal(packets.get(packet.id).documents.length, 0);
    const adding = packets.add(packet.id, packet.revision, [{ name: 'pending.pdf', extension: 'pdf', bytes }]);
    packets.save({ ...packet, title: 'Concurrent edit' });
    await assert.rejects(adding, /PACKET_CONFLICT/);
    assert.equal(packets.get(packet.id).title, 'Concurrent edit');
    const entries = await readdir(join(root, 'sources', packet.id));
    assert.deepEqual(entries, []);
  }));

test('PDF assembly retains selected page order and visible annotations without executable actions', async () => {
  const original = await PDFDocument.create();
  for (const width of [301, 302, 303]) original.addPage([width, 500]);
  const action = original.context.obj({ Type: 'Action', S: 'JavaScript', JS: 'app.alert("synthetic")' });
  original.getPages()[0].node.set(PDFName.of('AA'), original.context.obj({ O: action }));
  original
    .getPages()[0]
    .node.set(
      PDFName.of('Annots'),
      original.context.obj([{ Type: 'Annot', Subtype: 'Stamp', Rect: [0, 0, 30, 30], A: action, Contents: 'Synthetic review stamp' }]),
    );
  const bytes = await original.save();
  const source = {
    id,
    name: 'mixed.pdf',
    extension: 'pdf' as const,
    sha256: receiptSourceToken(bytes),
    bytes: bytes.length,
    pages: [1, 2, 3].map(number => ({ number, included: number !== 2, checked: false, kind: 'receipt' as const })),
  };
  const merged = await PDFDocument.load(await mergePacketPdf(await pdfBytes([595]), await pdfBytes([400]), [{ source, bytes }]));
  assert.deepEqual(
    merged.getPages().map(page => page.getWidth()),
    [595, 400, 301, 303],
  );
  assert.equal(merged.getPage(2).node.has(PDFName.of('AA')), false);
  const annotations = merged.getPage(2).node.Annots()!;
  const stamp = merged.context.lookup(annotations.get(0)) as PDFDict;
  assert.equal(stamp.has(PDFName.of('A')), false);
  assert.equal(stamp.get(PDFName.of('Subtype'))?.toString(), '/Stamp');
  const packet = createReceiptPacket(id, now);
  packet.documents = [source];
  assert.equal(packetIndex(packet, 1, 1)[0].outputPages, '3–4');
});

test('native Word template is editable, embeds pinned Thai faces, leaves signatures blank and escapes PDF content', async () => {
  const voucher = blankReceiptVoucher();
  const bytes = await receiptVoucherDocx(voucher),
    zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')!.async('string');
  const footer = await zip.file('word/footer1.xml')!.async('string');
  assert.match(xml, /ใบสำคัญรับเงิน/);
  assert.match(xml, /w:tblHeader/);
  assert.match(xml, /w:cantSplit/);
  assert.match(xml, /w:val="Title"/);
  assert.match(xml, /th-TH/);
  assert.match(footer, /FM-AF-014 V.02/);
  assert.equal(Object.keys(zip.files).filter(name => name.startsWith('word/fonts/') && name.endsWith('.odttf')).length, 4);
  assert.equal(
    Object.keys(zip.files).some(name => name.startsWith('word/media/')),
    false,
  );
  voucher.recipient = '<img src="https://example.test/private">';
  const printable = receiptVoucherHtml(voucher, await documentPrintFontCss());
  assert.ok(!printable.includes('<img'));
  assert.match(printable, /&lt;img/);
  assert.match(printable, /default-src 'none'/);
  const packet = createReceiptPacket(id, now);
  packet.title = '<script>private</script>';
  assert.ok(!receiptPacketCoverHtml(packet, 1, 0, '').includes('<script>'));
});
