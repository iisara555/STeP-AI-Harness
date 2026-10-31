import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { createChallenge, matchesImage, runProbe } from '../scripts/probe-antigravity-vision';

test('challenge pixels encode independent shapes without answer metadata', () => {
  let n = 0;
  const image = createChallenge(max => n++ % max);
  assert.equal(image.png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const types: string[] = [];
  const data: Buffer[] = [];
  for (let i = 8; i < image.png.length;) {
    const size = image.png.readUInt32BE(i);
    const kind = image.png.toString('ascii', i + 4, i + 8);
    types.push(kind);
    if (kind === 'IDAT') data.push(image.png.subarray(i + 8, i + 8 + size));
    i += size + 12;
  }
  assert.deepEqual(types, ['IHDR', 'IDAT', 'IEND']);
  const raw = inflateSync(Buffer.concat(data));
  assert.equal(raw.length, 400 * 1801);
  // The first cell is a red square: both center and upper corner contain red; outside stays white.
  assert.deepEqual(image.cells[0], { color: 'red', shape: 'square' });
  const pixel = (x: number, y: number) => [...raw.subarray(y * 1801 + x * 3 + 1, y * 1801 + x * 3 + 4)];
  assert.deepEqual(pixel(100, 100), [220, 25, 35]);
  assert.deepEqual(pixel(145, 55), [220, 25, 35]);
  assert.deepEqual(pixel(170, 100), [255, 255, 255]);
  assert.ok(image.png.length < 256_000);
  assert.equal(matchesImage(JSON.stringify({ cells: image.cells }), image.cells), true);
  assert.equal(matchesImage(JSON.stringify({ cells: image.cells.slice(1) }), image.cells), false);
  assert.equal(matchesImage('I can see the image', image.cells), false);
});

test('actual MCP stdio returns image blocks only after the host gate and rejects model paths, URLs and unknown tools', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-probe-mcp-test-'));
  const image = createChallenge();
  const imagePath = join(root, 'image.png'),
    gate = join(root, 'allow'),
    evidence = join(root, 'evidence.json');
  await writeFile(imagePath, image.png);
  const child = spawn(process.execPath, [
    fileURLToPath(new URL('../scripts/antigravity-image-mcp.mjs', import.meta.url)),
    imagePath,
    gate,
    evidence,
  ]);
  const exited = new Promise(resolve => child.once('close', resolve));
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let id = 0;
  const call = async (method: string, params: unknown = {}) => {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) + '\n');
    return JSON.parse((await lines.next()).value!);
  };
  try {
    assert.equal((await call('initialize')).result.serverInfo.name, 'step_image_probe');
    assert.equal((await call('tools/list')).result.tools.length, 1);
    assert.equal((await call('tools/call', { name: 'read_probe_image' })).result.isError, true);
    await assert.rejects(access(evidence));
    await mkdir(gate);
    for (const params of [
      { name: 'read_file' },
      { name: 'read_probe_image', arguments: { path: '/private.txt' } },
      { name: 'read_probe_image', arguments: { url: 'https://example.com' } },
      { name: 'read_probe_image', arguments: [] },
      { name: 'read_probe_image', arguments: null },
    ])
      assert.equal((await call('tools/call', params)).result.isError, true);
    await assert.rejects(access(evidence));
    const result = (await call('tools/call', { name: 'read_probe_image', arguments: {} })).result;
    assert.equal(result.isError, false);
    assert.deepEqual(result.content, [{ type: 'image', mimeType: 'image/png', data: image.png.toString('base64') }]);
    assert.equal(JSON.parse(await readFile(evidence, 'utf8')).calls, 1);
    await call('tools/call', { name: 'read_probe_image' });
    await call('tools/call', { name: 'read_probe_image' });
    assert.equal((await call('tools/call', { name: 'read_probe_image' })).result.isError, true);
  } finally {
    child.stdin.end();
    await exited;
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture(kind: string) {
  const root = await mkdtemp(join(tmpdir(), 'step-probe-runtime-test-'));
  const executable = join(root, 'agy.mjs');
  const log = join(root, 'home.txt');
  await writeFile(
    executable,
    `
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {inflateSync} from 'node:zlib';
const kind=${JSON.stringify(kind)};
if(process.argv.includes('--version')){console.log('1.3.2');process.exit(0);}
fs.writeFileSync(${JSON.stringify(log)},process.env.HOME);
const policy=JSON.parse(fs.readFileSync(path.join(process.env.HOME,'.gemini','antigravity-cli','settings.json')));
assert.equal(policy.permissions.allow[0],'mcp(step_image_probe/read_probe_image)');
for(const rule of policy.permissions.allow.slice(1))assert.ok(rule.startsWith('read_file(')&&rule.endsWith('brain/**)')&&rule.includes('antigravity-cli'));
assert.equal(policy.permissions.deny.includes('mcp(*)'),false);
for(const rule of ['write_file(*)','read_url(*)','execute_url(*)','command(*)','unsandboxed(*)'])assert.ok(policy.permissions.deny.includes(rule));
const send=x=>console.log(JSON.stringify(x));
send({event:'init',conversation_id:'probe',init:{cwd:process.cwd(),agent:'step-draft',model:process.argv.at(-1),permission_mode:kind==='unsafe'?'always-proceed':'request-review',tools:['finish']}});
createInterface({input:process.stdin}).on('line',async line=>{
 const prompt=JSON.parse(line).message.content;
 if(prompt.includes('base64')||prompt.includes('220,25,35'))process.exit(9);
 if(kind==='tool'){send({event:'step_update',step_update:{conversation_id:'probe',step_type:'tool',tool_name:'read_file'}});return;}
 if(kind==='hang'){setInterval(()=>{},1000);return;}
 let response='{"cells":[]}';
 if(kind!=='no-image'){
  const config=JSON.parse(fs.readFileSync(path.join(process.env.HOME,'.gemini','config','mcp_config.json'))).mcpServers.step_image_probe;
  const child=spawn(config.command,config.args,{env:{...process.env,...config.env}});
  const done=new Promise(resolve=>child.once('close',resolve));
  const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'read_probe_image',arguments:{}}})+'\\n');
  const image=JSON.parse((await lines.next()).value).result.content[0];
  if(image.type!=='image'||image.mimeType!=='image/png')process.exit(8);
  child.stdin.end();await done;
  // A deterministic fixture pixel reader, NOT evidence of a real Gemini answer.
  const png=Buffer.from(image.data,'base64'),chunks=[];
  for(let i=8;i<png.length;){const size=png.readUInt32BE(i);if(png.toString('ascii',i+4,i+8)==='IDAT')chunks.push(png.subarray(i+8,i+8+size));i+=size+12;}
  const rgb=inflateSync(Buffer.concat(chunks));
  const palette={'220,25,35':'red','25,75,225':'blue','20,150,50':'green','245,220,25':'yellow','145,35,185':'purple','245,125,20':'orange'};
  const cells=Array.from({length:6},(_,i)=>{
   const x=(i%3)*200+100,y=Math.floor(i/3)*200+100;
   const color=(dx,dy)=>[...rgb.subarray((y+dy)*1801+(x+dx)*3+1,(y+dy)*1801+(x+dx)*3+4)].join(',');
   return {color:palette[color(0,0)],shape:color(45,-45)!=='255,255,255'?'square':color(45,0)!=='255,255,255'?'circle':'triangle'};
  });
  response=kind==='wrong'?'{"cells":[]}':JSON.stringify({cells});
 }
 send({event:'result',result:{status:'SUCCESS',conversation_id:'probe',response}});
 if(kind==='duplicate')send({event:'result',result:{status:'SUCCESS',conversation_id:'probe',response}});
 if(kind==='exit')process.exitCode=7;
});
`,
  );
  return { root, executable, log, profile: { home: root, platform: process.platform } };
}

for (const kind of ['success', 'wrong', 'no-image', 'unsafe', 'tool', 'duplicate', 'exit', 'hang']) {
  test(`probe ${kind}: isolated runtime, observed image handoff, exact pixel answer and cleanup`, { timeout: 40_000 }, async () => {
    const f = await fixture(kind);
    try {
      const run = runProbe({
        executable: f.executable,
        model: 'gemini-test',
        profile: f.profile,
        timeoutMs: kind === 'hang' ? 5000 : 10_000,
      });
      if (['unsafe', 'tool', 'duplicate', 'exit', 'hang'].includes(kind)) {
        await assert.rejects(
          run,
          new RegExp(
            (
              {
                unsafe: 'POLICY_UNCONFIRMED',
                tool: 'TOOL_DENIED',
                duplicate: 'PROBE_STREAM_INVALID',
                exit: 'RUNTIME_EXITED',
                hang: 'PROVIDER_TIMEOUT',
              } as Record<string, string>
            )[kind],
          ),
        );
      } else {
        const result = await run;
        assert.equal(result.version, '1.3.2');
        assert.equal(result.imageDelivered, kind !== 'no-image');
        assert.equal(result.visualAnswerCorrect, kind === 'success');
      }
      const isolatedHome = await readFile(f.log, 'utf8');
      await assert.rejects(access(isolatedHome));
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
}

test('probe steps: only call_mcp_tool for the probe tool and a view_file of its schema file pass', async () => {
  const { allowedProbeStep } = await import('../scripts/probe-antigravity-vision');
  const schema = '/tmp/home/.gemini/antigravity-cli/mcp/step_image_probe/read_probe_image.json';
  const call = (args: unknown) => ({ tool_info: { name: 'call_mcp_tool', parameters: args } });
  assert.equal(allowedProbeStep(call({ ServerName: 'step_image_probe', ToolName: 'read_probe_image', Arguments: {} }), schema), true);
  assert.equal(allowedProbeStep(call(JSON.stringify({ ServerName: 'step_image_probe', ToolName: 'read_probe_image' })), schema), true);
  assert.equal(allowedProbeStep(call({ ServerName: 'other', ToolName: 'read_probe_image' }), schema), false);
  assert.equal(allowedProbeStep({ tool_info: { name: 'view_file', parameters: { AbsolutePath: schema } } }, schema), true);
  assert.equal(allowedProbeStep({ tool_info: { name: 'view_file', parameters: { AbsolutePath: '/etc/passwd' } } }, schema), false);
  const media = '/tmp/home/.gemini/antigravity-cli/brain/conv-1/.system_generated/steps';
  const view = (path: string) => ({ tool_info: { name: 'view_file', parameters: { AbsolutePath: path } } });
  assert.equal(allowedProbeStep(view(media + '/4/media_0.png'), schema, media), true);
  assert.equal(allowedProbeStep(view(media + '/4/media_0.png'), schema), false);
  assert.equal(allowedProbeStep(view(media + '/4/notes.md'), schema, media), false);
  assert.equal(allowedProbeStep(view(media + '/../../../conv-2/.system_generated/steps/4/media_0.png'), schema, media), false);
  assert.equal(allowedProbeStep(view(media + '/4/../../../../../../secret/media_0.png'), schema, media), false);
  assert.equal(allowedProbeStep({ tool_name: 'read_file' }, schema), false);
  assert.equal(allowedProbeStep({ tool_name: 'search_web' }, schema), false);
});
