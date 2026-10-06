import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Rpc } from '../electron/rpc';
import { createRequire } from 'node:module';
import { CodexAdapter, GeminiAdapter, ClaudeAdapter, nativeCodex, listModels, googleLoginUrl } from '../electron/providers';
import type { Connection } from '../src/types';

test('closeAndWait is repeatable and releases process and file handles before cleanup', { timeout: 6000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), 'step-rpc-shutdown-'));
  t.after(() => rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
  const executable = join(home, 'runtime.cjs');
  await writeFile(
    executable,
    `require('node:readline').createInterface({input:process.stdin}).on('line', line => {
    const message=JSON.parse(line); console.log(JSON.stringify({id:message.id,result:{pid:process.pid}}));
  });`,
  );
  const rpc = new Rpc(process.execPath, [executable], { cwd: home });
  try {
    const { pid } = await rpc.request('ready', {});
    await Promise.all([rpc.closeAndWait(), rpc.closeAndWait()]);
    assert.throws(() => process.kill(pid, 0));
    await assert.rejects(rpc.request('ready', {}), /CANCELLED/);
    await rm(home, { recursive: true, force: true });
  } finally {
    await rpc.closeAndWait();
  }
});

test('closeAndWait completes after a runtime startup failure', async () => {
  const rpc = new Rpc(join(tmpdir(), 'step-nonexistent-runtime', 'not-found'), [], { cwd: tmpdir() });
  await assert.rejects(rpc.request('initialize', {}), /RUNTIME_UNAVAILABLE/);
  await rpc.closeAndWait();
});

test('runtime exit rejects pending and future RPC requests immediately', async () => {
  const rpc = new Rpc(process.execPath, ['-e', 'process.exit(1)'], { cwd: tmpdir() });
  try {
    await assert.rejects(rpc.request('initialize', {}, 2000), /RUNTIME_EXITED/);
    await assert.rejects(rpc.request('initialize', {}, 2000), /RUNTIME_EXITED/);
  } finally {
    rpc.close();
  }
});

test('unsolicited provider tool requests are denied by default', async () => {
  const script = `const r = require('node:readline').createInterface({input:process.stdin});
    console.log(JSON.stringify({jsonrpc:'2.0',id:'tool',method:'exec',params:{command:'never execute'}}));
    r.on('line', l => { const m=JSON.parse(l); if(m.id==='tool') console.log(JSON.stringify({method:'denied',params:m.error})); });`;
  const rpc = new Rpc(process.execPath, ['-e', script], { cwd: tmpdir() });
  try {
    const result = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('TEST_TIMEOUT')), 3000);
      rpc.onNotification = (_, params) => {
        clearTimeout(timer);
        resolve(params);
      };
    });
    assert.equal(result.code, -32601);
  } finally {
    rpc.close();
  }
});

test('Codex exits after accepting a turn without leaving generation waiting', { timeout: 5000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-rpc-test-'));
  const executable = join(home, 'runtime.cjs');
  await writeFile(
    executable,
    `require('node:readline').createInterface({input:process.stdin}).on('line',l=>{
    const m=JSON.parse(l); if(m.id===undefined)return;
    console.log(JSON.stringify({id:m.id,result:m.method==='thread/start'?{thread:{id:'test'}}:{}}));
    if(m.method==='turn/start')setTimeout(()=>process.exit(1),20);
  });`,
  );
  const connection: Connection = { id: 'test', provider: 'openai', mode: 'subscription', executable, model: '', ready: true, note: '' };
  await assert.rejects(
    new CodexAdapter().run('Test', connection, { cwd: home, env: {}, signal: new AbortController().signal, emit: () => {} }),
    /RUNTIME_EXITED/,
  );
});

test('all adapters reject an already cancelled run before spawning', async () => {
  const controller = new AbortController();
  controller.abort();
  for (const adapter of [new CodexAdapter(), new GeminiAdapter(), new ClaudeAdapter()]) {
    await assert.rejects(
      adapter.run('Test', {} as Connection, { cwd: tmpdir(), env: {}, signal: controller.signal, emit: () => {} }),
      /CANCELLED/,
    );
  }
});

test('cancellation terminates the CLI descendant process', { timeout: 6000 }, async () => {
  const script = `const child=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
    require('node:readline').createInterface({input:process.stdin}).on('line',l=>{const m=JSON.parse(l);console.log(JSON.stringify({id:m.id,result:{pid:child.pid}}));});`;
  const rpc = new Rpc(process.execPath, ['-e', script], { cwd: tmpdir() });
  try {
    const { pid } = await rpc.request('pid', {}, 2000);
    rpc.close();
    let alive = true;
    for (let attempt = 0; attempt < 100 && alive; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 30));
      try {
        process.kill(pid, 0);
      } catch {
        alive = false;
      }
    }
    assert.equal(alive, false, 'CLI descendant must exit after cancellation');
  } finally {
    rpc.close();
  }
});

test('Windows Codex launcher is replaced by its native binary so no console window flashes', { skip: process.platform !== 'win32' }, () => {
  const launcher = createRequire(import.meta.url).resolve('@openai/codex/bin/codex.js');
  assert.match(nativeCodex(launcher), /[\\/]codex\.exe$/i);
  assert.equal(nativeCodex('C:\tools\other.js'), 'C:\tools\other.js');
});

test('model catalogs come from the provider runtime and drop hidden or malformed entries', { timeout: 5000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-models-test-'));
  const executable = join(home, 'runtime.cjs');
  await writeFile(
    executable,
    `require('node:readline').createInterface({input:process.stdin}).on('line',l=>{
    const m=JSON.parse(l); if(m.id===undefined)return;
    const data=[{id:'a',model:'model-a',displayName:'Model A',isDefault:true,supportedReasoningEfforts:[{reasoningEffort:'low',description:'Fast'},{reasoningEffort:'ultra'},{reasoningEffort:'BAD value'}],defaultReasoningEffort:'low'},{id:'h',model:'hidden-model',hidden:true},{id:'bad',model:'bad model <x>'}];
    console.log(JSON.stringify({id:m.id,result:m.method==='model/list'?{data}:{}}));
  });`,
  );
  const connection: Connection = { id: 'test', provider: 'openai', mode: 'subscription', executable, model: '', ready: true, note: '' };
  assert.deepEqual(await listModels(connection, { cwd: home, env: {} }), [
    {
      id: 'model-a',
      label: 'Model A',
      description: undefined,
      isDefault: true,
      efforts: [
        { id: 'low', description: 'Fast' },
        { id: 'ultra', description: undefined },
      ],
      defaultEffort: 'low',
    },
  ]);
});

test('Codex turns carry the chosen reasoning effort', { timeout: 5000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-effort-test-'));
  const executable = join(home, 'runtime.cjs');
  await writeFile(
    executable,
    `require('node:readline').createInterface({input:process.stdin}).on('line',l=>{
    const m=JSON.parse(l); if(m.id===undefined)return;
    console.log(JSON.stringify({id:m.id,result:m.method==='thread/start'?{thread:{id:'t'}}:{}}));
    if(m.method==='turn/start'){console.log(JSON.stringify({method:'item/agentMessage/delta',params:{delta:String(m.params.effort)}}));console.log(JSON.stringify({method:'turn/completed',params:{turn:{status:'completed'}}}));}
  });`,
  );
  const connection: Connection = { id: 'test', provider: 'openai', mode: 'subscription', executable, model: '', ready: true, note: '' };
  assert.equal(
    await new CodexAdapter().run('Test', connection, {
      cwd: home,
      env: {},
      effort: 'high',
      signal: new AbortController().signal,
      emit: () => {},
    }),
    'high',
  );
});

test('only real Google sign-in URLs are recognized', () => {
  assert.equal(googleLoginUrl('Visit https://accounts.google.com/o/oauth2/v2/auth?x=1')?.hostname, 'accounts.google.com');
  assert.equal(googleLoginUrl('https://accounts.google.com.evil.example/o/oauth2'), undefined);
  assert.equal(googleLoginUrl('http://accounts.google.com/o/oauth2'), undefined);
});

test('plain-text CLI prompts reach the host and can be answered', { timeout: 5000 }, async () => {
  const script = `process.stdout.write('\\x1b[2JPlease visit https://accounts.google.com/auth\\n');
    require('node:readline').createInterface({input:process.stdin}).on('line',l=>{console.log(JSON.stringify({method:'code',params:{code:l}}));});`;
  const rpc = new Rpc(process.execPath, ['-e', script], { cwd: tmpdir() });
  try {
    const seen: string[] = [];
    const code = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('TEST_TIMEOUT')), 3000);
      rpc.onText = line => {
        seen.push(line);
        rpc.writeText('4/abc');
      };
      rpc.onNotification = (_, params) => {
        clearTimeout(timer);
        resolve(params.code);
      };
    });
    assert.equal(code, '4/abc');
    assert.deepEqual(seen, ['Please visit https://accounts.google.com/auth']);
  } finally {
    rpc.close();
  }
});

test('Gemini runs stop with LOGIN_REQUIRED instead of hanging on an expired sign-in', { timeout: 5000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-gemini-test-'));
  const executable = join(home, 'runtime.cjs');
  await writeFile(
    executable,
    `require('node:readline').createInterface({input:process.stdin}).on('line',l=>{
    const m=JSON.parse(l); if(m.method==='initialize')console.log(JSON.stringify({id:m.id,result:{}}));
    if(m.method==='authenticate')console.log('Please visit https://accounts.google.com/o/oauth2/v2/auth?x=1');
  });`,
  );
  const connection: Connection = { id: 'test', provider: 'gemini', mode: 'subscription', executable, model: '', ready: true, note: '' };
  await assert.rejects(
    new GeminiAdapter().run('Test', connection, { cwd: home, env: {}, signal: new AbortController().signal, emit: () => {} }),
    /LOGIN_REQUIRED/,
  );
});

test('runtime stderr is scrubbed and known provider failures become codes', async () => {
  const { scrub, explainRuntimeFailure } = await import('../electron/diagnostics');
  const line = scrub('user me@cmu.ac.th token ya29.a0AfH6SMBxyz https://oauth2.googleapis.com/token?code=abc&state=1 ' + 'x'.repeat(40));
  assert.ok(!line.includes('me@cmu.ac.th') && !line.includes('ya29.') && !line.includes('code=abc') && !line.includes('x'.repeat(40)));
  assert.equal(explainRuntimeFailure(['[API Error: 429 RESOURCE_EXHAUSTED] quota']), 'PROVIDER_QUOTA');
  assert.equal(explainRuntimeFailure(['Please set GOOGLE_CLOUD_PROJECT']), 'GOOGLE_CLOUD_PROJECT_REQUIRED');
  assert.equal(
    explainRuntimeFailure(['error: Model stream ended with an invalid chunk or missing finish reason.']),
    'PROVIDER_EMPTY_RESPONSE',
  );
  assert.equal(explainRuntimeFailure(['finishReason: MALFORMED_FUNCTION_CALL']), 'PROVIDER_EMPTY_RESPONSE');
  assert.equal(explainRuntimeFailure(['all good']), undefined);
});

test('a Gemini run that dies on quota reports PROVIDER_QUOTA with a scrubbed tail', { timeout: 5000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-quota-test-'));
  const executable = join(home, 'runtime.cjs');
  await writeFile(
    executable,
    `require('node:readline').createInterface({input:process.stdin}).on('line',l=>{
    const m=JSON.parse(l); if(m.method==='session/prompt'){ console.error('Error 429 RESOURCE_EXHAUSTED for user a@b.co'); setTimeout(()=>process.exit(1),20); return; }
    console.log(JSON.stringify({id:m.id,result:m.method==='session/new'?{sessionId:'s'}:{}}));
  });`,
  );
  const connection: Connection = { id: 'test', provider: 'gemini', mode: 'api', executable, model: '', ready: true, note: '' };
  const error: any = await new GeminiAdapter()
    .run('Test', connection, { cwd: home, env: {}, key: 'k', signal: new AbortController().signal, emit: () => {} })
    .catch(e => e);
  assert.equal(error.message, 'PROVIDER_QUOTA');
  assert.ok(error.detail.some((l: string) => l.includes('RESOURCE_EXHAUSTED')) && !error.detail.join(' ').includes('a@b.co'));
});

test('a provider error reply keeps its scrubbed reason and becomes PROVIDER_QUOTA', { timeout: 5000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-codex-quota-'));
  const executable = join(home, 'runtime.cjs');
  await writeFile(
    executable,
    `require('node:readline').createInterface({input:process.stdin}).on('line',l=>{
    const m=JSON.parse(l); if(m.id===undefined)return;
    if(m.method==='turn/start'){console.log(JSON.stringify({id:m.id,error:{code:-32000,message:'You have hit your usage limit (user a@b.co)'}}));return;}
    console.log(JSON.stringify({id:m.id,result:m.method==='thread/start'?{thread:{id:'t'}}:{}}));
  });`,
  );
  const connection: Connection = { id: 'test', provider: 'openai', mode: 'subscription', executable, model: '', ready: true, note: '' };
  const error: any = await new CodexAdapter()
    .run('Test', connection, { cwd: home, env: {}, signal: new AbortController().signal, emit: () => {} })
    .catch(e => e);
  assert.equal(error.message, 'PROVIDER_QUOTA');
  assert.ok(error.detail.join(' ').includes('usage limit') && !error.detail.join(' ').includes('a@b.co'));
});

test('a failed Codex turn reports the reason it gives', { timeout: 5000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-codex-turn-'));
  const executable = join(home, 'runtime.cjs');
  await writeFile(
    executable,
    `require('node:readline').createInterface({input:process.stdin}).on('line',l=>{
    const m=JSON.parse(l); if(m.id===undefined)return;
    console.log(JSON.stringify({id:m.id,result:m.method==='thread/start'?{thread:{id:'t'}}:{}}));
    if(m.method==='turn/start'){console.log(JSON.stringify({method:'error',params:{error:{message:'The model gpt-x is not supported when using Codex with a ChatGPT account.'},willRetry:false}}));console.log(JSON.stringify({method:'turn/completed',params:{turn:{status:'failed',error:{message:'The model gpt-x is not supported when using Codex with a ChatGPT account.'}}}}));}
  });`,
  );
  const connection: Connection = {
    id: 'test',
    provider: 'openai',
    mode: 'subscription',
    executable,
    model: 'gpt-x',
    ready: true,
    note: '',
  };
  await assert.rejects(
    new CodexAdapter().run('Test', connection, { cwd: home, env: {}, signal: new AbortController().signal, emit: () => {} }),
    /MODEL_NOT_AVAILABLE/,
  );
});

// Each runtime receives the drafting rules as system-level instructions, not inside the user message.
test('Codex receives the drafting rules as developer instructions and keeps its base prompt', { timeout: 5000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-codex-system-'));
  const executable = join(home, 'runtime.cjs');
  const log = join(home, 'thread-start.json');
  await writeFile(
    executable,
    `const fs=require('node:fs');require('node:readline').createInterface({input:process.stdin}).on('line',l=>{
    const m=JSON.parse(l); if(m.id===undefined)return;
    if(m.method==='thread/start'){fs.writeFileSync(${JSON.stringify(log)},JSON.stringify(m.params));console.log(JSON.stringify({id:m.id,result:{thread:{id:'t'}}}));return;}
    console.log(JSON.stringify({id:m.id,result:{}}));
    if(m.method==='turn/start'){console.log(JSON.stringify({method:'item/agentMessage/delta',params:{delta:'ร่าง'}}));console.log(JSON.stringify({method:'turn/completed',params:{turn:{status:'completed'}}}));}
  });`,
  );
  const connection: Connection = { id: 'test', provider: 'openai', mode: 'subscription', executable, model: '', ready: true, note: '' };
  const text = await new CodexAdapter().run('<request>\nทดสอบ\n</request>', connection, {
    cwd: home,
    env: {},
    system: 'STEP RULES',
    signal: new AbortController().signal,
    emit: () => {},
  });
  assert.equal(text, 'ร่าง');
  const params = JSON.parse(await readFile(log, 'utf8'));
  assert.equal(params.developerInstructions, 'STEP RULES');
  assert.equal(params.baseInstructions, undefined);
  assert.equal(params.sandbox, 'read-only');
});

test('Gemini replaces its coding system prompt through a per-run file that is removed afterwards', { timeout: 5000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-gemini-system-'));
  const cwd = join(home, 'workspace');
  await mkdir(cwd);
  const executable = join(home, 'runtime.cjs');
  const seen = join(home, 'seen.json');
  await writeFile(
    executable,
    `const fs=require('node:fs');require('node:readline').createInterface({input:process.stdin}).on('line',l=>{
    const m=JSON.parse(l); if(m.id===undefined)return;
    const file=process.env.GEMINI_SYSTEM_MD;
    if(m.method==='session/new'){fs.writeFileSync(${JSON.stringify(seen)},JSON.stringify({file,text:fs.readFileSync(file,'utf8')}));console.log(JSON.stringify({id:m.id,result:{sessionId:'s'}}));return;}
    if(m.method==='session/prompt'){console.log(JSON.stringify({method:'session/update',params:{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'ร่าง'}}}}));}
    console.log(JSON.stringify({id:m.id,result:{}}));
  });`,
  );
  const connection: Connection = { id: 'test', provider: 'gemini', mode: 'api', executable, model: '', ready: true, note: '' };
  const text = await new GeminiAdapter().run('<request>\nทดสอบ\n</request>', connection, {
    cwd,
    env: {},
    key: 'test-key',
    system: 'STEP RULES',
    signal: new AbortController().signal,
    emit: () => {},
  });
  assert.equal(text, 'ร่าง');
  const { file, text: system } = JSON.parse(await readFile(seen, 'utf8'));
  assert.equal(system, 'STEP RULES');
  assert.ok(!file.startsWith(cwd), 'the file sits outside the runtime working folder');
  // The adapter removes the file without waiting for it; give that removal a moment on slow machines.
  for (let i = 0; i < 40 && existsSync(file); i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(existsSync(file), false, 'the per-run file is removed');
});

test('Claude receives the drafting rules as its system prompt', async () => {
  let captured: any;
  const provider = new ClaudeAdapter(
    async () =>
      ({
        query: (input: any) => {
          captured = input;
          return (async function* () {
            yield { type: 'result', subtype: 'success', is_error: false, result: 'ร่าง' };
          })();
        },
      }) as any,
  );
  const answer = await provider.run('<request>\nทดสอบ\n</request>', { mode: 'api' } as Connection, {
    cwd: tmpdir(),
    env: {},
    key: 'test-key',
    system: 'STEP RULES',
    signal: new AbortController().signal,
    emit: () => {},
  });
  assert.equal(answer, 'ร่าง');
  assert.equal(captured.options.systemPrompt, 'STEP RULES');
  assert.deepEqual(captured.options.tools, []);
});

test('busy services, exhausted quotas and the Gemini personal-account shutdown are told apart', async () => {
  const { explainRuntimeFailure } = await import('../electron/diagnostics');
  assert.equal(explainRuntimeFailure(['{"type":"error","error":{"type":"overloaded_error"}}']), 'PROVIDER_BUSY');
  assert.equal(explainRuntimeFailure(['529 Overloaded']), 'PROVIDER_BUSY');
  assert.equal(explainRuntimeFailure(['rate_limit_error: 429 too many requests']), 'PROVIDER_BUSY');
  assert.equal(explainRuntimeFailure(['You have hit your usage limit']), 'PROVIDER_QUOTA');
  assert.equal(explainRuntimeFailure(['[API Error: 429 RESOURCE_EXHAUSTED] quota']), 'PROVIDER_QUOTA');
  assert.equal(
    explainRuntimeFailure([
      'error: This client is no longer supported for Gemini Code Assist for individuals. To continue using Gemini, please migrate to the Antigravity suite of products',
    ]),
    'GEMINI_PERSONAL_DISCONTINUED',
  );
});
