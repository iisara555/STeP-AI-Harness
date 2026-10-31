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

test('receipts go to the employee AI by default; local-only and the organization service need explicit policy', () => {
  const cloud = { url: 'https://ocr.example.test', model: 'gemini-3.8-flash' };
  assert.equal(defaultPolicy().receiptLocalOnly, false);
  assert.equal(defaultPolicy().receiptCloud, undefined);
  for (const raw of [{}, { receiptCloud: cloud }]) {
    const { policy, problems } = parsePolicy(raw);
    assert.deepEqual(problems, []);
    assert.equal(policy.receiptLocalOnly, false);
    // An organization service is never a default recipient; it needs receiptLocalOnly: false as well.
    assert.equal(policy.receiptCloud, undefined);
    assert.deepEqual(receiptReadingMode(policy, 'gemini'), { vision: true, textOnly: false });
    assert.deepEqual(receiptReadingMode(policy, 'antigravity'), { vision: true, textOnly: false });
  }
  assert.deepEqual(parsePolicy({ receiptLocalOnly: false, receiptCloud: cloud }).policy.receiptCloud, cloud);
  for (const raw of [{ receiptLocalOnly: true }, { receiptLocalOnly: true, receiptCloud: cloud }, { receiptLocalOnly: 'false' }]) {
    const { policy } = parsePolicy(raw);
    assert.equal(policy.receiptLocalOnly, true);
    assert.equal(policy.receiptCloud, undefined);
    for (const provider of [undefined, 'gemini', 'openai', 'antigravity'])
      assert.deepEqual(receiptReadingMode(policy, provider), { vision: false, textOnly: false });
  }
});
