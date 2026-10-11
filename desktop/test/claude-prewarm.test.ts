import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeAdapter, ProviderSession, closeClaudeSpares, claudeSpareCount, type ProviderContext } from '../electron/providers';
import type { Connection } from '../src/types';

// A stand-in for @anthropic-ai/claude-agent-sdk: query() is a cold start, prewarm() parks a spare that claim() binds.
function fakeSdk(
  options: {
    refuse?: boolean;
    claimThrows?: boolean;
    settingsRefused?: boolean;
    modelRefused?: boolean;
    prewarmPending?: boolean;
    claimPending?: boolean;
    afterResult?: () => void;
    fail?: boolean;
  } = {},
) {
  const log: { kind: 'query' | 'claim' | 'prewarm' | 'close'; params?: any }[] = [];
  const stream = (text: string, refused = false, repeat = false) => {
    const messages: any[] = refused
      ? [{ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'not_claimed: cwd_not_found', errors: [] }]
      : [
          ...[...text].map(ch => ({
            type: 'stream_event',
            event: { type: 'content_block_delta', delta: { type: 'text_delta', text: ch } },
          })),
          { type: 'result', subtype: 'success', is_error: false, result: text, usage: { input_tokens: 3, output_tokens: 1 } },
        ];
    let i = 0;
    return {
      next: async () => {
        if (options.fail) throw new Error('LOGIN_REQUIRED');
        if (repeat && i >= messages.length) i = 0;
        if (i < messages.length) {
          const value = messages[i++];
          if (value.type === 'result') options.afterResult?.();
          return { done: false, value };
        }
        return { done: true, value: undefined };
      },
      close: () => {},
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };
  const sdk: any = {
    query: (params: any) => {
      log.push({ kind: 'query', params });
      return stream('cold', false, typeof params.prompt?.push === 'function');
    },
    prewarm: async (params: any) => {
      log.push({ kind: 'prewarm', params });
      if (options.prewarmPending) return new Promise(() => {});
      let claimedResolve: (v: any) => void, claimedReject: (e: Error) => void;
      const claimed = new Promise((res, rej) => {
        claimedResolve = res;
        claimedReject = rej;
      });
      claimed.catch(() => {});
      return {
        claimed,
        exited: new Promise(() => {}),
        claim: (claim: any) => {
          log.push({ kind: 'claim', params: claim });
          if (options.claimPending) return stream('unconfirmed');
          if (options.claimThrows) throw new Error('spare_exited');
          if (options.settingsRefused) {
            claimedReject!(new Error('settings_not_applied: effort'));
            return {
              ...stream(''),
              next: async () => {
                throw new Error('RUNTIME_EXITED');
              },
            };
          }
          if (options.modelRefused) {
            claimedReject!(new Error('option_not_applied: model'));
            return stream('wrong model');
          }
          if (options.refuse) {
            claimedReject!(new Error('cwd_not_found'));
            return stream('', true);
          }
          claimedResolve!({ cwd: claim.options.cwd, sessionId: 's', sdkMcpSettled: true });
          return stream('warm', false, typeof claim.prompt?.push === 'function');
        },
        close: () => log.push({ kind: 'close' }),
      };
    },
  };
  return { sdk, log };
}
const connection = (patch: Partial<Connection> = {}): Connection => ({
  id: 'claude-' + Math.random().toString(36).slice(2),
  provider: 'claude',
  mode: 'subscription',
  model: 'claude-test',
  executable: '/claude',
  ready: true,
  note: '',
  ...patch,
});
const context = (patch: Partial<ProviderContext> = {}): ProviderContext & { out: { text: string; transport: any[] } } => {
  const out = { text: '', transport: [] as any[] };
  return {
    cwd: '/tmp/work',
    env: { CLAUDE_CONFIG_DIR: '/tmp/claude-config' },
    signal: new AbortController().signal,
    system: 'STeP rules',
    emit: t => void (out.text += t),
    onTransport: t => void out.transport.push(t),
    out,
    ...patch,
  };
};
const settle = () => new Promise(done => setImmediate(done));

test('after the first Claude message a spare process waits, and the next message claims it instead of starting cold', async () => {
  const { sdk, log } = fakeSdk();
  const adapter = new ClaudeAdapter(async () => sdk);
  const c = connection();
  try {
    assert.equal(await adapter.run('first', c, context()), 'cold');
    await settle();
    assert.equal(claudeSpareCount(c.id), 1, 'a spare is parked for the next message');
    const prewarmed = log.find(e => e.kind === 'prewarm')!.params.options;
    // Only host-level options go to the spare; nothing about the task is known yet.
    assert.deepEqual(prewarmed.tools, []);
    assert.deepEqual(prewarmed.allowedTools, []);
    assert.deepEqual(prewarmed.settingSources, []);
    assert.equal(prewarmed.persistSession, false);
    assert.equal(prewarmed.strictMcpConfig, true);
    assert.equal(typeof prewarmed.systemPrompt, 'string');
    assert.ok(!prewarmed.systemPrompt.includes('STeP rules'), 'the task instructions arrive with the claim');
    assert.equal((await prewarmed.canUseTool('Bash', {})).behavior, 'deny');
    assert.equal(prewarmed.cwd, undefined, 'the spare never parks in the work folder');

    const ctx = context({ effort: 'high' });
    assert.equal(await adapter.run('second', c, ctx), 'warm');
    const claim = log.find(e => e.kind === 'claim')!.params;
    assert.equal(claim.prompt, 'second');
    assert.deepEqual(claim.options, {
      cwd: '/tmp/work',
      model: 'claude-test',
      appendSystemPrompt: 'STeP rules',
      settings: { effortLevel: 'high' },
    });
    assert.equal(log.filter(e => e.kind === 'query').length, 1, 'no second cold start');
    assert.equal(ctx.out.transport[0].resetReason, 'prewarmed');
    await settle();
    assert.equal(claudeSpareCount(c.id), 1, 'and another spare waits for the message after');
  } finally {
    closeClaudeSpares();
  }
  await settle();
  assert.equal(claudeSpareCount(c.id), 0);
  assert.ok(
    log.some(e => e.kind === 'close'),
    'closing releases the parked process',
  );
});

test('a refused claim falls back to a cold start for the same message, with nothing shown twice', async () => {
  const { sdk, log } = fakeSdk({ refuse: true });
  const adapter = new ClaudeAdapter(async () => sdk);
  const c = connection();
  try {
    await adapter.run('first', c, context());
    await settle();
    const ctx = context();
    assert.equal(await adapter.run('second', c, ctx), 'cold');
    assert.equal(ctx.out.text, 'cold');
    assert.equal(log.filter(e => e.kind === 'claim').length, 1);
    assert.equal(log.filter(e => e.kind === 'query').length, 2);
  } finally {
    closeClaudeSpares();
  }
});

test('web search, images and a changed account or runtime never use a spare made for something else', async () => {
  const { sdk, log } = fakeSdk();
  const adapter = new ClaudeAdapter(async () => sdk);
  const c = connection();
  try {
    await adapter.run('first', c, context());
    await settle();
    await adapter.run('search', c, context({ webSearch: true }));
    await adapter.run('look', c, context({ images: [{ mime: 'image/png', data: 'AA' } as any] }));
    assert.equal(log.filter(e => e.kind === 'claim').length, 0);
    // Another runtime home (a sign-out and sign-in elsewhere) does not take the old spare.
    await adapter.run('moved', c, context({ env: { CLAUDE_CONFIG_DIR: '/tmp/other' } }));
    assert.equal(log.filter(e => e.kind === 'claim').length, 0);
    await settle();
    assert.ok(
      log.some(e => e.kind === 'close'),
      'the stale spare is closed',
    );
    closeClaudeSpares(c.id);
    assert.equal(claudeSpareCount(c.id), 0);
  } finally {
    closeClaudeSpares();
  }
});

test('the tool loop conversation can start on a spare and continues on the same process', async () => {
  const { sdk, log } = fakeSdk();
  const adapter = new ClaudeAdapter(async () => sdk);
  const c = connection();
  try {
    await adapter.run('first', c, context());
    await settle();
    const session = new ProviderSession();
    assert.equal(await adapter.run('turn one', c, context({ session })), 'warm');
    const claim = log.find(e => e.kind === 'claim')!.params;
    assert.equal(typeof claim.prompt[Symbol.asyncIterator], 'function', 'a held conversation streams its input');
    const next = context({ session });
    assert.equal(await adapter.run('turn one tool result', c, next), 'warm');
    assert.equal(log.filter(e => e.kind === 'claim').length, 1);
    assert.equal(next.out.transport[0].mode, 'delta');
    assert.equal(next.out.transport[0].sentChars, ' tool result'.length);
    await session.closeAndWait();
  } finally {
    closeClaudeSpares();
  }
});

test('a still-starting spare never delays a new request or prevents cancellation', { timeout: 1000 }, async () => {
  const { sdk, log } = fakeSdk({ prewarmPending: true });
  const adapter = new ClaudeAdapter(async () => sdk);
  const c = connection();
  try {
    await adapter.run('first', c, context());
    await settle();
    const controller = new AbortController();
    const ctx = context({ signal: controller.signal });
    const result = adapter.run('second', c, ctx);
    const timeout = setTimeout(() => controller.abort(), 100);
    try {
      assert.equal(await result, 'cold');
      assert.equal(log.filter(e => e.kind === 'claim').length, 0);
    } finally {
      clearTimeout(timeout);
    }
  } finally {
    closeClaudeSpares();
  }
});

for (const failure of ['claimThrows', 'settingsRefused'] as const) {
  test(`${failure}: a claim whose prompt has not run falls back exactly once and releases the spare`, async () => {
    const { sdk, log } = fakeSdk({ [failure]: true });
    const adapter = new ClaudeAdapter(async () => sdk);
    try {
      const c = connection();
      await adapter.run('first', c, context());
      await settle();
      const ctx = context();
      assert.equal(await adapter.run('second', c, ctx), 'cold');
      assert.equal(ctx.out.text, 'cold');
      assert.equal(log.filter(e => e.kind === 'query').length, 2);
      assert.equal(log.filter(e => e.kind === 'claim').length, 1);
      assert.ok(log.some(e => e.kind === 'close'));
    } finally {
      closeClaudeSpares();
    }
  });
}

test('a refused model is surfaced without replaying a prompt already submitted to the provider', async () => {
  const { sdk, log } = fakeSdk({ modelRefused: true });
  const adapter = new ClaudeAdapter(async () => sdk);
  try {
    const c = connection();
    await adapter.run('first', c, context());
    await settle();
    const ctx = context();
    await assert.rejects(adapter.run('second', c, ctx), /MODEL_UNAVAILABLE/);
    assert.equal(ctx.out.text, '');
    assert.equal(log.filter(e => e.kind === 'query').length, 1);
  } finally {
    closeClaudeSpares();
  }
});

test('authentication failures and image/search-only calls never start idle Claude processes', async () => {
  for (const scenario of ['auth', 'search', 'image']) {
    const { sdk, log } = fakeSdk({ fail: scenario === 'auth' });
    const adapter = new ClaudeAdapter(async () => sdk);
    const c = connection();
    try {
      const result = adapter.run(
        'request',
        c,
        context(
          scenario === 'search' ? { webSearch: true } : scenario === 'image' ? { images: [{ mime: 'image/png', data: 'AA' } as any] } : {},
        ),
      );
      if (scenario === 'auth') await assert.rejects(result, /LOGIN_REQUIRED/);
      else await result;
      await settle();
      assert.equal(claudeSpareCount(c.id), 0);
      assert.equal(log.filter(e => e.kind === 'prewarm').length, 0);
    } finally {
      closeClaudeSpares();
    }
  }
});

test('closing spares during a finishing request cannot resurrect an idle process', async () => {
  const { sdk, log } = fakeSdk({ afterResult: () => closeClaudeSpares() });
  const adapter = new ClaudeAdapter(async () => sdk);
  const c = connection();
  await adapter.run('finishing', c, context());
  await settle();
  try {
    assert.equal(claudeSpareCount(c.id), 0);
    assert.equal(log.filter(e => e.kind === 'prewarm').length, 0);
  } finally {
    closeClaudeSpares();
  }
});

test('cancelling an unresolved claim stops waiting, closes it and never retries or replenishes', { timeout: 1000 }, async () => {
  const { sdk, log } = fakeSdk({ claimPending: true });
  const adapter = new ClaudeAdapter(async () => sdk);
  const c = connection();
  try {
    await adapter.run('first', c, context());
    await settle();
    const controller = new AbortController();
    const ctx = context({ signal: controller.signal });
    const result = adapter.run('second', c, ctx);
    const rejected = assert.rejects(result, /CANCELLED/);
    await settle();
    controller.abort();
    await rejected;
    assert.equal(ctx.out.text, '');
    assert.equal(log.filter(e => e.kind === 'query').length, 1);
    assert.equal(log.filter(e => e.kind === 'prewarm').length, 1);
    assert.ok(log.some(e => e.kind === 'close'));
    assert.equal(claudeSpareCount(c.id), 0);
  } finally {
    closeClaudeSpares();
  }
});

test('a prewarm resolving after logout closes immediately and cannot re-enter the pool', async () => {
  const { sdk, log } = fakeSdk();
  const prewarm = sdk.prewarm;
  let finish: () => void = () => {};
  sdk.prewarm = (options: any) =>
    new Promise(resolve => {
      finish = () => resolve(prewarm(options));
    });
  const adapter = new ClaudeAdapter(async () => sdk);
  const c = connection();
  await adapter.run('first', c, context());
  closeClaudeSpares(c.id);
  finish();
  await settle();
  assert.equal(claudeSpareCount(c.id), 0);
  assert.equal(log.filter(e => e.kind === 'close').length, 1);
});

test('the parked process is released after ten idle minutes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { sdk, log } = fakeSdk();
  const adapter = new ClaudeAdapter(async () => sdk);
  const c = connection();
  try {
    await adapter.run('first', c, context());
    await settle();
    t.mock.timers.tick(10 * 60_000 - 1);
    assert.equal(claudeSpareCount(c.id), 1);
    t.mock.timers.tick(1);
    await settle();
    assert.equal(claudeSpareCount(c.id), 0);
    assert.equal(log.filter(e => e.kind === 'close').length, 1);
  } finally {
    closeClaudeSpares();
  }
});
