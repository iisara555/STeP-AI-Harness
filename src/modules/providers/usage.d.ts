export type TokenCount = {
  input: number;
  output: number;
  total: number;
  cachedInput?: number;
  cacheWriteInput?: number;
  costUsd?: number;
};
export type RateLimitReading = {
  name: "requests" | "tokens" | "input_tokens" | "output_tokens";
  limit?: number;
  remaining?: number;
  usedPercent?: number;
  resetsAt?: string;
  windowMinutes?: number;
};
export function providerUsage(protocol: string, raw?: any): TokenCount;
export function parseRateLimitHeaders(
  headers?: { get(name: string): string | null } | null,
  now?: number,
): RateLimitReading[];
