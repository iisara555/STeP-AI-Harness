// Whole-app Skill resource handoff with a synthetic provider and no external data.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'step-skill-template-smoke-'));
const workspace = join(home, 'work');
const executable = join(home, 'codex.mjs');
const audit = join(home, 'audit.jsonl');
await mkdir(workspace);
await writeFile(
  join(home, 'desktop-policy.json'),
  JSON.stringify({ pilot: false, features: { toolLoop: true }, checks: { authority: true, privacy: true } }),
);
await writeFile(
  executable,
  `import readline from 'node:readline';
import {appendFileSync} from 'node:fs';
const send=o=>console.log(JSON.stringify({jsonrpc:'2.0',...o}));
let thread='';
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);if(m.method==='thread/start')thread='';send({id:m.id,result:m.method==='thread/start'?{thread:{id:'fixture'}}:{}});
 if(m.method!=='turn/start')return;
 if(m.params.outputSchema?.properties?.skillId){send({method:'item/agentMessage/delta',params:{delta:JSON.stringify({skillId:'project-pre-mortem',reason:'Synthetic pre-mortem'})}});send({method:'turn/completed',params:{turn:{status:'completed'}}});return;}
 thread+=m.params.input?.map(i=>i.text||'').join('')||'';
 const blocks=[...thread.matchAll(/<tool_results>\\s*([\\s\\S]*?)\\s*<\\/tool_results>/g)];
 let text;
 if(!blocks.length){const request={tool:'skill',input:'project-pre-mortem',args:{resource:'templates/pre-mortem-matrix-template.md'}};text='\x60\x60\x60step-tool\\n'+JSON.stringify(request)+'\\n\x60\x60\x60';}
 else {
  const results=JSON.parse(blocks.at(-1)[1]),page=results[0];
  appendFileSync(${JSON.stringify(audit)},JSON.stringify(page)+'\\n');
  const request=page.nextOffset===undefined?null:{tool:'read_remaining',input:page.id,args:{offset:page.nextOffset}};
  text=request?'\x60\x60\x60step-tool\\n'+JSON.stringify(request)+'\\n\x60\x60\x60':'Synthetic template fixture complete';
 }
 send({method:'item/agentMessage/delta',params:{delta:text}});send({method:'turn/completed',params:{turn:{status:'completed'}}});
});`,
);
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1' };
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
        team: 'pm',
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
  await page.locator('.composer textarea').fill('ช่วยทำ project pre-mortem โครงการจัดอบรมจำลองและระบุความเสี่ยง');
  await page.keyboard.press('Enter');
  const finish = page.getByText('Synthetic template fixture complete', { exact: true });
  for (let i = 0; i < 600 && !(await finish.isVisible()); i++) {
    const allow = page.getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true });
    if (await allow.isVisible()) await allow.click();
    await page.waitForTimeout(100);
  }
  await expect(finish).toBeVisible();
  const pages = (await readFile(audit, 'utf8'))
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  assert.ok(pages.length >= 2, 'the long template must be read beyond the first page');
  assert.ok(pages.every(page => page.ok));
  assert.equal(pages[0].nextOffset, 4000);
  assert.equal(pages.at(-1).nextOffset, undefined);
  const resource = JSON.parse(pages.map(page => page.text).join(''));
  assert.equal(resource.resource, 'templates/pre-mortem-matrix-template.md');
  assert.match(resource.text, /Paper Tiger/);
  assert.match(resource.text, /สัญญาณเตือน/);
  assert.equal(resource.text, await readFile('../skills/pm/project-pre-mortem/templates/pre-mortem-matrix-template.md', 'utf8'));
  assert.deepEqual(errors, []);
  console.log('Synthetic Desktop pre-mortem Skill template handoff passed');
} finally {
  await child?.close();
  const target = resolve(home);
  assert.ok(target.startsWith(resolve(tmpdir()) + sep));
  await rm(target, { recursive: true, force: true });
}
