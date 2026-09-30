import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../electron/store';
import { WorkService, type Harness } from '../electron/service';
import { CodexAdapter, GeminiAdapter, ClaudeAdapter } from '../electron/providers';
import { geminiTools } from '../electron/runtime-policy';
import { publicSourceUrl, webSources } from '../src/web';
import type { Connection, RunEvent } from '../src/types';
import { needsPublicWebSearch } from '../../src/modules/router/public-information.js';
const routing: any = await import('../../src/modules/router/service.js');
const policy: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');
const query = 'ประกาศวันหยุดราชการปีงบ 2570';
const evidence = 'Synthetic evidence only. [Government fixture](https://www.thaigov.go.th/example)';
const harness: Harness = {
  root: resolve('..'),
  route: routing.queryStepRouter,
  contextPolicy: policy.classifyContextPolicy,
  privacy: privacy.evaluatePrivacyGate,
  skillMetadata: async id => routing.loadSkillContextMetadata(id),
  documentPrivacy: async () => ({}),
  nextOutput: async () => ({}),
};
function fixture() {
  const store = new Store(':memory:');
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
  store.put('connection', 'test', { id: 'test', provider: 'openai', mode: 'subscription', ready: true });
  return { store, session: store.create('test', 'cc') };
}
test('public search intent distinguishes current facts from internal policy, quoted tasks and offline requests', () => {
  for (const text of [query, 'วันหยุดราชการ 2569', 'พยากรณ์อากาศเชียงใหม่พรุ่งนี้', 'ค้นเว็บประกาศรัฐบาลล่าสุด', 'latest news about space'])
    assert.equal(needsPublicWebSearch(text), true, text);
  for (const text of [
    'วันหยุดราชการของพนักงาน STeP ปี 2570',
    'ร่างประกาศวันหยุดราชการ',
    'แปลคำว่า government holidays',
    'ไม่ต้องค้นเว็บ วันหยุดราชการปี 2570',
    'วันหยุดราชการในไฟล์แนบ',
    'แก้โค้ด Routing วันหยุดราชการ',
    'เขียนบรีฟงานเปิดตัว',
    'วันลาได้กี่วัน',
  ])
    assert.equal(needsPublicWebSearch(text), false, text);
  assert.deepEqual(geminiTools(true), { core: ['google_web_search'] });
  assert.deepEqual(geminiTools(false), { core: [] });
});
test('public sources reject credentials, scripts, local hosts and IP literals', () => {
  for (const url of [
    'javascript:alert(1)',
    'file:///test',
    'http://127.0.0.1',
    'http://[::1]',
    'http://office.local',
    'https://user:pass@example.com',
    'https://example.com:8080',
  ])
    assert.equal(publicSourceUrl(url), '');
  assert.equal(publicSourceUrl('https://www.thaigov.go.th/example'), 'https://www.thaigov.go.th/example');
  assert.deepEqual(webSources(evidence + '\n' + evidence + '\n[Bad](javascript:alert)'), [
    { title: 'Government fixture', url: 'https://www.thaigov.go.th/example' },
  ]);
});
test('public holidays route to GENERAL with governance even with a CC profile; internal HR and authority remain gated', async () => {
  const publicResult = await routing.queryStepRouter(query, { team: 'cc', cluster: '', workspaceDir: tmpdir() });
  assert.equal(publicResult.routingContract.mode, 'GENERAL');
  assert.equal(publicResult.routingContract.skill, '');
  assert.equal(publicResult.routingContract.authority.status, 'ALLOW');
  assert.ok(publicResult.routingContract.mandatoryReferences.some((r: any) => r.id === 'human-approval-rule'));
  const internal = await routing.queryStepRouter('พนักงานอุทยานลาป่วยได้กี่วัน', { team: 'hd', cluster: '', workspaceDir: tmpdir() });
  assert.notEqual(internal.routingContract.mode, 'GENERAL');
  const action = await routing.queryStepRouter('อนุมัติจ่ายเงินและค้นเว็บประกาศวันหยุดราชการ', {
    team: '',
    cluster: '',
    workspaceDir: tmpdir(),
  });
  assert.notEqual(action.routingContract.authority.status, 'ALLOW');
});
test('retrieval sees only the public turn; answering sees evidence and reviewed source with tools disabled', async () => {
  const { store, session } = fixture();
  const calls: { prompt: string; web: boolean }[] = [],
    events: RunEvent[] = [];
  const service = new WorkService(
    store,
    harness,
    async (_connection, web = false) => ({
      adapter: {
        run: async (prompt, _c, context) => {
          calls.push({ prompt, web });
          if (web) {
            context.onWebActivity?.('search');
            context.onWebActivity?.('complete');
            context.onUsage?.({ input: 2, output: 3, total: 5 });
            return evidence;
          }
          context.emit('Verified answer');
          context.onUsage?.({ input: 4, output: 5, total: 9 });
          return 'Verified answer';
        },
      },
      context: { cwd: tmpdir(), env: {} },
    }),
    e => events.push(e),
  );
  await service.run(session.id, query, 'Approved attachment marker PRIVATE_SOURCE_MARKER', true, undefined, 'chat');
  assert.equal(store.session(session.id).status, 'review');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].web, true);
  assert.equal(calls[1].web, false);
  assert.doesNotMatch(calls[0].prompt, /PRIVATE_SOURCE_MARKER|Conversation:|Routing contract:/);
  assert.match(calls[0].prompt, /October 1|September 30/);
  assert.match(calls[1].prompt, /<web_evidence>[^]*Government fixture/);
  assert.match(calls[1].prompt, /PRIVATE_SOURCE_MARKER/);
  assert.equal(store.session(session.id).usage?.total, 14);
  assert.deepEqual(store.session(session.id).messages.at(-1)?.webSources, webSources(evidence));
  assert.ok(events.some(e => e.type === 'activity' && e.text === 'กำลังค้นเว็บ'));
  assert.ok(events.some(e => e.type === 'activity' && e.text === 'กำลังเขียนคำตอบ'));
  store.close();
});
test('a runtime that does not execute web search cannot silently answer current facts from memory', async () => {
  const { store, session } = fixture();
  let calls = 0;
  const service = new WorkService(
    store,
    harness,
    async () => ({
      adapter: {
        run: async () => {
          calls++;
          return 'Unverified memory answer';
        },
      },
      context: { cwd: tmpdir(), env: {} },
    }),
    () => {},
  );
  await service.run(session.id, query, '', true, undefined, 'chat');
  assert.equal(calls, 1);
  assert.equal(store.session(session.id).status, 'error');
  assert.equal(store.session(session.id).messages.at(-1)?.text, 'WEB_SEARCH_UNAVAILABLE');
  assert.ok(!store.session(session.id).messages.some(m => m.text === 'Unverified memory answer'));
  store.close();
});
test('authority and credentials stop the run before any search runtime; cancellation stops before answering', async () => {
  const { store, session } = fixture();
  let calls = 0;
  const service = new WorkService(
    store,
    harness,
    async () => {
      calls++;
      throw new Error('Should not run');
    },
    () => {},
  );
  await assert.rejects(
    service.run(session.id, query + ' api_key=' + ['sk', 'synthetic-secret-value-long'].join('-'), '', true, undefined, 'chat'),
    /PRIVACY_REVIEW_REQUIRED/,
  );
  await service.run(session.id, 'อนุมัติจ่ายเงิน ค้นเว็บประกาศวันหยุดราชการ', '', true, undefined, 'chat');
  assert.equal(calls, 0);
  let started!: () => void;
  const begun = new Promise<void>(r => {
    started = r;
  });
  const cancelled = new WorkService(
    store,
    harness,
    async () => ({
      adapter: {
        run: async (_p, _c, context) => {
          started();
          await new Promise<void>(r => context.signal.addEventListener('abort', () => r(), { once: true }));
          return 'Cancelled';
        },
      },
      context: { cwd: tmpdir(), env: {} },
    }),
    () => {},
  );
  const run = cancelled.run(session.id, query, '', true, undefined, 'chat');
  await begun;
  cancelled.cancel(session.id);
  await run;
  assert.equal(store.session(session.id).status, 'cancelled');
  store.close();
});
for (const provider of ['openai', 'gemini'] as const)
  test(`${provider} native search sends real tool activity and keeps non-search requests disabled`, async t => {
    const home = await mkdtemp(join(tmpdir(), 'step-web-rpc-'));
    t.after(() => rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
    const executable = join(home, 'runtime.cjs');
    await writeFile(
      executable,
      `const send=m=>console.log(JSON.stringify(m));require('node:readline').createInterface({input:process.stdin}).on('line',l=>{const m=JSON.parse(l);if(m.id===undefined)return;
    if(m.method==='thread/start') {if(m.params.config.web_search!=='live'||m.params.config.features.shell_tool!==false)process.exit(2);}
    if(m.method==='session/prompt'){send({method:'session/update',params:{update:{sessionUpdate:'tool_call',toolCallId:'search',kind:'search',status:'in_progress'}}});send({method:'session/update',params:{update:{sessionUpdate:'tool_call_update',toolCallId:'search',kind:'search',status:'completed'}}});send({method:'session/update',params:{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Evidence'}}}});}
    send({id:m.id,result:m.method==='thread/start'?{thread:{id:'t'}}:m.method==='session/new'?{sessionId:'s'}:{}});
    if(m.method==='turn/start'){send({method:'item/started',params:{item:{id:'w',type:'webSearch',action:{type:'search'}}}});send({method:'item/completed',params:{item:{id:'w',type:'webSearch'}}});send({method:'item/agentMessage/delta',params:{delta:'Evidence'}});send({method:'turn/completed',params:{turn:{status:'completed'}}});}});`,
    );
    const stages: string[] = [];
    const connection = { id: 'test', provider, mode: provider === 'openai' ? 'subscription' : 'oauth', executable } as Connection;
    const adapter = provider === 'openai' ? new CodexAdapter() : new GeminiAdapter();
    assert.equal(
      await adapter.run(query, connection, {
        cwd: home,
        env: {},
        signal: new AbortController().signal,
        webSearch: true,
        emit: () => {},
        onWebActivity: stage => stages.push(stage),
      }),
      'Evidence',
    );
    assert.deepEqual(stages, ['search', 'complete']);
  });
test('Claude retrieval exposes only WebSearch, reports tool hooks and denies unrelated tools', async () => {
  let options: any;
  const stages: string[] = [];
  const adapter = new ClaudeAdapter(
    async () =>
      ({
        query: (input: any) => {
          options = input.options;
          return (async function* () {
            await options.hooks.PreToolUse[0].hooks[0]({ tool_name: 'WebSearch' });
            await options.hooks.PostToolUse[0].hooks[0]({ tool_name: 'WebSearch' });
            yield { type: 'result', subtype: 'success', result: 'Evidence' };
          })();
        },
      }) as any,
  );
  assert.equal(
    await adapter.run(query, { mode: 'api' } as Connection, {
      cwd: tmpdir(),
      env: {},
      key: 'synthetic-key',
      signal: new AbortController().signal,
      webSearch: true,
      emit: () => {},
      onWebActivity: stage => stages.push(stage),
    }),
    'Evidence',
  );
  assert.deepEqual(options.tools, ['WebSearch']);
  assert.deepEqual(options.mcpServers, {});
  assert.deepEqual(stages, ['search', 'complete']);
  assert.equal((await options.canUseTool('Bash', {})).behavior, 'deny');
  assert.equal((await options.canUseTool('WebSearch', { query })).behavior, 'allow');
  assert.equal((await options.hooks.PreToolUse[0].hooks[0]({ tool_name: 'Read' })).hookSpecificOutput.permissionDecision, 'deny');
});
