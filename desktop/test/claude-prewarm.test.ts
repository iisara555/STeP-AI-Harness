import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeAdapter, ProviderSession, closeClaudeSpares, claudeSpareCount, type ProviderContext } from '../electron/providers';
import type { Connection } from '../src/types';

// A stand-in for @anthropic-ai/claude-agent-sdk: query() is a cold start, prewarm() parks a spare that claim() binds.
function fakeSdk(options: { refuse?: boolean } = {}) {
  const log: { kind: 'query' | 'claim' | 'prewarm' | 'close'; params?: any }[] = [];
  const stream = (text: string, refused = false) => {
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
      next: async () => (i < messages.length ? { done: false, value: messages[i++] } : { done: true, value: undefined }),
      close: () => {},
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };
  const sdk: any = {
    query: (params: any) => {
      log.push({ kind: 'query', params });
      return stream('cold');
    },
    prewarm: async (params: any) => {
      log.push({ kind: 'prewarm', params });
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
          if (options.refuse) {
            claimedReject!(new Error('cwd_not_found'));
            return stream('', true);
          }
          claimedResolve!({ cwd: claim.options.cwd, sessionId: 's', sdkMcpSettled: true });
          return stream('warm');
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
    await session.closeAndWait();
  } finally {
    closeClaudeSpares();
  }
});
