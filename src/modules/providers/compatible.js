import { providerUsage } from "./usage.js";
// Error bodies are untrusted and may contain private text. Inspect only a bounded structured code/type.
async function failureCode(response) {
  let code = "";
  if (response.body) {
    const reader = response.body.getReader();
    try {
      let body = "",
        bytes = 0;
      const decoder = new TextDecoder();
      while (bytes <= 8192) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 8192) break;
        body += decoder.decode(part.value, { stream: true });
      }
      if (bytes <= 8192) {
        const error = JSON.parse(body)?.error;
        code = [error?.code, error?.type]
          .filter((v) => typeof v === "string")
          .join(" ");
      }
    } catch {
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  if (response.status === 401 || response.status === 403)
    return "PROVIDER_AUTH_FAILED";
  if (
    /\b(insufficient_quota|quota_exceeded|billing_hard_limit_reached|credit_balance_exhausted)\b/.test(
      code,
    )
  )
    return "PROVIDER_QUOTA";
  if (/\b(context_length_exceeded|prompt_too_long)\b/.test(code))
    return "PROMPT_TOO_LONG";
  return response.status === 429
    ? "PROVIDER_RATE_LIMIT"
    : response.status >= 500
      ? "PROVIDER_UNAVAILABLE"
      : "PROVIDER_REQUEST_FAILED";
}
/** Bounded, text-only API transport shared by Desktop, the CLI and server runners. */
export function providerEndpoint(baseUrl, protocol = "openai") {
  if (!["openai", "anthropic"].includes(protocol))
    throw new Error("PROVIDER_PROTOCOL_INVALID");
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("PROVIDER_URL_INVALID");
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
  )
    throw new Error("PROVIDER_URL_INVALID");
  url.pathname =
    url.pathname.replace(/\/$/, "") +
    (protocol === "anthropic" ? "/messages" : "/chat/completions");
  return url;
}

export function approvedProfile(profile, policy) {
  if (policy?.features?.compatibleProviders !== true)
    throw new Error("FEATURE_DISABLED");
  if (policy.network?.proxyUrl) throw new Error("PROVIDER_PROXY_UNAVAILABLE");
  const endpoint = providerEndpoint(profile.baseUrl, profile.protocol);
  const allowed = policy.providers?.compatible || [];
  if (
    !allowed.some(
      (p) =>
        p.protocol === (profile.protocol || "openai") &&
        providerEndpoint(p.baseUrl, p.protocol).href === endpoint.href,
    )
  )
    throw new Error("PROVIDER_DESTINATION_DENIED");
  return endpoint;
}

export async function compatibleRun(
  prompt,
  profile,
  context = {},
  fetcher = fetch,
) {
  if (
    typeof prompt !== "string" ||
    prompt.length > 400_000 ||
    !profile.model ||
    profile.model.length > 160 ||
    (profile.maxOutputTokens !== undefined &&
      (!Number.isSafeInteger(profile.maxOutputTokens) ||
        profile.maxOutputTokens < 1 ||
        profile.maxOutputTokens > 65536)) ||
    (profile.promptCaching !== undefined &&
      !["off", "anthropic-ephemeral"].includes(profile.promptCaching)) ||
    (profile.promptCaching === "anthropic-ephemeral" &&
      profile.protocol !== "anthropic")
  )
    throw new Error("INVALID_INPUT");
  const protocol = profile.protocol || "openai",
    endpoint = providerEndpoint(profile.baseUrl, protocol);
  if (context.images?.length || context.webSearch)
    throw new Error("PROVIDER_CAPABILITY_UNSUPPORTED");
  const signal = AbortSignal.any([
    AbortSignal.timeout(600_000),
    ...(context.signal ? [context.signal] : []),
  ]);
  signal.throwIfAborted();
  const headers = {
    "content-type": "application/json",
    accept: "text/event-stream",
  };
  if (protocol === "anthropic") {
    if (!context.key) throw new Error("API_KEY_REQUIRED");
    headers["x-api-key"] = context.key;
    headers["anthropic-version"] = "2023-06-01";
  } else if (context.key) headers.authorization = "Bearer " + context.key;
  const body =
    protocol === "anthropic"
      ? {
          model: profile.model,
          max_tokens: profile.maxOutputTokens || 8192,
          stream: true,
          system:
            profile.promptCaching === "anthropic-ephemeral" && context.system
              ? [
                  {
                    type: "text",
                    text: context.system,
                    cache_control: { type: "ephemeral" },
                  },
                ]
              : context.system || "",
          messages: [{ role: "user", content: prompt }],
        }
      : {
          model: profile.model,
          max_tokens: profile.maxOutputTokens || 8192,
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            ...(context.system
              ? [{ role: "system", content: context.system }]
              : []),
            { role: "user", content: prompt },
          ],
        };
  let response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "error",
      signal,
    });
  } catch {
    if (signal.aborted)
      throw new Error(
        context.signal?.aborted ? "CANCELLED" : "PROVIDER_TIMEOUT",
      );
    throw new Error("PROVIDER_NETWORK_FAILED");
  }
  if (!response.ok) {
    const code = await failureCode(response);
    const header = response.headers.get("retry-after");
    const seconds = header === null ? NaN : Number(header);
    const wait = Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(header || "") - Date.now();
    throw Object.assign(
      new Error(code),
      Number.isFinite(wait) && wait > 0
        ? { retryAfterMs: Math.min(wait, 120_000) }
        : {},
    );
  }
  if (
    !response.body ||
    !response.headers.get("content-type")?.includes("text/event-stream")
  ) {
    await response.body?.cancel();
    throw new Error("PROVIDER_STREAM_INVALID");
  }
  let text = "",
    buffer = "",
    bytes = 0,
    ended = false;
  let usage,
    rawUsage = {};
  const reader = response.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  const consume = (block) => {
    const data = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    if (data === "[DONE]") {
      ended = true;
      return;
    }
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      throw new Error("PROVIDER_STREAM_INVALID");
    }
    if (event.error || event.type === "error")
      throw new Error("PROVIDER_REQUEST_FAILED");
    if (event.type === "message_stop") ended = true;
    const reported =
      protocol === "anthropic"
        ? event.type === "message_start"
          ? event.message?.usage
          : event.type === "message_delta"
            ? event.usage
            : undefined
        : event.usage;
    if (reported) {
      rawUsage = { ...rawUsage, ...reported };
      usage = providerUsage(protocol, rawUsage);
    }
    const delta =
      protocol === "anthropic"
        ? event.type === "content_block_delta" &&
          event.delta?.type === "text_delta"
          ? event.delta.text
          : ""
        : event.choices?.[0]?.delta?.content || "";
    if (
      protocol === "anthropic" &&
      event.type === "content_block_start" &&
      event.content_block?.type === "tool_use"
    )
      throw new Error("PROVIDER_TOOL_DENIED");
    if (
      event.choices?.some(
        (c) => c.delta?.tool_calls?.length || c.delta?.function_call,
      )
    )
      throw new Error("PROVIDER_TOOL_DENIED");
    if (typeof delta !== "string") throw new Error("PROVIDER_STREAM_INVALID");
    text += delta;
    if (text.length > 200_000) throw new Error("PROVIDER_OUTPUT_LIMIT");
    if (delta) context.emit?.(delta);
  };
  const cancel = () => void reader.cancel().catch(() => {});
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (!ended) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 2_000_000) throw new Error("PROVIDER_OUTPUT_LIMIT");
      buffer += decoder.decode(chunk.value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      if (buffer.length > 250_000) throw new Error("PROVIDER_OUTPUT_LIMIT");
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        consume(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (ended) break;
      }
    }
    if (signal.aborted)
      throw new Error(
        context.signal?.aborted ? "CANCELLED" : "PROVIDER_TIMEOUT",
      );
    if (!ended || !text.trim()) throw new Error("PROVIDER_STREAM_INCOMPLETE");
    return text;
  } catch (error) {
    if (signal.aborted)
      throw new Error(
        context.signal?.aborted ? "CANCELLED" : "PROVIDER_TIMEOUT",
      );
    if (error instanceof TypeError) throw new Error("PROVIDER_STREAM_INVALID");
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    // One observation per attempt, including a stream that fails after reporting usage.
    if (usage) context.onUsage?.(usage);
  }
}
