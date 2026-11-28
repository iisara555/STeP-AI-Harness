import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { compatibleRun } from '../../src/modules/providers/compatible.js';
import { parseRateLimitHeaders, providerUsage } from '../../src/modules/providers/usage.js';
import {
  ClaudeAdapter,
  CodexAdapter,
  GeminiAdapter,
  ProviderSession,
  anthropicApiModels,
  compatibleModels,
  geminiApiModels,
  openAiApiModels,
  type ProviderContext,
  type TokenCount,
} from '../electron/providers';
import { GeminiApiAdapter } from '../electron/gemini-api';
import { lookupCatalogModel, normalizeCatalogModelId } from '../electron/model-catalog';
import { CooldownTracker } from '../electron/cooldown';
import { CostLedger } from '../electron/cost';
import { contextBudget } from '../electron/compact';
import { ProviderUsage } from '../electron/provider-usage';
import { Store } from '../electron/store';
import { defaultPolicy } from '../electron/policy';
import { connectionCapabilities } from '../src/connection-capabilities';
import { accountCacheBreakdown, inlineQuotaReadings, limitLabel, shortWindowLabel } from '../src/usage-readings';
import { usageSourceName } from '../src/usage-display';
import { WorkService } from '../electron/service';
import type { Connection, PolicySnapshot, ProviderUsageReport } from '../src/types';

function sseResponse(lines: string[], headers: Record<string, string> = {}) {
  return new Response(lines.join('\n\n') + '\n\n', {
    status: 200,
    headers: { 'content-type': 'text/event-stream', ...headers },
  });
}

test('compatibleModels extracts OpenRouter/compatible rich metadata while omitting absent fields', async () => {
  const fetcher = (async () =>
    Response.json({
      data: [
        {
          id: 'anthropic/claude-sonnet-4.5',
          name: 'Claude Sonnet 4.5',
          description: 'Fast and smart',
          context_length: 200_000,
          top_provider: { max_completion_tokens: 64_000 },
          pricing: {
            prompt: '0.000003',
            completion: '0.000015',
            input_cache_read: '0.0000003',
            input_cache_write: '0.00000375',
          },
          architecture: { input_modalities: ['text', 'image'] },
          supported_parameters: ['tools', 'reasoning'],
        },
        { id: 'minimal/model', name: 'Minimal' },
      ],
    })) as unknown as typeof fetch;
  const conn = {
    id: 'or',
    provider: 'compatible',
    mode: 'api',
    preset: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    protocol: 'openai',
    model: '',
    executable: '',
    ready: true,
    note: '',
  } as Connection;
  const models = await compatibleModels(conn, 'sk-or', fetcher);
  assert.equal(models.length, 2);
  assert.equal(models[0].contextWindow, 200_000);
  assert.equal(models[0].maxOutputTokens, 64_000);
  assert.deepEqual(models[0].pricing, { input: 3, output: 15, cachedInput: 0.3, cacheWriteInput: 3.75 });
  assert.equal(models[0].supportsVision, true);
  assert.equal(models[0].supportsReasoning, true);
  assert.equal(models[0].supportsTools, true);
  assert.deepEqual(models[0].efforts, [{ id: 'low' }, { id: 'medium' }, { id: 'high' }]);
  // Absent metadata stays omitted so minimal endpoints stay clean.
  assert.deepEqual(models[1], { id: 'minimal/model', label: 'Minimal' });
});

test('direct REST model catalog loaders parse Gemini, Anthropic, and OpenAI /models responses', async () => {
  const gemModels = await geminiApiModels('k', 'https://generativelanguage.googleapis.com', (async () =>
    Response.json({
      models: [
        {
          name: 'models/gemini-2.5-flash',
          displayName: 'Gemini 2.5 Flash',
          inputTokenLimit: 1_048_576,
          outputTokenLimit: 65_536,
          supportedGenerationMethods: ['generateContent'],
        },
        {
          name: 'models/embedding-001',
          displayName: 'Embedding',
          supportedGenerationMethods: ['embedContent'],
        },
      ],
    })) as unknown as typeof fetch);
  assert.equal(gemModels.length, 1);
  assert.equal(gemModels[0].id, 'gemini-2.5-flash');
  assert.equal(gemModels[0].contextWindow, 1_048_576);
  assert.equal(gemModels[0].maxOutputTokens, 65_536);
  assert.equal(gemModels[0].supportsReasoning, true);
  assert.equal(gemModels[0].isDefault, true);

  const claudeModels = await anthropicApiModels('k', (async () =>
    Response.json({
      data: [{ id: 'claude-sonnet-4-5-20250929', display_name: 'Claude Sonnet 4.5' }],
    })) as unknown as typeof fetch);
  assert.equal(claudeModels.length, 1);
  assert.equal(claudeModels[0].contextWindow, 200_000);
  assert.equal(claudeModels[0].pricing?.input, 3);
  assert.equal(claudeModels[0].supportsVision, true);
  assert.equal(claudeModels[0].supportsReasoning, true);

  const oaiModels = await openAiApiModels('k', (async () =>
    Response.json({
      data: [
        { id: 'gpt-4.1', created: 100 },
        { id: 'gpt-5', created: 200 },
        { id: 'whisper-1', created: 300 },
        { id: 'dall-e-3', created: 400 },
      ],
    })) as unknown as typeof fetch);
  assert.deepEqual(
    oaiModels.map(m => m.id),
    ['gpt-5', 'gpt-4.1'],
  );
  assert.equal(oaiModels[0].contextWindow, 400_000);
  assert.equal(oaiModels[1].contextWindow, 1_047_576);
});

test('compatibleRun streams reasoning_content/thinking_delta, OpenRouter exact cost, ZDR routing, and rate-limit headers', async () => {
  const seenBodies: any[] = [];
  const seenHeaders: Record<string, string>[] = [];
  const reasoning: string[] = [];
  const usages: TokenCount[] = [];
  const observedLimits: any[] = [];
  const openRouterFetch = (async (_url: URL, init: any) => {
    seenBodies.push(JSON.parse(init.body));
    seenHeaders.push(init.headers);
    return sseResponse(
      [
        'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: 'Step 1. ' } }] }),
        'data: ' + JSON.stringify({ choices: [{ delta: { reasoning: 'Step 2.' } }] }),
        'data: ' + JSON.stringify({ choices: [{ delta: { content: 'Final answer' } }] }),
        'data: ' + JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 25, cost: 0.001234 } }),
        'data: [DONE]',
      ],
      {
        'x-ratelimit-limit-requests': '100',
        'x-ratelimit-remaining-requests': '75',
        'x-ratelimit-reset-requests': '1m30s',
      },
    );
  }) as unknown as typeof fetch;

  const text = await compatibleRun(
    'Hello',
    {
      baseUrl: 'https://openrouter.ai/api/v1',
      protocol: 'openai',
      preset: 'openrouter',
      model: 'deepseek/deepseek-r1',
      providerRouting: { zdrOnly: true, sort: 'latency' },
    },
    {
      key: 'sk-or-test',
      onReasoning: (r: string) => reasoning.push(r),
      onUsage: (u: TokenCount) => usages.push(u),
      onRateLimits: (l: any[]) => observedLimits.push(...l),
    },
    openRouterFetch,
  );
  assert.equal(text, 'Final answer');
  assert.deepEqual(reasoning, ['Step 1. ', 'Step 2.']);
  assert.equal(usages[0].costUsd, 0.001234);
  assert.deepEqual(seenBodies[0].provider, { zdr: true, data_collection: 'deny', sort: 'latency' });
  assert.equal(seenHeaders[0]['X-Title'], 'STeP Desktop');
  assert.equal(observedLimits.length, 1);
  assert.equal(observedLimits[0].name, 'requests');
  assert.equal(observedLimits[0].usedPercent, 25);

  // Anthropic extended thinking + thinking_delta + anthropic-ratelimit-* headers
  const anthBodies: any[] = [];
  const anthThinking: string[] = [];
  const anthLimits: any[] = [];
  const anthFetch = (async (_url: URL, init: any) => {
    anthBodies.push(JSON.parse(init.body));
    return sseResponse(
      [
        'data: ' +
          JSON.stringify({
            type: 'message_start',
            message: { usage: { input_tokens: 10, cache_read_input_tokens: 40, cache_creation_input_tokens: 5 } },
          }),
        'data: ' + JSON.stringify({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Analyzing...' } }),
        'data: ' + JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Done' } }),
        'data: ' + JSON.stringify({ type: 'message_delta', usage: { output_tokens: 12 } }),
        'data: ' + JSON.stringify({ type: 'message_stop' }),
      ],
      {
        'anthropic-ratelimit-input-tokens-limit': '100000',
        'anthropic-ratelimit-input-tokens-remaining': '60000',
        'anthropic-ratelimit-input-tokens-reset': '2026-11-28T12:00:00Z',
      },
    );
  }) as unknown as typeof fetch;

  const anthText = await compatibleRun(
    'Analyze this',
    {
      baseUrl: 'https://api.anthropic.com/v1',
      protocol: 'anthropic',
      model: 'claude-sonnet-4-5',
      promptCaching: 'anthropic-ephemeral',
    },
    {
      key: 'sk-ant-test',
      system: 'Rules',
      effort: 'high',
      onReasoning: (r: string) => anthThinking.push(r),
      onRateLimits: (l: any[]) => anthLimits.push(...l),
    },
    anthFetch,
  );
  assert.equal(anthText, 'Done');
  assert.deepEqual(anthThinking, ['Analyzing...']);
  assert.deepEqual(anthBodies[0].thinking, { type: 'enabled', budget_tokens: 8192 });
  assert.equal(anthLimits[0].name, 'input_tokens');
  assert.equal(anthLimits[0].usedPercent, 40);
  assert.equal(anthLimits[0].resetsAt, '2026-11-28T12:00:00.000Z');
});

test('GeminiAdapter defaults all API-key text runs to native REST with multi-turn ProviderSession history', async () => {
  const bodies: any[] = [];
  const api = new GeminiApiAdapter(
    (async (_url: any, init: any) => {
      bodies.push(JSON.parse(String(init.body)));
      return sseResponse([
        'data: ' +
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: bodies.length === 1 ? 'Turn 1 reply' : 'Turn 2 reply' }] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 5 },
          }),
      ]);
    }) as unknown as typeof fetch,
    new Map(),
  );
  const adapter = new GeminiAdapter(api, true);
  const session = new ProviderSession();
  const conn = {
    id: 'g1',
    provider: 'gemini',
    mode: 'api',
    model: '', // Empty model defaults cleanly to gemini-2.5-flash
    executable: '',
    ready: true,
    note: '',
  } as Connection;
  const ctx: ProviderContext = {
    cwd: tmpdir(),
    env: {},
    key: 'AIza-synthetic',
    system: 'Rules',
    signal: new AbortController().signal,
    emit: () => {},
    session,
  };
  assert.equal(await adapter.run('First turn', conn, ctx), 'Turn 1 reply');
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].contents.length, 1);
  assert.equal(await adapter.run('First turn\n<tool_results>ok</tool_results>', conn, ctx), 'Turn 2 reply');
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].contents.length, 3);
  assert.equal(bodies[1].contents[1].role, 'model');
  assert.equal(bodies[1].contents[1].parts[0].text, 'Turn 1 reply');
  assert.equal(bodies[1].contents[2].parts[0].text, '\n<tool_results>ok</tool_results>');
  await session.closeAndWait();
});

test('ClaudeAdapter and CodexAdapter direct HTTP fast paths skip subprocesses for official API keys', async () => {
  const urls: string[] = [];
  const fetcher = (async (url: URL, init: any) => {
    urls.push(String(url));
    const body = JSON.parse(init.body);
    if (String(url).includes('anthropic.com')) {
      assert.ok(Array.isArray(body.system) && body.system[0].cache_control?.type === 'ephemeral');
      return sseResponse([
        'data: ' + JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 5 } } }),
        'data: ' + JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Direct Claude' } }),
        'data: ' + JSON.stringify({ type: 'message_delta', usage: { output_tokens: 2 } }),
        'data: ' + JSON.stringify({ type: 'message_stop' }),
      ]);
    }
    return sseResponse([
      'data: ' + JSON.stringify({ choices: [{ delta: { content: 'Direct OpenAI' } }] }),
      'data: ' + JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 2 } }),
      'data: [DONE]',
    ]);
  }) as unknown as typeof fetch;

  const claude = new ClaudeAdapter(async () => {
    throw new Error('SDK must not be loaded on direct API fast path');
  }, fetcher);
  const oai = new CodexAdapter(fetcher);
  const baseCtx: ProviderContext = {
    cwd: tmpdir(),
    env: {},
    key: 'sk-synthetic',
    system: 'Rules',
    signal: new AbortController().signal,
    emit: () => {},
  };
  assert.equal(
    await claude.run(
      'Hi',
      { id: 'c1', provider: 'claude', mode: 'api', model: 'claude-sonnet-4-5', executable: '', ready: true, note: '' },
      baseCtx,
    ),
    'Direct Claude',
  );
  assert.equal(
    await oai.run('Hi', { id: 'o1', provider: 'openai', mode: 'api', model: 'gpt-4.1', executable: '', ready: true, note: '' }, baseCtx),
    'Direct OpenAI',
  );
  assert.deepEqual(urls, ['https://api.anthropic.com/v1/messages', 'https://api.openai.com/v1/chat/completions']);
});

test('model catalog, contextBudget, and CostLedger follow exact precedence (Policy > Provider cost > Live /models > Catalog > Unpriced)', () => {
  assert.equal(normalizeCatalogModelId('anthropic/claude-sonnet-4.5:thinking'), 'claude-sonnet-4.5');
  assert.equal(lookupCatalogModel('anthropic/claude-sonnet-4-5-20250929')?.pricing?.input, 3);
  assert.equal(lookupCatalogModel('test'), undefined);

  // contextBudget uses live ModelOption.contextWindow over regex defaults
  assert.equal(
    contextBudget({
      provider: 'compatible',
      model: 'custom/big-model',
      models: [{ id: 'custom/big-model', label: 'Big', contextWindow: 160_000 }],
    }),
    96_000,
  );

  const store = new Store(':memory:');
  const policy = defaultPolicy();
  const ledger = new CostLedger(
    store,
    () => policy,
    () => new Date('2026-11-28T00:00:00Z'),
  );

  // 1) Offline catalog prices real API model without policy config
  ledger.record(
    { id: 'c-api', provider: 'claude', mode: 'api', model: 'claude-sonnet-4-5', executable: '', ready: true, note: '' },
    { input: 1_000_000, output: 100_000, total: 1_100_000, cachedInput: 500_000 },
  );
  // 500k * $3 + 500k * $0.30 + 100k * $15 = 1.5 + 0.15 + 1.5 = $3.15
  assert.equal(ledger.report().monthlyUsd, 3.15);
  assert.equal(ledger.report().unpricedTokens, 0);

  // 2) Provider exact costUsd (OpenRouter) overrides catalog/live pricing
  ledger.record(
    { id: 'c-or', provider: 'compatible', mode: 'api', model: 'anthropic/claude-sonnet-4.5', executable: '', ready: true, note: '' },
    providerUsage('openai', { prompt_tokens: 1000, completion_tokens: 500, cost: 0.0042 }),
  );
  assert.equal(ledger.report().monthlyUsd, 3.1542);

  // 3) Live /models pricing applies for models not in offline catalog
  ledger.record(
    {
      id: 'c-live',
      provider: 'compatible',
      mode: 'api',
      model: 'vendor/custom-v2',
      executable: '',
      ready: true,
      note: '',
      models: [{ id: 'vendor/custom-v2', label: 'Custom V2', pricing: { input: 2, output: 4 } }],
    },
    { input: 500_000, output: 250_000, total: 750_000 },
  );
  // 0.5 * $2 + 0.25 * $4 = $2.00
  assert.equal(ledger.report().monthlyUsd, 5.1542);

  // 4) Subscriptions without admin policy stay unpriced (not misbilled at API rates)
  ledger.record(
    { id: 'c-sub', provider: 'openai', mode: 'subscription', model: 'gpt-5', executable: '', ready: true, note: '' },
    { input: 100, output: 50, total: 150 },
  );
  assert.equal(ledger.report().unpricedTokens, 150);
  store.close();
});

test('ProviderUsage passive header telemetry, smart model-family quota chip, cache split, and vision capabilities work together', () => {
  const usage = new ProviderUsage(
    async () => ({ cwd: tmpdir(), env: {}, key: 'k' }),
    undefined,
    () => new Date('2026-11-28T10:00:00Z'),
  );
  const apiConn: Connection = {
    id: 'claude-api-1',
    provider: 'claude',
    mode: 'api',
    model: 'claude-sonnet-4-5',
    executable: '',
    ready: true,
    note: '',
  };
  const headers = new Headers({
    'anthropic-ratelimit-requests-limit': '50',
    'anthropic-ratelimit-requests-remaining': '40',
    'anthropic-ratelimit-input-tokens-limit': '100000',
    'anthropic-ratelimit-input-tokens-remaining': '20000',
  });
  const parsed = parseRateLimitHeaders(headers, Date.parse('2026-11-28T10:00:00Z'));
  usage.observeRateLimits(apiConn, parsed);
  const snap = usage.snapshot(apiConn);
  assert.equal(snap.status, 'ok');
  assert.equal(snap.source, 'claude-api');
  assert.equal(usageSourceName('claude-api'), 'Claude API');
  assert.equal(snap.limits.length, 2);
  assert.equal(shortWindowLabel(snap.limits[0]), 'RPM');
  assert.equal(limitLabel(snap.limits[1]), 'Token ขาเข้า');

  // Smart model-family matching for Antigravity multi-group limits
  const agyReport: ProviderUsageReport = {
    connectionId: 'agy-1',
    provider: 'antigravity',
    mode: 'subscription',
    label: 'Antigravity',
    status: 'ok',
    source: 'antigravity',
    canRefresh: true,
    hasDashboard: true,
    limits: [
      { name: 'five_hour', scope: 'Gemini Models', windowMinutes: 300, usedPercent: 10 },
      { name: 'seven_day', scope: 'Gemini Models', windowMinutes: 10080, usedPercent: 25 },
      { name: 'five_hour', scope: 'Claude and GPT models', windowMinutes: 300, usedPercent: 70 },
      { name: 'seven_day', scope: 'Claude and GPT models', windowMinutes: 10080, usedPercent: 80 },
    ],
    credits: [],
    spend: [],
  };
  const geminiReadings = inlineQuotaReadings(agyReport, Date.now(), 'gemini-3.5-flash');
  assert.equal(geminiReadings[0].remainingPercent, 90);
  const claudeReadings = inlineQuotaReadings(agyReport, Date.now(), 'claude-sonnet-4-5');
  assert.equal(claudeReadings[0].remainingPercent, 30);

  // Separate Cache Read / Cache Write breakdown
  assert.deepEqual(
    accountCacheBreakdown('a', {
      day: '2026-11-28',
      month: '2026-11',
      dailyTokens: 1000,
      monthlyUsd: 0.01,
      unpricedTokens: 0,
      budgets: {},
      warnings: [],
      entries: [
        {
          day: '2026-11-28',
          provider: 'claude',
          model: 'claude-sonnet-4-5',
          connectionId: 'a',
          total: 1000,
          usd: 0.01,
          unpricedTokens: 0,
          cachedInput: 600,
          cacheWriteInput: 200,
        },
      ],
    }),
    { cacheRead: 600, cacheWrite: 200 },
  );

  // Model-aware vision capability states
  const policy = {
    source: 'default',
    features: { toolLoop: true, vision: true },
    mode: 'ask',
    checks: { authority: false, privacy: false },
  } as unknown as PolicySnapshot;
  const visionOn = connectionCapabilities(
    { ...apiConn, models: [{ id: 'claude-sonnet-4-5', label: 'Sonnet 4.5', supportsVision: true }] },
    policy,
  ).find(c => c.id === 'vision')!;
  assert.equal(visionOn.state, 'available');
  const visionOff = connectionCapabilities(
    { ...apiConn, model: 'deepseek-reasoner', models: [{ id: 'deepseek-reasoner', label: 'R1', supportsVision: false }] },
    policy,
  ).find(c => c.id === 'vision')!;
  assert.equal(visionOff.state, 'blocked');
});

test('CooldownTracker isolates per (connectionId, model) and WorkService fails over cleanly to opt-in backup on PROVIDER_QUOTA', async () => {
  let clock = 1_000_000;
  const tracker = new CooldownTracker(() => clock);
  tracker.recordFailure('c1', 'gemini-2.5-pro', 'PROVIDER_QUOTA');
  assert.equal(tracker.isCooledDown('c1', 'gemini-2.5-pro'), true);
  assert.equal(tracker.isCooledDown('c1', 'gemini-2.5-flash'), false, 'model-scoped cooldown does not block other models');
  clock += 300_001;
  assert.equal(tracker.isCooledDown('c1', 'gemini-2.5-pro'), false);

  // End-to-end WorkService failover when primary throws PROVIDER_QUOTA
  const store = new Store(':memory:');
  const primary: Connection = {
    id: 'primary',
    provider: 'gemini',
    mode: 'api',
    model: 'gemini-2.5-pro',
    executable: '',
    ready: true,
    note: '',
  };
  const backup: Connection = {
    id: 'backup',
    provider: 'claude',
    mode: 'api',
    model: 'claude-sonnet-4-5',
    executable: '',
    ready: true,
    note: '',
  };
  store.put('connection', primary.id, primary);
  store.put('connection', backup.id, backup);
  const session = store.create(primary.id, 'CC');
  const calledIds: string[] = [];
  const billedIds: string[] = [];
  const cooldownRecorded: string[] = [];
  const svc = new WorkService(
    store,
    {
      root: tmpdir(),
      route: async () => ({
        routingContract: { mode: 'GENERAL', confidenceTier: 'FALLBACK', authority: { status: 'ALLOW' }, mandatoryReferences: [] },
      }),
      contextPolicy: () => ({ history: 'ignore', carryover: false }),
      privacy: text => ({ action: 'pass', redactedText: text, findings: [] }),
      skillMetadata: async () => null,
      documentPrivacy: async () => ({ action: 'pass' }),
      nextOutput: async () => ({ path: '' }),
      recordUsage: (conn, count) => {
        if (count.total) billedIds.push(conn.id);
      },
      recordCooldown: (conn, code) => cooldownRecorded.push(`${conn.id}:${code}`),
      fallbackConnection: conn => (conn.id === 'primary' ? backup : undefined),
    },
    async () => ({
      adapter: {
        run: async (_prompt, activeConn, ctx) => {
          calledIds.push(activeConn.id);
          if (activeConn.id === 'primary') throw new Error('PROVIDER_QUOTA');
          ctx.onUsage?.({ input: 10, output: 5, total: 15 });
          ctx.emit('Answered by backup');
          return 'Answered by backup';
        },
      },
      context: { cwd: tmpdir(), env: {}, key: 'k' },
    }),
    () => {},
    10_000,
    undefined,
    [0],
  );
  await svc.run(session.id, 'สรุปให้หน่อย', '', true, undefined, 'chat');
  const finished = store.session(session.id);
  assert.equal(finished.status, 'review');
  assert.deepEqual(calledIds, ['primary', 'backup']);
  assert.deepEqual(billedIds, ['backup']);
  assert.deepEqual(cooldownRecorded, ['primary:PROVIDER_QUOTA']);
  assert.deepEqual(finished.runs?.at(-1)?.failover, {
    fromConnectionId: 'primary',
    toConnectionId: 'backup',
    reason: 'PROVIDER_QUOTA',
  });
  store.close();
});

test('WorkService does not call a primary account that is still cooling down when a backup is opted in', async () => {
  // A primary still cooling down is skipped: the turn goes straight to the backup without calling it again.
  const store = new Store(':memory:');
  const primary: Connection = {
    id: 'primary',
    provider: 'gemini',
    mode: 'api',
    model: 'gemini-2.5-pro',
    executable: '',
    ready: true,
    note: '',
  };
  const backup: Connection = {
    id: 'backup',
    provider: 'claude',
    mode: 'api',
    model: 'claude-sonnet-4-5',
    executable: '',
    ready: true,
    note: '',
  };
  store.put('connection', primary.id, primary);
  store.put('connection', backup.id, backup);
  const session = store.create(primary.id, 'CC');
  const calledIds: string[] = [];
  const billedIds: string[] = [];
  const cooldownRecorded: string[] = [];
  const svc = new WorkService(
    store,
    {
      root: tmpdir(),
      route: async () => ({
        routingContract: { mode: 'GENERAL', confidenceTier: 'FALLBACK', authority: { status: 'ALLOW' }, mandatoryReferences: [] },
      }),
      contextPolicy: () => ({ history: 'ignore', carryover: false }),
      privacy: text => ({ action: 'pass', redactedText: text, findings: [] }),
      skillMetadata: async () => null,
      documentPrivacy: async () => ({ action: 'pass' }),
      nextOutput: async () => ({ path: '' }),
      recordUsage: (conn, count) => {
        if (count.total) billedIds.push(conn.id);
      },
      recordCooldown: (conn, code) => cooldownRecorded.push(`${conn.id}:${code}`),
      cooledDown: conn => conn.id === 'primary',
      fallbackConnection: conn => (conn.id === 'primary' ? backup : undefined),
    },
    async () => ({
      adapter: {
        run: async (_prompt, activeConn, ctx) => {
          calledIds.push(activeConn.id);
          if (activeConn.id === 'primary') throw new Error('PROVIDER_QUOTA');
          ctx.onUsage?.({ input: 10, output: 5, total: 15 });
          ctx.emit('Answered by backup');
          return 'Answered by backup';
        },
      },
      context: { cwd: tmpdir(), env: {}, key: 'k' },
    }),
    () => {},
    10_000,
    undefined,
    [0],
  );
  await svc.run(session.id, 'สรุปให้หน่อย', '', true, undefined, 'chat');
  const finished = store.session(session.id);
  assert.equal(finished.status, 'review');
  assert.deepEqual(calledIds, ['backup']);
  assert.deepEqual(billedIds, ['backup']);
  assert.deepEqual(cooldownRecorded, []);
  assert.deepEqual(finished.runs?.at(-1)?.failover, {
    fromConnectionId: 'primary',
    toConnectionId: 'backup',
    reason: 'COOLDOWN',
  });
  store.close();
});
