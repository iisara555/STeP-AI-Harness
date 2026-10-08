import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readReceiptVision } from '../electron/receipt-vision-recheck';

const reply = (total: string) =>
  JSON.stringify({
    fields: { subtotal: { value: '100.00' }, vat: { value: '7.00' }, total: { value: total } },
    amountInWords: 'หนึ่งร้อยเจ็ดบาทถ้วน',
  });
test('a contradictory amount is read independently once more and changed readings stay flagged', async () => {
  const prompts: unknown[] = [];
  const result = await readReceiptVision(async focus => {
    prompts.push(focus);
    return reply(prompts.length === 1 ? '170.00' : '107.00');
  });
  assert.equal(prompts.length, 2);
  assert.equal(result.fields.total?.value, '107.00');
  assert.equal(result.fields.total?.needsReview, true);
  assert.equal(result.recheck?.first.fields.total?.value, '170.00');
  assert.deepEqual(result.recheck?.changedFields, ['total']);
});
test('matching readings need one call; permanent contradiction never loops or calculates a replacement', async () => {
  let calls = 0;
  const clean = await readReceiptVision(async () => {
    calls++;
    return reply('107.00');
  });
  assert.equal(calls, 1);
  assert.equal(clean.recheck, undefined);
  calls = 0;
  const bad = await readReceiptVision(async () => {
    calls++;
    return reply('170.00');
  });
  assert.equal(calls, 2);
  assert.equal(bad.fields.total?.value, '170.00');
});

test('a recheck receives field coordinates without previous numeric answers', async () => {
  let calls = 0;
  let received: unknown;
  const region = { page: 1, x: 0.5, y: 0.7, width: 0.4, height: 0.1 };
  await readReceiptVision(async (focus, regions) => {
    if (++calls === 1) return JSON.stringify({ fields: { subtotal: '100', vat: '7', total: { value: '170', region } } });
    received = { focus, regions };
    return reply('107.00');
  });
  assert.equal(calls, 2);
  assert.deepEqual(received, { focus: ['subtotal', 'vat', 'total'], regions: [region] });
});
test('a failed recheck keeps its first unverified reading but cancellation never publishes it', async () => {
  let calls = 0;
  const result = await readReceiptVision(async () => {
    if (++calls === 2) throw new Error('synthetic quota failure');
    return reply('170.00');
  });
  assert.equal(result.recheck?.failed, true);
  assert.equal(result.fields.total?.needsReview, true);
  const controller = new AbortController();
  calls = 0;
  await assert.rejects(
    readReceiptVision(async () => {
      if (++calls === 2) {
        controller.abort();
        throw new Error('stopped');
      }
      return reply('170.00');
    }, controller.signal),
  );
});
