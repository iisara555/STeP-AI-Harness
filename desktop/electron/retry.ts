export const RETRY_DELAYS_MS = [2000, 4000, 8000];
export const RETRYABLE_CODES = new Set(['PROVIDER_NETWORK', 'PROVIDER_BUSY', 'RUNTIME_EXITED']);
export function retryAfterMs(value: unknown, now = Date.now()) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Date.parse(String(value)) - now;
  return Number.isFinite(delay) && delay >= 0 ? Math.min(delay, 120_000) : undefined;
}
export function retryDelay(attempt: number, error: unknown, delays = RETRY_DELAYS_MS, random = Math.random) {
  const base = delays[attempt - 1] ?? 0;
  const jittered = base * (0.75 + random() * 0.5);
  const retryAfter = Number((error as any)?.retryAfterMs);
  // Reject absurd remote delays; an ordinary retry-after takes precedence over backoff.
  return Math.round(Math.max(jittered, Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.min(retryAfter, 120_000) : 0));
}
