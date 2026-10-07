// Real chat/IPC/NDJSON recovery and host file tools; synthetic local data only.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-agy-recovery-'));
const workspace = join(home, 'files');
const executable = join(home, 'agy.mjs');
const scenario = join(home, 'scenario');
const calls = join(home, 'calls');
await mkdir(workspace);
await writeFile(join(workspace, 'note.txt'), 'Public synthetic host evidence');
await writeFile(scenario, 'recover');
await writeFile(
  executable,
  `
import fs from 'node:fs';import {createInterface} from 'node:readline';
const scenario=${JSON.stringify(scenario)},calls=${JSON.stringify(calls)};
const args=process.argv.slice(2);
if(args[0]==='--version'){console.log('1.2.17');process.exit(0);}
const send=x=>console.log(JSON.stringify(x));
send({event:'init',conversation_id:'fixture',init:{cwd:process.cwd(),agent:'step-draft',model:'gemini-test',permission_mode:'strict',tools:['read_file','finish']}});
createInterface({input:process.stdin}).on('line',line=>{
 const prompt=JSON.parse(line).message.content;
 const mode=fs.readFileSync(scenario,'utf8');fs.appendFileSync(calls,mode+'\\n');
 if(mode==='recover'||mode==='block'){
  if(mode==='recover')fs.writeFileSync(scenario,'answer');
  send({event:'step_update',step_update:{conversation_id:'fixture',step_type:'agent_response',text_delta:'UNVERIFIED FRAGMENT'}});
  send({event:'step_update',step_update:{conversation_id:'fixture',step_type:'tool',tool_name:'read_file'}});return;
 }
 const ticks=String.fromCharCode(96).repeat(3);
 const response=mode==='host'?(prompt.includes('<tool_results>')?'Public synthetic host evidence received':ticks+'step-tool\\n'+JSON.stringify({tool:'files',input:'note.txt'})+'\\n'+ticks):'ขอลิงก์แหล่งข้อมูลล่าสุดเพื่อสรุปให้ครับ';
 send({event:'result',result:{status:'SUCCESS',conversation_id:'fixture',num_turns:1,response,usage:{input_tokens:2,output_tokens:1,total_tokens:3}}});
});
`,
);
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง', exact: true }).click();
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor({ state: 'detached' });
  await app.evaluate(
    ({ app }, data) => {
      const { DatabaseSync } = process.mainModule.require('node:sqlite');
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
        termsVersion: '2026-10-02',
        consentedAt: new Date().toISOString(),
      });
      put('connection', 'fake', {
        id: 'fake',
        provider: 'antigravity',
        mode: 'subscription',
        model: 'gemini-test',
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
  const send = async text => {
    await page.locator('.composer textarea').fill(text);
    await page.keyboard.press('Enter');
  };
  await send('How is the public synthetic podcast doing recently?');
  await expect(page.locator('.message.assistant')).toContainText('ขอลิงก์แหล่งข้อมูลล่าสุดเพื่อสรุปให้ครับ');
  assert.deepEqual((await readFile(calls, 'utf8')).trim().split('\n'), ['recover', 'answer']);
  await expect(page.locator('.message').filter({ hasText: 'UNVERIFIED FRAGMENT' })).toHaveCount(0);
  await writeFile(scenario, 'host');
  await send('Read the public synthetic note.txt through the host tool');
  await expect(page.locator('.message.assistant').last()).toContainText('Public synthetic host evidence received');
  assert.equal(
    (await readFile(calls, 'utf8'))
      .trim()
      .split('\n')
      .filter(x => x === 'host').length,
    2,
  );
  await writeFile(scenario, 'block');
  await send('Synthetic persistent tool failure');
  const status = page.locator('.message.status').last();
  await expect(status).toContainText('AI พยายามใช้เครื่องมือที่การเชื่อมต่อนี้ไม่อนุญาต');
  await expect(status).not.toContainText('TOOL_DENIED');
  assert.equal(
    (await readFile(calls, 'utf8'))
      .trim()
      .split('\n')
      .filter(x => x === 'block').length,
    2,
  );
  await expect(page.locator('.message').filter({ hasText: 'UNVERIFIED FRAGMENT' })).toHaveCount(0);
  await page.evaluate(async () => {
    const s = (await window.step.call('snapshot')).settings;
    await window.step.call('settings', { assistant: s.assistant, team: s.team, theme: s.theme, language: 'en' });
  });
  await page.reload();
  await expect(page.locator('.message.status').last()).toContainText('The AI attempted a tool this connection does not allow');
  console.log(
    'Antigravity chat recovery smoke passed: bounded recovery, withheld partial text, real host file tool and localized failure; no live provider calls.',
  );
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
