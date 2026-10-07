import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPolicy } from '../electron/policy';
import { receiptReadingMode } from '../electron/receipt-status';

test('receipt reading capabilities distinguish text-only Antigravity from Gemini image input', () => {
  const policy = defaultPolicy();
  assert.deepEqual(receiptReadingMode(policy, 'antigravity'), { vision: false, textOnly: true });
  assert.deepEqual(receiptReadingMode(policy, 'gemini'), { vision: true, textOnly: false });
  for (const provider of ['compatible', 'copilot'])
    assert.deepEqual(receiptReadingMode(policy, provider), { vision: false, textOnly: true });
  policy.checks.privacy = true;
  assert.deepEqual(receiptReadingMode(policy, 'gemini'), { vision: false, textOnly: true });
  policy.features.receiptVision = false;
  policy.checks.privacy = false;
  assert.deepEqual(receiptReadingMode(policy, 'gemini'), { vision: false, textOnly: true });
});
