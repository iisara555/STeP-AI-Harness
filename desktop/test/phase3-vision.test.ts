import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CodexAdapter, GeminiAdapter, ClaudeAdapter } from '../electron/providers';
import type { Connection } from '../src/types';
import { WorkService, type Harness } from '../electron/service';
import { Store } from '../electron/store';
const image = { mime: 'image/png' as const, data: 'c3ludGhldGlj' };
const privacy: any = await import('../../src/modules/privacy/index.js');

test('Codex and Gemini image blocks are passed only in explicit multimodal runs', async () => {
  for (const provider of ['openai', 'gemini'] as const) {
    const home = await mkdtemp(join(tmpdir(), 'step-vision-rpc-')),
      executable = join(home, 'runtime.cjs'),
      log = join(home, 'prompt.json');
    await writeFile(
      executable,
      `const fs=require('node:fs');const send=o=>console.log(JSON.stringify(o));require('node:readline').createInterface({input:process.stdin}).on('line',l=>{const m=JSON.parse(l);if(m.id===undefined)return;
      let result=m.method==='initialize'?{agentCapabilities:{promptCapabilities:{image:true}}}:m.method==='thread/start'?{thread:{id:'t'}}:m.method==='session/new'?{sessionId:'s'}:{};
      if(m.method==='turn/start'||m.method==='session/prompt') {fs.writeFileSync(${JSON.stringify(log)},JSON.stringify(m.params));if(m.method==='turn/start'){send({method:'item/agentMessage/delta',params:{delta:'Image described'}});send({method:'turn/completed',params:{turn:{status:'completed'}}});}else send({method:'session/update',params:{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Image described'}}}});}
      send({id:m.id,result});});`,
    );
    const connection = { id: 'test', provider, executable, model: '', mode: 'api', ready: true, note: '' } as Connection;
    const adapter = provider === 'openai' ? new CodexAdapter() : new GeminiAdapter();
    assert.equal(
      await adapter.run('Describe source', connection, {
        cwd: home,
        env: {},
        images: [image],
        signal: new AbortController().signal,
        emit: () => {},
      }),
      'Image described',
    );
    const params = JSON.parse(await readFile(log, 'utf8')),
      blocks = params.input || params.prompt;
    assert.equal(blocks.length, 2);
    assert.equal(blocks[1].type, 'image');
    assert.equal(
      provider === 'openai' ? blocks[1].url : blocks[1].data,
      provider === 'openai' ? `data:image/png;base64,${image.data}` : image.data,
    );
  }
});
test('Gemini rejects images before prompt transmission without the advertised image capability', async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-no-vision-')),
    executable = join(home, 'runtime.cjs');
  await writeFile(
    executable,
    `require('node:readline').createInterface({input:process.stdin}).on('line',l=>{const m=JSON.parse(l);if(m.id!==undefined)console.log(JSON.stringify({id:m.id,result:{}}));});`,
  );
  await assert.rejects(
    new GeminiAdapter().run('Describe', { provider: 'gemini', executable, mode: 'api' } as Connection, {
      cwd: home,
      env: {},
      images: [image],
      signal: new AbortController().signal,
      emit: () => {},
    }),
    /VISION_UNAVAILABLE/,
  );
});
test('Claude uses an image user message while keeping native tools disabled', async () => {
  let captured: any;
  const provider = new ClaudeAdapter(
    async () =>
      ({
        query: (input: any) => {
          captured = input;
          return (async function* () {
            yield { type: 'result', subtype: 'success', result: 'Image described' };
          })();
        },
      }) as any,
  );
  await provider.run('Describe', { mode: 'api' } as Connection, {
    cwd: tmpdir(),
    env: {},
    key: 'fixture',
    images: [image],
    system: 'Standing rules',
    signal: new AbortController().signal,
    emit: () => {},
  });
  const messages = [];
  for await (const message of captured.prompt) messages.push(message);
  assert.equal(messages[0].message.content[1].source.media_type, image.mime);
  assert.equal(messages[0].message.content[1].source.data, image.data);
  assert.deepEqual(captured.options.tools, []);
  assert.equal(captured.options.systemPrompt, 'Standing rules');
});
test('policy-disabled vision never reaches a provider through WorkService', async () => {
  const store = new Store(':memory:');
  store.put('connection', 'c', { id: 'c', provider: 'openai', ready: true } as Connection);
  const s = store.create('c', 'cc');
  let calls = 0;
  const harness: Harness = {
    root: tmpdir(),
    route: async () => ({ routingContract: { mode: 'GENERAL', authority: { status: 'ALLOW' }, mandatoryReferences: [] } }),
    contextPolicy: () => ({ history: 'ignore', carryover: false }),
    privacy: privacy.evaluatePrivacyGate,
    skillMetadata: async () => null,
    documentPrivacy: async () => null,
    nextOutput: async () => null,
    visionEnabled: () => false,
  };
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async () => {
          calls++;
          return 'Forbidden';
        },
      },
    }),
    () => {},
  );
  await service.run(s.id, 'Describe source', '', true, undefined, 'chat', undefined, [], { images: [image] });
  assert.equal(calls, 0);
  assert.equal(store.session(s.id).status, 'error');
  assert.ok(store.session(s.id).messages.some(m => m.text === 'VISION_DISABLED'));
  store.close();
});
