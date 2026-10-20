import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPolicy } from '../electron/policy';
import { receiptReadingMode, receiptGeminiConnection } from '../electron/receipt-status';
import type { Connection } from '../src/types';

test('receipt Gemini API selection is independent of chat and excludes unavailable or custom profiles', () => {
  const api = { id: 'ocr', provider: 'gemini', mode: 'api', model: 'gemini-3.8-flash', ready: true } as Connection;
  const chat = { id: 'chat', provider: 'antigravity', mode: 'subscription', ready: true } as Connection;
  assert.equal(receiptGeminiConnection([chat, api], chat.id)?.id, api.id);
  const second = { ...api, id: 'other' };
  assert.equal(receiptGeminiConnection([api, second], second.id)?.id, second.id);
  for (const bad of [
    { ready: false },
    { customRuntime: true },
    { policyBlocked: true },
    { mode: 'subscription' },
    { model: 'not-a-gemini-model' },
  ])
    assert.equal(receiptGeminiConnection([{ ...api, ...bad } as Connection]), undefined);
});

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
