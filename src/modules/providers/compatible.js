import { parseRateLimitHeaders, providerUsage } from "./usage.js";
// Error bodies are untrusted and may contain private text. Inspect only a bounded structured code/type
// and test message against static limit patterns without returning or logging raw text.
async function failureCode(response) {
  let code = "";
  let message = "";
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
        const parsed = JSON.parse(body);
        const error = parsed?.error;
        code = [error?.code, error?.type]
          .filter((v) => typeof v === "string")
          .join(" ");
        const rawMessage =
          typeof error?.message === "string"
            ? error.message
            : typeof parsed?.message === "string"
              ? parsed.message
              : "";
        message = rawMessage.slice(0, 500);
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
  if (response.status === 429) return "PROVIDER_RATE_LIMIT";
  if (response.status >= 500) return "PROVIDER_UNAVAILABLE";
  if (
    /\b(context_length_exceeded|prompt_too_long)\b/.test(code) ||
    /(?:context.{0,25}(?:length|window|limit|exceed)|(?:prompt|input|request|message).{0,25}(?:too long|too large|exceed|token limit)|maximum.{0,20}(?:context|tokens?)|too many tokens)/i.test(
      message,
    )
  )
    return "PROMPT_TOO_LONG";
  return "PROVIDER_REQUEST_FAILED";
}
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
function imageParts(images, protocol) {
  if (images === undefined) return [];
  if (!Array.isArray(images) || images.length > 40)
    throw new Error("INVALID_INPUT");
  return images.map((image) => {
    if (
      !IMAGE_TYPES.includes(image?.mime) ||
      typeof image.data !== "string" ||
      !image.data ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)
    )
      throw new Error("INVALID_INPUT");
    return protocol === "anthropic"
      ? {
          type: "image",
          source: { type: "base64", media_type: image.mime, data: image.data },
        }
      : {
          type: "image_url",
          image_url: { url: `data:${image.mime};base64,${image.data}` },
        };
  });
}
/** Bounded API transport shared by Desktop, the CLI and server runners. */
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
  if (typeof prompt !== "string") throw new Error("INVALID_INPUT");
  if (prompt.length > 400_000) throw new Error("PROMPT_TOO_LONG");
  if (
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
  const native =
    protocol === "openai" &&
    Array.isArray(context.nativeTools) &&
    context.nativeTools.length > 0;
  if (
    native &&
    (context.nativeTools.length > 8 ||
      JSON.stringify(context.nativeTools).length > 20_000)
  )
    throw new Error("INVALID_INPUT");
  if (context.webSearch) throw new Error("PROVIDER_CAPABILITY_UNSUPPORTED");
  // Pictures (an image or the pages of a scanned PDF) go as standard content parts, the way the OpenAI and Anthropic
  // APIs and the services that copy them (OpenRouter, Qwen, MiniMax, Ollama, ...) take them. Whether the chosen model
  // reads them is the service's answer: a refusal comes back as VISION_UNAVAILABLE, never as a silent text-only reply.
  const images = imageParts(context.images, protocol);
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
  if (endpoint.hostname === "openrouter.ai") {
    headers["HTTP-Referer"] = "https://step.cmu.ac.th";
    headers["X-Title"] = "STeP Desktop";
  }
  const hasHistory =
    Array.isArray(context.messages) && context.messages.length > 0;
  const historyMessages = hasHistory
    ? context.messages
        .filter(
          (m) =>
            (m?.role === "user" || m?.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.length > 0,
        )
        .map((m) => ({ role: m.role, content: m.content }))
    : [];
  let sentReasoningEffort =
    protocol === "openai" &&
    ["low", "medium", "high"].includes(context.effort);
  const anthropicThinkingBudgets = {
    low: 1024,
    medium: 4096,
    high: 8192,
    xhigh: 16384,
    max: 24576,
  };
  let sentAnthropicThinking =
    protocol === "anthropic" &&
    !images.length &&
    typeof context.effort === "string" &&
    Object.hasOwn(anthropicThinkingBudgets, context.effort);
  const thinkingBudget = sentAnthropicThinking
    ? anthropicThinkingBudgets[context.effort]
    : 0;
  const anthropicBaseMax = profile.maxOutputTokens || 8192;
  const anthropicMaxTokens = sentAnthropicThinking
    ? Math.min(64_000, Math.max(anthropicBaseMax, thinkingBudget + 4096))
    : anthropicBaseMax;
  const openRouterRouting =
    protocol === "openai" &&
    profile.providerRouting &&
    (endpoint.hostname === "openrouter.ai" ||
      (profile.preset === "openrouter" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)))
      ? {
          ...(profile.providerRouting.zdrOnly
            ? { data_collection: "deny" }
            : {}),
          ...(profile.providerRouting.sort &&
          ["price", "throughput", "latency"].includes(
            profile.providerRouting.sort,
          )
            ? { sort: profile.providerRouting.sort }
            : {}),
        }
      : undefined;
  const routingPayload =
    openRouterRouting && Object.keys(openRouterRouting).length
      ? { provider: openRouterRouting }
      : {};
  let sentJsonFormat =
    protocol === "openai" &&
    Boolean(context.jsonSchema) &&
    endpoint.hostname === "api.openai.com";
  const anthropicUserContent = images.length
    ? [{ type: "text", text: prompt }, ...images]
    : profile.promptCaching === "anthropic-ephemeral" &&
        !historyMessages.length &&
        prompt.length >= 2048 &&
        prompt.includes("\n\n<current_message>\n")
      ? [
          {
            type: "text",
            text: prompt.slice(0, prompt.indexOf("\n\n<current_message>\n")),
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: prompt.slice(
              prompt.indexOf("\n\n<current_message>\n") + 2,
            ),
          },
        ]
      : prompt;
  const anthropicMessages = historyMessages.length
    ? [
        ...historyMessages.map((m, idx) =>
          profile.promptCaching === "anthropic-ephemeral" &&
          idx === historyMessages.length - 1
            ? {
                role: m.role,
                content: [
                  {
                    type: "text",
                    text: m.content,
                    cache_control: { type: "ephemeral" },
                  },
                ],
              }
            : m,
        ),
        { role: "user", content: anthropicUserContent },
      ]
    : [{ role: "user", content: anthropicUserContent }];
  const body =
    protocol === "anthropic"
      ? {
          model: profile.model,
          max_tokens: anthropicMaxTokens,
          stream: true,
          ...(sentAnthropicThinking
            ? { thinking: { type: "enabled", budget_tokens: thinkingBudget } }
            : {}),
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
          messages: anthropicMessages,
        }
      : {
          model: profile.model,
          ...(profile.maxOutputTokens
            ? { max_tokens: profile.maxOutputTokens }
            : context.longFormTor
              ? {}
              : { max_tokens: 8192 }),
          stream: true,
          stream_options: { include_usage: true },
          ...(sentReasoningEffort ? { reasoning_effort: context.effort } : {}),
          ...(sentJsonFormat ? { response_format: { type: "json_object" } } : {}),
          ...routingPayload,
          // Native tool calling (policy nativeToolCalls): the service returns tool requests as structured calls whose
          // arguments it has already escaped, instead of JSON the model writes by hand in a step-tool fence.
          ...(native ? { tools: context.nativeTools } : {}),
          messages: [
            ...(context.system
              ? [{ role: "system", content: context.system }]
              : []),
            ...historyMessages,
            {
              role: "user",
              content: images.length
                ? [{ type: "text", text: prompt }, ...images]
                : prompt,
            },
          ],
        };
  let response;
  for (let attempt = 0; attempt < 2; attempt++) {
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
    const rateLimits = parseRateLimitHeaders(response.headers);
    if (rateLimits.length) context.onRateLimits?.(rateLimits);
    if (response.ok) break;
    let code = await failureCode(response);
    if (
      (sentReasoningEffort || sentAnthropicThinking || sentJsonFormat) &&
      attempt === 0 &&
      [400, 422].includes(response.status) &&
      code === "PROVIDER_REQUEST_FAILED"
    ) {
      if (sentReasoningEffort) {
        delete body.reasoning_effort;
        sentReasoningEffort = false;
      }
      if (sentAnthropicThinking) {
        delete body.thinking;
        body.max_tokens = anthropicBaseMax;
        sentAnthropicThinking = false;
      }
      if (sentJsonFormat) {
        delete body.response_format;
        sentJsonFormat = false;
      }
      continue;
    }
    if (
      images.length &&
      code === "PROVIDER_REQUEST_FAILED" &&
      [400, 404, 415, 422].includes(response.status)
    )
      code = "VISION_UNAVAILABLE";
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
    ended = false,
    outputTruncated = false;
  let usage,
    rawUsage = {};
  const calls = [];
  let callChars = 0;
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
    if (
      (protocol === "anthropic" &&
        event.type === "message_delta" &&
        event.delta?.stop_reason === "max_tokens") ||
      (protocol === "openai" &&
        event.choices?.some((choice) => choice.finish_reason === "length"))
    )
      outputTruncated = true;
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
    const reasoningDelta =
      protocol === "anthropic"
        ? event.type === "content_block_delta" &&
          event.delta?.type === "thinking_delta" &&
          typeof event.delta.thinking === "string"
          ? event.delta.thinking
          : ""
        : typeof event.choices?.[0]?.delta?.reasoning_content === "string"
          ? event.choices[0].delta.reasoning_content
          : typeof event.choices?.[0]?.delta?.reasoning === "string"
            ? event.choices[0].delta.reasoning
            : "";
    if (reasoningDelta) context.onReasoning?.(reasoningDelta);
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
    if (native)
      for (const call of event.choices?.[0]?.delta?.tool_calls || []) {
        const index = Number.isSafeInteger(call?.index) ? call.index : calls.length;
        if (index < 0 || index > 15) throw new Error("PROVIDER_OUTPUT_LIMIT");
        calls[index] ??= { name: "", arguments: "" };
        const name = call.function?.name ?? "",
          args = call.function?.arguments ?? "";
        if (typeof name !== "string" || typeof args !== "string")
          throw new Error("PROVIDER_STREAM_INVALID");
        calls[index].name += name;
        calls[index].arguments += args;
        callChars += name.length + args.length;
        if (callChars > 1_700_000) throw new Error("PROVIDER_OUTPUT_LIMIT");
      }
    if (
      event.choices?.some(
        (c) =>
          (!native && c.delta?.tool_calls?.length) || c.delta?.function_call,
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
    if (ended && outputTruncated)
      throw Object.assign(new Error("PROVIDER_OUTPUT_LIMIT"), {
        outputTruncated: true,
      });
    // Each structured call becomes the same step-tool request the text protocol uses, so one parser, one validator and
    // every host gate apply. Backticks are escaped so content holding a code fence cannot end the block early.
    for (const call of calls.filter(Boolean)) {
      let request;
      try {
        const parsed = JSON.parse(call.arguments || "{}");
        request =
          call.name === "step_tool"
            ? parsed
            : { tool: call.name, ...(parsed && typeof parsed === "object" ? parsed : {}) };
        request = JSON.stringify(request);
      } catch {
        // Arguments that are not JSON stay as they came, so the loop reports the request as unreadable.
        request = call.arguments;
      }
      text += "\n\n```step-tool\n" + request.replace(/`/g, "\\u0060") + "\n```";
    }
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
