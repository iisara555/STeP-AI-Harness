import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AntigravityAdapter, prewarmAntigravity, antigravitySpareCount, closeAntigravitySpares } from '../electron/antigravity';
import { AntigravityMcpBridge } from '../electron/antigravity-mcp-bridge';
import { ToolLoop } from '../electron/tool-loop';
import { ProviderSession, type TokenCount } from '../electron/providers';
import { strictJsonSchema } from '../electron/json-schema';
import { runBridgeProbe } from '../scripts/probe-antigravity-bridge';
import type { Connection } from '../src/types';

// A stand-in for agy in stream-json mode: one turn per stdin line on one conversation, until stdin closes.
// `kind` picks how it misbehaves; usage is reported as conversation totals with num_turns counting turns.
async function fixture(kind = 'kept') {
  const root = await mkdtemp(join(tmpdir(), 'step-agy-session-'));
  const executable = join(root, 'agy.mjs');
  const log = join(root, 'calls.jsonl');
  await writeFile(
    executable,
    `
import fs from 'node:fs';
import {createInterface} from 'node:readline';
const kind=${JSON.stringify(kind)}, log=${JSON.stringify(log)};
const args=process.argv.slice(2);
if(args[0]==='--version'){console.log('1.3.2');process.exit(0);}
const schema=args.includes('--json-schema')?JSON.parse(fs.readFileSync(args[args.indexOf('--json-schema')+1],'utf8')):null;
fs.appendFileSync(log,JSON.stringify({start:process.pid,args,home:process.env.HOME,schema})+'\\n');
const send=x=>console.log(JSON.stringify(x));
const mcpCfgPath=process.env.HOME+'/.gemini/antigravity-cli/mcp_config.json';
const hasMcp=fs.existsSync(mcpCfgPath)&&JSON.parse(fs.readFileSync(mcpCfgPath,'utf8')).mcpServers?.step_host;
const settings=JSON.parse(fs.readFileSync(process.env.HOME+'/.gemini/antigravity-cli/settings.json','utf8'));
// Like agy 1.3.2: init lists only the generic call_mcp_tool for MCP servers.
const initTools=hasMcp?['finish','view_file','call_mcp_tool']:['finish'];
send({event:'init',conversation_id:'conv',init:{cwd:process.cwd(),agent:'step-draft',model:args[args.indexOf('--model')+1],permission_mode:settings.toolPermission,tools:initTools}});
let turns=0;
createInterface({input:process.stdin}).on('line',async line=>{
  const input=JSON.parse(line);turns++;
  fs.appendFileSync(log,JSON.stringify({pid:process.pid,content:input.message.content})+'\\n');
  const starts=fs.readFileSync(log,'utf8').trim().split('\\n').map(x=>JSON.parse(x)).filter(x=>x.start).length;
  if((kind==='protocol-first'&&starts===1)||(kind==='protocol-later'&&(turns>1||starts>1))){
    send({event:'step_update',step_update:{conversation_id:'conv',step_type:'agent_response',text_delta:'UNVALIDATED'}});
    return console.log('invalid protocol');
  }
  if(kind==='die' && turns===2) process.exit(0);
  if(kind==='schema-tool' && schema) return send({event:'step_update',step_update:{conversation_id:'conv',step_type:'tool',tool_name:'finish'}});
  if(kind==='tool' && turns===2) return send({event:'step_update',step_update:{conversation_id:'conv',step_type:'tool',tool_name:'read_file'}});
  if(kind==='native-bridge-unapproved' && starts===1) return send({event:'step_update',step_update:{conversation_id:'conv',step_type:'tool',tool_name:'bash'}});
  const step=(tool_name,parameters,state='ACTIVE',extra={})=>send({event:'step_update',step_update:{conversation_id:'conv',step_index:turns*2,step_type:'tool',state,tool_name,tool_info:{name:tool_name,parameters,...extra}}});
  const schemaFile=process.env.HOME+'/.gemini/antigravity-cli/mcp/step_host/step_host.json';
  if(kind==='native-bridge-other-server' && hasMcp) return step('call_mcp_tool',{ServerName:'other',ToolName:'step_host',Arguments:{tool:'files',input:'.'}});
  if(kind==='native-bridge-other-read' && hasMcp) return step('view_file',{AbsolutePath:process.env.HOME+'/.gemini/antigravity-cli/mcp/step_host/other.json'});
  if(kind==='native-bridge-search' && hasMcp) return step('search_web',{query:'synthetic'});
  if((kind==='native-bridge'||kind==='native-bridge-then-search') && hasMcp){
    // Like agy 1.3.2: Deny > Ask > Allow, mcp(*) matches every MCP tool, and headless strict auto-denies every MCP
    // call whatever the allow list says. Before call_mcp_tool the model reads agy's own schema file, which
    // read_file(*) refuses.
    const policy=settings.permissions;
    if(settings.toolPermission==='strict'||policy.deny.some(r=>r==='mcp(*)'||r==='mcp(step_host/*)'||r==='mcp(step_host/step_host)')||!policy.allow.includes('mcp(step_host/step_host)')){
      const soft='soft-denied: mcp(step_host/step_host)';
      return send({event:'result',result:{status:'SUCCESS',conversation_id:'conv',num_turns:turns,response:soft,usage:{input_tokens:5,output_tokens:5,total_tokens:10}}});
    }
    step('view_file',{AbsolutePath:schemaFile});
    if(!policy.deny.includes('read_file(*)')) return console.log('test fixture: read_file(*) must stay denied');
    step('view_file',{AbsolutePath:schemaFile},'ERROR',{error:{type:'TOOL_ERROR',message:'Matches user-configured deny rule.'}});
    step('call_mcp_tool',{ServerName:'step_host',ToolName:'step_host',Arguments:{tool:'files',input:'note.txt'}});
    const {spawn}=await import('node:child_process');
    const child=spawn(hasMcp.command,hasMcp.args,{env:{...process.env,...hasMcp.env},stdio:['pipe','pipe','pipe']});
    const rl=createInterface({input:child.stdout});
    const rpc=(id,method,params)=>new Promise(res=>{
      const onLine=l=>{const msg=JSON.parse(l);if(msg.id===id){rl.off('line',onLine);res(msg);}};
      rl.on('line',onLine);
      child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\\n');
    });
    await rpc(1,'initialize',{});
    const listed=await rpc(2,'tools/list',{});
    const called=await rpc(3,'tools/call',{name:'step_host',arguments:{tool:'files',input:'note.txt'}});
    rl.close();
    child.stdin.end();
    child.kill();
    if(kind==='native-bridge-then-search') return step('search_web',{query:'synthetic'});
    const text=called.result?.content?.[0]?.text||'';
    const ans='bridge:'+listed.result.tools[0].name+':'+text;
    send({event:'step_update',step_update:{conversation_id:'conv',step_type:'agent_response',text_delta:ans}});
    return send({event:'result',result:{status:'SUCCESS',conversation_id:'conv',num_turns:turns,response:ans,usage:{input_tokens:50,output_tokens:10,total_tokens:60}}});
  }
  if(kind==='reinit') send({event:'init',conversation_id:'conv',init:{cwd:process.cwd(),agent:'step-draft',permission_mode:'strict',tools:['finish']}});
  let answer='answer '+turns, provisional=answer;
  if(kind==='workspace-rewrite'){
    const requests=[
      {tool:'google_workspace',input:'accounts',args:{action:'list'}},
      {tool:'google_workspace',input:'calendar.list',args:{action:'execute',account:'synthetic-account'}},
      {tool:'google_workspace',input:'calendar.events',args:{action:'execute',account:'synthetic-account',params:{calendarId:'synthetic-calendar',timeMin:'2026-10-19T00:00:00+07:00',timeMax:'2026-10-26T00:00:00+07:00'}}},
    ];
    const ticks=String.fromCharCode(96).repeat(3);
    answer=turns<=requests.length?ticks+'step-tool\\n'+JSON.stringify(requests[turns-1])+'\\n'+ticks:'วันอังคาร 10:00 ประชุมทีมสังเคราะห์';
    // A provisional native answer must never cause this unvalidated write request to execute.
    provisional=turns===3?ticks+'step-tool\\n'+JSON.stringify({tool:'google_workspace',input:'calendar.createEvent',args:{action:'execute',account:'synthetic-account'}})+'\\n'+ticks:'กำลังตรวจตารางนัดหมาย';
  }
  send({event:'step_update',step_update:{conversation_id:'conv',step_type:'agent_response',text_delta:provisional}});
  send({event:'result',result:{status:'SUCCESS',conversation_id:'conv',num_turns:turns,response:answer,usage:{input_tokens:100*turns,output_tokens:10*turns,total_tokens:110*turns}}});
}).on('close',()=>{fs.appendFileSync(log,JSON.stringify({closed:process.pid})+'\\n');process.exit(0);});
`,
  );
  const connection: Connection = {
    id: 'agy',
    provider: 'antigravity',
    mode: 'subscription',
    model: 'gemini-test',
    executable,
    ready: true,
    note: '',
  };
  const deltas: string[] = [],
    counts: TokenCount[] = [],
    transports: any[] = [];
  // What is on screen: streamed text minus what an attempt took back.
  const discarded: number[] = [];
  const discard = (chars: number) => {
    discarded.push(chars);
    const kept = deltas.join('').slice(0, Math.max(0, deltas.join('').length - chars));
    deltas.length = 0;
    if (kept) deltas.push(kept);
  };
  const session = new ProviderSession();
  const context = {
    cwd: root,
    env: { ...process.env },
    signal: new AbortController().signal,
    emit: (text: string) => deltas.push(text),
    discard,
    onUsage: (count: TokenCount) => counts.push(count),
    onTransport: (info: any) => transports.push(info),
    system: 'Synthetic standing instructions',
    session,
  };
  return {
    root,
    connection,
    context,
    session,
    deltas,
    discarded,
    counts,
    transports,
    calls: async () =>
      (await readFile(log, 'utf8').catch(() => ''))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line)),
    close: () => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
  };
}

test('the tool turns of a run continue on one agy process and send only the new tool results', async () => {
  const f = await fixture();
  try {
    const adapter = new AntigravityAdapter();
    assert.equal(await adapter.run('Request', f.connection, f.context), 'answer 1');
    assert.equal(await adapter.run('Request\n<tool_results>A</tool_results>', f.connection, f.context), 'answer 2');
    assert.equal(
      await adapter.run('Request\n<tool_results>A</tool_results>\n<tool_results>B</tool_results>', f.connection, f.context),
      'answer 3',
    );
    let calls = await f.calls();
    assert.equal(calls.filter(c => c.start).length, 1);
    assert.deepEqual(
      calls.filter(c => c.content !== undefined).map(c => c.content),
      ['Request', '\n<tool_results>A</tool_results>', '\n<tool_results>B</tool_results>'],
    );
    assert.deepEqual(
      f.transports.map(t => t.mode),
      ['full', 'delta', 'delta'],
    );
    // agy reported conversation totals; each call gets only its own turn's part.
    assert.deepEqual(f.counts, [
      { input: 100, output: 10, total: 110 },
      { input: 100, output: 10, total: 110 },
      { input: 100, output: 10, total: 110 },
    ]);
    assert.equal(f.deltas.join(''), 'answer 1answer 2answer 3');
    // Closing the run ends the conversation: stdin closes, the process exits and its isolated home is removed.
    await f.session.closeAndWait();
    calls = await f.calls();
    assert.ok(calls.some(c => c.closed));
    assert.deepEqual((await readdir(f.root)).sort(), ['agy.mjs', 'calls.jsonl']);
  } finally {
    await f.close();
  }
});

test('Antigravity Calendar lookup executes only canonical host requests and preserves outgoing checks', async () => {
  const f = await fixture('workspace-rewrite');
  const requests: any[] = [],
    outgoing: string[] = [];
  const loop = new ToolLoop({
    enabled: () => true,
    check: async () => {},
    readOnly: request => request.args?.action === 'list' || ['calendar.list', 'calendar.events'].includes(request.input),
    execute: async request => {
      assert.equal(request.tool, 'google_workspace');
      requests.push(request);
      if (request.args?.action === 'list') return { accounts: [{ handle: 'synthetic-account' }] };
      assert.equal(request.args?.account, 'synthetic-account');
      if (request.input === 'calendar.list') return { items: [{ id: 'synthetic-calendar' }] };
      assert.equal(request.input, 'calendar.events', 'provisional write requests must never execute');
      assert.deepEqual(request.args?.params, {
        calendarId: 'synthetic-calendar',
        timeMin: '2026-10-19T00:00:00+07:00',
        timeMax: '2026-10-26T00:00:00+07:00',
      });
      return { items: [{ summary: 'ประชุมทีมสังเคราะห์', start: { dateTime: '2026-10-20T10:00:00+07:00' } }] };
    },
    outgoing: async text => {
      outgoing.push(text);
      return text;
    },
  });
  try {
    const provider = new AntigravityAdapter();
    assert.equal(
      await loop.run('อาทิตย์นี้มีประชุมอะไรบ้าง', prompt => provider.run(prompt, f.connection, f.context), f.context.signal),
      'วันอังคาร 10:00 ประชุมทีมสังเคราะห์',
    );
    assert.deepEqual(
      requests.map(request => request.input),
      ['accounts', 'calendar.list', 'calendar.events'],
    );
    assert.equal(outgoing.length, 3);
    assert.match(outgoing[2], /ประชุมทีมสังเคราะห์/);
    assert.doesNotMatch(f.deltas.join(''), /calendar.createEvent|กำลังตรวจตารางนัดหมาย/);
    assert.equal((await f.calls()).filter(call => call.start).length, 1);
    assert.equal(f.discarded.length, 4);
    await f.session.closeAndWait();
  } finally {
    await f.session.closeAndWait();
    await f.close();
  }
});

test('a changed prompt, or one repeated conversation announcement, is handled without mixing conversations', async () => {
  const f = await fixture('reinit');
  try {
    const adapter = new AntigravityAdapter();
    assert.equal(await adapter.run('Request', f.connection, f.context), 'answer 1');
    // agy may announce the same conversation again on a later turn; that is not a new conversation.
    assert.equal(await adapter.run('Request + more', f.connection, f.context), 'answer 2');
    // A prompt that does not continue the held one starts a new process with the whole prompt.
    assert.equal(await adapter.run('Different request', f.connection, f.context), 'answer 1');
    const calls = await f.calls();
    assert.equal(calls.filter(c => c.start).length, 2);
    assert.deepEqual(
      calls.filter(c => c.content !== undefined).map(c => c.content),
      ['Request', ' + more', 'Different request'],
    );
    await f.session.closeAndWait();
  } finally {
    await f.close();
  }
});

test('a process that stops between turns gets one fresh start with the whole prompt', async () => {
  const f = await fixture('die');
  try {
    const adapter = new AntigravityAdapter();
    assert.equal(await adapter.run('Request', f.connection, f.context), 'answer 1');
    assert.equal(await adapter.run('Request\nResults', f.connection, f.context), 'answer 1');
    const calls = await f.calls();
    assert.equal(calls.filter(c => c.start).length, 2);
    assert.deepEqual(
      calls.filter(c => c.content !== undefined).map(c => c.content),
      ['Request', '\nResults', 'Request\nResults'],
    );
    assert.equal(f.transports.at(-1).resetReason, 'session-invalid');
    assert.equal(f.transports.at(-1).mode, 'full');
    await f.session.closeAndWait();
    assert.deepEqual((await readdir(f.root)).sort(), ['agy.mjs', 'calls.jsonl']);
  } finally {
    await f.close();
  }
});

test('a native tool step on a kept turn stops that process and recovers on a fresh text-only attempt', async () => {
  const f = await fixture('tool');
  try {
    const adapter = new AntigravityAdapter();
    assert.equal(await adapter.run('Request', f.connection, f.context), 'answer 1');
    assert.equal(await adapter.run('Request\nResults', f.connection, f.context), 'answer 1');
    const calls = await f.calls();
    const starts = calls.filter(c => c.start);
    assert.equal(starts.length, 2);
    // The recovery attempt carries the whole prompt and nothing from the stopped turn is shown.
    assert.deepEqual(
      calls.filter(c => c.content !== undefined).map(c => c.content),
      ['Request', '\nResults', 'Request\nResults'],
    );
    assert.equal(f.deltas.join(''), 'answer 1answer 1');
    await f.session.closeAndWait();
    assert.deepEqual((await readdir(f.root)).sort(), ['agy.mjs', 'calls.jsonl']);
  } finally {
    await f.close();
  }
});

test('a structured request runs alone with --json-schema, and the recovery attempt goes without it', async () => {
  const schema = { type: 'object', properties: { decisions: { type: 'object', properties: {} } }, required: ['decisions'] };
  const f = await fixture();
  try {
    assert.equal(await new AntigravityAdapter().run('Filter', f.connection, { ...f.context, jsonSchema: schema }), 'answer 1');
    const [start] = (await f.calls()).filter(c => c.start);
    assert.deepEqual(start.schema, strictJsonSchema(schema));
    // Nothing is kept open for a structured request.
    assert.ok((await f.calls()).some(c => c.closed));
  } finally {
    await f.close();
  }
  // If agy answers a schema through a tool step, the recovery attempt asks again without the schema.
  const denied = await fixture('schema-tool');
  try {
    assert.equal(await new AntigravityAdapter().run('Filter', denied.connection, { ...denied.context, jsonSchema: schema }), 'answer 1');
    const starts = (await denied.calls()).filter(c => c.start);
    assert.deepEqual(
      starts.map(c => c.args.includes('--json-schema')),
      [true, false],
    );
    assert.equal(denied.deltas.join(''), 'answer 1');
  } finally {
    await denied.close();
  }
});

test('cancelling a kept turn stops the process and removes its home', async () => {
  const f = await fixture();
  try {
    const adapter = new AntigravityAdapter();
    assert.equal(await adapter.run('Request', f.connection, f.context), 'answer 1');
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(adapter.run('Request\nMore', f.connection, { ...f.context, signal: controller.signal }), { message: 'CANCELLED' });
    await f.session.closeAndWait();
    assert.deepEqual((await readdir(f.root)).sort(), ['agy.mjs', 'calls.jsonl']);
  } finally {
    await f.close();
  }
});

test('protocol recovery covers the first kept turn and never adds a third attempt after a failed kept-turn reset', async () => {
  for (const kind of ['protocol-first', 'protocol-later']) {
    const f = await fixture(kind);
    try {
      const adapter = new AntigravityAdapter();
      assert.equal(await adapter.run('Request', f.connection, f.context), 'answer 1');
      if (kind === 'protocol-later')
        await assert.rejects(adapter.run('Request + results', f.connection, f.context), { message: 'PROVIDER_STREAM_INVALID' });
      assert.equal((await f.calls()).filter(call => call.start).length, 2);
      assert.equal(f.deltas.join(''), 'answer 1');
      await f.session.closeAndWait();
    } finally {
      await f.close();
    }
  }
});

test('native MCP bridge executes governed host tools over local IPC and rejects unapproved native tools', async () => {
  const f = await fixture('native-bridge');
  const seen: any[] = [];
  try {
    const adapter = new AntigravityAdapter();
    const answer = await adapter.run('Read note', f.connection, {
      ...f.context,
      nativeBridge: async (request, _signal) => {
        seen.push(request);
        return { ok: true, result: { text: 'governed-content' } };
      },
    });
    assert.equal(answer, 'bridge:step_host:{"ok":true,"result":{"text":"governed-content"}}');
    assert.deepEqual(seen, [{ tool: 'files', input: 'note.txt' }]);
  } finally {
    await f.session.closeAndWait();
    await f.close();
  }

  // Unapproved native tool (e.g. bash) even when nativeBridge is enabled stops attempt 1 and falls back to text-only on attempt 2.
  const unapproved = await fixture('native-bridge-unapproved');
  try {
    const adapter = new AntigravityAdapter();
    const answer = await adapter.run('Fallback', unapproved.connection, {
      ...unapproved.context,
      nativeBridge: async () => ({ ok: true }),
    });
    assert.equal(answer, 'answer 1');
    const starts = (await unapproved.calls()).filter(c => c.start);
    assert.equal(starts.length, 2);
  } finally {
    await unapproved.session.closeAndWait();
    await unapproved.close();
  }

  // A call_mcp_tool for another server, a read of any other file, and a tool outside every agy permission namespace
  // (search_web runs even in strict mode on agy 1.3.2) stop the bridge attempt; the text-only retry answers.
  for (const kind of ['native-bridge-other-server', 'native-bridge-other-read', 'native-bridge-search']) {
    const other = await fixture(kind);
    const hostCalls: unknown[] = [];
    try {
      const answer = await new AntigravityAdapter().run('Fallback', other.connection, {
        ...other.context,
        nativeBridge: async request => {
          hostCalls.push(request);
          return { ok: true };
        },
      });
      assert.equal(answer, 'answer 1', kind);
      assert.equal((await other.calls()).filter(c => c.start).length, 2, kind);
      assert.deepEqual(hostCalls, [], kind);
    } finally {
      await other.session.closeAndWait();
      await other.close();
    }
  }

  // After a bridge call reached the host, a later native step fails the run instead of a text-only retry that could
  // repeat the call's effect.
  const after = await fixture('native-bridge-then-search');
  try {
    const hostCalls: unknown[] = [];
    await assert.rejects(
      new AntigravityAdapter().run('Stage then search', after.connection, {
        ...after.context,
        nativeBridge: async request => {
          hostCalls.push(request);
          return { ok: true };
        },
      }),
      { message: 'TOOL_DENIED' },
    );
    assert.equal(hostCalls.length, 1);
    assert.equal((await after.calls()).filter(c => c.start).length, 1, 'no text-only retry');
  } finally {
    await after.session.closeAndWait();
    await after.close();
  }

  // Direct bridge unit check: invalid token and invalid tool request fail closed.
  const bridgeHome = await mkdtemp(join(tmpdir(), 'step-agy-bridge-'));
  const bridge = new AntigravityMcpBridge(async req => ({ ok: true, result: { echoed: req.tool } }));
  const cfg = await bridge.start(bridgeHome);
  try {
    const net = await import('node:net');
    const callPipe = (payload: unknown) =>
      new Promise<any>((resolve, reject) => {
        const sock = net.createConnection(cfg.endpoint);
        let buf = '';
        sock.setEncoding('utf8');
        sock.on('connect', () => sock.write(JSON.stringify(payload) + '\n'));
        sock.on('data', chunk => {
          buf += chunk;
          const nl = buf.indexOf('\n');
          if (nl !== -1) {
            sock.end();
            resolve(JSON.parse(buf.slice(0, nl)));
          }
        });
        sock.on('error', reject);
      });
    const denied = await callPipe({ token: 'wrong-token', arguments: { tool: 'files', input: 'a.txt' } });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, 'TOOL_DENIED');

    const badTool = await callPipe({ token: bridge.token, arguments: { tool: 'unknown_tool', input: 'a.txt' } });
    assert.equal(badTool.ok, false);
    assert.equal(badTool.code, 'UNKNOWN_OPERATION');
  } finally {
    await bridge.close();
    await rm(bridgeHome, { recursive: true, force: true });
  }
});

test('a bridge caller that goes away cancels its host call, an approval still open included', async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-agy-bridge-cancel-'));
  let started!: () => void;
  const running = new Promise<void>(done => (started = done));
  let cancelled!: () => void;
  const stopped = new Promise<void>(done => (cancelled = done));
  // Stands in for a host call waiting on the employee's approval.
  const bridge = new AntigravityMcpBridge(async (_request, signal) => {
    started();
    await new Promise<void>(done => signal.addEventListener('abort', () => done(), { once: true }));
    cancelled();
    return { ok: false, code: 'CANCELLED' };
  });
  const cfg = await bridge.start(home);
  try {
    const net = await import('node:net');
    const sock = net.createConnection(cfg.endpoint);
    sock.on('error', () => {});
    sock.on('connect', () => sock.write(JSON.stringify({ token: bridge.token, arguments: { tool: 'files', input: 'a.txt' } }) + '\n'));
    await running;
    sock.destroy();
    await stopped;
  } finally {
    await bridge.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('prewarmAntigravity spare pool and followUpDelta reuse a warm agy process across messages', async () => {
  const f = await fixture();
  try {
    await closeAntigravitySpares();
    const warmed = await prewarmAntigravity(f.connection, f.context);
    assert.equal(warmed, true);
    assert.equal(antigravitySpareCount(f.connection.id), 1);
    const adapter = new AntigravityAdapter();
    assert.equal(await adapter.run('First message', f.connection, f.context), 'answer 1');
    assert.equal(antigravitySpareCount(f.connection.id), 0, 'spare was claimed by the first run');
    assert.equal(
      await adapter.run('Completely rewritten full prompt', f.connection, {
        ...f.context,
        followUpDelta: 'Follow-up delta only',
      }),
      'answer 2',
    );
    const calls = await f.calls();
    assert.equal(calls.filter(c => c.start).length, 1, 'both turns used the single prewarmed agy process');
    assert.deepEqual(
      calls.filter(c => c.content !== undefined).map(c => c.content),
      ['First message', 'Follow-up delta only'],
    );
  } finally {
    await f.session.closeAndWait();
    await closeAntigravitySpares();
    await f.close();
  }
});

test('the real-agy bridge probe passes against a CLI that applies agy permission precedence', async () => {
  // Keeps scripts/probe-antigravity-bridge.ts working; the real check runs it with a signed-in agy.
  const f = await fixture('native-bridge');
  try {
    const report = await runBridgeProbe({
      executable: f.connection.executable,
      model: 'gemini-test',
      signal: new AbortController().signal,
    });
    assert.equal(report.version, '1.3.2');
    assert.equal(report.bridge.pass, true, JSON.stringify(report));
    assert.equal(report.nativeRead.pass, true);
    assert.equal(report.toolLoop.pass, true, JSON.stringify(report.toolLoop));
  } finally {
    await f.session.closeAndWait();
    await f.close();
  }
});
