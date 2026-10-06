import { join } from 'node:path';
import { CopilotClient } from '@github/copilot-sdk';
import { createRpc, initialize, claudeSdkOptions } from './providers';
import { presetFor } from '../src/provider-presets';
import type { ProviderContext } from './providers';
import type { Connection, ProviderUsageData, ProviderUsageReport } from '../src/types';

type Context = Pick<ProviderContext, 'cwd' | 'env' | 'key'>;
type Dependencies = {
  fetcher?: typeof fetch;
  loadClaude?: () => Promise<typeof import('@anthropic-ai/claude-agent-sdk')>;
  createCopilot?: (options: ConstructorParameters<typeof CopilotClient>[0]) => CopilotClient;
};
const object = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const number = (v: unknown): number | undefined => {
  if (typeof v !== 'number' && !(typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v))) return;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= 1e15 ? n : undefined;
};
const nonnegative = (v: unknown) => {
  const n = number(v);
  return n !== undefined && n >= 0 ? n : undefined;
};
const percent = (v: unknown) => {
  const n = nonnegative(v);
  return n !== undefined && n <= 100 ? n : undefined;
};
const timestamp = (v: unknown): string | undefined => {
  const n = typeof v === 'number' ? v * 1000 : typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 8640000000000000 ? new Date(n).toISOString() : undefined;
};
const scope = (v: unknown) => (typeof v === 'string' && /^[\p{L}\p{N} ._:/()-]{1,80}$/u.test(v) ? v : undefined);
const data = (source: ProviderUsageData['source']): ProviderUsageData => ({
  status: 'ok',
  source,
  limits: [],
  credits: [],
  spend: [],
});
function finish(result: ProviderUsageData) {
  if (!result.limits.length && !result.credits.length && !result.spend.length) result.status = 'unavailable';
  return result;
}

export function normalizeCodexUsage(raw: unknown): ProviderUsageData {
  const response = object(raw),
    result = data('codex');
  const buckets = Object.entries(object(response.rateLimitsByLimitId)).slice(0, 50);
  if (!buckets.length) buckets.push(['codex', response.rateLimits]);
  for (const [id, value] of buckets) {
    const bucket = object(value),
      label = scope(bucket.limitName) || scope(id);
    if (
      ['free', 'go', 'plus', 'pro', 'prolite', 'promax', 'team', 'business', 'enterprise', 'edu', 'edu_plus', 'edu_pro'].includes(
        bucket.planType,
      )
    )
      result.plan ||= bucket.planType;
    for (const name of ['primary', 'secondary']) {
      const row = object(bucket[name]),
        usedPercent = percent(row.usedPercent);
      if (usedPercent === undefined) continue;
      const windowMinutes = nonnegative(row.windowDurationMins);
      result.limits.push({
        name,
        scope: label,
        usedPercent,
        windowMinutes: windowMinutes && Number.isInteger(windowMinutes) ? windowMinutes : undefined,
        resetsAt: timestamp(row.resetsAt),
      });
    }
    const credit = object(bucket.credits),
      remaining = number(credit.balance);
    if (remaining !== undefined || typeof credit.unlimited === 'boolean' || typeof credit.hasCredits === 'boolean')
      result.credits.push({
        name: 'balance',
        scope: label,
        unit: 'credits',
        remaining,
        unlimited: typeof credit.unlimited === 'boolean' ? credit.unlimited : undefined,
        hasCredits: typeof credit.hasCredits === 'boolean' ? credit.hasCredits : undefined,
      });
  }
  return finish(result);
}

export function normalizeClaudeUsage(raw: unknown): ProviderUsageData {
  const response = object(raw),
    result = data('claude');
  result.experimental = true;
  if (['pro', 'max', 'team', 'enterprise'].includes(response.subscription_type)) result.plan = response.subscription_type;
  if (response.rate_limits_available !== true) return { ...result, status: 'unavailable' };
  const rates = object(response.rate_limits);
  for (const name of ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet', 'seven_day_oauth_apps']) {
    if (!rates[name] || typeof rates[name] !== 'object') continue;
    const row = object(rates[name]);
    result.limits.push({
      name,
      windowMinutes: name === 'five_hour' ? 300 : 10080,
      usedPercent: percent(row.utilization),
      resetsAt: timestamp(row.resets_at),
    });
  }
  for (const value of (Array.isArray(rates.model_scoped) ? rates.model_scoped : []).slice(0, 50)) {
    const row = object(value),
      label = scope(row.display_name);
    if (label)
      result.limits.push({
        name: 'model_week',
        scope: label,
        windowMinutes: 10080,
        usedPercent: percent(row.utilization),
        resetsAt: timestamp(row.resets_at),
      });
  }
  const extra = object(rates.extra_usage),
    rawTotal = nonnegative(extra.monthly_limit),
    rawUsed = nonnegative(extra.used_credits);
  if (rawTotal !== undefined || rawUsed !== undefined) {
    const unit = ['USD', 'CNY'].includes(extra.currency) ? (extra.currency as 'USD' | 'CNY') : 'minor-units';
    const divisor = unit === 'minor-units' ? 1 : 100;
    const total = rawTotal === undefined ? undefined : rawTotal / divisor,
      used = rawUsed === undefined ? undefined : rawUsed / divisor;
    result.credits.push({
      name: 'extra_usage',
      unit,
      total,
      used,
      remaining: total !== undefined && used !== undefined ? total - used : undefined,
      available: typeof extra.is_enabled === 'boolean' ? extra.is_enabled : undefined,
    });
  }
  return finish(result);
}

export function normalizeCopilotUsage(raw: unknown): ProviderUsageData {
  const result = data('copilot');
  result.experimental = true;
  for (const name of ['premium_interactions', 'chat', 'completions']) {
    const value = object(raw).quotaSnapshots?.[name];
    if (!value || typeof value !== 'object') continue;
    const row = object(value),
      remaining = percent(row.remainingPercentage);
    result.limits.push({
      name,
      unlimited: typeof row.isUnlimitedEntitlement === 'boolean' ? row.isUnlimitedEntitlement : undefined,
      usedPercent: row.isUnlimitedEntitlement === true || remaining === undefined ? undefined : 100 - remaining,
      used: nonnegative(row.usedRequests),
      total: nonnegative(row.entitlementRequests),
      resetsAt: timestamp(row.resetDate),
    });
  }
  return finish(result);
}

/** Fixed-origin, read-only endpoints only. A custom/overridden preset does not gain access to its account API. */
function apiService(c: Connection) {
  const preset = presetFor(c.preset);
  if (
    c.provider !== 'compatible' ||
    c.mode !== 'api' ||
    c.protocol === 'anthropic' ||
    !preset ||
    !['openrouter', 'deepseek'].includes(preset.id) ||
    !c.baseUrl
  )
    return;
  try {
    const actual = new URL(c.baseUrl),
      official = new URL(preset.baseUrl);
    if (
      actual.origin !== official.origin ||
      actual.username ||
      actual.password ||
      actual.search ||
      actual.hash ||
      actual.pathname.replace(/\/$/, '') !== official.pathname
    )
      return;
    return preset.id as 'openrouter' | 'deepseek';
  } catch {
    return;
  }
}
function sourceFor(c: Connection): ProviderUsageData['source'] | undefined {
  if (c.provider === 'openai' && c.mode === 'subscription') return 'codex';
  if (c.provider === 'claude' && c.mode === 'subscription') return 'claude';
  if (c.provider === 'copilot') return 'copilot';
  return apiService(c);
}
export function usageDashboard(c: Connection): string | undefined {
  if (c.provider === 'openai')
    return c.mode === 'subscription' ? 'https://chatgpt.com/codex/settings/usage' : 'https://platform.openai.com/usage';
  if (c.provider === 'claude') return c.mode === 'subscription' ? 'https://claude.ai/settings/usage' : 'https://platform.claude.com/usage';
  if (c.provider === 'gemini') return c.mode === 'api' ? 'https://aistudio.google.com/usage' : 'https://console.cloud.google.com/';
  if (c.provider === 'antigravity') return 'https://antigravity.google/';
  if (c.provider === 'copilot') return 'https://github.com/settings/billing';
  if (c.preset === 'ollama') return;
  if (c.preset === 'openrouter') return 'https://openrouter.ai/settings/credits';
  if (c.preset === 'deepseek') return 'https://platform.deepseek.com/usage';
  // Never open a user-supplied endpoint as an account/billing page.
  return presetFor(c.preset)?.keyUrl || undefined;
}
async function deadline<T>(task: Promise<T>, ms = 20_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('USAGE_TIMEOUT')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function accountJson(url: string, key: string, fetcher: typeof fetch) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetcher(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
      redirect: 'error',
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) throw new Error('USAGE_AUTH_REQUIRED');
    if (!response.ok) throw new Error('USAGE_REQUEST_FAILED');
    if (Number(response.headers.get('content-length')) > 65_536 || !response.body) throw new Error('USAGE_RESPONSE_INVALID');
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 65_536) throw new Error('USAGE_RESPONSE_INVALID');
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    let value: unknown;
    try {
      value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new Error('USAGE_RESPONSE_INVALID');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('USAGE_RESPONSE_INVALID');
    return object(value);
  } catch (error) {
    if (controller.signal.aborted) throw new Error('USAGE_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** No generation request, transcript scan, browser-cookie read or automatic login. */
export async function readProviderUsage(c: Connection, context: Context, deps: Dependencies = {}): Promise<ProviderUsageData> {
  const source = sourceFor(c);
  if (!source) throw new Error('USAGE_UNSUPPORTED');
  if (source === 'codex') {
    const rpc = createRpc(c, context);
    try {
      return await deadline(
        (async () => {
          await initialize(rpc, 'openai');
          return normalizeCodexUsage(await rpc.request('account/rateLimits/read', { excludeResetCreditDetails: true }, 20_000));
        })(),
      );
    } finally {
      await rpc.closeAndWait().catch(() => {});
    }
  }
  if (source === 'claude') {
    const { query } = await (deps.loadClaude || (() => import('@anthropic-ai/claude-agent-sdk')))();
    const controller = new AbortController();
    async function* idle(): AsyncGenerator<never> {
      if (!controller.signal.aborted) await new Promise(resolve => controller.signal.addEventListener('abort', resolve, { once: true }));
    }
    const q = query({
      prompt: idle(),
      options: {
        cwd: context.cwd,
        ...claudeSdkOptions(c, context),
        tools: [],
        allowedTools: [],
        mcpServers: {},
        strictMcpConfig: true,
        settingSources: [],
        persistSession: false,
        abortController: controller,
        canUseTool: async () => ({ behavior: 'deny', message: 'Account usage only.' }),
      },
    });
    try {
      if (typeof q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET !== 'function')
        return { ...data('claude'), status: 'unavailable', experimental: true };
      return normalizeClaudeUsage(await deadline(q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })));
    } finally {
      controller.abort();
      q.close();
    }
  }
  if (source === 'copilot') {
    if (!context.key) throw new Error('USAGE_AUTH_REQUIRED');
    const client = (deps.createCopilot || (opts => new CopilotClient(opts)))({
      mode: 'empty',
      workingDirectory: context.cwd,
      baseDirectory: join(context.cwd, 'copilot'),
      env: context.env,
      gitHubToken: context.key,
      useLoggedInUser: false,
      logLevel: 'none',
    });
    try {
      return await deadline(
        (async () => {
          await client.start();
          return normalizeCopilotUsage(await client.rpc.account.getQuota({ gitHubToken: context.key }));
        })(),
      );
    } finally {
      await client.forceStop().catch(() => {});
    }
  }
  if (!context.key) throw new Error('USAGE_AUTH_REQUIRED');
  const fetcher = deps.fetcher || fetch;
  if (source === 'openrouter') {
    const result = data('openrouter'),
      key = object((await accountJson('https://openrouter.ai/api/v1/key', context.key, fetcher)).data);
    if (key.limit === null || nonnegative(key.limit) !== undefined || number(key.limit_remaining) !== undefined)
      result.credits.push({
        name: 'key_limit',
        unit: 'USD',
        total: nonnegative(key.limit),
        remaining: number(key.limit_remaining),
        unlimited: key.limit === null ? true : undefined,
      });
    for (const [period, suffix] of [
      ['day', '_daily'],
      ['week', '_weekly'],
      ['month', '_monthly'],
      ['all', ''],
    ] as const) {
      for (const [scope, prefix] of [
        ['key', 'usage'],
        ['byok', 'byok_usage'],
      ] as const) {
        const amount = nonnegative(key[prefix + suffix]);
        if (amount !== undefined) result.spend.push({ period, scope, amount, unit: 'USD' });
      }
    }
    try {
      const credits = object((await accountJson('https://openrouter.ai/api/v1/credits', context.key, fetcher)).data),
        total = nonnegative(credits.total_credits),
        used = nonnegative(credits.total_usage);
      if (total === undefined || used === undefined) throw new Error('USAGE_RESPONSE_INVALID');
      result.credits.push({ name: 'balance', unit: 'USD', total, used, remaining: total - used });
    } catch {
      result.reason = 'CREDIT_UNAVAILABLE';
    }
    if (finish(result).status !== 'ok') throw new Error('USAGE_RESPONSE_INVALID');
    return result;
  }
  const response = await accountJson('https://api.deepseek.com/user/balance', context.key, fetcher),
    result = data('deepseek');
  for (const value of (Array.isArray(response.balance_infos) ? response.balance_infos : []).slice(0, 10)) {
    const row = object(value),
      remaining = number(row.total_balance);
    if (['USD', 'CNY'].includes(row.currency) && remaining !== undefined)
      result.credits.push({
        name: 'balance',
        unit: row.currency,
        remaining,
        available: typeof response.is_available === 'boolean' ? response.is_available : undefined,
      });
  }
  if (finish(result).status !== 'ok') throw new Error('USAGE_RESPONSE_INVALID');
  return result;
}

/** Memory-only account snapshots; serialize runtimes on small machines and coalesce repeated reads for one minute. */
export class ProviderUsage {
  private cache = new Map<string, { signature: string; report: ProviderUsageReport }>();
  private pending = new Map<string, { signature: string; task: Promise<ProviderUsageReport> }>();
  private versions = new Map<string, number>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private context: (c: Connection) => Promise<Context>,
    private read = readProviderUsage,
    private now = () => new Date(),
  ) {}
  private signature(c: Connection) {
    return JSON.stringify([c.provider, c.mode, c.preset, c.baseUrl, c.protocol, c.ready]);
  }
  private base(c: Connection): ProviderUsageReport {
    const source = sourceFor(c),
      canRefresh = Boolean(source && c.ready);
    return {
      connectionId: c.id,
      provider: c.provider,
      mode: c.mode,
      label:
        c.label ||
        presetFor(c.preset)?.label ||
        {
          openai: 'OpenAI / Codex',
          claude: 'Claude',
          gemini: 'Gemini',
          antigravity: 'Antigravity',
          copilot: 'GitHub Copilot',
          compatible: 'Compatible API',
        }[c.provider],
      status: !c.ready ? 'disconnected' : source ? 'idle' : 'unsupported',
      source,
      experimental: source === 'claude' || source === 'copilot' ? true : undefined,
      canRefresh,
      hasDashboard: Boolean(usageDashboard(c)),
      limits: [],
      credits: [],
      spend: [],
    };
  }
  snapshot(c: Connection): ProviderUsageReport {
    const item = this.cache.get(c.id);
    return item?.signature === this.signature(c) ? { ...item.report, label: this.base(c).label } : this.base(c);
  }
  forget(id: string) {
    this.versions.set(id, (this.versions.get(id) || 0) + 1);
    this.cache.delete(id);
    this.pending.delete(id);
  }
  refresh(c: Connection): Promise<ProviderUsageReport> {
    const base = this.base(c),
      signature = this.signature(c),
      version = this.versions.get(c.id) || 0;
    if (!base.canRefresh) return Promise.resolve(base);
    const cached = this.cache.get(c.id);
    if (cached?.signature === signature && cached.report.checkedAt && this.now().getTime() - Date.parse(cached.report.checkedAt) < 60_000)
      return Promise.resolve(this.snapshot(c));
    const existing = this.pending.get(c.id);
    if (existing?.signature === signature) return existing.task;
    const task = this.queue.then(async () => {
      if ((this.versions.get(c.id) || 0) !== version) return base;
      let report: ProviderUsageReport;
      try {
        report = { ...base, ...(await this.read(c, await this.context(c))), checkedAt: this.now().toISOString() };
      } catch (error) {
        const code = error instanceof Error ? error.message : '';
        report = {
          ...base,
          status: 'error',
          checkedAt: this.now().toISOString(),
          reason: ['FEATURE_DISABLED', 'USAGE_AUTH_REQUIRED', 'USAGE_TIMEOUT', 'USAGE_RESPONSE_INVALID'].includes(code)
            ? code
            : 'USAGE_REQUEST_FAILED',
        };
      }
      if ((this.versions.get(c.id) || 0) === version) this.cache.set(c.id, { signature, report });
      return report;
    });
    this.queue = task.catch(() => {});
    this.pending.set(c.id, { signature, task });
    void task.finally(() => {
      if (this.pending.get(c.id)?.task === task) this.pending.delete(c.id);
    });
    return task;
  }
}
