import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPolicy, parsePolicy } from '../electron/policy';
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

test('receipt reading capabilities: Gemini and Antigravity read images, compatible and Copilot get text', () => {
  const policy = defaultPolicy();
  policy.receiptLocalOnly = false;
  assert.deepEqual(receiptReadingMode(policy, 'antigravity'), { vision: true, textOnly: false });
  assert.deepEqual(receiptReadingMode(policy, 'gemini'), { vision: true, textOnly: false });
  for (const provider of ['compatible', 'copilot'])
    assert.deepEqual(receiptReadingMode(policy, provider), { vision: false, textOnly: true });
  policy.checks.privacy = true;
  assert.deepEqual(receiptReadingMode(policy, 'gemini'), { vision: false, textOnly: true });
  policy.features.receiptVision = false;
  policy.checks.privacy = false;
  assert.deepEqual(receiptReadingMode(policy, 'gemini'), { vision: false, textOnly: true });
});

test('receipt OCR defaults to local processing without image or text model calls, including existing API accounts', () => {
  assert.equal(defaultPolicy().receiptLocalOnly, true);
  for (const raw of [{}, { receiptCloud: { url: 'https://ocr.example.test', model: 'gemini-3.8-flash' } }, { receiptLocalOnly: 'false' }]) {
    const { policy } = parsePolicy(raw);
    assert.equal(policy.receiptLocalOnly, true);
    for (const provider of [undefined, 'gemini', 'openai', 'antigravity'])
      assert.deepEqual(receiptReadingMode(policy, provider), { vision: false, textOnly: false });
  }
  const explicit = parsePolicy({ receiptLocalOnly: false });
  assert.deepEqual(explicit.problems, []);
  assert.equal(explicit.policy.receiptLocalOnly, false);
  assert.deepEqual(receiptReadingMode(explicit.policy, 'gemini'), { vision: true, textOnly: false });
});
