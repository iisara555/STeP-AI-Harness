import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, link, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Store } from '../electron/store';
import { defaultPolicy, parsePolicy } from '../electron/policy';
import { Workbench } from '../electron/workbench';
import { Sandbox } from '../electron/sandbox';
import { Mcp } from '../electron/mcp';
const { evaluatePrivacyGate }: any = await import('../../src/modules/privacy/index.js');
const image = 'alpine@sha256:' + 'a'.repeat(64);
test('Docker sandbox sends only approved snapshots with no network or host writes, then cleans up', async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-docker-test-')),
    policy = defaultPolicy(),
    store = new Store(':memory:');
  store.put('settings', 'main', { workspace: home });
  policy.features.sandbox = true;
  policy.sandbox = { image };
  await writeFile(join(home, 'note.txt'), 'Public synthetic note');
  let mount = '';
  const calls: string[][] = [];
  const sandbox = new Sandbox(
    new Workbench(store, undefined, () => policy),
    () => policy,
    evaluatePrivacyGate,
    async () => true,
    async (_command, args) => {
      calls.push(args);
      if (args[0] === 'run') {
        mount = /source=(.*),target=/.exec(args[args.indexOf('--mount') + 1])![1];
        assert.equal(await readFile(join(mount, 'note.txt'), 'utf8'), 'Public synthetic note');
      }
      return { code: 0, output: 'synthetic' };
    },
  );
  assert.equal((await sandbox.run('cat note.txt', ['note.txt'])).output, 'synthetic');
  const args = calls.find(a => a[0] === 'run')!;
  assert.ok(args.includes('--network=none'));
  assert.ok(args.includes('--read-only'));
  assert.ok(args.includes('--pull=never'));
  assert.ok(args.some(a => a.includes('target=/workspace,readonly')));
  assert.ok(calls.some(a => a[0] === 'rm'));
  await assert.rejects(readFile(join(mount, 'note.txt')), /ENOENT/);
  assert.equal(await readFile(join(home, 'note.txt'), 'utf8'), 'Public synthetic note');
  await writeFile(join(home, 'pii.txt'), 'person@example.test');
  await assert.rejects(sandbox.run('cat pii.txt', ['pii.txt']), /PRIVACY_REVIEW_REQUIRED/);
  await link(join(home, 'note.txt'), join(home, 'linked.txt'));
  await assert.rejects(sandbox.run('cat linked.txt', ['linked.txt']), /INVALID_PATH/);
  await assert.rejects(sandbox.run('cat .env', ['.env']), /INVALID_PATH/);
  assert.equal(calls.filter(a => a[0] === 'run').length, 1);
  await sandbox.close();
  store.close();
  await rm(home, { recursive: true, force: true });
});
test('policy rejects unpinned images and duplicate MCP names without enabling capabilities', () => {
  assert.equal(parsePolicy({ features: { sandbox: true }, sandbox: { image: 'alpine:latest' } }).policy.features.sandbox, false);
  assert.equal(
    parsePolicy({
      features: { mcp: true },
      mcpServers: [
        { name: 'x', transport: 'stdio', command: 'node' },
        { name: 'x', transport: 'stdio', command: 'node' },
      ],
    }).policy.features.mcp,
    false,
  );
});
test('MCP stdio SDK transport lists/searches at most 12 tools, calls once and rejects PII/unapproved servers', async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-mcp-test-')),
    script = join(home, 'server.mjs'),
    audit = join(home, 'audit.jsonl'),
    policy = defaultPolicy();
  await writeFile(
    script,
    `import readline from 'node:readline';import fs from 'node:fs';
readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;
fs.appendFileSync(${JSON.stringify(audit)},m.method+'\\n');let result={};
if(m.method==='initialize')result={protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};
if(m.method==='tools/list')result={tools:Array.from({length:16},(_,i)=>({name:'tool_'+i,description:'Synthetic tool '+i,inputSchema:{type:'object'}}))};
if(m.method==='tools/call')result={content:[{type:'text',text:'Synthetic result'}]};
console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result}));});`,
  );
  policy.features.mcp = true;
  policy.mcpServers = [{ name: 'fixture', transport: 'stdio', command: process.execPath, args: [script] }];
  let approve = true;
  const mcp = new Mcp(
    () => policy,
    () => 'stable',
    join(home, 'isolated'),
    evaluatePrivacyGate,
    async () => approve,
  );
  try {
    const all = await mcp.search('fixture');
    assert.equal(all.total, 16);
    assert.equal(all.searchRequired, true);
    assert.equal(all.tools.length, 12);
    assert.equal((await mcp.search('fixture', 'tool_15')).tools[0].name, 'tool_15');
    const result: any = await mcp.call('fixture', 'tool_15', { message: 'Public data' });
    assert.equal(result.content[0].text, 'Synthetic result');
    assert.equal((await readFile(audit, 'utf8')).split('\n').filter(l => l === 'tools/call').length, 1);
    await assert.rejects(mcp.call('fixture', 'tool_1', { message: 'person@example.test' }), /PRIVACY_REVIEW_REQUIRED/);
    await assert.rejects(mcp.search('unapproved'), /MCP_SERVER_NOT_ALLOWED/);
    approve = false;
    await assert.rejects(mcp.call('fixture', 'tool_1', {}), /CANCELLED/);
    assert.equal((await readFile(audit, 'utf8')).split('\n').filter(l => l === 'tools/call').length, 1);
  } finally {
    await mcp.close();
    await rm(home, { recursive: true, force: true });
  }
});
test('MCP HTTP rejects redirects and retries discovery within a bounded attempt limit', async () => {
  let calls = 0;
  const server = createServer((_req, res) => {
    calls++;
    res.writeHead(302, { Location: 'http://127.0.0.1:1/private' });
    res.end();
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const address = server.address() as { port: number },
    policy = defaultPolicy(),
    home = await mkdtemp(join(tmpdir(), 'step-mcp-http-'));
  policy.features.mcp = true;
  policy.mcpServers = [{ name: 'http', transport: 'http', url: `http://127.0.0.1:${address.port}/mcp`, headers: {} }];
  const mcp = new Mcp(
    () => policy,
    () => 'stable',
    home,
    evaluatePrivacyGate,
    async () => true,
  );
  try {
    await assert.rejects(mcp.search('http'), /MCP_UNAVAILABLE/);
    assert.ok(calls >= 3 && calls <= 6);
  } finally {
    await mcp.close();
    await new Promise<void>(r => server.close(() => r()));
    await rm(home, { recursive: true, force: true });
  }
});
test('MCP HTTP transport discovers and calls once even when remote execution becomes uncertain', async () => {
  let calls = 0,
    fail = false;
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end();
      return;
    }
    let text = '';
    for await (const chunk of req) text += chunk;
    const message = JSON.parse(text);
    if (!('id' in message)) {
      res.writeHead(202);
      res.end();
      return;
    }
    let result: any = {};
    if (message.method === 'initialize')
      result = { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'http-fixture', version: '1' } };
    if (message.method === 'tools/list') result = { tools: [{ name: 'test', inputSchema: { type: 'object' } }] };
    if (message.method === 'tools/call') {
      calls++;
      if (fail) {
        res.writeHead(503);
        res.end('uncertain');
        return;
      }
      result = { content: [{ type: 'text', text: 'HTTP result' }] };
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const address = server.address() as { port: number },
    policy = defaultPolicy(),
    home = await mkdtemp(join(tmpdir(), 'step-mcp-http-ok-'));
  policy.features.mcp = true;
  policy.mcpServers = [{ name: 'http', transport: 'http', url: `http://127.0.0.1:${address.port}/mcp`, headers: {} }];
  const mcp = new Mcp(
    () => policy,
    () => 'stable',
    home,
    evaluatePrivacyGate,
    async () => true,
  );
  try {
    assert.equal((await mcp.search('http')).tools.length, 1);
    assert.equal(((await mcp.call('http', 'test', {})) as any).content[0].text, 'HTTP result');
    fail = true;
    await assert.rejects(mcp.call('http', 'test', {}), /MCP_UNAVAILABLE/);
    assert.equal(calls, 2);
  } finally {
    await mcp.close();
    await new Promise<void>(r => server.close(() => r()));
    await rm(home, { recursive: true, force: true });
  }
});
test('Docker cancellation removes the owned container without falling back to the host shell', async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-docker-cancel-')),
    store = new Store(':memory:'),
    policy = defaultPolicy();
  store.put('settings', 'main', { workspace: home });
  policy.features.sandbox = true;
  policy.sandbox = { image };
  const calls: string[][] = [],
    controller = new AbortController();
  const sandbox = new Sandbox(
    new Workbench(store),
    () => policy,
    evaluatePrivacyGate,
    async () => true,
    async (command, args, options) => {
      assert.equal(command, 'docker');
      calls.push(args);
      if (args[0] === 'run') {
        setTimeout(() => controller.abort(), 10);
        await new Promise<void>((_, reject) =>
          options?.signal?.addEventListener('abort', () => reject(new Error('CANCELLED')), { once: true }),
        );
      }
      return { code: 0, output: '' };
    },
  );
  await assert.rejects(sandbox.run('echo synthetic', [], controller.signal), /CANCELLED/);
  await sandbox.close();
  assert.ok(calls.some(a => a[0] === 'rm'));
  store.close();
  await rm(home, { recursive: true, force: true });
});
