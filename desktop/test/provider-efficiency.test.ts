import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CodexAdapter,
  GeminiAdapter,
  ClaudeAdapter,
  CompatibleAdapter,
  ProviderSession,
  type ProviderContext,
  type TokenCount,
} from '../electron/providers';
import { CopilotAdapter } from '../electron/copilot';
import { WorkService, type Harness } from '../electron/service';
import { Store } from '../electron/store';
import { CostLedger } from '../electron/cost';
import { defaultPolicy, parsePolicy } from '../electron/policy';
import { contextBudget } from '../electron/compact';
import type { Connection } from '../src/types';
const privacy: any = await import('../../src/modules/privacy/index.js');
const event = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;
const response = (usage: any = { prompt_tokens: 10, completion_tokens: 2 }) =>
  new Response(event({ choices: [{ delta: { content: 'Done' } }], usage }) + 'data: [DONE]\n\n', {
    headers: { 'content-type': 'text/event-stream' },
  });

test('compatible errors reach WorkService retry; quotas/auth/cancellation never replay, failed-stream usage is retained', async () => {
  for (const scenario of ['429', '503', 'network', 'quota', 'auth', 'cancel', 'partial']) {
    const store = new Store(':memory:');
    const connection = {
      id: 'c',
      provider: 'compatible',
      mode: 'api',
      baseUrl: 'https://fixture.invalid/v1',
      model: 'fixture',
      ready: true,
    } as Connection;
    store.put('connection', 'c', connection);
    store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
    const session = store.create('c', 'cc');
    const policy = defaultPolicy();
    policy.prices.fixture = { input: 1, output: 2, cachedInput: 0.1 };
    const ledger = new CostLedger(store, () => policy);
    let calls = 0;
    const counts: TokenCount[] = [];
    const adapter = new CompatibleAdapter(async (_url, options) => {
      calls++;
      if (calls > 1) return response();
      if (scenario === 'network') throw new Error('synthetic offline');
      if (scenario === 'cancel') {
        service.cancel(session.id);
        (options!.signal as AbortSignal).throwIfAborted();
      }
      if (scenario === 'partial')
        return new Response(
          event({
            choices: [{ delta: { content: 'Partial' } }],
            usage: { prompt_tokens: 10, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 4 } },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        );
      const status = scenario === 'auth' ? 401 : scenario === '503' ? 503 : 429;
      return new Response(JSON.stringify({ error: { code: scenario === 'quota' ? 'insufficient_quota' : 'rate_limit_error' } }), {
        status,
      });
    });
    const harness: Harness = {
      root: tmpdir(),
      route: async () => ({ routingContract: { mode: 'GENERAL', authority: { status: 'ALLOW' } } }),
      contextPolicy: () => ({ history: 'ignore', carryover: false }),
      privacy: privacy.evaluatePrivacyGate,
      skillMetadata: async () => null,
      documentPrivacy: async () => null,
      nextOutput: async () => null,
      recordUsage: (c, usage) => {
        counts.push(usage);
        ledger.record(c, usage);
      },
    };
    const service = new WorkService(
      store,
      harness,
      async () => ({ adapter, context: { cwd: tmpdir(), env: {} } }),
      () => {},
      undefined,
      undefined,
      [0, 0, 0],
    );
    await service.run(session.id, 'Reply with a sentence', '', false, undefined, 'chat');
    const done = store.session(session.id);
    if (['429', '503', 'network'].includes(scenario)) {
      assert.equal(calls, 2, scenario);
      assert.equal(done.status, 'review', scenario);
      assert.deepEqual(
        done.runs!.at(-1)!.steps[0].providerCalls!.map(c => c.outcome),
        ['error', 'completed'],
      );
    } else {
      assert.equal(calls, 1, scenario);
      assert.equal(done.status, scenario === 'cancel' ? 'cancelled' : 'error');
    }
    if (scenario === 'partial') {
      assert.equal(counts.at(-1)?.cachedInput, 4);
      assert.equal(ledger.report().dailyTokens, 12);
      assert.equal(ledger.report().entries[0].cachedInput, 4);
    }
    const trace = done.runs!.at(-1)!.steps[0].providerCalls!;
    assert.ok(trace.every(c => c.payloadBytes > 0 && c.inputEstimate > 0 && c.prefixHash.length === 64));
    assert.ok(!JSON.stringify(trace).includes('Reply with a sentence'), 'trace never contains task text');
    store.close();
  }
});

test('cache rates and small-model limits are explicit, validated and never double-count input', () => {
  const parsed = parsePolicy({
    prices: { fixture: { input: 1, output: 2, cachedInput: 0.1, cacheWriteInput: 1.25 } },
    modelLimits: { fixture: { contextWindow: 4096, maxOutputTokens: 1024, promptCaching: 'anthropic-ephemeral' } },
  });
  assert.deepEqual(parsed.problems, []);
  assert.ok(contextBudget({ provider: 'compatible', ...parsed.policy.modelLimits!.fixture }) < 4096 - 1024);
  assert.ok(contextBudget({ provider: 'compatible', model: 'gpt-4o', maxOutputTokens: 65536 }) <= 128000 - 65536 - 6400);
  for (const input of [
    { prices: { fixture: { input: 1, output: 2, cachedInput: -1 } } },
    { modelLimits: { fixture: { contextWindow: 4096, maxOutputTokens: 4096 } } },
    { modelLimits: { fixture: { contextWindow: NaN } } },
  ])
    assert.ok(parsePolicy(input).problems.length);
  const store = new Store(':memory:');
  const ledger = new CostLedger(store, () => parsed.policy);
  const connection = { provider: 'compatible', model: 'fixture' } as Connection;
  ledger.record(connection, { input: 100, output: 10, total: 110, cachedInput: 40, cacheWriteInput: 20 });
  assert.equal(ledger.report().dailyTokens, 110);
  assert.equal(ledger.report().monthlyUsd, 0.000089);
  delete parsed.policy.prices.fixture.cachedInput;
  ledger.record(connection, { input: 100, output: 10, total: 110, cachedInput: 40 });
  assert.equal(ledger.report().cachePriceMissingTokens, 40);
  assert.equal(ledger.report().entries[0].cachedInput, 80);
  store.close();
});

for (const provider of ['openai', 'gemini'] as const)
  test(`${provider} keeps one process/thread for deltas, resets changed context and does not retry quotas`, { timeout: 12000 }, async t => {
    const home = await mkdtemp(join(tmpdir(), 'step-reuse-'));
    const cwd = join(home, 'work');
    await mkdir(cwd);
    t.after(() => rm(home, { recursive: true, force: true }));
    const log = join(home, 'events.jsonl'),
      executable = join(home, 'runtime.cjs');
    await writeFile(
      executable,
      `const fs=require('node:fs'),send=x=>console.log(JSON.stringify(x));let turns=0;require('node:readline').createInterface({input:process.stdin}).on('line',l=>{const m=JSON.parse(l);if(m.id===undefined)return;fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({pid:process.pid,method:m.method,params:m.params})+'\\n');const input=m.params?.input?.[0]?.text||m.params?.prompt?.[0]?.text||'';if(input.includes('quota')){send({id:m.id,error:{message:'usage limit exceeded'}});return;}let result={};if(m.method==='thread/start')result={thread:{id:'t'}};if(m.method==='session/new')result={sessionId:'s'};if(m.method==='turn/start'){turns++;send({method:'thread/tokenUsage/updated',params:{tokenUsage:{total:{inputTokens:10*turns,outputTokens:2*turns,totalTokens:12*turns,cachedInputTokens:4*turns}}}});send({method:'item/agentMessage/delta',params:{delta:'Done'}});send({method:'turn/completed',params:{turn:{status:'completed'}}});}if(m.method==='session/prompt')send({method:'session/update',params:{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Done'}}}});send({id:m.id,result});});`,
    );
    const session = new ProviderSession();
    t.after(() => session.closeAndWait());
    const transports: any[] = [],
      usages: TokenCount[] = [];
    const context: ProviderContext = {
      cwd,
      env: {},
      system: 'Rules',
      signal: new AbortController().signal,
      emit: () => {},
      session,
      onTransport: x => transports.push(x),
      onUsage: x => usages.push(x),
    };
    const connection = { id: 'c', provider, mode: 'subscription', executable, model: '', ready: true } as Connection;
    const adapter = provider === 'openai' ? new CodexAdapter() : new GeminiAdapter();
    await adapter.run('Request', connection, context);
    await adapter.run('Request\nResult', connection, context);
    if (provider === 'openai')
      assert.deepEqual(usages, [
        { input: 10, output: 2, total: 12, cachedInput: 4 },
        { input: 10, output: 2, total: 12, cachedInput: 4 },
      ]);
    await adapter.run('Compacted request', connection, context);
    await adapter.run('Compacted request\nNew', { ...connection, model: 'new' }, context);
    await adapter.run('Compacted request\nNew\nAccount', { ...connection, model: 'new', id: 'other' }, context);
    await assert.rejects(
      adapter.run('Compacted request\nNew\nAccount\nquota', { ...connection, model: 'new', id: 'other' }, context),
      /PROVIDER_QUOTA/,
    );
    await session.closeAndWait();
    const events = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map(x => JSON.parse(x));
    assert.equal(events.filter(x => x.method === 'initialize').length, 4, 'quota does not start a fifth process');
    const turns = events.filter(x => ['turn/start', 'session/prompt'].includes(x.method));
    assert.equal((turns[1].params.input || turns[1].params.prompt)[0].text, '\nResult');
    assert.deepEqual(
      transports.slice(0, 5).map(x => x.mode),
      ['full', 'delta', 'full', 'full', 'full'],
    );
    assert.equal(transports[2].resetReason, 'prefix-changed');
    assert.equal(transports[3].resetReason, 'model-changed');
    assert.equal(transports[4].resetReason, 'connection-changed');
    for (const pid of new Set(events.map(x => x.pid))) assert.throws(() => process.kill(pid as number, 0));
  });

for (const provider of ['openai', 'gemini'] as const)
  test(`${provider} recovers a dropped session once and retains failed-attempt usage`, { timeout: 8000 }, async t => {
    const home = await mkdtemp(join(tmpdir(), 'step-recover-'));
    const cwd = join(home, 'work');
    await mkdir(cwd);
    t.after(() => rm(home, { recursive: true, force: true }));
    const log = join(home, 'events.jsonl'),
      executable = join(home, 'runtime.cjs');
    await writeFile(
      executable,
      `const fs=require('node:fs'),send=x=>console.log(JSON.stringify(x));let turns=0;require('node:readline').createInterface({input:process.stdin}).on('line',l=>{const m=JSON.parse(l);if(m.id===undefined)return;fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({pid:process.pid,method:m.method,params:m.params})+'\\n');const input=m.params?.input?.[0]?.text||m.params?.prompt?.[0]?.text||'';let result={};if(m.method==='thread/start')result={thread:{id:'t'}};if(m.method==='session/new')result={sessionId:'s'};if(m.method==='turn/start'){turns++;send({method:'thread/tokenUsage/updated',params:{tokenUsage:{total:{inputTokens:10*turns,outputTokens:2*turns,totalTokens:12*turns,cachedInputTokens:4*turns}}}});}if(input==='\\nDrop'){process.exit(0);return;}if(m.method==='turn/start'){send({method:'item/agentMessage/delta',params:{delta:'Done'}});send({method:'turn/completed',params:{turn:{status:'completed'}}});}if(m.method==='session/prompt')send({method:'session/update',params:{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Done'}}}});send({id:m.id,result});});`,
    );
    const session = new ProviderSession();
    t.after(() => session.closeAndWait());
    const counts: TokenCount[] = [],
      transports: any[] = [];
    const context: ProviderContext = {
      cwd,
      env: {},
      system: 'Rules',
      signal: new AbortController().signal,
      emit: () => {},
      session,
      onUsage: u => counts.push(u),
      onTransport: x => transports.push(x),
    };
    const connection = { id: 'c', provider, mode: 'subscription', executable, model: '', ready: true } as Connection;
    const adapter = provider === 'openai' ? new CodexAdapter() : new GeminiAdapter();
    await adapter.run('Request', connection, context);
    assert.equal(await adapter.run('Request\nDrop', connection, context), 'Done');
    if (provider === 'openai') assert.deepEqual(counts.at(-1), { input: 20, output: 4, total: 24, cachedInput: 8 });
    assert.deepEqual(
      transports.map(x => x.mode),
      ['full', 'delta', 'full'],
    );
    assert.equal(transports.at(-1).resetReason, 'session-invalid');
    await session.closeAndWait();
    const events = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map(x => JSON.parse(x));
    assert.equal(events.filter(x => x.method === 'initialize').length, 2);
    for (const pid of new Set(events.map(x => x.pid))) assert.throws(() => process.kill(pid as number, 0));
  });

test('Claude streaming input reuses the query, reports per-turn cache usage, resets context, and cleans up', async () => {
  const received: string[] = [],
    options: any[] = [],
    counts: TokenCount[] = [];
  let closed = 0;
  const adapter = new ClaudeAdapter(
    async () =>
      ({
        query: (args: any) => {
          options.push(args.options);
          const source = args.prompt[Symbol.asyncIterator]();
          let resultNext = false,
            turns = 0;
          return {
            next: async () => {
              if (resultNext) {
                resultNext = false;
                return {
                  done: false,
                  value: {
                    type: 'result',
                    subtype: 'success',
                    is_error: false,
                    result: 'Done',
                    usage: {},
                    modelUsage: {
                      fixture: {
                        inputTokens: 10 * turns,
                        cacheReadInputTokens: 4 * turns,
                        cacheCreationInputTokens: 2 * turns,
                        outputTokens: 3 * turns,
                      },
                    },
                  },
                };
              }
              const input = await source.next();
              if (input.done) return { done: true };
              received.push(input.value.message.content);
              turns++;
              resultNext = true;
              return {
                done: false,
                value: { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Done' } } },
              };
            },
            close: () => {
              closed++;
            },
          };
        },
      }) as any,
  );
  const session = new ProviderSession();
  const context: ProviderContext = {
    cwd: tmpdir(),
    env: {},
    key: 'synthetic',
    signal: new AbortController().signal,
    emit: () => {},
    system: 'Rules',
    session,
    onUsage: c => counts.push(c),
  };
  const connection = { id: 'c', provider: 'claude', mode: 'api', model: 'fixture' } as Connection;
  assert.equal(await adapter.run('Request', connection, context), 'Done');
  assert.equal(await adapter.run('Request\nResults', connection, context), 'Done');
  assert.equal(options.length, 1);
  assert.deepEqual(received, ['Request', '\nResults']);
  assert.deepEqual(counts, Array(2).fill({ input: 16, output: 3, total: 19, cachedInput: 4, cacheWriteInput: 2 }));
  assert.deepEqual(options[0].tools, []);
  assert.ok(options[0].maxTurns > 1, 'the query must allow host tool turns and a final answer');
  assert.equal(options[0].persistSession, false);
  assert.equal((await options[0].canUseTool('Bash', {})).behavior, 'deny');
  await adapter.run('Compacted', connection, context);
  assert.equal(closed, 1);
  assert.equal(options.length, 2);
  await session.closeAndWait();
  assert.equal(closed, 2);
});

test('Copilot keeps the client/session for tool turns and forwards only current-turn events', async () => {
  let created = 0,
    stopped = 0,
    deleted = 0;
  const received: string[] = [],
    emits: string[][] = [[], []];
  const adapter = new CopilotAdapter(() => {
    created++;
    return {
      start: async () => {},
      forceStop: async () => {
        stopped++;
      },
      deleteSession: async () => {
        assert.equal(stopped, 0, 'the SDK cannot delete sessions after disconnecting');
        deleted++;
      },
      createSession: async (options: any) => {
        assert.deepEqual(options.availableTools, []);
        assert.equal(options.enableSessionStore, false);
        assert.equal((await options.onPermissionRequest()).kind, 'denied-interactively-by-user');
        return {
          sessionId: 's',
          sendAndWait: async ({ prompt }: any) => {
            received.push(prompt);
            options.onEvent({ type: 'assistant.message_delta', data: { deltaContent: 'Done' } });
            return { data: { content: 'Done' } };
          },
        };
      },
    } as any;
  });
  const session = new ProviderSession();
  const context: ProviderContext = {
    cwd: tmpdir(),
    env: {},
    key: 'synthetic',
    signal: new AbortController().signal,
    emit: x => emits[0].push(x),
    session,
  };
  const connection = { id: 'c', provider: 'copilot', mode: 'oauth', model: 'fixture' } as Connection;
  await adapter.run('Request', connection, context);
  await adapter.run('Request\nResult', connection, { ...context, emit: x => emits[1].push(x) });
  assert.equal(created, 1);
  assert.equal(stopped, 0);
  assert.deepEqual(received, ['Request', '\nResult']);
  assert.deepEqual(emits, [['Done'], ['Done']]);
  await session.closeAndWait();
  assert.equal(stopped, 1);
  assert.equal(deleted, 1);
});

test('retained conversation shutdown failures stop a reset and still release host resources', async () => {
  const session = new ProviderSession();
  let released = false;
  session.rpc = {
    closeAndWait: async () => {
      throw new Error('RUNTIME_SHUTDOWN_TIMEOUT');
    },
  } as any;
  session.onClose = async () => {
    released = true;
  };
  session.close();
  await assert.rejects(session.closeAndWait(), /RUNTIME_SHUTDOWN_TIMEOUT/);
  assert.ok(released);
});

test('Claude result failures cannot be accepted as a completed host tool turn', async () => {
  let stopped = 0;
  const adapter = new ClaudeAdapter(
    async () =>
      ({
        query: () => ({
          next: async () => ({
            done: false,
            value: { type: 'result', subtype: 'error_max_turns', is_error: false, usage: {}, modelUsage: {}, errors: [] },
          }),
          close: () => {
            stopped++;
          },
        }),
      }) as any,
  );
  const session = new ProviderSession();
  await assert.rejects(
    adapter.run('Request', { id: 'c', provider: 'claude', mode: 'api' } as Connection, {
      cwd: tmpdir(),
      env: {},
      key: 'synthetic',
      signal: new AbortController().signal,
      emit: () => {},
      session,
    }),
    /PROVIDER_REQUEST_FAILED/,
  );
  assert.equal(stopped, 1);
});

test('Claude and Copilot cancellation closes the retained SDK conversation before returning', { timeout: 4000 }, async () => {
  for (const provider of ['claude', 'copilot'] as const) {
    let stopped = 0,
      rejectPending: ((error: Error) => void) | undefined;
    const controller = new AbortController(),
      session = new ProviderSession();
    const context: ProviderContext = { cwd: tmpdir(), env: {}, key: 'synthetic', signal: controller.signal, emit: () => {}, session };
    const connection = { id: provider, provider, mode: provider === 'claude' ? 'api' : 'oauth', model: 'fixture' } as Connection;
    const pending = () =>
      new Promise<any>((_resolve, reject) => {
        rejectPending = reject;
        queueMicrotask(() => controller.abort());
      });
    const adapter =
      provider === 'claude'
        ? new ClaudeAdapter(
            async () =>
              ({
                query: () => ({
                  next: pending,
                  close: () => {
                    stopped++;
                    rejectPending?.(new Error('closed'));
                  },
                }),
              }) as any,
          )
        : new CopilotAdapter(
            () =>
              ({
                start: async () => {},
                createSession: async () => ({ sessionId: 's', sendAndWait: pending }),
                forceStop: async () => {
                  stopped++;
                  rejectPending?.(new Error('closed'));
                },
                deleteSession: async () => {},
              }) as any,
          );
    await assert.rejects(adapter.run('Request', connection, context), /CANCELLED/);
    await session.closeAndWait();
    assert.equal(stopped, 1, provider);
  }
});
