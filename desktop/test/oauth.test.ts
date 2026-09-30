import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signInAndTest, signOutManagedProvider } from '../electron/connect';
import type { Connection } from '../src/types';

async function fakeRuntime(kind: 'openai' | 'gemini') {
  const home = await mkdtemp(join(tmpdir(), `step-${kind}-oauth-`));
  const executable = join(home, 'runtime.cjs');
  const calls = join(home, 'calls.jsonl');
  const marker = join(home, 'signed-in');

  const body =
    kind === 'openai'
      ? `
const fs=require('node:fs');
const readline=require('node:readline');
const calls=${JSON.stringify(calls)}, marker=${JSON.stringify(marker)};
const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
  const m=JSON.parse(line); if(m.id===undefined)return;
  fs.appendFileSync(calls,JSON.stringify({method:m.method,params:m.params})+'\\n');
  if(m.method==='initialize') return send({id:m.id,result:{}});
  if(m.method==='account/read') return send({id:m.id,result:{account:fs.existsSync(marker)?{type:'chatgpt',planType:'plus'}:null,requiresOpenaiAuth:true}});
  if(m.method==='account/login/start'){
    send({id:m.id,result:{type:'chatgpt',authUrl:'https://auth.openai.com/oauth/authorize?step=1',loginId:'login-good'}});
    setTimeout(()=>send({method:'account/login/completed',params:{loginId:'stale-login',success:true}}),5);
    setTimeout(()=>{fs.writeFileSync(marker,'1');send({method:'account/login/completed',params:{loginId:'login-good',success:true}})},15);
    return;
  }
  if(m.method==='account/login/cancel') return send({id:m.id,result:{}});
  if(m.method==='account/logout'){fs.rmSync(marker,{force:true});return send({id:m.id,result:{}});}
  send({id:m.id,result:{}});
});`
      : `
const fs=require('node:fs');
const readline=require('node:readline');
const calls=${JSON.stringify(calls)}, marker=${JSON.stringify(marker)};
const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
  const m=JSON.parse(line); if(m.id===undefined)return;
  fs.appendFileSync(calls,JSON.stringify({
    method:m.method,
    params:m.params,
    noBrowser:process.env.NO_BROWSER||null,
    authType:process.env.GEMINI_DEFAULT_AUTH_TYPE||null,
    trust:process.env.GEMINI_CLI_TRUST_WORKSPACE||null,
    project:process.env.GOOGLE_CLOUD_PROJECT||null
  })+'\\n');
  if(m.method==='initialize') return send({id:m.id,result:{protocolVersion:1,authMethods:[
    {id:'oauth-personal',name:'Log in with Google'},
    {id:'gemini-api-key',name:'Use Gemini API key'}
  ]}});
  if(m.method==='authenticate'){
    if(process.env.NO_BROWSER) return send({id:m.id,error:{code:-32000,message:'Manual authorization is required but the current session is non-interactive'}});
    if(m.params.methodId!=='oauth-personal') return send({id:m.id,error:{code:-32602,message:'wrong auth method'}});
    process.stdout.write('Attempting to open authentication page in your browser.\\n');
    process.stdout.write('https://accounts.google.com/o/oauth2/v2/auth?step=1\\n');
    setTimeout(()=>{fs.writeFileSync(marker,'1');send({id:m.id,result:{}})},15);
    return;
  }
  send({id:m.id,result:{}});
});`;

  await writeFile(executable, body);
  return { home, executable, calls, marker };
}

const deps = (home: string, extraEnv: NodeJS.ProcessEnv = {}) => {
  let signedIn = false;
  let tested = false;
  let opened = '';
  let codePrompts = 0;
  const runtime = {
    adapter: {
      run: async () => {
        tested = true;
        return 'OK';
      },
    },
    context: { cwd: home, env: { ...extraEnv } },
  };
  return {
    state: {
      get signedIn() {
        return signedIn;
      },
      get tested() {
        return tested;
      },
      get opened() {
        return opened;
      },
      get codePrompts() {
        return codePrompts;
      },
    },
    value: {
      runtime,
      progress: () => {},
      openExternal: async (url: string) => {
        opened = url;
      },
      askForCode: async () => {
        codePrompts++;
        return null;
      },
      dropCode: () => {},
      signedIn: () => {
        signedIn = true;
      },
    },
  };
};

test('ChatGPT OAuth binds the completion to loginId, refreshes the saved account, and reuses it', { timeout: 5000 }, async t => {
  const f = await fakeRuntime('openai');
  t.after(() => rm(f.home, { recursive: true, force: true }));
  const connection: Connection = {
    id: 'openai-oauth',
    provider: 'openai',
    mode: 'subscription',
    executable: f.executable,
    model: '',
    ready: false,
    note: '',
  };
  const first = deps(f.home);
  await signInAndTest(connection, first.value, new AbortController().signal);
  assert.equal(first.state.signedIn, true);
  assert.equal(first.state.tested, true);
  assert.match(first.state.opened, /^https:\/\/auth\.openai\.com\//);

  const calls1 = (await readFile(f.calls, 'utf8'))
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  assert.ok(calls1.some(call => call.method === 'account/login/start' && call.params.type === 'chatgpt'));
  assert.ok(calls1.some(call => call.method === 'account/read' && call.params.refreshToken === true));

  const second = deps(f.home);
  await signInAndTest(connection, second.value, new AbortController().signal);
  const calls2 = (await readFile(f.calls, 'utf8'))
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  assert.equal(calls2.filter(call => call.method === 'account/login/start').length, 1, 'saved ChatGPT login should be reused');
  assert.equal(second.state.opened, '');
  assert.equal(second.state.signedIn, true);

  await signOutManagedProvider(connection, second.value.runtime);
  const calls3 = (await readFile(f.calls, 'utf8'))
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  assert.ok(calls3.some(call => call.method === 'account/logout'));
});

test('Gemini OAuth keeps browser callback mode enabled and never asks ACP stdin for an auth code', { timeout: 5000 }, async t => {
  const f = await fakeRuntime('gemini');
  t.after(() => rm(f.home, { recursive: true, force: true }));
  const connection: Connection = {
    id: 'gemini-oauth',
    provider: 'gemini',
    mode: 'subscription',
    executable: f.executable,
    googleCloudProject: 'step-oauth-test',
    model: '',
    ready: false,
    note: '',
  };
  const d = deps(f.home, { GOOGLE_CLOUD_PROJECT: connection.googleCloudProject });
  await signInAndTest(connection, d.value, new AbortController().signal);
  assert.equal(d.state.signedIn, true);
  assert.equal(d.state.tested, true);
  assert.equal(d.state.codePrompts, 0);
  assert.equal(d.state.opened, '', 'Gemini CLI owns browser launch and loopback callback');

  const calls = (await readFile(f.calls, 'utf8'))
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  const auth = calls.find(call => call.method === 'authenticate');
  assert.equal(auth.params.methodId, 'oauth-personal');
  assert.equal(auth.noBrowser, null);
  assert.equal(auth.authType, 'oauth-personal');
  assert.equal(auth.trust, 'true');
  assert.equal(auth.project, 'step-oauth-test');
});

test('Gemini refuses an incompatible runtime that does not advertise Google OAuth', { timeout: 5000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), 'step-gemini-old-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const executable = join(home, 'runtime.cjs');
  await writeFile(
    executable,
    `const r=require('node:readline').createInterface({input:process.stdin});
const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
r.on('line',line=>{const m=JSON.parse(line);if(m.method==='initialize')send({id:m.id,result:{authMethods:[{id:'gemini-api-key'}]}});else send({id:m.id,result:{}})});`,
  );
  const connection: Connection = {
    id: 'gemini-old',
    provider: 'gemini',
    mode: 'subscription',
    executable,
    model: '',
    ready: false,
    note: '',
  };
  const d = deps(connection, home);
  await assert.rejects(signInAndTest(connection, d.value, new AbortController().signal), /AUTH_METHOD_UNAVAILABLE/);
});
