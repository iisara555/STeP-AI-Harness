// Renderer/preload/main/RPC with a synthetic provider. No live account, external actions or real workspace.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'step-hybrid-smoke-'));
const workspace = join(home, 'work');
const executable = join(home, 'codex.mjs');
await mkdir(workspace);
await writeFile(
  executable,
  `import {createInterface} from 'node:readline';
const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
let system='';
createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);if(m.id===undefined)return;
 if(m.method==='thread/start')system=m.params.developerInstructions||'';
 send({id:m.id,result:m.method==='thread/start'?{thread:{id:'fixture'}}:m.method==='model/list'?{data:[]}: {}});
 if(m.method!=='turn/start')return;
 const schema=m.params.outputSchema||{};
 let text=schema.properties?.skillId?JSON.stringify({skillId:'document-review',reason:'Review existing text'}):schema.properties?.unsupported?JSON.stringify({unsupported:[]}):system.includes('<skill_instructions>')&&system.includes('name: document-review')?'Hybrid loaded real document-review':'General text answer';
 send({method:'thread/tokenUsage/updated',params:{tokenUsage:{total:{inputTokens:10,outputTokens:2,totalTokens:12}}}});
 send({method:'item/agentMessage/delta',params:{delta:text}});
 send({method:'turn/completed',params:{turn:{status:'completed'}}});
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
          .prepare('INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value')
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
        model: 'synthetic',
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
  const run = async (text, skill) => {
    const created = await page.evaluate(() => window.step.call('create', { connectionId: 'fake', project: 'hybrid smoke' }));
    let sent = await page.evaluate(({ id, text, skill }) => window.step.call('send', { id, text, skill, mode: 'chat', attachments: [] }), {
      id: created.id,
      text,
      skill,
    });
    if (sent.consent)
      sent = await page.evaluate(
        ({ id, text, skill, consent }) => window.step.call('send', { id, text, skill, mode: 'chat', attachments: [], consent }),
        { id: created.id, text, skill, consent: sent.consent.token },
      );
    assert.equal(sent.started, true);
    await expect
      .poll(
        async () => {
          const s = (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.id === created.id);
          return s.status;
        },
        { timeout: 30000 },
      )
      .toBe('review');
    return (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.id === created.id);
  };
  const selected = await run('อ่านร่างนี้ว่ามีข้อมูลอะไรขาดบ้าง');
  const trace = selected.runs.at(-1);
  assert.equal(trace.skillSelection.method, 'model');
  assert.equal(trace.skillSelection.skill, 'document-review');
  assert.equal(trace.providerCalls.filter(c => c.kind === 'selection').length, 1);
  assert.equal(trace.providerCalls[0].usage.total, 12);
  assert.equal(selected.messages.filter(m => m.role === 'assistant').at(-1).text, 'Hybrid loaded real document-review');
  assert.ok(selected.usage.total >= 24);
  const light = await run('แปลเป็นอังกฤษ: วันนี้อากาศดี');
  assert.equal(light.runs.at(-1).skillSelection, undefined);
  assert.equal(light.runs.at(-1).steps[0].contextScope, 'text');
  assert.equal(light.usage.total, 12);
  const explicit = await run('ช่วยตรวจร่างเอกสารนี้', 'document-review');
  assert.equal(explicit.runs.at(-1).skillSelection, undefined);
  assert.equal(explicit.messages.filter(m => m.role === 'assistant').at(-1).text, 'Hybrid loaded real document-review');
  console.log('Hybrid selection RPC, actual Skill assembly, selection usage, text fast path and explicit Skill smoke passed');
} finally {
  await app.close();
  const target = resolve(home);
  assert.ok(target.startsWith(resolve(tmpdir()) + sep));
  await rm(target, { recursive: true, force: true });
}
