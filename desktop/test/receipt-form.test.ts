import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyReceiptForm, receiptFormReducer } from '../src/receipt-form';

function loaded(sourceId = 'synthetic-a') {
  return receiptFormReducer(emptyReceiptForm, {
    type: 'load',
    sourceId,
    values: { merchant: 'ร้านตัวอย่าง', total: '107.00' },
    guessed: { merchant: 'ocr' },
    description: 'รายการตัวอย่าง',
  });
}

test('late AI readings preserve manual fields and description, including an intentional blank', () => {
  let state = loaded();
  state = receiptFormReducer(state, { type: 'edit', field: 'merchant', value: 'ชื่อที่ตรวจจากต้นฉบับ' });
  state = receiptFormReducer(state, { type: 'edit', field: 'date', value: '' });
  state = receiptFormReducer(state, { type: 'describe', value: 'รายการที่ผู้ใช้แก้' });
  state = receiptFormReducer(state, {
    type: 'suggest',
    sourceId: 'synthetic-a',
    origin: 'vision',
    values: { merchant: 'ชื่อที่ AI อ่าน', date: '01/01/2569', receiptNumber: '001' },
    description: 'รายการจาก AI',
  });
  assert.equal(state.values.merchant, 'ชื่อที่ตรวจจากต้นฉบับ');
  assert.equal(state.values.date, '');
  assert.equal(state.values.receiptNumber, '001');
  assert.equal(state.description.value, 'รายการที่ผู้ใช้แก้');
  assert.equal(state.origins.merchant, 'manual');
  assert.equal(state.origins.receiptNumber, 'vision');
  assert.equal(state.guessed.merchant, undefined);
  assert.equal(state.guessed.receiptNumber, 'ai');
});

test('candidate filtering cannot overwrite a manual correction and new AI values require review', () => {
  let state = receiptFormReducer(loaded(), { type: 'edit', field: 'total', value: '808.00' });
  state = receiptFormReducer(state, { type: 'check', checked: true });
  state = receiptFormReducer(state, {
    type: 'suggest',
    sourceId: 'synthetic-a',
    origin: 'ai-candidate-filter',
    values: { total: '107.00', receiptNumber: '002' },
  });
  assert.equal(state.values.total, '808.00');
  assert.equal(state.origins.total, 'manual');
  assert.equal(state.origins.receiptNumber, 'ai-candidate-filter');
  assert.equal(state.checked, false);
});

test('a result from a different receipt cannot change values, origins or confirmation', () => {
  const state = receiptFormReducer(loaded('synthetic-b'), { type: 'check', checked: true });
  const after = receiptFormReducer(state, {
    type: 'suggest',
    sourceId: 'synthetic-a',
    origin: 'vision',
    values: { total: '999.00' },
    description: 'รายการจากใบเสร็จเก่า',
  });
  assert.strictEqual(after, state);
});

test('loading a new receipt resets previous edits and confirmation without sharing mutable state', () => {
  let state = receiptFormReducer(loaded(), { type: 'describe', value: 'รายการที่แก้' });
  state = receiptFormReducer(state, { type: 'check', checked: true });
  state = receiptFormReducer(state, {
    type: 'load',
    sourceId: 'synthetic-b',
    values: { total: '200.00' },
    guessed: {},
    description: '',
  });
  assert.equal(state.values.merchant, undefined);
  assert.deepEqual(state.values, { total: '200.00' });
  assert.equal(state.checked, false);
  assert.equal(state.description.edited, false);
  assert.deepEqual(emptyReceiptForm.values, {});
});
