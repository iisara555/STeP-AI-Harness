import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { Store } from '../electron/store';
import { ReceiptPackets } from '../electron/receipt-packets';
import { receiptPacketCoverHtml } from '../electron/receipt-voucher';
import { blankEvidenceGuidance, evidenceAiPrompt, evidenceChecklist, inferActivity, suggestEvidenceKind } from '../src/afp-evidence';
import { createReceiptPacket, editReceiptPacket, packetAssessment } from '../src/receipt-packet';
import { setLanguage, t } from '../src/i18n';

const now = '2026-10-28T00:00:00Z';
const id = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
const extraId = '33333333-3333-4333-8333-333333333333';
const base = () => createReceiptPacket(id, now);

test('activity suggestions remain editable, preserve ambiguity and never infer a finance category', () => {
  const packet = base();
  packet.title = 'จัดอบรมเชิงปฏิบัติการโดยวิทยากร';
  assert.equal(inferActivity(packet).activity, 'training');
  assert.equal(inferActivity(packet).speaker, true);
  packet.title = 'จัดกิจกรรมอบรมโดยวิทยากร';
  assert.equal(inferActivity(packet).activity, 'training');
  let list = evidenceChecklist(packet);
  assert.deepEqual(
    list.map(item => item.id),
    ['attendance', 'cv', 'privacy', 'certificate'],
  );
  assert.equal(list.find(item => item.id === 'attendance')?.source, 'qp-af-003');
  assert.equal(list.find(item => item.id === 'cv')?.source, 'need-source');
  assert.ok(!list.some(item => item.source === 'afp-circular'));
  packet.title = 'อบรมและประชุม';
  assert.equal(inferActivity(packet).activity, null);
  assert.deepEqual(inferActivity(packet).candidates, ['training', 'meeting']);
  packet.guidance.activity = 'meeting';
  packet.guidance.speaker = 'no';
  assert.equal(inferActivity(packet).activity, 'meeting');
  assert.equal(inferActivity(packet).speaker, false);
  list = evidenceChecklist(packet);
  assert.ok(!list.some(item => item.id === 'cv'));
});

test('AFP category B items apply only to the explicitly chosen scenario, with alternatives left visible', () => {
  const packet = base();
  packet.title = 'ประชุม';
  packet.guidance.finance = 'b_advance';
  assert.deepEqual(
    evidenceChecklist(packet)
      .filter(item => item.source === 'afp-circular')
      .map(item => item.id),
    ['loan', 'request', 'proposal'],
  );
  packet.guidance.finance = 'b_clearance';
  const list = evidenceChecklist(packet).filter(item => item.source === 'afp-circular');
  assert.deepEqual(
    list.map(item => item.id),
    ['request', 'receipt', 'recipient', 'approval'],
  );
  assert.deepEqual(list.find(item => item.id === 'recipient')?.kinds, ['id_copy', 'employee_certificate', 'executive_certificate']);
  assert.equal(packetAssessment(packet).policyVerified, false);
  assert.equal(packetAssessment(packet).paymentApproved, false);
});

test('a filename is only a hint; classification, selected pages and human review determine the evidence state', () => {
  const packet = base();
  packet.title = 'อบรม';
  packet.documents = [
    {
      id: sourceId,
      name: 'FM-AF-015.pdf',
      extension: 'pdf',
      bytes: 30,
      sha256: 'a'.repeat(64),
      pages: [{ number: 1, kind: 'other', included: true, checked: false }],
    },
  ];
  const status = () => evidenceChecklist(packet).find(item => item.id === 'attendance')?.status;
  assert.equal(status(), 'suggested');
  assert.equal(suggestEvidenceKind('FM-AF-015-FM-AF-035.pdf'), null);
  packet.documents[0].pages[0].kind = 'attendance';
  assert.equal(status(), 'unchecked');
  packet.documents[0].pages[0].checked = true;
  assert.equal(status(), 'checked');
  packet.documents[0].pages[0].included = false;
  assert.equal(status(), 'missing');
});

test('the AI handoff contains only fixed categories and states, never case text, filenames, custom labels or receipt data', () => {
  const packet = base();
  packet.title = 'อบรมชื่อทดสอบ PERSON_SECRET 1234567890123';
  packet.project = 'PROJECT_SECRET';
  packet.purpose = 'ชื่อบุคคล PURPOSE_SECRET';
  packet.voucher.recipient = 'RECIPIENT_SECRET';
  packet.guidance.extra = [{ id: extraId, label: 'EXTRA_SECRET', sourceId }];
  packet.documents = [
    {
      id: sourceId,
      name: 'FM-AF-015_FILENAME_SECRET.pdf',
      extension: 'pdf',
      bytes: 10,
      sha256: 'a'.repeat(64),
      pages: [{ number: 1, kind: 'other', included: true, checked: false }],
    },
  ];
  const prompt = evidenceAiPrompt(packet);
  assert.match(prompt, /อบรม \/ workshop/);
  for (const secret of [
    'PERSON_SECRET',
    '1234567890123',
    'PROJECT_SECRET',
    'PURPOSE_SECRET',
    'RECIPIENT_SECRET',
    'EXTRA_SECRET',
    'FILENAME_SECRET',
  ])
    assert.ok(!prompt.includes(secret), secret);
  assert.match(prompt, /ชื่อไฟล์ชวนให้ตรวจ ยังไม่ยืนยัน/);
});

test('English handoff translates the selected finance scenario and preserves reviewed optional context', () => {
  const packet = base();
  packet.title = 'อบรม';
  packet.guidance.finance = 'b_clearance';
  packet.guidance.speaker = 'no';
  setLanguage('en');
  try {
    const prompt = evidenceAiPrompt(packet, t, 'One-day workshop with meals');
    assert.match(prompt, /Category B — advance settlement/);
    assert.match(prompt, /the employee selected no \/ not relevant/);
    assert.match(prompt, /One-day workshop with meals/);
    assert.doesNotMatch(prompt, /[\u0e00-\u0e7f]/);
  } finally {
    setLanguage('th');
  }
});

test('legacy packets migrate additively; custom items persist and losing a linked source clears only that link', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-afp-evidence-'));
  const store = new Store(join(root, 'workspace.sqlite'));
  try {
    const packets = new ReceiptPackets(store, join(root, 'sources'), () => now);
    const legacy = base();
    delete (legacy as Partial<typeof legacy>).guidance;
    store.put('receipt-packet', id, legacy);
    let packet = packets.get(id);
    assert.deepEqual(packet.guidance, blankEvidenceGuidance());
    const pdf = await PDFDocument.create();
    pdf.addPage();
    packet = await packets.add(id, packet.revision, [{ name: 'example.pdf', extension: 'pdf', bytes: Buffer.from(await pdf.save()) }]);
    const addedId = packet.documents[0].id;
    packet.guidance = {
      ...packet.guidance,
      activity: 'training',
      extra: [{ id: extraId, label: 'เอกสารประกอบที่ผู้ใช้กำหนด', sourceId: addedId }],
    };
    packet = packets.save(packet);
    assert.equal(packets.get(id).guidance.extra[0].sourceId, addedId);
    const malformed = structuredClone(packet);
    malformed.guidance.finance = 'b_clearance_invented' as typeof malformed.guidance.finance;
    assert.throws(() => packets.save(malformed), /INVALID_INPUT/);
    packet = await packets.remove(id, packet.revision, addedId);
    assert.equal(packet.guidance.extra[0].label, 'เอกสารประกอบที่ผู้ใช้กำหนด');
    assert.equal(packet.guidance.extra[0].sourceId, '');
    assert.equal(packets.get(id).paymentApproved, false);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('changing activity context invalidates voucher comparison and PDF summary escapes custom labels', () => {
  const packet = base();
  packet.disbursement.checked = true;
  const input = structuredClone(packet);
  input.guidance.activity = 'training';
  input.guidance.extra = [{ id: extraId, label: '<script>synthetic</script>', sourceId: '' }];
  const result = editReceiptPacket(packet, input, now);
  assert.equal(result.disbursement.checked, false);
  const cover = receiptPacketCoverHtml(result, 1, 0, '');
  assert.match(cover, /รายการตรวจตามบริบท/);
  assert.match(cover, /FM-AF-015/);
  assert.ok(!cover.includes('<script>synthetic</script>'));
  assert.match(cover, /&lt;script&gt;synthetic&lt;\/script&gt;/);
});

test('changing selected evidence or its review state invalidates a previous disbursement comparison', () => {
  const packet = base();
  packet.disbursement.checked = true;
  packet.documents = [
    {
      id: sourceId,
      name: 'evidence.pdf',
      extension: 'pdf',
      bytes: 10,
      sha256: 'a'.repeat(64),
      pages: [{ number: 1, kind: 'attendance', included: true, checked: true }],
    },
  ];
  const input = structuredClone(packet);
  input.documents[0].pages[0].included = false;
  assert.equal(editReceiptPacket(packet, input, now).disbursement.checked, false);
  input.documents[0].pages[0].included = true;
  input.documents[0].pages[0].checked = false;
  assert.equal(editReceiptPacket(packet, input, now).disbursement.checked, false);
});
