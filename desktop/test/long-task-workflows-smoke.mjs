// Real renderer/preload/main/provider/tool workers, isolated synthetic profile and files only.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
const home = await mkdtemp(join(tmpdir(), 'step-long-task-'));
const workspace = join(home, 'work'),
  executable = join(home, 'codex.mjs');
await mkdir(workspace);
await writeFile(join(workspace, 'main.ts'), 'const value: string = 123; export { value };');
await writeFile(
  executable,
  `
import {createInterface} from 'node:readline';
import {existsSync} from 'node:fs';
const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
let system='',thread='';
const text=reply=>{send({method:'thread/tokenUsage/updated',params:{tokenUsage:{total:{inputTokens:10,outputTokens:2,totalTokens:12}}}});send({method:'item/agentMessage/delta',params:{delta:reply}});send({method:'turn/completed',params:{turn:{status:'completed'}}});};
const tool=request=>text('\x60\x60\x60step-tool\\n'+JSON.stringify(request)+'\\n\x60\x60\x60');
createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);if(m.id===undefined)return;
 if(m.method==='thread/start'){system=m.params.developerInstructions||'';thread='';}
 send({id:m.id,result:m.method==='thread/start'?{thread:{id:'fixture'}}:m.method==='model/list'?{data:[]}:{}});
 if(m.method!=='turn/start')return;
 thread+=m.params.input.map(i=>i.text||'').join('');
 if(m.params.outputSchema?.properties?.skillId)return text(JSON.stringify({skillId:null,reason:'Synthetic fixture'}));
 if(m.params.outputSchema?.properties?.unsupported)return text(JSON.stringify({unsupported:[]}));
 if(system.includes('Answer the side question'))return text('Side snapshot answer');
 const target=/<document_patch_target>\\n([\\s\\S]*?)\\n<\\/document_patch_target>/.exec(system);
 if(target){const p=JSON.parse(target[1]);p.markdown=p.markdown.replace('ก่อนแก้','หลังแก้');return text('<document_patch>'+JSON.stringify(p)+'</document_patch><document_review>ตรวจข้อมูลจำลอง</document_review>');}
 const results=[...thread.matchAll(/<tool_results>\\s*([\\s\\S]*?)\\s*<\\/tool_results>/g)].map(m=>JSON.parse(m[1])[0]);
 if(system.includes('Native workflow: EXECUTE THE APPROVED PLAN')){
  if(results.length)return text('Plan step verified');
  const task=/^(\\d+)\\. \\[(?:todo|doing)\\]/m.exec(system);
  return task?tool({tool:'plan_update',input:task[1],args:{status:'done'},content:'Synthetic verified result'}):text('Plan complete');
 }
 if(system.includes('Native workflow: CODE AND VERIFY')){
  if(!results.length)return tool({tool:'code_diagnostics',input:'main.ts'});
  if(results.length===1){const d=JSON.parse(results[0].text);return d.diagnostics.some(e=>e.code===2322)?tool({tool:'patch',input:'main.ts',args:{old_string:'= 123',new_string:'= "fixed"'}}):text('Applied code diagnostics passed');}
  return text('Patch staged; apply before rechecking');
 }
 if(system.includes('<document_tool_contract>')){
  const finish=()=>text('<document_draft># โครงการจำลอง\\n\\n## 1 วัตถุประสงค์\\n\\nก่อนแก้\\n\\n## 2 กิจกรรม\\n\\nคงเดิม</document_draft><document_review>ตรวจจำลอง</document_review>');
  const wait=()=>existsSync(${JSON.stringify(join(home, 'main-release'))})?finish():setTimeout(wait,25);
  return thread.includes('LONG_RUNNING_FIXTURE')?wait():finish();
 }
 text('General synthetic response');
});`,
);
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor({ state: 'detached' });
  await app.evaluate(
    ({ app }, data) => {
      const { DatabaseSync } = process.mainModule.require('node:sqlite');
      const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
      const put = (kind, id, value) =>
        db
          .prepare('INSERT INTO records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value')
          .run(kind, id, JSON.stringify(value));
      const settings = JSON.parse(db.prepare("SELECT value FROM records WHERE kind='settings' AND id='main'").get().value);
      put('settings', 'main', {
        ...settings,
        workspace: data.workspace,
        team: 'cc',
        tourDone: true,
        termsVersion: '2026-10-02',
        consentedAt: new Date().toISOString(),
      });
      put('connection', 'fake', {
        id: 'fake',
        provider: 'openai',
        mode: 'subscription',
        model: 'fixture',
        executable: data.executable,
        customRuntime: true,
        ready: true,
        modelsAt: new Date().toISOString(),
      });
      db.close();
    },
    { workspace, executable },
  );
  await page.reload();
  await page.locator('.statusbar .status-dot.ok').waitFor();
  const created = await page.evaluate(() => window.step.call('create', { connectionId: 'fake', project: 'Long task fixture' }));
  const id = created.id;
  await app.evaluate(({ app }, id) => {
    const { DatabaseSync } = process.mainModule.require('node:sqlite');
    const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
    const s = JSON.parse(db.prepare("SELECT value FROM records WHERE kind='session' AND id=?").get(id).value);
    const block = (type, text, attrs) => ({ type, ...(attrs ? { attrs } : {}), content: [{ type: 'text', text }] });
    Object.assign(s, {
      title: 'Synthetic long document',
      mode: 'draft',
      status: 'review',
      documentTool: 'project',
      skill: 'project-plan',
      originalQuery: 'ร่างโครงการจำลอง',
      draft: 'โครงการจำลอง\n1 วัตถุประสงค์\nก่อนแก้\n2 กิจกรรม\nคงเดิม',
      document: {
        type: 'doc',
        content: [
          block('title', 'โครงการจำลอง'),
          block('heading', '1 วัตถุประสงค์', { level: 2 }),
          block('paragraph', 'ก่อนแก้'),
          block('heading', '2 กิจกรรม', { level: 2 }),
          block('paragraph', 'คงเดิม'),
        ],
      },
      revision: 1,
      workPlan: {
        goal: 'Synthetic plan',
        approvedAt: new Date().toISOString(),
        tasks: [
          { title: 'First check', status: 'todo' },
          { title: 'Second check', status: 'todo' },
        ],
      },
    });
    db.prepare("UPDATE records SET value=? WHERE kind='session' AND id=?").run(JSON.stringify(s), id);
    db.close();
  }, id);
  await page.reload();
  const snapshot = () => page.evaluate(() => window.step.call('snapshot'));
  const current = async () => (await snapshot()).sessions.find(s => s.id === id);
  const changes = () => page.evaluate(() => window.step.call('toolChanges'));
  const waitDone = () => expect.poll(async () => (await current()).status, { timeout: 30000 }).toBe('review');
  const send = async (text, workflow) => {
    const payload = { id, text, mode: workflow ? 'chat' : 'draft', attachments: [], ...(workflow ? { workflow } : {}) };
    const result = await page.evaluate(payload => window.step.call('send', payload), payload);
    if (result.consent) await page.evaluate(payload => window.step.call('send', payload), { ...payload, consent: result.consent.token });
  };
  const before = await current();
  await page.locator('.composer textarea').fill('ช่วยอธิบายว่าวัตถุประสงค์ข้อนี้หมายถึงอะไร');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Side snapshot answer', { exact: true })).toBeVisible({ timeout: 30000 });
  assert.equal((await current()).originalQuery, before.originalQuery);
  assert.equal((await current()).proposals.length, 0);
  await send('แก้เฉพาะข้อ 1 ให้เปลี่ยนจากก่อนแก้เป็นหลังแก้');
  await expect.poll(async () => (await current()).proposals.length).toBe(1);
  let s = await current();
  assert.deepEqual(s.proposals[0].document.content.slice(-2), before.document.content.slice(-2));
  await page.evaluate(({ id, proposalId }) => window.step.call('accept', { id, proposalId }), { id, proposalId: s.proposals[0].id });
  await page.locator('.composer textarea').fill('ปรับภาษาให้ชัดขึ้น LONG_RUNNING_FIXTURE');
  await page.locator('.composer textarea').press('Enter');
  await expect.poll(async () => (await current()).status).toBe('running');
  await expect(page.getByRole('button', { name: 'หยุดงาน', exact: true })).toBeVisible();
  await page.locator('.composer textarea').fill('อธิบายเป้าหมายให้ฟังหน่อย');
  await page.getByRole('button', { name: 'ถามแทรก', exact: true }).click();
  await expect.poll(async () => (await current()).sideQuestions.filter(q => q.status === 'completed').length).toBe(2);
  assert.equal((await current()).status, 'running');
  await expect(page.getByRole('button', { name: 'หยุดงาน', exact: true })).toBeVisible();
  await writeFile(join(home, 'main-release'), 'release synthetic main run');
  await waitDone();
  await page.setViewportSize({ width: 960, height: 720 });
  const inputBox = await page.locator('.composer textarea').boundingBox();
  const asideBox = await page.locator('.composer').getByRole('button', { name: 'ถามแทรก', exact: true }).boundingBox();
  assert.ok(inputBox && inputBox.y >= 0 && inputBox.y + inputBox.height <= 720);
  assert.ok(asideBox && asideBox.x >= 0 && asideBox.x + asideBox.width <= 960 && asideBox.y + asideBox.height <= 720);
  await mkdir('release/qa/long-task-workflows', { recursive: true });
  await page.screenshot({ path: 'release/qa/long-task-workflows/questions-and-draft.png' });
  await page.getByRole('button', { name: 'ทำตามแผนแบบต่อเนื่อง', exact: true }).click();
  await expect.poll(async () => (await current()).longTask?.status, { timeout: 30000 }).toBe('completed');
  assert.equal((await current()).longTask.rounds, 2);
  await send('Inspect and fix the synthetic main.ts', 'coding');
  await waitDone();
  await expect.poll(async () => (await changes()).length).toBe(1);
  assert.match(await readFile(join(workspace, 'main.ts'), 'utf8'), /= 123/);
  const change = (await changes())[0];
  const applying = page.evaluate(id => window.step.call('toolApply', { id }), change.id);
  const allow = page.getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true });
  await allow.waitFor();
  await allow.click();
  await applying;
  assert.match(await readFile(join(workspace, 'main.ts'), 'utf8'), /"fixed"/);
  await send('Recheck the applied main.ts', 'coding');
  await waitDone();
  assert.ok((await current()).messages.some(m => m.text === 'Applied code diagnostics passed'));
  const retainedDraft = (await current()).draft;
  await page.locator('.composer textarea').fill('UNRELATED_NEW_TASK');
  await page.locator('.composer').getByRole('button', { name: 'เริ่มงานใหม่', exact: true }).click();
  await expect(page.locator('.composer textarea')).toHaveValue('UNRELATED_NEW_TASK');
  const fresh = (await snapshot()).sessions.find(s => s.id !== id);
  assert.ok(fresh && !fresh.documentTool && !fresh.draft && !fresh.workPlan);
  assert.equal((await current()).draft, retainedDraft);
  await page.locator('.composer textarea').press('Enter');
  await expect.poll(async () => (await snapshot()).sessions.find(s => s.id === fresh.id)?.status).toBe('review');
  assert.equal((await current()).draft, retainedDraft);
  console.log(
    'Long-task native smoke passed: detached/busy questions, localized document patch, bounded plan continuation, real language-service diagnostics, staged/applied code and recheck.',
  );
} finally {
  await app.close();
  const target = resolve(home);
  assert.ok(target.startsWith(resolve(tmpdir()) + sep));
  await rm(target, { recursive: true, force: true });
}
