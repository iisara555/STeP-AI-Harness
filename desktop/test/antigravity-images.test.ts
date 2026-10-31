import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AntigravityAdapter, ANTIGRAVITY_DENY, antigravityHome, antigravityPermissions, imageStep } from '../electron/antigravity';
import { IMAGE_PERMISSION, brainReadRules, imageSchemaFile, mediaStepsDir } from '../electron/antigravity-image-mcp';
import { takesImages } from '../src/vision-transport';
import type { Connection, VisionInput } from '../src/types';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108020000009077053e', 'hex');
const image: VisionInput = { mime: 'image/png', data: PNG.toString('base64') };
const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');

/**
 * A synthetic agy 1.3.2: under request-review it starts the isolated step_image server, calls its tool, saves the
 * result as a media file of that step in its brain folder (as the real CLI does), views it, and answers with the
 * sha256 of the pixels it received. It is NOT evidence that Gemini reads pictures; the signed-in probe is.
 */
async function fixture(kind: 'view' | 'stray' | 'command' = 'view') {
  const root = await mkdtemp(join(tmpdir(), 'step-agy-images-test-'));
  const executable = join(root, 'agy.mjs');
  const log = join(root, 'calls.jsonl');
  await writeFile(
    executable,
    `
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
const kind=${JSON.stringify(kind)}, log=${JSON.stringify(log)};
const args=process.argv.slice(2);
if(args[0]==='--version'){console.log('1.3.2');process.exit(0);}
const home=process.env.HOME;
const settings=JSON.parse(fs.readFileSync(path.join(home,'.gemini','antigravity-cli','settings.json'),'utf8'));
const agent=fs.readFileSync(path.join(home,'.gemini','config','agents','step-draft','agent.md'),'utf8');
const mcp=JSON.parse(fs.readFileSync(path.join(home,'.gemini','config','mcp_config.json'),'utf8'));
fs.appendFileSync(log,JSON.stringify({settings,agent,servers:Object.keys(mcp.mcpServers),home})+'\\n');
const send=x=>console.log(JSON.stringify(x));
const conv='conv-'+crypto.randomUUID();
send({event:'init',conversation_id:conv,init:{cwd:process.cwd(),agent:'step-draft',model:args[args.indexOf('--model')+1],permission_mode:settings.toolPermission,tools:['finish','view_file','call_mcp_tool']}});
const tool=(index,name,parameters,state='DONE')=>send({event:'step_update',step_update:{conversation_id:conv,step_index:index,state,step_type:'tool',tool_name:name,tool_info:{name,parameters}}});
createInterface({input:process.stdin}).on('line',async line=>{
 const prompt=JSON.parse(line).message.content;
 fs.appendFileSync(log,JSON.stringify({prompt:prompt.length})+'\\n');
 const server=mcp.mcpServers.step_image;
 const child=spawn(server.command,server.args,{env:{...process.env,...server.env}});
 const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'view_attached_images',arguments:{}}})+'\\n');
 const content=JSON.parse((await lines.next()).value).result.content;
 child.stdin.end();
 tool(2,'view_file',{AbsolutePath:path.join(home,'.gemini','antigravity-cli','mcp','step_image','view_attached_images.json')});
 tool(3,'call_mcp_tool',{ServerName:'step_image',ToolName:'view_attached_images',Arguments:{}});
 const media=path.join(home,'.gemini','antigravity-cli','brain',conv,'.system_generated','steps','3');
 fs.mkdirSync(media,{recursive:true});
 const hashes=content.map((c,i)=>{const bytes=Buffer.from(c.data,'base64');fs.writeFileSync(path.join(media,'media_'+i+'.png'),bytes);return c.mimeType+':'+crypto.createHash('sha256').update(bytes).digest('hex');});
 if(kind==='stray') tool(4,'view_file',{AbsolutePath:path.join(home,'attachments','image-1.png')});
 else if(kind==='command') tool(4,'run_command',{CommandLine:'type media_0.png'});
 else tool(4,'view_file',{AbsolutePath:path.join(media,'media_0.png')});
 send({event:'result',result:{status:'SUCCESS',conversation_id:conv,num_turns:1,response:hashes.join(','),usage:{input_tokens:3,output_tokens:2,total_tokens:5}}});
});
`,
  );
  const connection: Connection = {
    id: 'images',
    provider: 'antigravity',
    mode: 'subscription',
    model: 'gemini-test',
    executable,
    ready: true,
    note: '',
  };
  const deltas: string[] = [];
  return {
    root,
    connection,
    deltas,
    context: { cwd: root, env: { ...process.env }, signal: new AbortController().signal, emit: (t: string) => deltas.push(t) },
    calls: async () =>
      (await readFile(log, 'utf8').catch(() => ''))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line)),
    close: () => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
  };
}

test('Antigravity counts as an image-capable connection', () => {
  assert.equal(takesImages('antigravity'), true);
  assert.equal(takesImages('copilot'), false);
});

test('attached pictures reach agy as MCP image content and the model may open only its saved media file', async () => {
  const f = await fixture();
  try {
    const answer = await new AntigravityAdapter().run('อธิบายภาพนี้', f.connection, { ...f.context, images: [image, image] });
    assert.equal(answer, [`image/png:${digest(PNG)}`, `image/png:${digest(PNG)}`].join(','));
    const [start] = await f.calls();
    assert.equal(start.settings.toolPermission, 'request-review');
    assert.deepEqual(start.settings.permissions.allow, [IMAGE_PERMISSION, ...brainReadRules(start.home)]);
    for (const rule of ANTIGRAVITY_DENY.filter(r => r !== 'mcp(*)' && r !== 'read_file(*)'))
      assert.ok(start.settings.permissions.deny.includes(rule), rule);
    assert.equal(start.settings.permissions.deny.includes('read_file(*)'), false);
    assert.deepEqual(start.servers, ['step_image']);
    assert.match(start.agent, /tools: \[finish, mcp:step_image:view_attached_images\]/);
    assert.match(start.agent, /mcpServers: \[step_image\]/);
    assert.match(start.agent, /The user attached 2 images/);
    // The isolated home, with the copies of the pictures, is gone after the run.
    assert.equal(existsSync(start.home), false);
  } finally {
    await f.close();
  }
});

test('a picture request stops when the model opens another file or runs a command', async () => {
  for (const kind of ['stray', 'command'] as const) {
    const f = await fixture(kind);
    try {
      await assert.rejects(new AntigravityAdapter().run('อธิบายภาพนี้', f.connection, { ...f.context, images: [image] }), {
        message: 'TOOL_DENIED',
      });
      for (const call of (await f.calls()).filter(c => c.home)) assert.equal(existsSync(call.home), false);
    } finally {
      await f.close();
    }
  }
});

test('a request without pictures keeps strict mode, the full deny list and no image server', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-agy-images-test-'));
  try {
    const home = await antigravityHome({ cwd: root, env: process.env });
    try {
      const settings = JSON.parse(await readFile(join(home.env.HOME!, '.gemini', 'antigravity-cli', 'settings.json'), 'utf8'));
      assert.equal(settings.toolPermission, 'strict');
      assert.deepEqual(settings.permissions, antigravityPermissions(false));
      assert.equal(home.images, undefined);
      assert.equal(existsSync(join(home.env.HOME!, '.gemini', 'config', 'mcp_config.json')), false);
    } finally {
      await home.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('image steps: only the image tool, its schema file and this conversation media pass', () => {
  const home = join(tmpdir(), 'agy-home');
  const images = { schemaFile: imageSchemaFile(home), media: (c: string) => mediaStepsDir(home, c) };
  const view = (path: string) => ({ tool_info: { name: 'view_file', parameters: { AbsolutePath: path } } });
  const media = mediaStepsDir(home, 'conv-1');
  assert.equal(
    imageStep(
      { tool_name: 'call_mcp_tool', tool_info: { parameters: { ServerName: 'step_image', ToolName: 'view_attached_images' } } },
      images,
      'conv-1',
    ),
    true,
  );
  assert.equal(
    imageStep(
      { tool_name: 'call_mcp_tool', tool_info: { parameters: { ServerName: 'other', ToolName: 'view_attached_images' } } },
      images,
      'conv-1',
    ),
    false,
  );
  assert.equal(imageStep(view(images.schemaFile), images, 'conv-1'), true);
  assert.equal(imageStep(view(join(media, '3', 'media_0.png')), images, 'conv-1'), true);
  assert.equal(imageStep(view(join(media, '12', 'media_4.jpeg')), images, 'conv-1'), true);
  assert.equal(imageStep(view(join(mediaStepsDir(home, 'conv-2'), '3', 'media_0.png')), images, 'conv-1'), false);
  assert.equal(imageStep(view(join(media, '3', 'notes.md')), images, 'conv-1'), false);
  assert.equal(imageStep(view(join(media, '3', '..', '..', '..', '..', 'secret', 'media_0.png')), images, 'conv-1'), false);
  assert.equal(imageStep(view(join(home, 'attachments', 'image-1.png')), images, 'conv-1'), false);
  assert.equal(imageStep(view(join(media, '3', 'media_0.png')), images, '../conv-1'), false);
  assert.equal(
    imageStep(
      { tool_info: { name: 'view_file', parameters: { AbsolutePath: join(media, '3', 'media_0.png'), StartLine: 1 } } },
      images,
      'conv-1',
    ),
    false,
  );
  assert.equal(imageStep({ tool_name: 'run_command', tool_info: { parameters: { CommandLine: 'dir' } } }, images, 'conv-1'), false);
  assert.equal(imageStep({ tool_name: 'search_web' }, images, 'conv-1'), false);
});
