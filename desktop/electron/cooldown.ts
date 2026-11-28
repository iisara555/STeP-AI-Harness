/**
 * Model-scoped cooldown tracker (inspired by Hermes Agent credential_pool / fallback_model).
 * Tracks temporary quota/rate-limit windows per (connectionId, model) so a cooled-down model on
 * one account does not block other models on the same account, and an opt-in fallback account
 * can take over cleanly without hammering a throttled endpoint.
 */
export type CooldownEntry = {
  connectionId: string;
  model: string;
  code: string;
  until: number;
};

const DEFAULT_BUSY_MS = 60_000;
const DEFAULT_QUOTA_MS = 300_000;
const MAX_COOLDOWN_MS = 30 * 60_000;

export class CooldownTracker {
  private entries = new Map<string, CooldownEntry>();
  constructor(private now: () => number = Date.now) {}

  private key(connectionId: string, model?: string) {
    return `${connectionId}::${(model || '').trim().toLowerCase()}`;
  }

  private prune() {
    const current = this.now();
    for (const [k, entry] of this.entries) {
      if (entry.until <= current) this.entries.delete(k);
    }
  }

  recordFailure(connectionId: string, model: string | undefined, code: string, retryAfterMs?: number) {
    if (!connectionId || !['PROVIDER_QUOTA', 'PROVIDER_BUSY'].includes(code)) return;
    this.prune();
    const baseMs =
      typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? retryAfterMs
        : code === 'PROVIDER_QUOTA'
          ? DEFAULT_QUOTA_MS
          : DEFAULT_BUSY_MS;
    const duration = Math.min(Math.max(1_000, Math.round(baseMs)), MAX_COOLDOWN_MS);
    const key = this.key(connectionId, model);
    this.entries.set(key, {
      connectionId,
      model: (model || '').trim(),
      code,
      until: this.now() + duration,
    });
  }

  recordSuccess(connectionId: string, model?: string) {
    this.entries.delete(this.key(connectionId, model));
  }

  remainingMs(connectionId: string, model?: string): number {
    this.prune();
    const entry = this.entries.get(this.key(connectionId, model));
    if (!entry) return 0;
    return Math.max(0, entry.until - this.now());
  }

  isCooledDown(connectionId: string, model?: string): boolean {
    return this.remainingMs(connectionId, model) > 0;
  }

  activeEntry(connectionId: string, model?: string): CooldownEntry | undefined {
    this.prune();
    return this.entries.get(this.key(connectionId, model));
  }

  clear(connectionId?: string) {
    if (!connectionId) {
      this.entries.clear();
      return;
    }
    for (const [k, entry] of this.entries) {
      if (entry.connectionId === connectionId) this.entries.delete(k);
    }
  }
}
