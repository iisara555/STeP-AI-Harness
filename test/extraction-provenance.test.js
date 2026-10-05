import test from 'node:test';
import assert from 'node:assert/strict';
import { createProvenanceRecord, STANDARD_PROVENANCE_TYPES } from '../src/modules/provenance/index.js';

test('unverified extraction requires a traceable source and never implies a fact', () => {
  assert.ok(STANDARD_PROVENANCE_TYPES.includes('EXTRACTED_UNVERIFIED'));
  assert.throws(() => createProvenanceRecord({ type: 'EXTRACTED_UNVERIFIED', value: '107.00' }), /requires sourceRef/);
  const record = createProvenanceRecord({ type: 'EXTRACTED_UNVERIFIED', value: '107.00', sourceRef: 'RECEIPT-SYN-01', sourceLocation: 'page 1' });
  assert.equal(record.type, 'EXTRACTED_UNVERIFIED');
  assert.equal(record.sourceRef, 'RECEIPT-SYN-01');
});
