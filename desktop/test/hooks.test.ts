import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { defaultPolicy, parsePolicy } from '../electron/policy';
import { HookEngine, hookMetadata } from '../electron/hooks';

test('hook payloads and diagnostics expose metadata only', async () => {
  const payload = {
    event: 'pre_tool_use' as const,
    tool: 'write',
    prompt: 'private text',
    command: 'private command',
    path: '/private',
    key: 'raw key',
    readOnly: false,
    targetHash: 'abcdef',
  };
  assert.deepEqual(hookMetadata(payload), { event: 'pre_tool_use', tool: 'write', targetHash: 'abcdef', readOnly: false });
  const p = parsePolicy({ hooks: [{ type: 'prompt', event: 'pre_tool_use', prompt: 'Check metadata', matcher: 'write' }] }).policy;
  let received: any;
  const engine = new HookEngine(
    () => p,
    async (_, data) => {
      received = data;
      return '{"decision":"block","reason":"private reply"}';
    },
  );
  const result = await engine.run(payload);
  assert.equal(result.blocked, true);
  assert.equal(result.reason, 'HOOK_BLOCKED');
  assert.equal(received.prompt, undefined);
  assert.doesNotMatch(JSON.stringify(result), /private/);
  assert.equal((await engine.run({ event: 'pre_tool_use', tool: 'read' })).blocked, false);
});

test('HTTP hook blocks on explicit denial and malformed replies only when configured', async () => {
  let response = '{"decision":"block"}',
    received = '';
  const server = createServer((req, res) => {
    req.on('data', c => {
      received += c;
    });
    req.on('end', () => res.end(response));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const p = parsePolicy({ hooks: [{ type: 'http', url, event: 'user_prompt_submit', blockOnFailure: true }] }).policy;
  const engine = new HookEngine(() => p);
  try {
    assert.equal((await engine.run({ event: 'user_prompt_submit', prompt: 'do not send' })).blocked, true);
    assert.doesNotMatch(received, /do not send/);
    response = 'not-json';
    assert.equal((await engine.run({ event: 'user_prompt_submit' })).blocked, true);
    p.hooks[0].blockOnFailure = false;
    assert.equal((await engine.run({ event: 'user_prompt_submit' })).blocked, false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('command hooks do not inherit ambient credentials and bad JSON fails closed', async () => {
  process.env.STEP_HOOK_TEST_TOKEN = 'synthetic-hidden-value';
  try {
    const command = `"${process.execPath}" -e "process.exit(process.env.STEP_HOOK_TEST_TOKEN ? 2 : 0)"`;
    const p = parsePolicy({ hooks: [{ type: 'command', command, event: 'pre_tool_use', blockOnFailure: true }] }).policy;
    const engine = new HookEngine(() => p);
    assert.equal((await engine.run({ event: 'pre_tool_use', tool: 'read' })).blocked, false);
    p.hooks[0] = { ...p.hooks[0], type: 'command', command: 'echo invalid-json' };
    assert.equal((await engine.run({ event: 'pre_tool_use', tool: 'read' })).blocked, true);
  } finally {
    delete process.env.STEP_HOOK_TEST_TOKEN;
  }
});

test('prompt timeouts, missing provider, priority and hot reload preserve the blocking contract', async () => {
  let p = parsePolicy({
    hooks: [{ type: 'prompt', event: 'pre_tool_use', prompt: 'Check metadata', timeoutSeconds: 1, blockOnFailure: true }],
  }).policy;
  const missing = new HookEngine(() => p);
  assert.equal((await missing.run({ event: 'pre_tool_use', tool: 'read' })).blocked, true);
  let aborted = false;
  const engine = new HookEngine(
    () => p,
    async (_, __, signal) =>
      new Promise<string>(() => {
        signal.addEventListener('abort', () => {
          aborted = true;
        });
      }),
  );
  assert.equal((await engine.run({ event: 'pre_tool_use', tool: 'read' })).blocked, true);
  assert.equal(aborted, true);
  p = defaultPolicy();
  assert.equal((await engine.run({ event: 'pre_tool_use', tool: 'read' })).blocked, false);
  p = parsePolicy({
    hooks: [
      { type: 'command', command: 'echo low', event: 'pre_tool_use', priority: 1 },
      { type: 'command', command: 'echo high', event: 'pre_tool_use', priority: 5 },
    ],
  }).policy;
  assert.equal((engine.hooksFor('pre_tool_use')[0] as any).command, 'echo high');
});
