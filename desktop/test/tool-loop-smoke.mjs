import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const home = await mkdtemp(join(tmpdir(), 'step-loop-smoke-')),
  workspace = join(home, 'work'),
  executable = join(home, 'codex.mjs');
await mkdir(workspace);
await mkdir('release/qa', { recursive: true });
await writeFile(join(workspace, 'note.txt'), 'Synthetic source note');
await writeFile(
  join(home, 'desktop-policy.json'),
  // Strict consent: this smoke checks the per-result dialogs.
  JSON.stringify({
    pilot: false,
    checks: { authority: true, privacy: true },
    prices: { 'openai:*': { input: 1, output: 2 } },
    budgets: { dailyTokens: 100 },
  }),
);
await writeFile(
  executable,
  `import readline from 'node:readline';
import { existsSync, writeFileSync } from 'node:fs';
const send=o=>console.log(JSON.stringify({jsonrpc:'2.0',...o}));
// Like a real Codex thread, the fixture keeps what it was sent and counts usage for the whole thread.
let thread='',turns=0;
// The first second turn on a thread fails once (as a runtime that drops a thread would): the app retries it on a fresh one.
const failMarker=${JSON.stringify(join(home, 'failed-once'))};
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);let result={};if(m.method==='thread/start'){result={thread:{id:'fixture'}};thread='';turns=0;}send({id:m.id,result});
 if(m.method==='turn/start'){
 thread+=m.params.input?.map(i=>i.text||'').join('')||'';turns++;
 if(turns===2&&!existsSync(failMarker)){writeFileSync(failMarker,'1');send({method:'turn/completed',params:{turn:{status:'failed',error:{message:'thread dropped'}}}});return;}
 const prompt=thread;
 const tool=(tool,input,args,content)=>'\x60\x60\x60step-tool\\n'+JSON.stringify({tool,input,args,content})+'\\n\x60\x60\x60';
 let text;
 if(!prompt.includes('<tool_results>'))text=tool('files','note.txt');
 else if(!prompt.includes('"tool":"ask_user"'))text=tool('ask_user','Choose output style',{options:['Brief','Detailed']});
 else if(!prompt.includes('"tool":"plan"'))text=tool('plan','Read the note and stage a reviewed summary.');
 else if(!prompt.includes('"tool":"changes"'))text=tool('changes','result.md',undefined,'Reviewed synthetic summary');
 else text='Completed with reviewed tools';
 send({method:'thread/tokenUsage/updated',params:{tokenUsage:{total:{inputTokens:10*turns,outputTokens:5*turns,totalTokens:15*turns}}}});
 send({method:'item/agentMessage/delta',params:{delta:text}});send({method:'turn/completed',params:{turn:{status:'completed'}}});
 }
});`,
);
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const child = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await child.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  // Skipping saves settings before the wizard closes; reading the store earlier races that write.
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor({ state: 'detached' });
  await child.evaluate(
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
  // Send only once the seeded connection is loaded; an Enter before that is ignored as "no AI selected".
  await page.locator('.statusbar .status-dot.ok').waitFor();
  await page.locator('.composer textarea').fill('Read local note and prepare summary');
  await page.keyboard.press('Enter');
  const consent = () => page.getByRole('alertdialog', { name: 'ส่งผลเครื่องมือให้ AI?' });
  await consent().waitFor();
  await expect(consent()).toContainText('Synthetic source note');
  await consent().getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true }).click();
  await page.getByText('Choose output style', { exact: true }).waitFor();
  // The question sits above the composer; one click on an option answers it.
  const question = page.locator('.composer-area .tool-question');
  await question.getByText('Choose output style').waitFor();
  await question.getByRole('button', { name: /Brief/ }).click();
  await consent().waitFor();
  await consent().getByRole('checkbox').check();
  await consent().getByRole('button', { name: 'อนุญาตในขอบเขตนี้จนจบรอบ', exact: true }).click();
  const plan = page.getByRole('alertdialog', { name: 'อนุมัติแผนก่อนจัดทำร่าง?' });
  await plan.waitFor();
  await plan.getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true }).click();
  await page.getByText('Completed with reviewed tools', { exact: true }).waitFor();
  await expect.poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).sessions[0].status).toBe('review');
  const data = await page.evaluate(() => window.step.call('snapshot'));
  assert.equal(data.sessions[0].status, 'review');
  assert.equal(data.sessions[0].usage.total, 75);
  const observed = data.sessions[0].runs.at(-1).steps.flatMap(s => s.tools || []);
  assert.ok(observed.some(t => t.tool === 'files' && t.ok));
  assert.doesNotMatch(JSON.stringify(observed), /Synthetic source note|result\.md|note\.txt/);
  await page.getByText('ประวัติเครื่องมือและรหัสตรวจสอบ', { exact: true }).click();
  await expect(page.getByText(observed[0].id, { exact: false })).toBeVisible();
  assert.equal(data.usage.dailyTokens, 75);
  const changes = await page.evaluate(() => window.step.call('toolChanges'));
  assert.equal(changes[0].path, 'result.md');
  await assert.rejects(readFile(join(workspace, 'result.md')));
  await page.locator('.composer textarea').fill('/usage');
  await page.keyboard.press('Enter');
  const usage = page.getByRole('alertdialog', { name: 'การใช้งาน AI' });
  await usage.waitFor();
  await expect(usage).toContainText('75 tokens');
  await page.screenshot({ path: 'release/qa/tool-loop-usage.png' });
  await usage.getByRole('button', { name: 'ปิด', exact: true }).click();
  // Declined note content is withheld; a provider may continue with a question without that note.
  await page.locator('.composer textarea').fill('Read local note again');
  await page.keyboard.press('Enter');
  await consent().waitFor();
  await consent().getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await page.getByText('Choose output style', { exact: true }).waitFor();
  // The fake runtime deliberately ignores the refusal. Host cancellation still closes the question.
  await page.getByRole('button', { name: 'ยกเลิกงานนี้', exact: true }).click();
  await expect(page.getByText('Choose output style', { exact: true })).toHaveCount(0);
  await expect.poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).sessions[0].status).toBe('cancelled');
  assert.deepEqual(errors, []);
  await writeFile(
    'release/qa/tool-loop-smoke.json',
    JSON.stringify(
      { passed: true, synthetic: true, providerTurns: 5, usageTokens: 75, stagedOnly: true, questionCancellation: true },
      null,
      2,
    ),
  );
  // The dropped thread above really happened, and the run still finished on a fresh thread.
  assert.equal(await readFile(join(home, 'failed-once'), 'utf8'), '1');
  console.log('Synthetic tool loop, consent, ask_user, plan, staged changes, usage and cancellation passed');
} finally {
  await child.close();
}
