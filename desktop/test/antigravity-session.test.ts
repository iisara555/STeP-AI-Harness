import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AntigravityAdapter } from '../electron/antigravity';
import { ProviderSession, type TokenCount } from '../electron/providers';
import { strictJsonSchema } from '../electron/json-schema';
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
send({event:'init',conversation_id:'conv',init:{cwd:process.cwd(),agent:'step-draft',model:args[args.indexOf('--model')+1],permission_mode:'strict',tools:['finish']}});
let turns=0;
createInterface({input:process.stdin}).on('line',line=>{
  const input=JSON.parse(line);turns++;
  fs.appendFileSync(log,JSON.stringify({pid:process.pid,content:input.message.content})+'\\n');
  if(kind==='die' && turns===2) process.exit(0);
  if(kind==='schema-tool' && schema) return send({event:'step_update',step_update:{conversation_id:'conv',step_type:'tool',tool_name:'finish'}});
  if(kind==='tool' && turns===2) return send({event:'step_update',step_update:{conversation_id:'conv',step_type:'tool',tool_name:'read_file'}});
  if(kind==='reinit') send({event:'init',conversation_id:'conv',init:{cwd:process.cwd(),agent:'step-draft',permission_mode:'strict',tools:['finish']}});
  const answer='answer '+turns;
  send({event:'step_update',step_update:{conversation_id:'conv',step_type:'agent_response',text_delta:answer}});
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
  const session = new ProviderSession();
  const context = {
    cwd: root,
    env: { ...process.env },
    signal: new AbortController().signal,
    emit: (text: string) => deltas.push(text),
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
