import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import {
  blankPaymentVoucher,
  editPaymentVoucher,
  paymentVoucherAmounts,
  paymentVoucherAssessment,
  paymentVoucherFromReceipt,
  paymentVoucherSourceStale,
} from '../src/afp-payment-voucher';
import { createReceiptPacket, editReceiptPacket, blankReceiptVoucher, packetAssessment } from '../src/receipt-packet';
import { ReceiptPackets, mergePacketPdf } from '../electron/receipt-packets';
import { Store } from '../electron/store';
import { paymentVoucherDocx, paymentVoucherHtml } from '../electron/afp-payment-voucher';
import { packetIndex, receiptPacketCoverHtml } from '../electron/receipt-voucher';

const id = '11111111-1111-4111-8111-111111111111',
  now = '2026-10-27T00:00:00Z';
function completeVoucher() {
  return {
    ...blankPaymentVoucher(),
    date: '27/10/2569',
    payee: 'Synthetic payee',
    method: 'transfer' as const,
    items: [{ description: 'Synthetic expense', gross: '100.25', withholding: '1.03', deduction: '0.11' }],
  };
}

test('unknown deductions never become zero or an inferred tax rate', () => {
  const voucher = completeVoucher();
  assert.equal(paymentVoucherAmounts(voucher).net, 9911);
  voucher.items[0].withholding = '';
  assert.equal(paymentVoucherAmounts(voucher).gross, 10025);
  assert.equal(paymentVoucherAmounts(voucher).net, null);
  voucher.items[0].withholding = '0.00';
  voucher.items[0].deduction = '0';
  assert.equal(paymentVoucherAmounts(voucher).net, 10025);
  voucher.items = [
    { description: 'A', gross: '1.00', withholding: '1.01', deduction: '0.00' },
    { description: 'B', gross: '20.00', withholding: '0.00', deduction: '0.00' },
  ];
  assert.equal(paymentVoucherAmounts(voucher).invalidRow, true);
  assert.equal(paymentVoucherAmounts(voucher).net, null);
});

test('typed signers and checked data cannot grant payment, policy or controlled-form approval', () => {
  const voucher = { ...completeVoucher(), checked: true, approvedBy: 'Synthetic approver' };
  const assessment = paymentVoucherAssessment(voucher, blankReceiptVoucher());
  assert.equal(assessment.status, 'prepared-for-afp');
  assert.equal(assessment.paymentApproved, false);
  assert.equal(assessment.policyVerified, false);
  assert.equal(assessment.controlledFormVerified, false);
  voucher.date = 'not a date';
  assert.equal(paymentVoucherAssessment(voucher, blankReceiptVoucher()).status, 'needs-review');
  const changed = editPaymentVoucher(voucher, { ...voucher, approvedBy: 'Changed printed name', checked: true, paymentApproved: true });
  assert.equal(changed.checked, false);
  assert.ok(!Object.hasOwn(changed, 'paymentApproved'));
});

test('receipt import preserves clerical edits and flags stale or mismatched source facts', () => {
  const receipt = {
    ...blankReceiptVoucher(),
    recipient: 'Source payee',
    checked: true,
    items: [{ description: 'Source expense', amount: '100.25' }],
  };
  assert.throws(() => paymentVoucherFromReceipt(blankPaymentVoucher(), { ...receipt, checked: false }), /DISBURSEMENT_RECEIPT_UNCHECKED/);
  let draft = paymentVoucherFromReceipt(blankPaymentVoucher(), receipt);
  assert.equal(draft.payee, receipt.recipient);
  assert.equal(draft.date, '');
  assert.equal(draft.items[0].withholding, '');
  assert.equal(draft.checked, false);
  draft = { ...draft, ...completeVoucher(), payee: receipt.recipient, sourceReceipt: draft.sourceReceipt, checked: true };
  receipt.items[0].amount = '101.00';
  assert.equal(paymentVoucherSourceStale(draft, receipt), true);
  const refreshed = paymentVoucherFromReceipt(draft, receipt);
  assert.equal(refreshed.items[0].gross, '100.25', 'manual financial entries are not overwritten');
  assert.equal(refreshed.items[0].withholding, '1.03');
  assert.equal(refreshed.checked, false);
  assert.ok(paymentVoucherAssessment(refreshed, receipt).missing.includes('receipt-values-differ'));
  const forged = editPaymentVoucher(refreshed, { ...refreshed, sourceReceipt: { recipient: 'forged', items: [] } });
  assert.deepEqual(forged.sourceReceipt, refreshed.sourceReceipt);
});

test('case and receipt edits invalidate the new document comparison', () => {
  const packet = createReceiptPacket(id, now);
  packet.disbursement = { ...completeVoucher(), checked: true };
  const renamed = editReceiptPacket(packet, { ...packet, project: 'New project' }, now);
  assert.equal(renamed.disbursement.checked, false);
  packet.voucher = {
    ...blankReceiptVoucher(),
    recipient: 'Synthetic payee',
    checked: true,
    items: [{ description: 'Synthetic expense', amount: '100.25' }],
  };
  packet.disbursement = { ...paymentVoucherFromReceipt(packet.disbursement, packet.voucher), checked: true };
  const next = structuredClone(packet);
  next.voucher.items[0].amount = '200.00';
  const changed = editReceiptPacket(packet, next, now);
  assert.equal(changed.voucher.checked, false);
  assert.equal(changed.disbursement.checked, false);
  changed.includeDisbursement = true;
  assert.ok(packetAssessment(changed).missing.includes('disbursement-review'));
});

test('legacy packet v1 records load new blank fields without erasing existing data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-pv-legacy-')),
    store = new Store(join(root, 'records.sqlite'));
  try {
    const legacy: any = createReceiptPacket(id, now);
    delete legacy.disbursement;
    delete legacy.includeDisbursement;
    store.put('receipt-packet', id, legacy);
    const packets = new ReceiptPackets(store, join(root, 'sources'));
    let loaded = packets.get(id);
    assert.deepEqual(loaded.disbursement, blankPaymentVoucher());
    assert.equal(loaded.includeDisbursement, false);
    loaded.disbursement = completeVoucher();
    loaded = packets.save(loaded);
    const oldClient = { ...loaded } as any;
    delete oldClient.disbursement;
    delete oldClient.includeDisbursement;
    assert.equal(packets.save(oldClient).disbursement.payee, 'Synthetic payee');
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Word uses native editable cells and blank signing areas without inventing a controlled form number', async () => {
  const packet = createReceiptPacket(id, now);
  packet.disbursement = completeVoucher();
  const zip = await JSZip.loadAsync(await paymentVoucherDocx(packet));
  const body = await zip.file('word/document.xml')!.async('string');
  assert.match(body, /ร่างใบสำคัญจ่ายสำหรับ AFP ตรวจ/);
  assert.match(body, /รอ AFP ออกเลข/);
  assert.match(body, /ผู้ตรวจสอบ/);
  assert.match(body, /w:tblHeader/);
  assert.match(body, /w:cantSplit/);
  assert.match(body, /th-TH/);
  assert.equal(Object.keys(zip.files).filter(name => name.endsWith('.odttf')).length, 4);
  assert.ok(!Object.keys(zip.files).some(name => name.startsWith('word/media/')));
  packet.disbursement.note = '<script>private</script>';
  packet.disbursement.items[0].description = '<img src="https://example.test/data">';
  const html = paymentVoucherHtml(packet, '');
  assert.ok(!html.includes('<script>') && !html.includes('<img'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /default-src 'none'/);
});

test('combined PDF and index place the AFP draft between receipt form and source pages', async () => {
  const bytes = async (width: number) => {
    const pdf = await PDFDocument.create();
    pdf.addPage([width, 500]);
    return pdf.save();
  };
  const packet = createReceiptPacket(id, now);
  packet.includeDisbursement = true;
  packet.documents = [
    {
      id,
      name: 'source.pdf',
      extension: 'pdf',
      sha256: '',
      bytes: 1,
      pages: [{ number: 1, included: true, checked: false, kind: 'invoice_or_quotation' }],
    },
  ];
  const merged = await PDFDocument.load(
    await mergePacketPdf(await bytes(595), await bytes(400), [{ source: packet.documents[0], bytes: await bytes(300) }], await bytes(450)),
  );
  assert.deepEqual(
    merged.getPages().map(page => page.getWidth()),
    [595, 400, 450, 300],
  );
  assert.equal(packetIndex(packet, 1, 1, 1)[0].outputPages, '4');
  assert.match(receiptPacketCoverHtml(packet, 1, 1, '', 1), /ร่างใบสำคัญจ่ายสำหรับ AFP อยู่หน้า 3/);
});
