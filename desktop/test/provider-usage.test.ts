import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  normalizeCodexUsage,
  normalizeClaudeUsage,
  normalizeCopilotUsage,
  readProviderUsage,
  ProviderUsage,
  usageDashboard,
} from '../electron/provider-usage';
import { Store } from '../electron/store';
import { CostLedger } from '../electron/cost';
import { defaultPolicy } from '../electron/policy';
import type { Connection } from '../src/types';

// Account responses, credentials and runtimes in this file are entirely synthetic.
const connection = (overrides: Partial<Connection> = {}): Connection => ({
  id: 'synthetic-account',
  provider: 'openai',
  mode: 'subscription',
  model: '',
  executable: '',
  ready: true,
  note: '',
  ...overrides,
});
const context = { cwd: tmpdir(), env: {}, key: 'synthetic-test-key' };

test('Codex keeps real window durations, model buckets, resets and credit units separate', () => {
  const result = normalizeCodexUsage({
    accountId: 'private-account-id',
    token: 'private-token',
    rateLimits: { primary: { usedPercent: 99, windowDurationMins: 300 } },
    rateLimitsByLimitId: {
      codex: {
        planType: 'plus',
        primary: { usedPercent: 35, windowDurationMins: 300, resetsAt: 1791288000 },
        secondary: { usedPercent: 70, windowDurationMins: 10080 },
        credits: { hasCredits: true, unlimited: false, balance: '12.50' },
      },
      special: { primary: { usedPercent: 0, windowDurationMins: 60 } },
    },
  });
  assert.equal(result.limits.length, 3, 'multi-bucket view does not double-count the legacy view');
  assert.equal(result.limits[0].windowMinutes, 300);
  assert.equal(result.limits[1].windowMinutes, 10080);
  assert.equal(result.limits[2].windowMinutes, 60, 'do not call every primary window 5h');
  assert.equal(result.limits[2].usedPercent, 0, 'zero is a reported reading');
  assert.equal(result.limits[0].resetsAt, new Date(1791288000 * 1000).toISOString());
  assert.equal(result.credits[0].remaining, 12.5);
  assert.equal(result.credits[0].unit, 'credits', 'Codex credits are not USD');
  assert.doesNotMatch(JSON.stringify(result), /private-/);
  assert.deepEqual(normalizeCodexUsage({ rateLimits: { primary: { usedPercent: null } } }).limits, []);
});

test('Claude treats missing windows as unknown and converts only declared minor currency units', () => {
  const result = normalizeClaudeUsage({
    rate_limits_available: true,
    subscription_type: 'max',
    rate_limits: {
      five_hour: { utilization: 22, resets_at: '2026-10-06T16:00:00Z' },
      seven_day: null,
      seven_day_sonnet: { utilization: null, resets_at: 'invalid' },
      extra_usage: { is_enabled: true, monthly_limit: 5000, used_credits: 1250, currency: 'USD' },
    },
  });
  assert.equal(result.limits[0].windowMinutes, 300);
  assert.equal(
    result.limits.some(l => l.name === 'seven_day'),
    false,
  );
  assert.equal(result.limits[1].usedPercent, undefined);
  assert.equal(result.credits[0].used, 12.5);
  assert.equal(result.credits[0].remaining, 37.5);
  assert.equal(normalizeClaudeUsage({ rate_limits_available: false, rate_limits: null }).status, 'unavailable');
  assert.equal(normalizeClaudeUsage({}).status, 'unavailable', 'experimental schema changes fail closed');
});

test('Codex credit presence is not an account permission decision', () => {
  const result = normalizeCodexUsage({ rateLimits: { credits: { hasCredits: false, unlimited: true } } });
  assert.equal(result.credits[0].hasCredits, false);
  assert.equal(result.credits[0].available, undefined);
  assert.equal(result.credits[0].unlimited, true);
});

test('Copilot displays its request entitlement without inventing a 5h or weekly meter', () => {
  const result = normalizeCopilotUsage({
    quotaSnapshots: {
      premium_interactions: {
        isUnlimitedEntitlement: false,
        entitlementRequests: 300,
        usedRequests: 60,
        remainingPercentage: 80,
        resetDate: '2026-11-01T00:00:00Z',
      },
      chat: { isUnlimitedEntitlement: true, entitlementRequests: -1, usedRequests: 4 },
    },
  });
  assert.equal(result.limits[0].usedPercent, 20);
  assert.equal(result.limits[0].total, 300);
  assert.equal(result.limits[0].windowMinutes, undefined);
  assert.equal(result.limits[1].unlimited, true);
  assert.equal(result.limits[1].total, undefined);
});

test('OpenRouter distinguishes account credit, key limit and UTC API usage, including BYOK', async () => {
  const calls: string[] = [];
  const result = await readProviderUsage(
    connection({ provider: 'compatible', mode: 'api', preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1' }),
    context,
    {
      fetcher: async (url, options) => {
        calls.push(String(url));
        assert.equal(options?.redirect, 'error');
        assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer synthetic-test-key');
        return Response.json({
          data: String(url).endsWith('/key')
            ? {
                label: 'private-label',
                limit: 20,
                limit_remaining: 15,
                usage: 5,
                usage_daily: 1,
                usage_weekly: 3,
                usage_monthly: 5,
                byok_usage_weekly: 2,
              }
            : { total_credits: 100, total_usage: 40 },
        });
      },
    },
  );
  assert.deepEqual(calls, ['https://openrouter.ai/api/v1/key', 'https://openrouter.ai/api/v1/credits']);
  assert.equal(result.credits.find(c => c.name === 'balance')?.remaining, 60);
  assert.equal(result.credits.find(c => c.name === 'key_limit')?.remaining, 15);
  assert.equal(result.spend.find(s => s.period === 'week' && s.scope === 'key')?.amount, 3);
  assert.equal(result.spend.find(s => s.scope === 'byok')?.amount, 2);
  assert.doesNotMatch(JSON.stringify(result), /private-label|synthetic-test-key/);
});

test('OpenRouter credit denial preserves key readings and does not equate no key limit with unlimited funds', async () => {
  const result = await readProviderUsage(
    connection({ provider: 'compatible', mode: 'api', preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1' }),
    context,
    {
      fetcher: async url =>
        String(url).endsWith('/credits')
          ? new Response('secret server response', { status: 403 })
          : Response.json({ data: { usage: 4, limit: null, limit_remaining: null } }),
    },
  );
  assert.equal(result.status, 'ok');
  assert.equal(result.reason, 'CREDIT_UNAVAILABLE');
  assert.equal(result.credits[0].unlimited, true);
  assert.equal(result.credits[0].name, 'key_limit');
  assert.equal(result.credits[0].remaining, undefined);
  assert.doesNotMatch(JSON.stringify(result), /secret server response/);
});

test('DeepSeek keeps currency balances and account availability without leaking raw responses', async () => {
  const result = await readProviderUsage(
    connection({ provider: 'compatible', mode: 'api', preset: 'deepseek', baseUrl: 'https://api.deepseek.com/v1' }),
    context,
    {
      fetcher: async url => {
        assert.equal(String(url), 'https://api.deepseek.com/user/balance');
        return Response.json({
          is_available: false,
          balance_infos: [
            { currency: 'CNY', total_balance: '-0.10', granted_balance: '0', topped_up_balance: '-0.10' },
            { currency: 'USD', total_balance: '1.25' },
            { currency: 'unknown', total_balance: '100' },
          ],
          token: 'private-token',
        });
      },
    },
  );
  assert.deepEqual(
    result.credits.map(c => [c.unit, c.remaining]),
    [
      ['CNY', -0.1],
      ['USD', 1.25],
    ],
  );
  assert.equal(result.credits[0].available, false);
  assert.doesNotMatch(JSON.stringify(result), /private-token/);
});

test('a preset name alone never authorizes sending a key to a different origin or path', async () => {
  for (const baseUrl of [
    'https://evil.example/api/v1',
    'https://openrouter.ai/api/v1/other',
    'https://openrouter.ai/api/v1?leak=1',
    'https://user:pass@openrouter.ai/api/v1',
  ]) {
    let called = false;
    await assert.rejects(
      readProviderUsage(connection({ provider: 'compatible', mode: 'api', preset: 'openrouter', baseUrl }), context, {
        fetcher: async () => {
          called = true;
          return Response.json({});
        },
      }),
      /USAGE_UNSUPPORTED/,
    );
    assert.equal(called, false);
  }
});

test('API account readers reject auth failures, malformed/oversized bodies and missing numbers', async () => {
  const c = connection({ provider: 'compatible', mode: 'api', preset: 'deepseek', baseUrl: 'https://api.deepseek.com/v1' });
  for (const response of [
    new Response('private-key', { status: 401 }),
    new Response('x'.repeat(70_000)),
    Response.json({ balance_infos: [{ currency: 'USD', total_balance: null }] }),
    Response.json([]),
  ]) {
    await assert.rejects(readProviderUsage(c, context, { fetcher: async () => response }), /USAGE_AUTH_REQUIRED|USAGE_RESPONSE_INVALID/);
  }
});

test('HTTP account refresh closes its request even when authentication is rejected', async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(
    readProviderUsage(
      connection({ provider: 'compatible', mode: 'api', preset: 'deepseek', baseUrl: 'https://api.deepseek.com/v1' }),
      context,
      {
        fetcher: async (_, options) => {
          signal = options?.signal as AbortSignal;
          return new Response('private response', { status: 401 });
        },
      },
    ),
    /USAGE_AUTH_REQUIRED/,
  );
  assert.equal(signal?.aborted, true);
});

test('Codex usage opens no thread, sends no prompt or key, and closes the isolated RPC', async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-usage-rpc-'));
  const executable = join(home, 'codex.mjs');
  await writeFile(
    executable,
    `import readline from 'node:readline';
readline.createInterface({input:process.stdin}).on('line', line => {
 const m=JSON.parse(line); if(m.id === undefined)return;
 const result=m.method==='initialize'?{}:m.method==='account/rateLimits/read'?{rateLimits:{primary:{usedPercent:12,windowDurationMins:300}}}:null;
 console.log(JSON.stringify({id:m.id,...(result?{result}:{error:{message:'unexpected mutation or prompt'}})}));
});`,
  );
  try {
    const result = await readProviderUsage(connection({ executable }), { cwd: home, env: {}, key: undefined });
    assert.equal(result.limits[0].usedPercent, 12);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('Claude quota uses an idle, isolated SDK query and skips transcript scanning, including failure cleanup', async () => {
  let closes = 0;
  for (const fail of [false, true]) {
    const task = readProviderUsage(
      connection({ provider: 'claude', executable: '/synthetic/claude' }),
      { ...context, env: { CLAUDE_CONFIG_DIR: '/synthetic/profile' } },
      {
        loadClaude: async () =>
          ({
            query: (args: any) => {
              assert.notEqual(typeof args.prompt, 'string');
              assert.deepEqual(args.options.tools, []);
              assert.equal(args.options.persistSession, false);
              assert.equal(args.options.strictMcpConfig, true);
              return {
                usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: async (opts: any) => {
                  assert.equal(opts.skipBehaviors, true);
                  if (fail) throw new Error('private-token');
                  return { rate_limits_available: true, rate_limits: { seven_day: { utilization: 10 } } };
                },
                close: () => {
                  closes++;
                },
              };
            },
          }) as any,
      },
    );
    if (fail) await assert.rejects(task);
    else assert.equal((await task).limits[0].windowMinutes, 10080);
  }
  assert.equal(closes, 2);
});

test('Copilot queries quota without a generation session and always stops its runtime', async () => {
  let starts = 0,
    stops = 0;
  const result = await readProviderUsage(connection({ provider: 'copilot' }), context, {
    createCopilot: (options: any) => {
      assert.equal(options.useLoggedInUser, false);
      return {
        start: async () => {
          starts++;
        },
        forceStop: async () => {
          stops++;
        },
        rpc: {
          account: {
            getQuota: async (params: any) => {
              assert.equal(params.gitHubToken, context.key);
              return {
                quotaSnapshots: {
                  chat: {
                    isUnlimitedEntitlement: true,
                    usedRequests: 10,
                    entitlementRequests: -1,
                  },
                },
              };
            },
          },
        },
      } as any;
    },
  });
  assert.equal(result.limits[0].unlimited, true);
  assert.equal(starts, 1);
  assert.equal(stops, 1);
});

test('usage cache coalesces refreshes, serializes runtimes, expires, and invalidates after account changes', async () => {
  let now = new Date('2026-10-06T12:00:00Z'),
    reads = 0,
    active = 0,
    peak = 0;
  const usage = new ProviderUsage(
    async () => context,
    async () => {
      reads++;
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      return normalizeCodexUsage({ rateLimits: { primary: { usedPercent: 10, windowDurationMins: 300 } } });
    },
    () => now,
  );
  const a = connection(),
    b = connection({ id: 'second' });
  assert.equal(usage.snapshot(a).status, 'idle');
  const [first, same] = await Promise.all([usage.refresh(a), usage.refresh(a), usage.refresh(b)]);
  assert.deepEqual(first, same);
  assert.equal(reads, 2);
  assert.equal(peak, 1);
  await usage.refresh(a);
  assert.equal(reads, 2);
  now = new Date('2026-10-06T12:01:01Z');
  await usage.refresh(a);
  assert.equal(reads, 3);
  usage.forget(a.id);
  assert.equal(usage.snapshot(a).status, 'idle');
  const pending = usage.refresh(a);
  usage.forget(a.id);
  await pending;
  assert.equal(usage.snapshot(a).status, 'idle', 'a late response cannot restore a signed-out account');
});

test('unsupported/API-only or disconnected accounts do not start runtimes; errors never expose credentials', async () => {
  let runtimes = 0;
  const usage = new ProviderUsage(async () => {
    runtimes++;
    throw new Error('secret sensitive exception');
  });
  for (const c of [
    connection({ ready: false }),
    connection({ mode: 'api' }),
    connection({ provider: 'gemini' }),
    connection({ provider: 'antigravity' }),
    connection({ provider: 'claude', mode: 'oauth' }),
    connection({ provider: 'compatible', mode: 'api', preset: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' }),
  ]) {
    const result = await usage.refresh(c);
    assert.equal(result.canRefresh, false);
    assert.equal(result.limits.length, 0);
  }
  assert.equal(runtimes, 0);
  const c = connection({
    provider: 'compatible',
    mode: 'api',
    preset: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    protocol: 'openai',
  });
  const cached = new ProviderUsage(
    async () => context,
    async () => ({ status: 'ok', source: 'openrouter', limits: [], credits: [{ name: 'balance', unit: 'USD', remaining: 3 }], spend: [] }),
  );
  await cached.refresh(c);
  assert.equal(
    cached.snapshot({ ...c, protocol: 'anthropic' }).status,
    'unsupported',
    'protocol changes cannot reuse a supported API snapshot',
  );
  const error = await usage.refresh(connection());
  assert.equal(error.status, 'error');
  assert.doesNotMatch(JSON.stringify(error), /secret sensitive/);
  assert.equal(usageDashboard(connection({ provider: 'compatible', preset: 'invented', baseUrl: 'https://evil.example' })), undefined);
  assert.equal(usageDashboard(connection({ provider: 'compatible', preset: 'ollama' })), undefined);
});

test('local API ledger separates connections and preserves unattributed historical totals', () => {
  const store = new Store(':memory:'),
    policy = defaultPolicy();
  policy.prices['openai:*'] = { input: 1, output: 2 };
  const ledger = new CostLedger(
    store,
    () => policy,
    () => new Date('2026-10-06T00:00:00Z'),
  );
  store.put('usage-ledger', 'legacy', {
    day: '2026-10-06',
    provider: 'openai',
    model: 'm',
    input: 5,
    output: 0,
    total: 5,
    usd: 0.000005,
    unpricedTokens: 0,
    calls: 1,
  });
  ledger.record(connection({ id: 'a', mode: 'api', model: 'm' }), { input: 10, output: 0, total: 10 });
  ledger.record(connection({ id: 'b', mode: 'api', model: 'm' }), { input: 20, output: 0, total: 20 });
  const report = ledger.report();
  assert.equal(report.dailyTokens, 35);
  assert.equal(report.entries.length, 3);
  assert.equal(report.entries.find(e => e.connectionId === 'a')?.total, 10);
  assert.equal(report.entries.filter(e => !e.connectionId).length, 1);
  store.close();
});
