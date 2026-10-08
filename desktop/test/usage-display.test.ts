import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatUsd, usageSourceName } from '../src/usage-display';

test('USD display retains small costs while normal amounts use two decimals', () => {
  assert.equal(formatUsd(0), '0.00');
  assert.equal(formatUsd(12.345), '12.35');
  assert.equal(formatUsd(0.01), '0.01');
  assert.equal(formatUsd(0.0099), '0.0099');
  assert.equal(formatUsd(0.0001), '0.0001');
  assert.equal(formatUsd(-0.0025), '-0.0025');
  assert.equal(formatUsd(NaN), '—');
});

test('usage sources name providers without presenting unknown backend codes as providers', () => {
  assert.equal(usageSourceName('codex'), 'ChatGPT');
  assert.equal(usageSourceName('claude'), 'Claude');
  assert.equal(usageSourceName('copilot'), 'GitHub Copilot');
  assert.equal(usageSourceName('openrouter'), 'OpenRouter');
  assert.equal(usageSourceName('deepseek'), 'DeepSeek');
  assert.equal(usageSourceName('unknown-runtime'), '—');
  assert.equal(usageSourceName('constructor'), '—');
});
