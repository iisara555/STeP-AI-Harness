// Real app/provider protocol, approved subprocesses and temporary files only. No accounts/network.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'step-execution-parity-'));
const workspace = join(home, 'work');
const executable = join(home, 'codex.mjs');
const audit = join(home, 'audit.jsonl');
await mkdir(workspace);
await writeFile(join(workspace, 'note.txt'), 'Synthetic file fixture');
await writeFile(join(workspace, 'short.cjs'), "process.stdout.write('lifecycle-ready');");
await writeFile(join(workspace, 'slow.cjs'), "process.stdout.write('slow-ready'); setTimeout(() => {}, 30000);");
await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ pilot: false, checks: { authority: true, privacy: true } }));
const command = file =>
  process.platform === 'win32'
    ? `$env:ELECTRON_RUN_AS_NODE='1'; & '${process.execPath.replaceAll("'", "''")}' ${file}`
    : `ELECTRON_RUN_AS_NODE=1 '${process.execPath.replaceAll("'", "'\\''")}' ${file}`;
await writeFile(
  executable,
  `import readline from 'node:readline';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
const audit=${JSON.stringify(audit)}, state=${JSON.stringify(join(home, 'state.json'))};
const send=o=>console.log(JSON.stringify({jsonrpc:'2.0',...o}));
let thread='';
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);let result={};if(m.method==='thread/start'){result={thread:{id:'fixture'}};thread='';}send({id:m.id,result});
 if(m.method!=='turn/start')return;
 thread+=m.params.input?.map(i=>i.text||'').join('')||'';
 const blocks=[...thread.matchAll(/<tool_results>\\s*([\\s\\S]*?)\\s*<\\/tool_results>/g)];
 const last=blocks.length?JSON.parse(blocks.at(-1)[1]):[];
 const prior=last[0]?.text?JSON.parse(last[0].text):null;
 const s=existsSync(state)?JSON.parse(readFileSync(state,'utf8')):{turn:0};
 if(s.turn===1)s.short=prior?.id;
 if(s.turn===6)s.slow=prior?.id;
 const requests=[
 {tool:'terminal',input:${JSON.stringify(command('short.cjs'))}},
 {tool:'tasks',input:s.short,args:{action:'status'}},
 {tool:'tasks',input:s.short,args:{action:'wait',timeoutMs:2000}},
 {tool:'tasks',input:s.short,args:{action:'poll',offset:0,length:7}},
 {tool:'tasks',input:'',args:{action:'list'}},
 {tool:'terminal',input:${JSON.stringify(command('slow.cjs'))}},
 {tool:'tasks',input:s.slow,args:{action:'wait',timeoutMs:20}},
 {tool:'tasks',input:s.slow,args:{action:'cancel'}},
 {tool:'tasks',input:s.slow,args:{action:'wait',timeoutMs:2000}},
 {tool:'files',input:'note.txt'},
 {tool:'changes',input:'result.md',content:'Reviewed synthetic file result'},
 ];
 const request=requests[s.turn];
 appendFileSync(audit,JSON.stringify({turn:s.turn,prior,last,request})+'\\n');
 s.turn++;writeFileSync(state,JSON.stringify(s));
 const text=request?'\x60\x60\x60step-tool\\n'+JSON.stringify(request)+'\\n\x60\x60\x60':'Execution parity fixture complete';
 send({method:'item/agentMessage/delta',params:{delta:text}});send({method:'turn/completed',params:{turn:{status:'completed'}}});
});`,
);
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
let child;
try {
  child = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await child.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor({ state: 'detached' });
  await child.evaluate(
    ({ app }, data) => {
      const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
      const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
      const put = (kind, id, value) =>
        db
          .prepare('INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value')
          .run(kind, id, JSON.stringify(value));
      const settings = JSON.parse(db.prepare("SELECT value FROM records WHERE kind='settings' AND id='main'").get().value);
      put('settings', 'main', {
        ...settings,
        workspace: data.workspace,
        tourDone: true,
        consentedAt: new Date().toISOString(),
        termsVersion: '2026-10-02',
      });
      put('connection', 'fake', {
        id: 'fake',
        provider: 'openai',
        mode: 'subscription',
        model: '',
        executable: data.executable,
        customRuntime: true,
        ready: true,
        note: 'Synthetic',
        modelsAt: new Date().toISOString(),
      });
      db.close();
    },
    { workspace, executable },
  );
  await page.reload();
  await page.locator('.statusbar .status-dot.ok').waitFor();
  await page.locator('.composer textarea').fill('Run the synthetic local lifecycle and file fixture');
  await page.keyboard.press('Enter');
  let approved = 0;
  const finish = page.getByText('Execution parity fixture complete', { exact: true });
  for (let i = 0; i < 600 && !(await finish.isVisible()); i++) {
    const allow = page.getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true });
    if (await allow.isVisible()) {
      await allow.click();
      approved++;
    }
    await page.waitForTimeout(100);
  }
  await expect(finish).toBeVisible();
  const records = (await readFile(audit, 'utf8'))
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  assert.equal(records.length, 12);
  for (const record of records.slice(1)) assert.equal(record.last[0].ok, true, JSON.stringify(record));
  assert.equal(records[2].prior.output, undefined, 'status excludes log bodies');
  assert.equal(records[3].prior.status, 'done');
  assert.equal(records[4].prior.output, 'lifecyc');
  assert.equal(records[5].prior.length, 1);
  assert.equal(records[7].prior.timedOut, true);
  assert.equal(records[9].prior.status, 'cancelled');
  assert.equal(records[10].prior.text, 'Synthetic file fixture');
  assert.equal(records[11].prior.status, 'staged-for-human-review');
  await assert.rejects(readFile(join(workspace, 'result.md')), /ENOENT/, 'staging must not write');
  assert.ok(approved >= 14, `execution/transmission approval dialogs: ${approved}`);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      smoke: 'execution-parity',
      turns: records.length,
      approved,
      process: 'done/cancelled',
      file: 'read/staged',
      fixture: home,
    }),
  );
} finally {
  await child?.close();
  await rm(home, { recursive: true, force: true });
}
