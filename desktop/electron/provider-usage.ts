import { join } from 'node:path';
import { CopilotClient } from '@github/copilot-sdk';
import { createRpc, initialize, claudeSdkOptions } from './providers';
import { antigravityQuota } from './antigravity';
import { presetFor } from '../src/provider-presets';
import type { ProviderContext } from './providers';
import type { Connection, ProviderUsageData, ProviderUsageReport } from '../src/types';

type Context = Pick<ProviderContext, 'cwd' | 'env' | 'key'>;
type Dependencies = {
  fetcher?: typeof fetch;
  loadClaude?: () => Promise<typeof import('@anthropic-ai/claude-agent-sdk')>;
  createCopilot?: (options: ConstructorParameters<typeof CopilotClient>[0]) => CopilotClient;
  antigravityQuota?: (c: Connection, context: Context) => Promise<unknown>;
};
const object = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const number = (v: unknown): number | undefined => {
  if (typeof v !== 'number' && !(typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()))) return;
  const n = Number(typeof v === 'string' ? v.trim() : v);
  return Number.isFinite(n) && Math.abs(n) <= 1e15 ? n : undefined;
};
const numberOrPercent = (v: unknown): number | undefined => {
  if (typeof v === 'string' && v.trim().endsWith('%')) return number(v.trim().slice(0, -1));
  return number(v);
};
const nonnegative = (v: unknown) => {
  const n = number(v);
  return n !== undefined && n >= 0 ? n : undefined;
};
const percent = (v: unknown) => {
  const n = nonnegative(v);
  return n !== undefined && n <= 100 ? Math.round(n * 100) / 100 : undefined;
};
const timestamp = (v: unknown): string | undefined => {
  const raw = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : v;
  const n = typeof raw === 'number' ? (raw > 100_000_000_000 ? raw : raw * 1000) : typeof raw === 'string' ? Date.parse(raw) : NaN;
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

/** MiniMax Token Plan remaining quota (adapted from Token Bar `minimax.rs`). */
export function normalizeMiniMaxUsage(raw: unknown): ProviderUsageData {
  const top = object(raw),
    baseResp = object(top.base_resp),
    statusCode = number(baseResp.status_code);
  if (statusCode === 1004 || statusCode === 401 || statusCode === 403) throw new Error('USAGE_AUTH_REQUIRED');
  if (statusCode !== undefined && statusCode !== 0) throw new Error('USAGE_RESPONSE_INVALID');
  const dataObj = object(top.data);
  const result = data('minimax');
  const planName =
    typeof dataObj.plan_name === 'string' ? dataObj.plan_name.trim() : typeof top.plan_name === 'string' ? top.plan_name.trim() : '';
  if (planName) result.plan = planName.slice(0, 48);
  type FoundQuota = { path: string; usedPercent: number; used: number; total: number; resetsAt?: string };
  const found: FoundQuota[] = [];
  const walk = (value: unknown, path: string, depth: number) => {
    if (depth > 6 || found.length >= 20 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const child of value.slice(0, 20)) walk(child, path, depth + 1);
      return;
    }
    const map = value as Record<string, unknown>;
    const limit = nonnegative(map.limit ?? map.total ?? map.current_interval_total_count);
    const usedRaw = nonnegative(map.used ?? map.current_interval_usage_count);
    const remainingRaw = nonnegative(map.remaining ?? map.remain);
    if (limit !== undefined && limit > 0) {
      const used = usedRaw !== undefined ? usedRaw : remainingRaw !== undefined ? Math.max(0, limit - remainingRaw) : undefined;
      const usedPercent = used !== undefined ? percent(Math.min(100, (used / limit) * 100)) : undefined;
      if (used !== undefined && usedPercent !== undefined) {
        found.push({
          path: typeof map.model_name === 'string' && map.model_name.trim() ? map.model_name.trim() : path,
          usedPercent,
          used,
          total: limit,
          resetsAt: timestamp(map.resetTime ?? map.reset_at ?? map.nextResetTime ?? map.end_time),
        });
      }
    }
    for (const [key, child] of Object.entries(map).slice(0, 30)) {
      walk(child, path ? `${path}.${key}` : key, depth + 1);
    }
  };
  walk(raw, '', 0);
  let hasFiveHour = false,
    hasWeek = false;
  for (const q of found) {
    const lower = q.path.toLowerCase();
    const isWeek = lower.includes('week') || lower.includes('7day') || lower.includes('weekly');
    if (isWeek && !hasWeek) {
      hasWeek = true;
      result.limits.push({
        name: 'seven_day',
        windowMinutes: 10080,
        usedPercent: q.usedPercent,
        used: q.used,
        total: q.total,
        resetsAt: q.resetsAt,
      });
    } else if (!hasFiveHour) {
      hasFiveHour = true;
      result.limits.push({
        name: 'five_hour',
        windowMinutes: 300,
        usedPercent: q.usedPercent,
        used: q.used,
        total: q.total,
        resetsAt: q.resetsAt,
      });
    } else if (!hasWeek) {
      hasWeek = true;
      result.limits.push({
        name: 'seven_day',
        windowMinutes: 10080,
        usedPercent: q.usedPercent,
        used: q.used,
        total: q.total,
        resetsAt: q.resetsAt,
      });
    }
  }
  return finish(result);
}

/** Z.AI (GLM) coding-plan quota monitor (adapted from Token Bar `zai.rs`). */
export function normalizeZaiUsage(raw: unknown): ProviderUsageData {
  const top = object(raw),
    code = number(top.code);
  if (code === 401 || code === 403 || code === 1001) throw new Error('USAGE_AUTH_REQUIRED');
  if (code !== undefined && code !== 200 && code !== 0) throw new Error('USAGE_RESPONSE_INVALID');
  const dataObj = object(top.data);
  const result = data('zai');
  const level = typeof dataObj.level === 'string' ? dataObj.level.trim() : typeof top.level === 'string' ? top.level.trim() : '';
  if (level) result.plan = level.slice(0, 48);
  type FoundLimit = { name: string; usedPercent: number; used?: number; total?: number; resetsAt?: string };
  const found: FoundLimit[] = [];
  const walk = (value: unknown, path: string, depth: number) => {
    if (depth > 6 || found.length >= 20 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const child of value.slice(0, 20)) walk(child, path, depth + 1);
      return;
    }
    const map = value as Record<string, unknown>;
    const limit = nonnegative(map.limit ?? map.total ?? map.usage);
    const used = nonnegative(map.used ?? map.currentValue);
    const pct = numberOrPercent(map.percentage ?? map.usedPercentage);
    if ((limit !== undefined && limit > 0 && used !== undefined) || pct !== undefined) {
      const computedPct = pct !== undefined ? pct : limit && used !== undefined ? (used / limit) * 100 : undefined;
      const usedPercent = computedPct !== undefined ? percent(Math.min(100, Math.max(0, computedPct))) : undefined;
      if (usedPercent !== undefined) {
        found.push({
          name: typeof map.type === 'string' && map.type.trim() ? map.type.trim() : path,
          usedPercent,
          used,
          total: limit && limit > 0 ? limit : undefined,
          resetsAt: timestamp(map.nextResetTime ?? map.resetTime),
        });
      }
    }
    for (const [key, child] of Object.entries(map).slice(0, 30)) {
      walk(child, path ? `${path}.${key}` : key, depth + 1);
    }
  };
  walk(raw, '', 0);
  let hasFiveHour = false,
    hasWeek = false;
  for (const item of found) {
    const lower = item.name.toLowerCase();
    const isWeek = lower.includes('week') || lower.includes('7day') || lower.includes('seven');
    if (isWeek && !hasWeek) {
      hasWeek = true;
      result.limits.push({
        name: 'seven_day',
        windowMinutes: 10080,
        usedPercent: item.usedPercent,
        used: item.used,
        total: item.total,
        resetsAt: item.resetsAt,
      });
    } else if ((lower.includes('token') || !hasFiveHour) && !hasFiveHour) {
      hasFiveHour = true;
      result.limits.push({
        name: 'five_hour',
        windowMinutes: 300,
        usedPercent: item.usedPercent,
        used: item.used,
        total: item.total,
        resetsAt: item.resetsAt,
      });
    } else if (!hasWeek) {
      hasWeek = true;
      result.limits.push({
        name: 'seven_day',
        windowMinutes: 10080,
        usedPercent: item.usedPercent,
        used: item.used,
        total: item.total,
        resetsAt: item.resetsAt,
      });
    }
  }
  return finish(result);
}

/** Kimi Code plan quota & Moonshot AI balance (adapted from Token Bar `kimi.rs`). */
export function normalizeKimiUsage(raw: unknown): ProviderUsageData {
  const response = object(raw),
    result = data('kimi');
  const parseWindow = (value: unknown, windowMinutes: number, name: string) => {
    const row = object(value),
      limit = nonnegative(row.limit);
    if (!limit || limit <= 0) return undefined;
    const usedRaw = nonnegative(row.used);
    const remainingRaw = nonnegative(row.remaining ?? row.remain);
    const used = usedRaw !== undefined ? usedRaw : remainingRaw !== undefined ? Math.max(0, limit - remainingRaw) : undefined;
    const usedPercent = used !== undefined ? percent(Math.min(100, (used / limit) * 100)) : undefined;
    if (usedPercent === undefined) return undefined;
    return {
      name,
      windowMinutes,
      usedPercent,
      used,
      total: limit,
      resetsAt: timestamp(row.resetTime ?? row.reset_at),
    };
  };
  let fiveHour: ProviderUsageData['limits'][number] | undefined, week: ProviderUsageData['limits'][number] | undefined;
  if (response.usage && typeof response.usage === 'object') {
    week = parseWindow(response.usage, 10080, 'seven_day');
  }
  const topLimits = Array.isArray(response.limits) ? response.limits : [];
  const usages = Array.isArray(response.usages) ? response.usages : [];
  for (const u of usages.slice(0, 5)) {
    const uObj = object(u);
    if (!week && uObj.detail && typeof uObj.detail === 'object') {
      week = parseWindow(uObj.detail, 10080, 'seven_day');
    }
    if (Array.isArray(uObj.limits)) topLimits.push(...uObj.limits);
  }
  if (topLimits.length > 0) {
    for (const item of topLimits.slice(0, 10)) {
      const entry = object(item),
        win = object(entry.window),
        duration = nonnegative(win.duration) || 0,
        unit = typeof (win.timeUnit ?? win.time_unit) === 'string' ? String(win.timeUnit ?? win.time_unit).toUpperCase() : '';
      const minutes = Math.round(unit.includes('DAY') ? duration * 1440 : unit.includes('HOUR') ? duration * 60 : duration);
      const isWeek = minutes >= 6 * 1440;
      const parsed = parseWindow(entry.detail ?? entry, isWeek ? 10080 : minutes > 0 ? minutes : 300, isWeek ? 'seven_day' : 'five_hour');
      if (!parsed) continue;
      if (isWeek && !week) week = parsed;
      else if (!fiveHour) fiveHour = parsed;
    }
  }
  if (fiveHour) result.limits.push(fiveHour);
  if (week) result.limits.push(week);
  const balanceObj = response.data && typeof response.data === 'object' ? object(response.data) : response;
  const available = number(balanceObj.available_balance ?? balanceObj.balance);
  if (available !== undefined) {
    const unit = balanceObj.currency === 'CNY' ? 'CNY' : 'USD';
    result.credits.push({
      name: 'balance',
      unit,
      remaining: available,
    });
  }
  return finish(result);
}

/**
 * Antigravity's own `agy -p "/usage" --output-format json` answer: model groups (Gemini, Claude and GPT, ...) that each
 * share a 5-hour and a weekly limit, reported as a remaining fraction. A run that started an agent turn is refused.
 */
export function normalizeAntigravityUsage(raw: unknown): ProviderUsageData {
  const response = object(raw),
    command = object(response.command),
    turns = number(response.num_turns);
  if (response.status !== 'SUCCESS' || command.name !== 'usage' || (turns !== undefined && turns !== 0))
    throw new Error('USAGE_RESPONSE_INVALID');
  const result = data('antigravity');
  result.experimental = true;
  const groups = object(command.data).groups;
  for (const value of (Array.isArray(groups) ? groups : []).slice(0, 20)) {
    const group = object(value),
      rows: ProviderUsageData['limits'] = [];
    for (const item of (Array.isArray(group.buckets) ? group.buckets : []).slice(0, 10)) {
      const bucket = object(item),
        fraction = number(bucket.remaining_fraction ?? bucket.remainingFraction);
      if (fraction === undefined || fraction < 0 || fraction > 1) continue;
      const window = typeof bucket.window === 'string' ? bucket.window.toLowerCase() : '',
        hint = `${typeof bucket.id === 'string' ? bucket.id : ''} ${typeof bucket.name === 'string' ? bucket.name : ''}`.toLowerCase();
      const windowMinutes =
        window === '5h' || /\b5h\b|five.?hour/.test(hint)
          ? 300
          : window === 'weekly' || /week/.test(hint)
            ? 10080
            : window === 'daily' || /daily/.test(hint)
              ? 1440
              : window === 'monthly' || /month/.test(hint)
                ? 43200
                : undefined;
      rows.push({
        name: windowMinutes === 300 ? 'five_hour' : windowMinutes === 10080 ? 'seven_day' : 'quota',
        scope: scope(group.name) || scope(bucket.name),
        windowMinutes,
        usedPercent: percent((1 - fraction) * 100),
        resetsAt: timestamp(bucket.reset_time ?? bucket.resetTime),
      });
    }
    // Shorter windows first in each group, so the compact chip reads "5H · 1W" for the leading group.
    rows.sort((a, b) => (a.windowMinutes ?? Infinity) - (b.windowMinutes ?? Infinity));
    result.limits.push(...rows);
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
    !['openrouter', 'deepseek', 'minimax', 'zai', 'kimi'].includes(preset.id) ||
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
    return preset.id as 'openrouter' | 'deepseek' | 'minimax' | 'zai' | 'kimi';
  } catch {
    return;
  }
}
function sourceFor(c: Connection): ProviderUsageData['source'] | undefined {
  if (c.provider === 'openai' && c.mode === 'subscription') return 'codex';
  if (c.provider === 'claude' && c.mode === 'subscription') return 'claude';
  if (c.provider === 'copilot') return 'copilot';
  if (c.provider === 'antigravity' && c.mode === 'subscription') return 'antigravity';
  return apiService(c);
}
export function usageDashboard(c: Connection): string | undefined {
  if (c.provider === 'openai')
    return c.mode === 'subscription' ? 'https://chatgpt.com/codex/settings/usage' : 'https://platform.openai.com/usage';
  if (c.provider === 'claude') return c.mode === 'subscription' ? 'https://claude.ai/settings/usage' : 'https://platform.claude.com/usage';
  if (c.provider === 'gemini') return c.mode === 'api' ? 'https://aistudio.google.com/usage' : 'https://console.cloud.google.com/';
  if (c.provider === 'antigravity') return 'https://antigravity.google/';
  if (c.provider === 'copilot') return 'https://github.com/settings/billing';
  if (c.preset === 'ollama' || c.preset === 'lmstudio') return;
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
  if (source === 'antigravity') {
    let raw: unknown;
    try {
      // agy stops itself after 30 seconds; this outer limit only covers its isolated-home setup and cleanup.
      raw = await deadline((deps.antigravityQuota || antigravityQuota)(c, context), 45_000);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'LOGIN_REQUIRED' || code === 'PROVIDER_PERMISSION_DENIED') throw new Error('USAGE_AUTH_REQUIRED');
      if (code === 'PROVIDER_TIMEOUT' || code === 'USAGE_TIMEOUT') throw new Error('USAGE_TIMEOUT');
      if (code === 'USAGE_RESPONSE_INVALID') throw new Error(code);
      throw new Error('USAGE_REQUEST_FAILED');
    }
    return normalizeAntigravityUsage(raw);
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
  if (source === 'minimax') {
    const response = await accountJson('https://api.minimax.io/v1/token_plan/remains', context.key, fetcher);
    const result = normalizeMiniMaxUsage(response);
    if (result.status !== 'ok') throw new Error('USAGE_RESPONSE_INVALID');
    return result;
  }
  if (source === 'zai') {
    const response = await accountJson('https://api.z.ai/api/monitor/usage/quota/limit', context.key, fetcher);
    const result = normalizeZaiUsage(response);
    if (result.status !== 'ok') throw new Error('USAGE_RESPONSE_INVALID');
    return result;
  }
  if (source === 'kimi') {
    const response = await accountJson('https://api.moonshot.ai/v1/users/me/balance', context.key, fetcher);
    const result = normalizeKimiUsage(response);
    if (result.status !== 'ok') throw new Error('USAGE_RESPONSE_INVALID');
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
      experimental: source === 'claude' || source === 'copilot' || source === 'antigravity' || source === 'zai' ? true : undefined,
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
