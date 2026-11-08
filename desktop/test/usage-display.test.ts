import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatUsd, usageSourceName } from '../src/usage-display';
import {
  accountTokenSummary,
  budgetReading,
  formatResetCountdown,
  inlineQuotaReadings,
  remainingPercentFromUsed,
  usageReadingsFor,
  windowRamp,
} from '../src/usage-readings';

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
  assert.equal(usageSourceName('antigravity'), 'Antigravity');
  assert.equal(usageSourceName('openrouter'), 'OpenRouter');
  assert.equal(usageSourceName('deepseek'), 'DeepSeek');
  assert.equal(usageSourceName('minimax'), 'MiniMax');
  assert.equal(usageSourceName('zai'), 'Z.AI (GLM)');
  assert.equal(usageSourceName('kimi'), 'Kimi (Moonshot AI)');
  assert.equal(usageSourceName('unknown-runtime'), '—');
  assert.equal(usageSourceName('constructor'), '—');
});

test('QuotaReading computes remaining percentages (100 - used), dual-horizon ramps, and reset countdowns', () => {
  assert.equal(remainingPercentFromUsed(35), 65);
  assert.equal(remainingPercentFromUsed(0), 100);
  assert.equal(remainingPercentFromUsed(100), 0);
  assert.equal(windowRamp({ name: 'primary', windowMinutes: 300 }), 'warm');
  assert.equal(windowRamp({ name: 'secondary', windowMinutes: 10080 }), 'cool');
  assert.equal(formatResetCountdown('2026-10-06T15:30:00Z', new Date('2026-10-06T12:00:00Z').getTime()), 'อีก 3 ชม. 30 นาที');

  const account = {
    connectionId: 'synthetic-codex',
    provider: 'openai' as const,
    mode: 'subscription' as const,
    label: 'Synthetic Codex',
    status: 'ok' as const,
    canRefresh: true,
    hasDashboard: true,
    source: 'codex' as const,
    plan: 'plus',
    limits: [
      { name: 'primary', windowMinutes: 300, usedPercent: 35, resetsAt: '2026-10-06T15:00:00Z' },
      { name: 'secondary', windowMinutes: 10080, usedPercent: 85, resetsAt: '2026-10-12T12:00:00Z' },
    ],
    credits: [{ name: 'balance' as const, unit: 'credits' as const, remaining: 12.5, unlimited: false, available: true }],
    spend: [],
  };
  const readings = usageReadingsFor(account, new Date('2026-10-06T12:00:00Z').getTime());
  assert.equal(readings.length, 3);
  assert.equal(readings[0].remainingPercent, 65);
  assert.equal(readings[0].usedPercent, 35);
  assert.equal(readings[0].ramp, 'warm');
  assert.equal(readings[0].tone, 'normal');
  assert.equal(readings[1].remainingPercent, 15);
  assert.equal(readings[1].ramp, 'cool');
  assert.equal(readings[1].tone, 'warn');
  assert.equal(inlineQuotaReadings(account).length, 2);

  const tokens = accountTokenSummary('a', {
    day: '2026-10-06',
    month: '2026-10',
    dailyTokens: 1500,
    monthlyUsd: 0.01,
    unpricedTokens: 0,
    budgets: {},
    warnings: [],
    entries: [
      {
        day: '2026-10-06',
        connectionId: 'a',
        provider: 'openai',
        model: 'gpt-5',
        input: 1200,
        output: 300,
        cachedInput: 400,
        total: 1500,
        usd: 0.01,
        unpricedTokens: 0,
        calls: 2,
      },
    ],
  });
  assert.deepEqual(tokens, { input: 1200, output: 300, cached: 400, total: 1500, usd: 0.01, hasBreakdown: true });

  const dailyBudget = budgetReading('dailyTokens', {
    day: '2026-10-06',
    month: '2026-10',
    dailyTokens: 2500,
    monthlyUsd: 0,
    unpricedTokens: 0,
    budgets: { dailyTokens: 10000 },
    warnings: [],
    entries: [],
  });
  assert.equal(dailyBudget?.remainingPercent, 75);
  assert.equal(dailyBudget?.usedPercent, 25);
});
