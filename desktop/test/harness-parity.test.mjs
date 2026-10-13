import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ParityBudget } from '../eval/harness-parity/budget.mjs';
import { nativeRequest, metrics } from '../eval/harness-parity/spec.mjs';
import { observeClaudeSdk } from '../eval/harness-parity/native.mjs';
import { trialHost } from '../eval/harness-parity/host.mjs';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('global budget persists reservations, includes missing usage, and never resets the cap', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'step-parity-budget-'));
  try {
    const budget = await ParityBudget.open(folder, 100);
    const call = await budget.reserve('claude-baseline', 70);
    await assert.rejects(budget.reserve('openai-native', 31), /TOKEN_BUDGET_STOP/);
    await assert.rejects(ParityBudget.open(folder, 100), /INTERRUPTED_CALL_REQUIRES_REVIEW/);
    await budget.settle(call, { total: 40 }, 'completed');
    const missing = await budget.reserve('google', 60);
    await budget.settle(missing, undefined, 'error');
    await assert.rejects(budget.reserve('retry', 1), /USAGE_UNKNOWN_STOP/);
    assert.equal(JSON.parse(await readFile(join(folder, 'budget.json'), 'utf8')).used, 100);
    await assert.rejects(ParityBudget.open(folder, 101), /BUDGET_CONTEXT_CHANGED/);
    assert.equal((await ParityBudget.open(folder, 100)).data.uncertain, true);
    await assert.rejects(budget.settle(call, { total: 40 }, 'completed'), /CALL_ALREADY_SETTLED/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('native bridge rejects malformed arguments and unavailable tools before dispatch', () => {
  assert.throws(() => nativeRequest({ tool: 'terminal', input: 'whoami', argsJson: '{}', content: '' }), /INVALID_TOOL_REQUEST/);
  assert.throws(() => nativeRequest({ tool: 'files', input: 'x', argsJson: '[]', content: '' }), /INVALID_TOOL_REQUEST/);
  assert.throws(() => nativeRequest({ tool: 'files', input: 'x', argsJson: '{', content: '' }), /INVALID_TOOL_REQUEST/);
  assert.deepEqual(nativeRequest({ tool: 'files', input: 'x', argsJson: '{"action":"read"}', content: '' }), {
    tool: 'files',
    input: 'x',
    args: { action: 'read' },
  });
});

test('accounted continuation keeps unknown costs charged, stops again on a new unknown, and validates a corrupted ledger', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'step-parity-accounting-'));
  try {
    const budget = await ParityBudget.open(folder, 100);
    const first = await budget.reserve('unknown', 40);
    await budget.settle(first, undefined, 'error');
    await budget.continueAccounted('Retain 40 tokens and use only the remaining 60.');
    const known = await budget.reserve('known', 30);
    await budget.settle(known, { total: 10 }, 'completed');
    assert.equal(budget.blocked(), false);
    assert.equal(budget.data.used, 50);
    await assert.rejects(budget.reserve('overspend', 51), /TOKEN_BUDGET_STOP/);
    const second = await budget.reserve('another unknown', 50);
    await budget.settle(second, undefined, 'error');
    assert.equal(budget.blocked(), true);
    assert.equal(budget.data.used, 100);
    await writeFile(join(folder, 'budget.json'), JSON.stringify({ ...budget.data, used: 0 }));
    await assert.rejects(ParityBudget.open(folder, 100), /BUDGET_LEDGER_INVALID/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('Claude native budget observes model steps before the final result without double counting streamed blocks', async () => {
  const events = [
    { type: 'system', subtype: 'init', model: 'claude-synthetic' },
    { type: 'assistant', message: { id: 'a', usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 20 } } },
    { type: 'assistant', message: { id: 'a', usage: { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 20 } } },
    { type: 'assistant', message: { id: 'b', usage: { input_tokens: 5, output_tokens: 1, cache_creation_input_tokens: 30 } } },
  ];
  const models = [],
    observations = [];
  const sdk = observeClaudeSdk(
    { query: () => ({ next: async () => ({ value: events.shift(), done: !events.length }), close() {} }) },
    model => models.push(model),
    count => observations.push(count),
  );
  const stream = sdk.query({});
  for (let i = 0; i < 4; i++) await stream.next();
  assert.deepEqual(models, ['claude-synthetic']);
  assert.deepEqual(
    observations.map(u => u.total),
    [32, 33, 69],
  );
  assert.equal(observations.at(-1).lastInput, 35);
  assert.equal(sdk.prewarm, undefined);
});

test('metrics distinguish injected errors, invalid calls and successful recovery of the same tool and target', () => {
  const rows = [
    { index: 0, tool: 'files', input: 'a', ok: false, code: 'FILE_BUSY_ONCE', injected: true },
    { index: 1, tool: 'files', input: 'b', ok: true },
    { index: 2, tool: 'patch', input: 'a', ok: false, code: 'INVALID_INPUT' },
    { index: 3, tool: 'files', input: 'a', ok: true },
    { index: 4, tool: 'patch', input: 'a', ok: false, code: 'FILE_CONFLICT', injected: true },
  ];
  assert.deepEqual(metrics(rows), { toolCalls: 5, invalidCalls: 1, toolErrors: 3, injectedErrors: 2, recoveredErrors: 1 });
});

test('native MCP subprocess forwards real host results and retains path, tool and registry gates', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'step-parity-native-'));
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const host = await trialHost(
    root,
    folder,
    { id: 'synthetic', provider: 'openai', mode: 'subscription', model: 'synthetic', ready: true, executable: '', note: '' },
    new AbortController().signal,
  );
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\step-parity-test-${randomUUID()}` : join(folder, 'bridge.sock');
  const sockets = new Set();
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let text = '';
    socket.on('data', bytes => {
      text += bytes;
      if (text.includes('\n'))
        void host.native(JSON.parse(text.slice(0, text.indexOf('\n')))).then(result => socket.end(JSON.stringify(result) + '\n'));
    });
  });
  const client = new Client({ name: 'synthetic-parity-test', version: '1.0.0' });
  try {
    await new Promise(resolve => server.listen(endpoint, resolve));
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [fileURLToPath(new URL('../eval/harness-parity/stdio.mjs', import.meta.url)), endpoint],
        stderr: 'ignore',
      }),
    );
    assert.deepEqual(
      (await client.listTools()).tools.map(t => t.name),
      ['step_host'],
    );
    const call = async (tool, input, args = {}, content = '') => {
      const result = await client.callTool({ name: 'step_host', arguments: { tool, input, argsJson: JSON.stringify(args), content } });
      return JSON.parse(result.content[0].text);
    };
    assert.equal((await call('reference', 'step-public-profile')).ok, true);
    assert.equal((await call('reference', 'unregistered')).code, 'REFERENCE_UNAVAILABLE');
    assert.equal((await call('terminal', 'whoami')).code, 'INVALID_TOOL_REQUEST');
    assert.equal((await call('files', '../outside.txt', { action: 'read' })).code, 'INVALID_PATH');
    assert.equal((await call('changes', 'native.md', { action: 'stage' }, 'Synthetic draft')).ok, true);
    assert.equal(await readFile(join(folder, 'native.md'), 'utf8'), 'Synthetic draft');
    assert.equal(host.records.filter(r => r.ok).length, 2);
  } finally {
    await client.close();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
    await host.close();
    await rm(folder, { recursive: true, force: true });
  }
});
