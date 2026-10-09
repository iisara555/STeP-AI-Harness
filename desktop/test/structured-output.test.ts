import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CodexAdapter } from '../electron/providers';
import { GeminiApiAdapter } from '../electron/gemini-api';
import { strictJsonSchema } from '../electron/json-schema';
import { buildReceiptAiResolver, resolveReceiptAiResponse } from '../electron/receipt-ai';
import { AntigravityAdapter, antigravityUsage } from '../electron/antigravity';
import { RECEIPT_VISION_SCHEMA, parseVisionReading } from '../src/receipt-vision';
import type { Connection } from '../src/types';

// Every object of a strict schema lists all its properties and allows no others; no keyword strict mode rejects remains.
function assertStrict(node: any, path = '$') {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((item, index) => assertStrict(item, `${path}[${index}]`));
  for (const key of ['$schema', 'maxLength', 'minLength', 'exclusiveMinimum']) assert.ok(!(key in node), `${path} has ${key}`);
  if (node.properties) {
    assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort(), `${path} required`);
    assert.equal(node.additionalProperties, false, `${path} additionalProperties`);
  }
  for (const [key, value] of Object.entries(node)) assertStrict(value, `${path}.${key}`);
}

test('strict schemas require every property, keep optional parts nullable and drop rejected keywords', () => {
  const strict: any = strictJsonSchema(RECEIPT_VISION_SCHEMA);
  assertStrict(strict);
  // fields was required: it stays an object; notes and items were optional: they may now be null.
  assert.equal(strict.properties.fields.type, 'object');
  assert.deepEqual(strict.properties.notes.type, ['string', 'null']);
  assert.deepEqual(strict.properties.items.type, ['array', 'null']);
  assert.ok(strict.properties.documentType.enum.includes(null));
  // A field's region was already nullable and is not doubled.
  assert.deepEqual(strict.properties.fields.properties.total.properties.region.type, ['object', 'null']);
  assert.equal(strict.properties.fields.properties.total.properties.region.properties.width.minimum, 0);
  // The host schema itself is unchanged.
  assert.equal((RECEIPT_VISION_SCHEMA as any).$schema, 'https://json-schema.org/draft/2020-12/schema');
});

test('a strict-mode receipt reading with nulls for the parts it leaves out still parses', () => {
  const reading = parseVisionReading(
    JSON.stringify({
      fields: {
        total: { value: '808.00', evidence: 'รวม 808.00', confidence: null, is_handwritten: null, needs_review: null, region: null },
      },
      items: null,
      signatures: null,
      features: { handwritten: null, thermalPaper: true },
      documentType: null,
      notes: null,
    }),
  );
  assert.equal(reading.fields.total?.value, '808.00');
  assert.deepEqual(reading.items, []);
  assert.deepEqual(reading.features, { thermalPaper: true });
  assert.equal(reading.notes, '');
});

test('the OCR filter schema limits each field to the fixed choices and its own OCR candidates', () => {
  const resolver = buildReceiptAiResolver(
    {
      fields: {
        total: { label: 'Total', selected_value: '808.00', candidates: [{ value: '808.00' }, { value: '880.00' }] },
        taxId: { label: 'Tax ID', candidates: [{ value: '0105551234567' }] },
      },
    },
    text => text,
  );
  const schema: any = resolver.schema;
  assertStrict(strictJsonSchema(schema));
  assert.deepEqual(schema.properties.decisions.required, ['total', 'taxId']);
  assert.deepEqual(schema.properties.decisions.properties.total.properties.choice.enum, [
    'KEEP',
    'AMBIGUOUS',
    'UNMAPPED',
    'C_total_1',
    'C_total_2',
  ]);
  assert.deepEqual(schema.properties.decisions.properties.taxId.properties.choice.enum, ['KEEP', 'AMBIGUOUS', 'UNMAPPED', 'C_taxId_1']);
  const decisions = resolveReceiptAiResponse(
    JSON.stringify({ decisions: { total: { choice: 'C_total_2', reason: 'printed' }, taxId: { choice: 'KEEP', reason: '' } } }),
    resolver.tokens,
    resolver.fields,
  );
  assert.equal(decisions.find(d => d.field === 'total')?.value, '880.00');
});

test('ChatGPT (Codex) constrains the answer with outputSchema only when the host asks for JSON', async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-structured-codex-'));
  try {
    const executable = join(home, 'codex.cjs'),
      log = join(home, 'turns.jsonl');
    await writeFile(
      executable,
      `const fs=require('node:fs');const send=o=>console.log(JSON.stringify(o));require('node:readline').createInterface({input:process.stdin}).on('line',l=>{const m=JSON.parse(l);if(m.id===undefined)return;
      if(m.method==='turn/start'){fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(m.params)+'\\n');send({method:'item/agentMessage/delta',params:{delta:'{}'}});send({method:'turn/completed',params:{turn:{status:'completed'}}});}
      send({id:m.id,result:m.method==='thread/start'?{thread:{id:'t'}}:{}});});`,
    );
    const connection = { id: 'c', provider: 'openai', executable, model: '', mode: 'subscription', ready: true, note: '' } as Connection;
    const base = { cwd: home, env: {}, signal: new AbortController().signal, emit: () => {} };
    await new CodexAdapter().run('Read', connection, { ...base, jsonSchema: RECEIPT_VISION_SCHEMA });
    await new CodexAdapter().run('Chat', connection, base);
    const [structured, chat] = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    assertStrict(structured.outputSchema);
    assert.deepEqual(structured.outputSchema, strictJsonSchema(RECEIPT_VISION_SCHEMA));
    assert.equal('outputSchema' in chat, false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('Gemini API uses native JSON mode only when the host asks for JSON', async () => {
  const bodies: any[] = [];
  const adapter = new GeminiApiAdapter(
    (async (_url: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      return new Response('data: {"candidates":[{"content":{"parts":[{"text":"{}"}]},"finishReason":"STOP"}]}\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      });
    }) as typeof fetch,
    new Map(),
  );
  const connection = {
    id: 'g',
    provider: 'gemini',
    mode: 'api',
    model: 'gemini-test',
    executable: '',
    ready: true,
    note: '',
  } as Connection;
  const context = { cwd: tmpdir(), env: {}, key: 'synthetic', signal: new AbortController().signal, emit: () => {} };
  await adapter.run('Read', connection, { ...context, jsonSchema: { type: 'object', properties: { a: { type: 'string' } } } });
  await adapter.run('Chat', connection, context);
  const generations = bodies.filter(body => body.contents);
  assert.equal(generations[0].generationConfig.responseMimeType, 'application/json');
  assert.equal('responseJsonSchema' in generations[0].generationConfig, false);
  assert.equal(generations[1].generationConfig, undefined);
});

test('Antigravity usage counts thinking as output and cache reads as part of the input', () => {
  assert.deepEqual(
    antigravityUsage({ input_tokens: 100, output_tokens: 20, thinking_tokens: 30, cache_read_tokens: 60, total_tokens: 150 }),
    {
      input: 100,
      output: 50,
      total: 150,
      cachedInput: 60,
    },
  );
  // When the cache reads exceed the reported input they were reported apart from it, so they are added.
  assert.deepEqual(antigravityUsage({ input_tokens: 10, output_tokens: 5, cache_read_tokens: 40, total_tokens: 15 }), {
    input: 50,
    output: 5,
    total: 55,
    cachedInput: 40,
  });
  assert.deepEqual(antigravityUsage({ input_tokens: 11, output_tokens: 5, total_tokens: 16 }), { input: 11, output: 5, total: 16 });
  assert.throws(
    () => antigravityUsage({ input_tokens: 1, output_tokens: 1, total_tokens: 2, thinking_tokens: -1 }),
    /PROVIDER_STREAM_INVALID/,
  );
});

test('Antigravity checks the CLI version once per binary instead of once per message', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-antigravity-version-'));
  try {
    const executable = join(root, 'agy.mjs'),
      log = join(root, 'versions.log');
    const script = (answer: string) => `
import fs from 'node:fs';
import {createInterface} from 'node:readline';
const args=process.argv.slice(2);
if(args[0]==='--version'){fs.appendFileSync(${JSON.stringify(log)},'v\\n');console.log('1.2.17');process.exit(0);}
const send=x=>console.log(JSON.stringify(x));
send({event:'init',conversation_id:'s',init:{cwd:process.cwd(),agent:'step-draft',model:args[args.indexOf('--model')+1],permission_mode:'strict',tools:['finish']}});
createInterface({input:process.stdin}).on('line',()=>send({event:'result',result:{status:'SUCCESS',conversation_id:'s',num_turns:1,response:${JSON.stringify(answer)}}}));
`;
    await writeFile(executable, script('one'));
    const connection = {
      id: 'a',
      provider: 'antigravity',
      mode: 'subscription',
      model: 'gemini-test',
      executable,
      ready: true,
      note: '',
    } as Connection;
    const context = { cwd: root, env: { ...process.env }, signal: new AbortController().signal, emit: () => {} };
    assert.equal(await new AntigravityAdapter().run('First', connection, context), 'one');
    assert.equal(await new AntigravityAdapter().run('Second', connection, context), 'one');
    assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 1);
    // A replaced binary is checked again.
    await writeFile(executable, script('two') + '\n// replaced');
    assert.equal(await new AntigravityAdapter().run('Third', connection, context), 'two');
    assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
