import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReceiptOperations } from '../electron/receipt-operations';

test('selecting a receipt reserves the workflow while its dialog is open', async () => {
  const operations = new ReceiptOperations();
  let release!: () => void;
  const dialog = new Promise<void>(resolve => {
    release = resolve;
  });
  const read = operations.run(async () => {
    await dialog;
    return 'synthetic receipt';
  });
  let calls = 0;
  for (const operation of ['read', 'vision', 'filter'])
    await assert.rejects(
      operations.run(async () => {
        calls++;
        return operation;
      }),
      /RUN_LIMIT/,
    );
  assert.equal(calls, 0);
  release();
  assert.equal(await read, 'synthetic receipt');
  assert.equal(await operations.run(async () => 'next receipt'), 'next receipt');
});

test('policy cancellation rejects a late receipt result and retains the claim until work settles', async () => {
  const operations = new ReceiptOperations();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let aborted = false;
  const read = operations.run(async signal => {
    signal.addEventListener(
      'abort',
      () => {
        aborted = true;
      },
      { once: true },
    );
    await gate;
    return 'old policy result';
  });
  operations.cancel();
  assert.equal(aborted, true);
  await assert.rejects(
    operations.run(async () => 'overlapping receipt'),
    /RUN_LIMIT/,
  );
  release();
  await assert.rejects(read, /CANCELLED/);
  assert.equal(await operations.run(async () => 'new policy result'), 'new policy result');
});

test('a rejected receipt operation releases its claim for retry', async () => {
  const operations = new ReceiptOperations();
  await assert.rejects(
    operations.run(async () => {
      throw new Error('OCR_FAILED');
    }),
    /OCR_FAILED/,
  );
  assert.equal(await operations.run(async () => 'retry'), 'retry');
});
