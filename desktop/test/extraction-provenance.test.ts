import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receiptProvenance } from '../src/extraction-provenance';
import { ocrAttachmentReport, ocrAttachmentSource } from '../electron/ocr-attachment';
import { receiptSourceText } from '../src/receipt-source';

test('expense descriptions keep source comparison separate from a suggested claim category', () => {
  const draft = receiptProvenance({
    source_id: 'SYN-DESC',
    fields: {},
    expense_description: { value: 'ค่าน้ำดื่ม', checked: true, input_origin: 'vision' },
    vision_check: { fields: {}, expense_description: { value: 'ค่าน้ำดื่ม' } },
    compliance: { category_suggestion: { code: 'B10', provenance: 'AI_RECOMMENDATION' } },
  });
  assert.equal(draft.expense_description.provenance, 'SOURCE_FACT');
  assert.equal(draft.expense_description.verification, 'human-source-comparison');
  assert.equal(draft.vision_check.expense_description.provenance, 'EXTRACTED_UNVERIFIED');
  assert.equal(draft.compliance.category_suggestion.provenance, 'AI_RECOMMENDATION');
  assert.equal(
    receiptProvenance({ ...draft, expense_description: { ...draft.expense_description, value: 'ค่าหนังสือ' } }).expense_description
      .provenance,
    'EXTRACTED_UNVERIFIED',
  );
  assert.equal(receiptProvenance({ ...draft, source_id: 'SYN-OTHER' }).expense_description.provenance, 'EXTRACTED_UNVERIFIED');
});

test('only the checked selected value becomes SOURCE_FACT, alternatives remain unverified', () => {
  const draft = {
    source_id: 'SYN-01',
    fields: { total: { value: '107.00', checked: true, input_origin: 'vision' } },
    afp_mapping: {
      fields: { total: { selected_value: '107.00', candidates: [{ value: '108.00', engine: 'paddle' }] } },
      unresolved_field_lines: [{ text: 'ยอดอื่น 109.00', page: 1 }],
    },
    ocr: { text: 'ยอดรวม 108.00', lines: [{ text: 'ยอดรวม 108.00', page: 1 }] },
    vision_check: { fields: { total: { ai_value: '107.00', match: 'agree' } } },
  };
  const result = receiptProvenance(draft);
  assert.equal(result.fields.total.provenance, 'SOURCE_FACT');
  assert.equal(result.fields.total.verification, 'human-source-comparison');
  assert.equal(result.afp_mapping.fields.total.candidates[0].provenance, 'EXTRACTED_UNVERIFIED');
  assert.equal(result.vision_check.fields.total.provenance, 'EXTRACTED_UNVERIFIED');
  assert.equal(result.ocr.provenance, 'EXTRACTED_UNVERIFIED');
  assert.equal(result.ocr.lines[0].provenance, 'EXTRACTED_UNVERIFIED');
  assert.equal(draft.fields.total.checked, true);
  assert.ok(!('provenance' in draft.fields.total), 'do not mutate evidence');
  assert.deepEqual(receiptProvenance(JSON.parse(JSON.stringify(result))), result);
  const edited = JSON.parse(JSON.stringify(result));
  edited.fields.total.value = '108.00';
  assert.equal(
    receiptProvenance(edited).fields.total.provenance,
    'EXTRACTED_UNVERIFIED',
    'a persisted confirmation is bound to the exact checked value',
  );
  const otherDocument = JSON.parse(JSON.stringify(result));
  otherDocument.source_id = 'SYN-02';
  assert.equal(receiptProvenance(otherDocument).fields.total.provenance, 'EXTRACTED_UNVERIFIED');
});

test('manual input is USER_INPUT until compared; an edit revokes verification even if old metadata says fact', () => {
  const result = receiptProvenance({
    fields: {
      total: {
        value: '108.00',
        checked: false,
        input_origin: 'manual',
        provenance: 'SOURCE_FACT',
        verification: 'human-source-comparison',
      },
      vat: { value: '7.00', checked: false, input_origin: 'ai-candidate-filter' },
      subtotal: { value: '100.00', checked: 'yes' },
    },
  });
  assert.equal(result.fields.total.provenance, 'USER_INPUT');
  assert.equal(result.fields.total.verification, null);
  assert.equal(result.fields.vat.provenance, 'EXTRACTED_UNVERIFIED');
  assert.equal(result.fields.subtotal.provenance, 'EXTRACTED_UNVERIFIED');
});

test('legacy JSON remains readable and handoff instructs the model to preserve extraction uncertainty', () => {
  const result = receiptProvenance({ fields: { total: { value: '107.00' } } });
  assert.equal(result.fields.total.provenance, 'EXTRACTED_UNVERIFIED');
  assert.ok(result.fields.total.sourceRef);
  const text = receiptSourceText(result);
  assert.match(text, /EXTRACTED_UNVERIFIED/);
  assert.match(text, /confirmation does not approve/);
});

test('ordinary OCR attachments remain unverified despite transmission consent', () => {
  const result: any = ocrAttachmentReport({ text: 'ยอดรวม 107.00', pages: [{ text: 'ยอดรวม 107.00' }] }, text => ({ redactedText: text }));
  assert.equal(result.provenance, 'EXTRACTED_UNVERIFIED');
  assert.equal(result.verification, null);
  assert.match(ocrAttachmentSource(result, 'attachment:SYN-01'), /EXTRACTED_UNVERIFIED — attachment:SYN-01/);
  assert.match(ocrAttachmentSource(result, 'attachment:SYN-01'), /Transmission consent is not value verification/);
});

test('saving an unchecked draft never claims a person has already verified its OCR', () => {
  const result = receiptProvenance({
    notice: 'OCR suggestions checked by a person. This is not a reimbursement approval.',
    fields: { total: { value: '107.00', checked: false } },
  });
  assert.equal(result.fields.total.provenance, 'EXTRACTED_UNVERIFIED');
  assert.doesNotMatch(result.notice, /suggestions checked by a person/);
  assert.match(result.notice, /selected values/);
});

test('successful independent re-reading does not verify either reading or extracted table rows', () => {
  const result = receiptProvenance({
    source_id: 'SYN-RECHECK',
    fields: { total: { value: '107.00', checked: true } },
    vision_check: {
      fields: { total: { value: '107.00', confidence: 1 } },
      items: [{ description: 'สินค้าสังเคราะห์', amount: '100.00', provenance: 'SOURCE_FACT' }],
      recheck: {
        failed: false,
        changedFields: ['total'],
        first: { fields: { total: { value: '170.00', provenance: 'SOURCE_FACT' } }, items: [{ amount: '100.00' }] },
      },
    },
  });
  assert.equal(result.fields.total.provenance, 'SOURCE_FACT');
  assert.equal(result.vision_check.recheck.first.fields.total.provenance, 'EXTRACTED_UNVERIFIED');
  assert.equal(result.vision_check.recheck.first.items[0].provenance, 'EXTRACTED_UNVERIFIED');
  assert.equal(result.vision_check.items[0].provenance, 'EXTRACTED_UNVERIFIED');
  assert.deepEqual(receiptProvenance(result), result);
});

test('single human confirmation verifies a visible signature observation, never raw AI signature readings', () => {
  const draft = receiptProvenance({
    source_id: 'SYN-SIGNATURE',
    fields: {},
    signature_observations: { receiver: { value: 'present', checked: true, input_origin: 'vision' } },
    vision_check: {
      fields: {},
      signatures: { receiver: { status: 'present', confidence: 1, provenance: 'SOURCE_FACT' } },
      recheck: { first: { fields: {}, signatures: { receiver: { status: 'absent' } } } },
    },
  });
  assert.equal(draft.signature_observations.receiver.provenance, 'SOURCE_FACT');
  assert.equal(draft.vision_check.signatures.receiver.provenance, 'EXTRACTED_UNVERIFIED');
  assert.equal(draft.vision_check.recheck.first.signatures.receiver.provenance, 'EXTRACTED_UNVERIFIED');
  assert.equal(receiptProvenance({ ...draft, source_id: 'SYN-OTHER' }).signature_observations.receiver.provenance, 'EXTRACTED_UNVERIFIED');
  assert.match(receiptSourceText(draft), /signature.*presence/i);
  assert.equal(
    receiptProvenance({ fields: {}, signature_observations: { receiver: { value: 'uncertain', checked: true } } }).signature_observations
      .receiver.provenance,
    'EXTRACTED_UNVERIFIED',
  );
});
