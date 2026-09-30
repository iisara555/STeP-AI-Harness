import { createHash } from 'node:crypto';
import { Store } from './store';
import type { Connection } from '../src/types';
import type { TokenCount } from './providers';
import type { Policy } from './policy';
type Entry = TokenCount & { day: string; provider: string; model: string; usd: number; unpricedTokens: number; calls: number };
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
    const price = this.policy().prices[model] || this.policy().prices[connection.provider + ':*'];
    const id = createHash('sha256')
      .update(JSON.stringify([day, connection.provider, model]))
      .digest('hex');
    const old = this.store.get<Entry>('usage-ledger', id);
    this.store.put('usage-ledger', id, {
      day,
      provider: connection.provider,
      model,
      input: input + (old?.input || 0),
      output: output + (old?.output || 0),
      total: total + (old?.total || 0),
      calls: 1 + (old?.calls || 0),
      usd: dollars((old?.usd || 0) + (price ? (input * price.input + output * price.output) / 1_000_000 : 0)),
      unpricedTokens: (old?.unpricedTokens || 0) + (price ? 0 : total),
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
    const warnings = [
      budgets.dailyTokens && dailyTokens >= budgets.dailyTokens * 0.8 && 'DAILY_TOKEN_BUDGET',
      budgets.monthlyCostUsd && monthlyUsd >= budgets.monthlyCostUsd * 0.8 && 'MONTHLY_COST_BUDGET',
    ].filter(Boolean) as string[];
    return { day, month, entries, dailyTokens, monthlyUsd, unpricedTokens, budgets, warnings };
  }
}
