import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { WorkService, type Harness } from '../electron/service';
import { Store } from '../electron/store';
import { MAX_BRIDGE_CALLS, ToolLoop, type LoopHost } from '../electron/tool-loop';
import { defaultPolicy, parsePolicy } from '../electron/policy';
import type { ProviderContext } from '../electron/providers';
import type { Connection } from '../src/types';
const routing: any = await import('../../src/modules/router/service.js');
const boundary: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');
const catalog: any = await import('../../src/modules/skills/catalog.js');
const root = resolve('..');

// Synthetic only: one note whose text holds a marker the host's outgoing check masks.
const NOTE = 'บันทึกสังเคราะห์ SECRET-123';
const host = (seen: string[], outgoingSeen: string[]): LoopHost => ({
  enabled: () => true,
  check: async () => {},
  readOnly: () => true,
  execute: async r => {
    seen.push(`${r.tool}:${r.input}`);
    return { path: r.input, text: NOTE };
  },
  outgoing: async text => {
    outgoingSeen.push(text);
    return text.replace(/SECRET-\d+/g, '[masked]');
  },
});

test('a bridge call runs through the tool loop host, its outgoing check and paging, only while the loop runs', async () => {
  const seen: string[] = [],
    outgoingSeen: string[] = [],
    traces: string[] = [];
  const loop = new ToolLoop({ ...host(seen, outgoingSeen), observe: trace => traces.push(trace.tool) });
  const signal = new AbortController().signal;
  // Outside a run there is nothing to answer to.
  assert.deepEqual(await loop.bridge({ tool: 'files', input: 'note.md' }, signal), { ok: false, code: 'CANCELLED' });
  let inside: any;
  const answer = await loop.run(
    'request',
    async () => {
      inside = await loop.bridge({ tool: 'files', input: 'note.md' }, signal);
      return 'done';
    },
    signal,
  );
  assert.equal(answer, 'done');
  assert.deepEqual(seen, ['files:note.md']);
  assert.equal(outgoingSeen.length, 1);
  assert.equal(inside.ok, true);
  assert.match(inside.result.text, /\[masked\]/);
  assert.doesNotMatch(JSON.stringify(inside), /SECRET-123/);
  assert.equal(typeof inside.result.id, 'string');
  assert.deepEqual(traces, ['files']);
  assert.deepEqual(await loop.bridge({ tool: 'files', input: 'note.md' }, signal), { ok: false, code: 'CANCELLED' });
});

test('bridge calls stop at the per-run limit and when tools are off', async () => {
  const seen: string[] = [];
  const signal = new AbortController().signal;
  const loop = new ToolLoop(host(seen, []));
  let last: any;
  await loop.run(
    'request',
    async () => {
      for (let i = 0; i <= MAX_BRIDGE_CALLS; i++) last = await loop.bridge({ tool: 'files', input: `n${i}.md` }, signal);
      return 'done';
    },
    signal,
  );
  assert.equal(seen.length, MAX_BRIDGE_CALLS);
  assert.equal(last.code, 'TOOL_TURN_LIMIT');
  const off = new ToolLoop({ ...host([], []), enabled: () => false });
  let denied: any;
  await off.run(
    'request',
    async () => {
      denied = await off.bridge({ tool: 'files', input: 'a.md' }, signal);
      return 'done';
    },
    signal,
  );
  assert.deepEqual(denied, { ok: false, code: 'TOOL_DENIED' });
});

function service(provider: Connection['provider'], bridgeOn: boolean) {
  const store = new Store(':memory:');
  store.put('connection', 'c', { id: 'c', provider, mode: 'subscription', model: 'gemini-test', ready: true } as Connection);
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
  const seen: string[] = [];
  const contexts: ProviderContext[] = [];
  const events: unknown[] = [];
  const harness: Harness = {
    root,
    route: (query, opts) => routing.queryStepRouter(query, { autoRoute: true, authorityChecks: true, ...opts }),
    contextPolicy: boundary.classifyContextPolicy,
    privacy: privacy.evaluatePrivacyGate,
    skillMetadata: async id => {
      const metadata = await routing.loadSkillContextMetadata(id);
      return { ...metadata, mandatoryReferences: await routing.loadDocumentContextMetadata(metadata.mandatory) };
    },
    documentCatalog: async () => routing.loadDocumentCatalog(),
    catalog: async () => catalog.loadSkillCatalog(root),
    documentPrivacy: async () => null,
    nextOutput: async () => null,
    toolLoop: () => true,
    antigravityBridge: () => bridgeOn,
    tools: async () => host(seen, []),
  };
  const svc = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async (_prompt: string, _connection: Connection, context: ProviderContext) => {
          contexts.push(context);
          if (!context.nativeBridge) return 'ตอบโดยไม่ใช้ bridge';
          const response = await context.nativeBridge({ tool: 'files', input: 'note.md' }, context.signal);
          return 'ผลจาก bridge: ' + JSON.stringify(response);
        },
      },
    }),
    event => events.push(event),
  );
  return { store, svc, seen, contexts, events, session: store.create('c', 'cc') };
}

test('with the policy feature on, an Antigravity chat answers tool calls through the bridge and the same host', async () => {
  const f = service('antigravity', true);
  try {
    await f.svc.run(f.session.id, 'สรุปไฟล์ note.md ให้หน่อย', '', true, undefined, 'chat');
    const done = f.store.session(f.session.id);
    assert.deepEqual(f.seen, ['files:note.md']);
    const answer = done.messages.at(-1)!.text;
    assert.match(answer, /ผลจาก bridge/);
    assert.match(answer, /\[masked\]/);
    assert.doesNotMatch(answer, /SECRET-123/);
    assert.ok(JSON.stringify(f.events).includes('"tool":"files"'), 'the bridged call is in the run trace');
  } finally {
    f.store.close();
  }
});

test('the bridge stays off without the policy feature and for other providers', async () => {
  for (const [provider, on] of [
    ['antigravity', false],
    ['openai', true],
  ] as const) {
    const f = service(provider, on);
    try {
      await f.svc.run(f.session.id, 'สรุปไฟล์ note.md ให้หน่อย', '', true, undefined, 'chat');
      assert.ok(f.contexts.length > 0);
      assert.ok(
        f.contexts.every(context => context.nativeBridge === undefined),
        `${provider} ${on}`,
      );
      assert.deepEqual(f.seen, []);
    } finally {
      f.store.close();
    }
  }
});

test('the bridge feature is off by default and an administrator can turn it on in the managed policy', () => {
  assert.equal(defaultPolicy().features.antigravityNativeBridge, false);
  const on = parsePolicy({ version: 1, features: { antigravityNativeBridge: true } });
  assert.deepEqual(on.problems, []);
  assert.equal(on.policy.features.antigravityNativeBridge, true);
});
