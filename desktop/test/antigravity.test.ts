import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { AntigravityAdapter, ANTIGRAVITY_DENY, antigravityHome, antigravityModels, antigravityUsage } from '../electron/antigravity';
import { adapter, listModels } from '../electron/providers';
import { signInAndTest, signOutManagedProvider } from '../electron/connect';
import { checkRuntime } from '../electron/runtimes';
import { ToolLoop } from '../electron/tool-loop';
import type { Connection } from '../src/types';

async function fixture(kind = 'success', version = '1.2.14') {
  const root = await mkdtemp(join(tmpdir(), 'step-antigravity-test-'));
  const executable = join(root, 'agy.mjs');
  const log = join(root, 'calls.jsonl');
  await writeFile(
    executable,
    `
import fs from 'node:fs';
import path from 'node:path';
import {createInterface} from 'node:readline';
const kind=${JSON.stringify(kind)}, log=${JSON.stringify(log)};
const args=process.argv.slice(2);
if(args[0]==='--version'){console.log(${JSON.stringify(version)});process.exit(0);}
fs.appendFileSync(log, JSON.stringify({args,cwd:process.cwd(),home:process.env.HOME,api:!!process.env.GEMINI_API_KEY,settings:JSON.parse(fs.readFileSync(path.join(process.env.HOME,'.gemini','antigravity-cli','settings.json'),'utf8')),agent:fs.readFileSync(path.join(process.env.HOME,'.gemini','config','agents','step-draft','agent.md'),'utf8'),updaterCheck:Date.now()-fs.statSync(path.join(process.env.HOME,'.gemini','antigravity-cli','last_check.timestamp')).mtimeMs})+'\\n');
if(args[0]==='models'){console.log('gemini-test\\tGemini test\\ngemini-test\\tDuplicate\\nclaude-other\\tOther provider\\ngemini-second\\tSecond');process.exit(0);}
const send=x=>console.log(JSON.stringify(x));
const runNumber=fs.readFileSync(log,'utf8').trim().split('\\n').map(x=>JSON.parse(x)).filter(x=>x.args?.includes('--input-format')).length;
if(kind==='auth'){send({event:'result',result:{status:'ERROR',error:'authentication required: user@example.com https://accounts.google.com/oauth?code=private-code',usage:{input_tokens:0,output_tokens:0,total_tokens:0}}});process.exit(1);}
if(kind==='hang'){setInterval(()=>{},1000);}
else send({event:'init',conversation_id:'session',init:{cwd:kind==='cwd'?'/wrong':process.cwd(),agent:kind==='agent'?'wrong':'step-draft',model:kind==='model'?'claude-other':args[args.indexOf('--model')+1],permission_mode:kind==='policy'||(kind==='recover-policy'&&runNumber===2)?'always-proceed':'strict',tools:kind==='tools'?['run_command','view_file','finish']:kind==='missing-tools'?null:['finish']}});
createInterface({input:process.stdin}).on('line',line=>{
 const input=JSON.parse(line);fs.appendFileSync(log,JSON.stringify({input})+'\\n');
 const step=(delta,state='ACTIVE')=>({event:'step_update',step_update:{conversation_id:'session',step_type:'agent_response',state,text_delta:delta}});
 const attempt=fs.readFileSync(log,'utf8').trim().split('\\n').map(x=>JSON.parse(x)).filter(x=>x.args?.includes('--input-format')).length;
 if(kind.startsWith('recover-') && attempt===1){
  send(step('UNVERIFIED FRAGMENT'));
  return setTimeout(()=>send({event:'step_update',step_update:{conversation_id:'session',step_type:'tool',tool_name:'read_file'}}),kind==='recover-timeout'?650:0);
 }
 if(kind==='recover-timeout') return setTimeout(()=>send({event:'result',result:{status:'SUCCESS',conversation_id:'session',num_turns:1,response:'late'}}),650);
 if(kind==='quota'){send({event:'result',result:{status:'ERROR',error:'RESOURCE_EXHAUSTED',usage:{input_tokens:1,output_tokens:0,total_tokens:1}}});return;}
 if(kind==='recover-host'){
  const ticks=String.fromCharCode(96).repeat(3);
  const response=input.message.content.includes('<tool_results>')?'Host evidence received':ticks+'step-tool\\n'+JSON.stringify({tool:'reference',input:'synthetic-reference'})+'\\n'+ticks;
  send({event:'result',result:{status:'SUCCESS',conversation_id:'session',num_turns:1,response}});return;
 }
 if(kind==='malformed') return console.log('not json');
 if(kind==='tool') return send({event:'step_update',step_update:{conversation_id:'session',step_type:'tool',state:'ACTIVE',tool_name:'run_command'}});
 if(kind==='tool-call') return send({event:'step_update',step_update:{conversation_id:'session',step_type:'action',state:'ACTIVE',tool_call:{name:'view_file'}}});
 if(kind==='oversize') return console.log('x'.repeat(4000001));
 if(kind==='null') return send(null);
 if(kind==='missing') return;
 if(kind!=='final-only'){const b=Buffer.from(JSON.stringify(step('สวัสดี'))+'\\n');process.stdout.write(b.subarray(0,180));process.stdout.write(b.subarray(180));send(step('ครับ','DONE'));}
 const result={event:'result',result:{status:kind==='waiting'?'WAITING':'SUCCESS',conversation_id:'session',num_turns:kind==='turns'?2:1,response:kind==='diverged'?'different':'สวัสดีครับ',usage:{input_tokens:11,output_tokens:5,total_tokens:16}}};
 send(result); if(kind==='duplicate')send(result); if(kind==='exit')process.exitCode=7;
});
`,
  );
  const connection: Connection = {
    id: 'test',
    provider: 'antigravity',
    mode: 'subscription',
    model: 'gemini-test',
    executable,
    ready: false,
    note: '',
  };
  const deltas: string[] = [];
  const counts: unknown[] = [];
  const context = {
    cwd: root,
    env: { ...process.env, GEMINI_API_KEY: 'synthetic-api-key' },
    signal: new AbortController().signal,
    emit: (text: string) => deltas.push(text),
    onUsage: (count: unknown) => counts.push(count),
    system: 'Synthetic standing instructions',
  };
  return {
    root,
    connection,
    context,
    deltas,
    counts,
    calls: async () =>
      (await readFile(log, 'utf8').catch(() => ''))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line)),
    close: async () => {
      assert.equal(dirname(resolve(root)), resolve(tmpdir()));
      assert.ok(root.startsWith(join(resolve(tmpdir()), 'step-antigravity-test-')));
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}

test('Antigravity uses native NDJSON, isolated system instructions and one usage report', async () => {
  const f = await fixture();
  try {
    assert.ok(adapter('antigravity') instanceof AntigravityAdapter);
    assert.equal(await adapter('antigravity').run('Synthetic request', f.connection, f.context), 'สวัสดีครับ');
    assert.equal(f.deltas.join(''), 'สวัสดีครับ');
    assert.deepEqual(f.counts, [{ input: 11, output: 5, total: 16 }]);
    const calls = await f.calls();
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].input, { event: 'user', message: { content: 'Synthetic request' } });
    assert.equal(calls[0].api, false);
    // A fresh update-check stamp keeps agy from starting its background updater (a console window on Windows).
    assert.ok(calls[0].updaterCheck >= 0 && calls[0].updaterCheck < 60_000);
    assert.equal(calls[0].settings.toolPermission, 'strict');
    assert.deepEqual(calls[0].settings.permissions, { allow: [], ask: [], deny: ANTIGRAVITY_DENY });
    assert.match(calls[0].agent, /Synthetic standing instructions/);
    assert.match(calls[0].agent, /^tools: \[finish\]\nexcludeDefaultComponents: true$/m);
    for (const flag of ['--acp', '--dangerously-skip-permissions', '--continue', '--conversation', '-p'])
      assert.ok(!calls[0].args.includes(flag));
    assert.ok(!calls[0].args.includes('Synthetic request'));
    assert.deepEqual((await readdir(f.root)).sort(), ['agy.mjs', 'calls.jsonl']);
  } finally {
    await f.close();
  }
});

test('a blocked native tool gets one fresh text-only attempt, with no failed text or tool arguments exposed', async () => {
  const f = await fixture('recover-chat');
  try {
    assert.equal(await new AntigravityAdapter().run('Synthetic current-events question', f.connection, f.context), 'สวัสดีครับ');
    assert.equal(f.deltas.join(''), 'สวัสดีครับ');
    assert.deepEqual(f.counts, [{ input: 11, output: 5, total: 16 }]);
    const calls = await f.calls();
    const runs = calls.filter(c => c.args?.includes('--input-format'));
    const inputs = calls.filter(c => c.input);
    assert.equal(runs.length, 2);
    assert.notEqual(runs[0].home, runs[1].home);
    assert.equal(existsSync(runs[0].home), false);
    for (const run of runs) {
      assert.equal(run.settings.toolPermission, 'strict');
      assert.deepEqual(run.settings.permissions.deny, ANTIGRAVITY_DENY);
      assert.match(run.agent, /Synthetic standing instructions/);
      assert.match(run.agent, /Native tools are unavailable/);
    }
    assert.match(runs[1].agent, /The previous attempt was stopped/);
    assert.deepEqual(
      inputs.map(c => c.input.message.content),
      ['Synthetic current-events question', 'Synthetic current-events question'],
    );
    assert.deepEqual((await readdir(f.root)).sort(), ['agy.mjs', 'calls.jsonl']);
  } finally {
    await f.close();
  }
});

test('recovery preserves the governed host tool loop and its outgoing-data check', async () => {
  const f = await fixture('recover-host');
  const tools: unknown[] = [];
  const outgoing: string[] = [];
  const loop = new ToolLoop({
    enabled: () => true,
    check: async () => {},
    readOnly: () => true,
    execute: async request => {
      tools.push(request);
      return 'Public synthetic reference';
    },
    outgoing: async text => {
      outgoing.push(text);
      return text;
    },
  });
  try {
    const provider = new AntigravityAdapter();
    assert.equal(
      await loop.run('Use the synthetic source', prompt => provider.run(prompt, f.connection, f.context), f.context.signal),
      'Host evidence received',
    );
    assert.deepEqual(tools, [{ tool: 'reference', input: 'synthetic-reference' }]);
    assert.deepEqual(outgoing, ['Public synthetic reference']);
    assert.ok(!f.deltas.join('').includes('UNVERIFIED FRAGMENT'));
    assert.equal((await f.calls()).filter(c => c.input).length, 3);
  } finally {
    await f.close();
  }
});

test('persistent native tool requests stop after two attempts and publish no partial answer', async () => {
  const f = await fixture('tool');
  try {
    await assert.rejects(new AntigravityAdapter().run('Synthetic', f.connection, f.context), { message: 'TOOL_DENIED' });
    assert.equal((await f.calls()).filter(c => c.input).length, 2);
    assert.deepEqual(f.deltas, []);
  } finally {
    await f.close();
  }
});

test('an unsafe init in the recovery attempt blocks the original prompt again', async () => {
  const f = await fixture('recover-policy');
  try {
    await assert.rejects(new AntigravityAdapter().run('Synthetic private request', f.connection, f.context), {
      message: 'ANTIGRAVITY_POLICY_UNCONFIRMED',
    });
    const calls = await f.calls();
    assert.equal(calls.filter(c => c.args?.includes('--input-format')).length, 2);
    assert.equal(calls.filter(c => c.input).length, 1);
    assert.deepEqual(f.deltas, []);
  } finally {
    await f.close();
  }
});

test('recovery shares the original deadline and does not retry quota or invalid-policy errors', async () => {
  const timed = await fixture('recover-timeout');
  try {
    await assert.rejects(new AntigravityAdapter(1000).run('Synthetic', timed.connection, timed.context), { message: 'PROVIDER_TIMEOUT' });
    assert.deepEqual(timed.deltas, []);
    assert.ok((await timed.calls()).filter(c => c.input).length <= 2);
  } finally {
    await timed.close();
  }
  for (const [kind, code] of [
    ['quota', 'PROVIDER_QUOTA'],
    ['policy', 'ANTIGRAVITY_POLICY_UNCONFIRMED'],
  ]) {
    const f = await fixture(kind);
    try {
      await assert.rejects(new AntigravityAdapter().run('Synthetic', f.connection, f.context), { message: code });
      assert.equal((await f.calls()).filter(c => c.args?.includes('--input-format')).length, 1);
      assert.deepEqual(f.deltas, []);
    } finally {
      await f.close();
    }
  }
});

test('Antigravity rejects an unconfirmed policy before writing the request', async () => {
  for (const [kind, code] of [
    ['missing-tools', 'ANTIGRAVITY_POLICY_UNCONFIRMED'],
    ['policy', 'ANTIGRAVITY_POLICY_UNCONFIRMED'],
    ['cwd', 'ANTIGRAVITY_POLICY_UNCONFIRMED'],
    ['agent', 'ANTIGRAVITY_POLICY_UNCONFIRMED'],
    ['model', 'MODEL_NOT_AVAILABLE'],
  ]) {
    const f = await fixture(kind);
    try {
      await assert.rejects(new AntigravityAdapter().run('Never send this', f.connection, f.context), { message: code });
      assert.equal((await f.calls()).filter(call => call.input).length, 0);
      assert.deepEqual(f.deltas, []);
    } finally {
      await f.close();
    }
  }
});

test('Antigravity accepts final-only output and fails closed on invalid, incomplete or failed streams', async () => {
  const f = await fixture('final-only');
  try {
    assert.equal(await new AntigravityAdapter().run('Synthetic', f.connection, f.context), 'สวัสดีครับ');
    assert.deepEqual(f.deltas, ['สวัสดีครับ']);
  } finally {
    await f.close();
  }
  for (const [kind, code] of [
    ['malformed', 'PROVIDER_STREAM_INVALID'],
    ['null', 'PROVIDER_STREAM_INVALID'],
    ['missing', 'PROVIDER_REQUEST_FAILED'],
    ['duplicate', 'PROVIDER_STREAM_INVALID'],
    ['turns', 'PROVIDER_STREAM_INVALID'],
    ['diverged', 'PROVIDER_STREAM_INVALID'],
    ['waiting', 'PROVIDER_REQUEST_FAILED'],
    ['exit', 'RUNTIME_EXITED'],
    ['tool', 'TOOL_DENIED'],
    ['tool-call', 'TOOL_DENIED'],
    ['oversize', 'PROVIDER_OUTPUT_LIMIT'],
  ]) {
    const f = await fixture(kind);
    try {
      await assert.rejects(new AntigravityAdapter().run('Synthetic', f.connection, f.context), { message: code });
    } finally {
      await f.close();
    }
  }
});

test('Antigravity cancellation and timeout terminate the process before cleanup', async () => {
  for (const cancel of [false, true]) {
    const f = await fixture('hang');
    const controller = new AbortController();
    const timer = cancel ? setTimeout(() => controller.abort(), 250) : undefined;
    try {
      await assert.rejects(
        new AntigravityAdapter(cancel ? 3000 : 100).run('Synthetic', f.connection, { ...f.context, signal: controller.signal }),
        {
          message: cancel ? 'CANCELLED' : 'PROVIDER_TIMEOUT',
        },
      );
    } finally {
      clearTimeout(timer);
      await f.close();
    }
  }
});

test('Antigravity rejects images, search, API auth and non-Gemini models without spawning', async () => {
  const f = await fixture();
  try {
    for (const [connection, context, code] of [
      [f.connection, { ...f.context, images: [{ mime: 'image/png', data: 'synthetic' }] }, 'VISION_UNAVAILABLE'],
      [f.connection, { ...f.context, webSearch: true }, 'WEB_SEARCH_UNAVAILABLE'],
      [{ ...f.connection, model: 'claude-other' }, f.context, 'MODEL_NOT_AVAILABLE'],
      [{ ...f.connection, mode: 'api' }, f.context, 'INVALID_CONNECTION'],
      [f.connection, { ...f.context, key: 'synthetic' }, 'INVALID_CONNECTION'],
      [f.connection, { ...f.context, signal: AbortSignal.abort() }, 'CANCELLED'],
    ] as any[])
      await assert.rejects(new AntigravityAdapter().run('Synthetic', connection, context), { message: code });
    assert.deepEqual(await f.calls(), []);
  } finally {
    await f.close();
  }
});

test('Antigravity catalog is bounded to Gemini and does not imply account readiness', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await listModels(f.connection, f.context), [
      { id: 'gemini-test', label: 'Gemini test' },
      { id: 'gemini-second', label: 'Second' },
    ]);
    assert.equal(f.connection.ready, false);
    await checkRuntime('antigravity', f.connection.executable);
    await assert.rejects(checkRuntime('gemini', f.connection.executable), { message: 'RUNTIME_INVALID' });
  } finally {
    await f.close();
  }
  const old = await fixture('success', '1.2.13');
  try {
    await assert.rejects(antigravityModels(old.connection, old.context), { message: 'ANTIGRAVITY_UPDATE_REQUIRED' });
  } finally {
    await old.close();
  }
  for (const usage of [
    null,
    {},
    { input_tokens: -1, output_tokens: 0, total_tokens: 0 },
    { input_tokens: 4, output_tokens: 3, total_tokens: 5 },
  ])
    assert.throws(() => antigravityUsage(usage), { message: 'PROVIDER_STREAM_INVALID' });
});

test('Antigravity connection requires successful generation and never logs out the shared native account', async () => {
  for (const kind of ['success', 'tools', 'exit', 'auth']) {
    const f = await fixture(kind);
    let signedIn = false;
    let opened = false;
    const deps = {
      runtime: { adapter: new AntigravityAdapter(), context: f.context },
      progress: () => {},
      openExternal: async () => {
        opened = true;
      },
      askForCode: async () => null,
      dropCode: () => {},
      signedIn: () => {
        signedIn = true;
      },
    };
    try {
      if (kind === 'success' || kind === 'tools') await signInAndTest(f.connection, deps, f.context.signal);
      else
        await assert.rejects(signInAndTest(f.connection, deps, f.context.signal), {
          message: kind === 'auth' ? 'LOGIN_REQUIRED' : 'RUNTIME_EXITED',
        });
      assert.equal(signedIn, kind === 'success' || kind === 'tools');
      assert.equal(opened, false);
      const before = await f.calls();
      await signOutManagedProvider(f.connection, deps.runtime);
      assert.deepEqual(await f.calls(), before);
    } finally {
      await f.close();
    }
  }
});

test('Antigravity parallel requests do not share native configuration or system instructions', async () => {
  const f = await fixture();
  try {
    await Promise.all(
      ['First instructions', 'Second instructions'].map(system =>
        new AntigravityAdapter().run('Synthetic', f.connection, { ...f.context, system }),
      ),
    );
    const runs = (await f.calls()).filter(call => call.args);
    assert.equal(new Set(runs.map(run => run.home)).size, 2);
    assert.ok(runs.some(run => run.agent.includes('First instructions')));
    assert.ok(runs.some(run => run.agent.includes('Second instructions')));
  } finally {
    await f.close();
  }
});

test('the isolated home sees the real sign-in: token file copied, Mac keychain folder linked and never deleted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-agy-profile-'));
  const profile = join(root, 'real-home');
  await mkdir(join(profile, '.gemini', 'antigravity-cli'), { recursive: true });
  await mkdir(join(profile, 'Library', 'Keychains'), { recursive: true });
  await writeFile(join(profile, '.gemini', 'antigravity-cli', 'antigravity-oauth-token'), 'synthetic-token');
  await writeFile(join(profile, 'Library', 'Keychains', 'login.keychain-db'), 'keep me');
  const work = join(root, 'work');
  await mkdir(work);

  const mac = await antigravityHome({ cwd: work, env: {} }, { home: profile, platform: 'darwin' });
  const home = mac.env.HOME!;
  assert.equal(await readFile(join(home, '.gemini', 'antigravity-cli', 'antigravity-oauth-token'), 'utf8'), 'synthetic-token');
  if (process.platform !== 'win32')
    assert.equal((await stat(join(home, '.gemini', 'antigravity-cli', 'antigravity-oauth-token'))).mode & 0o777, 0o600);
  assert.ok((await lstat(join(home, 'Library', 'Keychains'))).isSymbolicLink());
  await mac.close();
  assert.equal(existsSync(home), false);
  assert.equal(await readFile(join(profile, 'Library', 'Keychains', 'login.keychain-db'), 'utf8'), 'keep me');
  assert.equal(await readFile(join(profile, '.gemini', 'antigravity-cli', 'antigravity-oauth-token'), 'utf8'), 'synthetic-token');

  const win = await antigravityHome({ cwd: work, env: {} }, { home: profile, platform: 'win32' });
  assert.equal(existsSync(join(win.env.HOME!, 'Library')), false, 'only macOS links the keychain folder');
  await win.close();
  await rm(root, { recursive: true, force: true });
});
