import { test } from "node:test";
import assert from "node:assert/strict";
import { compatibleRun } from "../src/modules/providers/compatible.js";
import { providerUsage } from "../src/modules/providers/usage.js";
const event = (data) => `data: ${JSON.stringify(data)}\n\n`;
const stream = (text) =>
  new Response(text, { headers: { "content-type": "text/event-stream" } });

test("Gemini reported input includes cached content and output includes thinking without doubling cache tokens", () => {
  assert.deepEqual(
    providerUsage("gemini", {
      promptTokenCount: 100,
      cachedContentTokenCount: 40,
      candidatesTokenCount: 5,
      thoughtsTokenCount: 2,
    }),
    { input: 100, output: 7, total: 107, cachedInput: 40 },
  );
  assert.deepEqual(
    providerUsage("gemini", { promptTokenCount: 100, candidatesTokenCount: 5 }),
    { input: 100, output: 5, total: 105 },
  );
  assert.throws(
    () =>
      providerUsage("gemini", {
        promptTokenCount: 10,
        cachedContentTokenCount: 11,
      }),
    /PROVIDER_STREAM_INVALID/,
  );
});

test("Anthropic explicit caching is opt-in, keeps a stable system block and retains separate read/write usage", async () => {
  const bodies = [],
    usages = [];
  const profile = {
    baseUrl: "https://fixture.invalid/v1",
    protocol: "anthropic",
    model: "fixture",
    promptCaching: "anthropic-ephemeral",
    maxOutputTokens: 1024,
  };
  const fetcher = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return stream(
      event({
        type: "message_start",
        message: {
          usage: {
            input_tokens: 10,
            cache_read_input_tokens: 30,
            cache_creation_input_tokens: 5,
          },
        },
      }) +
        event({
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Done" },
        }) +
        event({ type: "message_delta", usage: { output_tokens: 2 } }) +
        event({ type: "message_stop" }),
    );
  };
  const context = {
    key: "synthetic",
    system: "Static rules",
    onUsage: (usage) => usages.push(usage),
  };
  await compatibleRun("First request", profile, context, fetcher);
  await compatibleRun("Second request", profile, context, fetcher);
  assert.deepEqual(bodies[0].system, [
    {
      type: "text",
      text: "Static rules",
      cache_control: { type: "ephemeral" },
    },
  ]);
  assert.deepEqual(bodies[0].system, bodies[1].system);
  assert.equal(bodies[0].max_tokens, 1024);
  assert.deepEqual(
    usages,
    Array(2).fill({
      input: 45,
      output: 2,
      total: 47,
      cachedInput: 30,
      cacheWriteInput: 5,
    }),
  );
  await compatibleRun(
    "Uncached request",
    { ...profile, promptCaching: "off" },
    context,
    fetcher,
  );
  assert.equal(bodies[2].system, "Static rules");
  await assert.rejects(
    compatibleRun(
      "Request",
      { ...profile, protocol: "openai" },
      context,
      fetcher,
    ),
    /INVALID_INPUT/,
  );
});

test("OpenAI/DeepSeek cache reads are subsets of input and absent cache observations remain unknown", async () => {
  for (const raw of [
    {
      prompt_tokens: 100,
      completion_tokens: 4,
      prompt_tokens_details: { cached_tokens: 40 },
    },
    { prompt_tokens: 100, completion_tokens: 4, prompt_cache_hit_tokens: 40 },
    { prompt_tokens: 100, completion_tokens: 4 },
  ]) {
    let usage;
    await compatibleRun(
      "Request",
      { baseUrl: "https://fixture.invalid/v1", model: "fixture" },
      {
        onUsage: (count) => {
          usage = count;
        },
      },
      async () =>
        stream(
          event({ choices: [{ delta: { content: "Done" } }], usage: raw }) +
            "data: [DONE]\n\n",
        ),
    );
    assert.equal(usage.input, 100);
    assert.equal(usage.total, 104);
    assert.equal(
      usage.cachedInput,
      raw.prompt_tokens_details || raw.prompt_cache_hit_tokens ? 40 : undefined,
    );
  }
});

test("invalid remote cache counts fail closed and previously observed usage survives an incomplete stream once", async () => {
  const profile = { baseUrl: "https://fixture.invalid/v1", model: "fixture" };
  await assert.rejects(
    compatibleRun("Request", profile, {}, async () =>
      stream(
        event({
          usage: {
            prompt_tokens: 10,
            completion_tokens: 2,
            prompt_tokens_details: { cached_tokens: 20 },
          },
        }),
      ),
    ),
    /STREAM_INVALID/,
  );
  const counts = [];
  await assert.rejects(
    compatibleRun(
      "Request",
      profile,
      { onUsage: (usage) => counts.push(usage) },
      async () =>
        stream(
          event({
            choices: [{ delta: { content: "Partial" } }],
            usage: { prompt_tokens: 10, completion_tokens: 2 },
          }),
        ),
    ),
    /INCOMPLETE/,
  );
  assert.deepEqual(counts, [{ input: 10, output: 2, total: 12 }]);
});
