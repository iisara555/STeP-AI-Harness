import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { GeminiApiAdapter } from '../electron/gemini-api';
import { GeminiAdapter, type ProviderContext, type TokenCount } from '../electron/providers';
import type { Connection } from '../src/types';

const connection = {
  id: 'synthetic',
  provider: 'gemini',
  mode: 'api',
  model: 'gemini-2.5-flash',
  maxOutputTokens: 1024,
  promptCaching: 'gemini-explicit',
} as Connection;
const context = (extra: Partial<ProviderContext> = {}): ProviderContext => ({
  cwd: tmpdir(),
  env: {},
  key: 'synthetic-key',
  system: 'Standing rules',
  emit: () => {},
  signal: new AbortController().signal,
  ...extra,
});
const event = (data: unknown) => 'data: ' + JSON.stringify(data) + '\n\n';
const stream = (cached = 40, complete = true) =>
  new Response(
    event({
      candidates: [
        { content: { parts: [{ thought: true, text: 'Reasoning' }, { text: 'Done' }] }, ...(complete ? { finishReason: 'STOP' } : {}) },
      ],
      usageMetadata: {
        promptTokenCount: 100,
        cachedContentTokenCount: cached,
        candidatesTokenCount: 5,
        thoughtsTokenCount: 2,
        totalTokenCount: 107,
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );

test('Gemini API dispatch caches only the stable system, reuses across adapter instances and preserves cache/thinking usage', async () => {
  const calls: { url: string; body: any }[] = [],
    counts: TokenCount[] = [],
    transports: any[] = [],
    reasoning: string[] = [];
  const fetcher = async (url: any, options?: RequestInit) => {
    const body = JSON.parse(String(options?.body));
    calls.push({ url: String(url), body });
    assert.equal((options!.headers as any)['x-goog-api-key'], 'synthetic-key');
    return String(url).endsWith('/cachedContents') ? Response.json({ name: 'cachedContents/fixture' }) : stream();
  };
  const cache = new Map();
  const ctx = context({ onUsage: u => counts.push(u), onTransport: t => transports.push(t), onReasoning: t => reasoning.push(t) });
  const first = new GeminiAdapter(new GeminiApiAdapter(fetcher as typeof fetch, cache));
  const second = new GeminiAdapter(new GeminiApiAdapter(fetcher as typeof fetch, cache));
  assert.equal(await first.run('Request', connection, ctx), 'Done');
  assert.equal(await second.run('Request\nTool result', connection, ctx), 'Done');
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].body, {
    model: 'models/gemini-2.5-flash',
    systemInstruction: { parts: [{ text: 'Standing rules' }] },
    ttl: '300s',
  });
  for (const { body } of calls.slice(1)) {
    assert.equal(body.cachedContent, 'cachedContents/fixture');
    assert.equal(body.systemInstruction, undefined);
    assert.equal(body.tools, undefined);
    assert.equal(body.generationConfig.maxOutputTokens, 1024);
  }
  assert.equal(calls[2].body.contents[0].parts[0].text, 'Request\nTool result', 'stateless API still needs the dynamic prompt');
  assert.deepEqual(counts, Array(2).fill({ input: 100, output: 7, total: 107, cachedInput: 40 }));
  assert.deepEqual(
    transports.map(t => t.cacheStatus),
    ['created', 'reused'],
  );
  assert.deepEqual(reasoning, ['Reasoning', 'Reasoning']);
});

test('Gemini prefix cache expires, bounds host memory and isolates account/model/system bindings', async () => {
  let clock = 0,
    created = 0;
  const cache = new Map();
  const fetcher = async (url: any) =>
    String(url).endsWith('/cachedContents') ? Response.json({ name: 'cachedContents/f' + ++created }) : stream();
  const adapter = new GeminiApiAdapter(fetcher as typeof fetch, cache, () => clock);
  await adapter.run('Request', connection, context());
  await adapter.run('Request', connection, context());
  assert.equal(created, 1);
  for (const [c, ctx] of [
    [{ ...connection, id: 'another' }, context()],
    [{ ...connection, model: 'gemini-2.5-pro' }, context()],
    [connection, context({ key: 'another' })],
    [connection, context({ system: 'Changed' })],
  ] as const)
    await adapter.run('Request', c, ctx);
  assert.equal(created, 5);
  clock = 300001;
  await adapter.run('Request', connection, context());
  assert.equal(created, 6);
  for (let i = 0; i < 12; i++) await adapter.run('Request', { ...connection, id: 'c' + i }, context());
  assert.ok(cache.size <= 8);
});

test('unsupported caching and expired server resources fall back once without losing the system rules', async () => {
  for (const unavailable of ['creation', 'resource']) {
    const bodies: any[] = [];
    let creates = 0;
    const adapter = new GeminiApiAdapter(
      (async (url: any, options?: RequestInit) => {
        const body = JSON.parse(String(options?.body));
        bodies.push(body);
        if (String(url).endsWith('/cachedContents')) {
          creates++;
          return unavailable === 'creation'
            ? Response.json({ error: { status: 'INVALID_ARGUMENT' } }, { status: 400 })
            : Response.json({ name: 'cachedContents/fixture' });
        }
        if (body.cachedContent) return Response.json({ error: { status: 'NOT_FOUND' } }, { status: 404 });
        assert.equal(body.systemInstruction.parts[0].text, 'Standing rules');
        return stream(0);
      }) as typeof fetch,
      new Map(),
    );
    assert.equal(await adapter.run('Request', connection, context()), 'Done');
    assert.equal(await adapter.run('Request again', connection, context()), 'Done');
    assert.equal(creates, 1);
    assert.equal(bodies.filter(body => body.cachedContent).length, unavailable === 'resource' ? 1 : 0);
  }
});

test('Gemini cache auth/quota errors stop before generation; failed stream retains usage and native tools are denied', async () => {
  const daily = [
    {
      '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
    },
  ];
  const minute = [
    {
      '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }],
    },
  ];
  for (const [status, details, expected] of [
    [401, undefined, 'LOGIN_REQUIRED'],
    [403, undefined, 'LOGIN_REQUIRED'],
    [429, daily, 'PROVIDER_QUOTA'],
    // A per-minute rate limit passes: the host retries it as a busy service instead of reporting a used-up quota.
    [429, minute, 'PROVIDER_BUSY'],
  ] as const) {
    let calls = 0;
    const adapter = new GeminiApiAdapter(
      (async () => {
        calls++;
        return Response.json(
          { error: { message: 'private diagnostic', status: status === 429 ? 'RESOURCE_EXHAUSTED' : 'PERMISSION_DENIED', details } },
          { status },
        );
      }) as typeof fetch,
      new Map(),
    );
    await assert.rejects(adapter.run('Request', connection, context()), new RegExp(expected));
    assert.equal(calls, 1);
  }
  const counts: TokenCount[] = [];
  const adapter = new GeminiApiAdapter((async () => stream(0, false)) as typeof fetch, new Map());
  await assert.rejects(
    adapter.run('Request', connection, context({ system: undefined, onUsage: u => counts.push(u) })),
    /PROVIDER_STREAM_INCOMPLETE/,
  );
  assert.deepEqual(counts[0], { input: 100, output: 7, total: 107, cachedInput: 0 });
  const denied = new GeminiApiAdapter(
    (async () =>
      new Response(event({ candidates: [{ content: { parts: [{ functionCall: { name: 'shell' } }] }, finishReason: 'STOP' }] }), {
        headers: { 'content-type': 'text/event-stream' },
      })) as typeof fetch,
    new Map(),
  );
  await assert.rejects(denied.run('Request', connection, context({ system: undefined })), /PROVIDER_TOOL_DENIED/);
});

test('Gemini stream cancellation releases the reader and rejects untrusted endpoint overrides', async () => {
  const controller = new AbortController();
  let cancelled = 0;
  const adapter = new GeminiApiAdapter(
    (async () => {
      queueMicrotask(() => controller.abort());
      return new Response(
        new ReadableStream({
          cancel: () => {
            cancelled++;
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    }) as typeof fetch,
    new Map(),
  );
  await assert.rejects(adapter.run('Request', connection, context({ system: undefined, signal: controller.signal })), /CANCELLED/);
  assert.equal(cancelled, 1);
  await assert.rejects(adapter.run('Request', connection, context({ geminiBaseUrl: 'https://untrusted.example' })), /INVALID_INPUT/);
});

test('cancelling a cache waiter stops immediately without cancelling the shared creator', async () => {
  let resolveCache!: (response: Response) => void;
  let generation = 0;
  const cacheResponse = new Promise<Response>(resolve => {
    resolveCache = resolve;
  });
  const adapter = new GeminiApiAdapter(
    (async (url: any) => {
      if (String(url).endsWith('/cachedContents')) return cacheResponse;
      generation++;
      return stream();
    }) as typeof fetch,
    new Map(),
  );
  const owner = adapter.run('Owner request', connection, context());
  const controller = new AbortController();
  const waiter = adapter.run('Waiter request', connection, context({ signal: controller.signal }));
  controller.abort();
  await assert.rejects(waiter, /CANCELLED/);
  assert.equal(generation, 0);
  resolveCache(Response.json({ name: 'cachedContents/shared' }));
  assert.equal(await owner, 'Done');
  assert.equal(generation, 1);
});
