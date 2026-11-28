import { createHash } from 'node:crypto';
import { Store } from './store';
import type { Connection, ModelPricing } from '../src/types';
import type { TokenCount } from './providers';
import type { Policy } from './policy';
import { lookupCatalogModel } from './model-catalog';
type Entry = TokenCount & {
  day: string;
  provider: string;
  model: string;
  connectionId?: string;
  mode?: Connection['mode'];
  usd: number;
  unpricedTokens: number;
  calls: number;
  cachePriceMissingTokens?: number;
};
const dollars = (n: number) => Math.round(n * 1e12) / 1e12;
export class CostLedger {
  constructor(
    private store: Store,
    private policy: () => Policy,
    private now = () => new Date(),
  ) {}
  record(connection: Connection, count: TokenCount) {
    const clean = (n: number) => (Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);
    const input = clean(count.input),
      output = clean(count.output),
      total = Math.max(clean(count.total), input + output);
    if (!total) return;
    const day = this.now().toISOString().slice(0, 10),
      model = connection.model || 'provider-default';
    // Pricing precedence:
    // 1) Admin policy override (`policy.prices[model]` or `policy.prices[provider:*]`)
    // 2) Provider-reported exact per-request cost (`count.costUsd`, e.g. OpenRouter SSE `usage.cost`)
    // 3) Live `/models` pricing on API connections (`connection.models[].pricing`)
    // 4) Offline baseline catalog pricing on API connections (`model-catalog.ts`)
    const policyPrice = this.policy().prices[model] || this.policy().prices[connection.provider + ':*'];
    const hasExactCost = !policyPrice && typeof count.costUsd === 'number' && Number.isFinite(count.costUsd) && count.costUsd >= 0;
    const liveModelPrice: ModelPricing | undefined =
      !policyPrice && !hasExactCost && connection.mode === 'api' ? connection.models?.find(m => m.id === model)?.pricing : undefined;
    const catalogPrice: ModelPricing | undefined =
      !policyPrice && !hasExactCost && !liveModelPrice && connection.mode === 'api' && model !== 'provider-default'
        ? lookupCatalogModel(model)?.pricing
        : undefined;
    const price = policyPrice || liveModelPrice || catalogPrice;
    const cached = Math.min(input, clean(count.cachedInput ?? 0));
    const written = Math.min(input - cached, clean(count.cacheWriteInput ?? 0));
    const missing = price ? (price.cachedInput === undefined ? cached : 0) + (price.cacheWriteInput === undefined ? written : 0) : 0;
    const usd = hasExactCost
      ? count.costUsd!
      : price
        ? ((input - cached - written) * price.input +
            cached * (price.cachedInput ?? price.input) +
            written * (price.cacheWriteInput ?? price.input) +
            output * price.output) /
          1_000_000
        : 0;
    const priced = Boolean(price || hasExactCost);
    const id = createHash('sha256')
      .update(JSON.stringify([day, connection.provider, model, connection.id || null, connection.mode || null]))
      .digest('hex');
    const old = this.store.get<Entry>('usage-ledger', id);
    this.store.put('usage-ledger', id, {
      day,
      provider: connection.provider,
      model,
      connectionId: connection.id,
      mode: connection.mode,
      input: input + (old?.input || 0),
      output: output + (old?.output || 0),
      total: total + (old?.total || 0),
      calls: 1 + (old?.calls || 0),
      ...(count.cachedInput !== undefined || old?.cachedInput !== undefined ? { cachedInput: cached + (old?.cachedInput || 0) } : {}),
      ...(count.cacheWriteInput !== undefined || old?.cacheWriteInput !== undefined
        ? { cacheWriteInput: written + (old?.cacheWriteInput || 0) }
        : {}),
      cachePriceMissingTokens: missing + (old?.cachePriceMissingTokens || 0),
      usd: dollars((old?.usd || 0) + usd),
      unpricedTokens: (old?.unpricedTokens || 0) + (priced ? 0 : total),
    });
  }
  report() {
    const day = this.now().toISOString().slice(0, 10),
      month = day.slice(0, 7),
      budgets = this.policy().budgets;
    const entries = this.store.list<Entry>('usage-ledger').filter(e => e.day.startsWith(month));
    const dailyTokens = entries.filter(e => e.day === day).reduce((sum, e) => sum + e.total, 0);
    const monthlyUsd = dollars(entries.reduce((sum, e) => sum + e.usd, 0)),
      unpricedTokens = entries.reduce((sum, e) => sum + e.unpricedTokens, 0);
    const cachePriceMissingTokens = entries.reduce((sum, e) => sum + (e.cachePriceMissingTokens || 0), 0);
    const warnings = [
      budgets.dailyTokens && dailyTokens >= budgets.dailyTokens * 0.8 && 'DAILY_TOKEN_BUDGET',
      budgets.monthlyCostUsd && monthlyUsd >= budgets.monthlyCostUsd * 0.8 && 'MONTHLY_COST_BUDGET',
    ].filter(Boolean) as string[];
    return { day, month, entries, dailyTokens, monthlyUsd, unpricedTokens, cachePriceMissingTokens, budgets, warnings };
  }
}
