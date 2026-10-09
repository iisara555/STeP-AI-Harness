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
  return {
    input,
    output,
    total: input + output,
    ...(cachedInput !== undefined ? { cachedInput } : {}),
    ...(cacheWriteInput !== undefined ? { cacheWriteInput } : {}),
  };
}
