/** Input always includes cache reads/writes; optional fields are subsets, never extra tokens. */
export function providerUsage(protocol, raw = {}) {
  const number = (value) => {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error("PROVIDER_STREAM_INVALID");
    return value;
  };
  const optional = (value) => (value == null ? undefined : number(value));
  const cachedInput = optional(
    protocol === "anthropic"
      ? raw.cache_read_input_tokens
      : protocol === "gemini"
        ? raw.cachedContentTokenCount
        : (raw.prompt_tokens_details?.cached_tokens ??
          raw.prompt_cache_hit_tokens),
  );
  const cacheWriteInput = optional(
    protocol === "anthropic" ? raw.cache_creation_input_tokens : undefined,
  );
  const input =
    protocol === "anthropic"
      ? number(raw.input_tokens ?? 0) +
        (cachedInput ?? 0) +
        (cacheWriteInput ?? 0)
      : number(
          protocol === "gemini"
            ? (raw.promptTokenCount ?? 0)
            : (raw.prompt_tokens ?? 0),
        );
  const output =
    protocol === "gemini"
      ? number(raw.candidatesTokenCount ?? 0) +
        number(raw.thoughtsTokenCount ?? 0)
      : number(
          protocol === "anthropic"
            ? (raw.output_tokens ?? 0)
            : (raw.completion_tokens ?? 0),
        );
  if ((cachedInput ?? 0) + (cacheWriteInput ?? 0) > input)
    throw new Error("PROVIDER_STREAM_INVALID");
  const costUsd =
    typeof raw.cost === "number" &&
    Number.isFinite(raw.cost) &&
    raw.cost >= 0 &&
    raw.cost <= 1000
      ? Math.round(raw.cost * 1e12) / 1e12
      : undefined;
  return {
    input,
    output,
    total: input + output,
    ...(cachedInput !== undefined ? { cachedInput } : {}),
    ...(cacheWriteInput !== undefined ? { cacheWriteInput } : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
  };
}

function parseHeaderNumber(raw) {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!/^\d+(?:\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 1e15 ? n : undefined;
}

function parseResetTimestamp(raw, now = Date.now()) {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  // ISO-8601 date string (Anthropic sends RFC 3339 timestamps).
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
  }
  // Pure numeric epoch seconds or relative seconds.
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return undefined;
    const ms = n > 1e11 ? n : n > 1e9 ? n * 1000 : now + n * 1000;
    return new Date(ms).toISOString();
  }
  // Go-style duration strings used by OpenAI / Groq / xAI (e.g. "6m0s", "1h2m3s", "450ms", "12s").
  const parts = [...s.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h|d)/gi)];
  if (parts.length && parts.map((m) => m[0]).join("") === s) {
    let deltaMs = 0;
    for (const [, value, unit] of parts) {
      const n = Number(value);
      const u = unit.toLowerCase();
      deltaMs +=
        u === "ms"
          ? n
          : u === "s"
            ? n * 1000
            : u === "m"
              ? n * 60_000
              : u === "h"
                ? n * 3_600_000
                : n * 86_400_000;
    }
    if (Number.isFinite(deltaMs) && deltaMs >= 0 && deltaMs <= 365 * 86_400_000) {
      return new Date(now + deltaMs).toISOString();
    }
  }
  return undefined;
}

/**
 * Passive rate-limit telemetry from standard provider HTTP headers (OpenAI, Anthropic, Groq, Mistral, xAI, DeepSeek, OpenRouter).
 * Returns bounded normalized readings without throwing on unexpected or missing headers.
 */
export function parseRateLimitHeaders(headers, now = Date.now()) {
  if (!headers || typeof headers.get !== "function") return [];
  const specs = [
    [
      "requests",
      "anthropic-ratelimit-requests-limit",
      "anthropic-ratelimit-requests-remaining",
      "anthropic-ratelimit-requests-reset",
    ],
    [
      "input_tokens",
      "anthropic-ratelimit-input-tokens-limit",
      "anthropic-ratelimit-input-tokens-remaining",
      "anthropic-ratelimit-input-tokens-reset",
    ],
    [
      "output_tokens",
      "anthropic-ratelimit-output-tokens-limit",
      "anthropic-ratelimit-output-tokens-remaining",
      "anthropic-ratelimit-output-tokens-reset",
    ],
    [
      "tokens",
      "anthropic-ratelimit-tokens-limit",
      "anthropic-ratelimit-tokens-remaining",
      "anthropic-ratelimit-tokens-reset",
    ],
    [
      "requests",
      "x-ratelimit-limit-requests",
      "x-ratelimit-remaining-requests",
      "x-ratelimit-reset-requests",
    ],
    [
      "tokens",
      "x-ratelimit-limit-tokens",
      "x-ratelimit-remaining-tokens",
      "x-ratelimit-reset-tokens",
    ],
  ];
  const seen = new Set();
  const readings = [];
  for (const [name, limitKey, remainingKey, resetKey] of specs) {
    if (seen.has(name)) continue;
    const limit = parseHeaderNumber(headers.get(limitKey));
    const remaining = parseHeaderNumber(headers.get(remainingKey));
    const resetsAt = parseResetTimestamp(headers.get(resetKey), now);
    if (limit === undefined && remaining === undefined) continue;
    seen.add(name);
    const usedPercent =
      limit !== undefined && limit > 0 && remaining !== undefined
        ? Math.round(Math.max(0, Math.min(100, ((limit - remaining) / limit) * 100)) * 100) / 100
        : undefined;
    readings.push({
      name,
      ...(limit !== undefined ? { limit } : {}),
      ...(remaining !== undefined ? { remaining } : {}),
      ...(usedPercent !== undefined ? { usedPercent } : {}),
      ...(resetsAt ? { resetsAt } : {}),
    });
  }
  return readings;
}
