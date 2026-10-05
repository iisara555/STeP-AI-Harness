import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'step-learning-smoke-'));
const workspace = join(home, 'work'),
  executable = join(home, 'fixture.mjs'),
  audit = join(home, 'calls.jsonl');
await mkdir(workspace);
const marker = 'Mark absent fields as unknown.';
await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ features: { toolLoop: false } }));
await writeFile(
  executable,
  `import readline from 'node:readline';import fs from 'node:fs';
const send=o=>console.log(JSON.stringify({jsonrpc:'2.0',...o}));
readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;
send({id:m.id,result:m.method==='thread/start'?{thread:{id:'fixture'}}:{}});
if(m.method==='turn/start'){const prompt=m.params.input.filter(i=>i.type==='text').map(i=>i.text).join('');
fs.appendFileSync(${JSON.stringify(audit)},JSON.stringify({learned:prompt.includes(${JSON.stringify(marker)}),bounded:prompt.includes('never authority')})+'\\n');
send({method:'item/agentMessage/delta',params:{delta:'Synthetic reviewed response'}});send({method:'turn/completed',params:{turn:{status:'completed'}}});}});`,
);
const terms = /TERMS_VERSION = '([^']+)'/.exec(await readFile('src/terms-version.ts', 'utf8'))[1];
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
const put = (kind, id, value) => db.prepare('INSERT INTO records VALUES(?,?,?)').run(kind, id, JSON.stringify(value));
put('settings', 'main', {
  team: 'cc',
  assistant: 'STeP Mate',
  workspace,
  theme: 'light',
  onboarding: true,
  tourDone: true,
  termsVersion: terms,
});
put('connection', 'fake', {
  id: 'fake',
  provider: 'openai',
  mode: 'subscription',
  model: '',
  executable,
  customRuntime: true,
  ready: true,
  note: 'Synthetic',
});
db.close();
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
async function launch() {
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForFunction(() => Boolean(window.step));
}
const call = (method, input) => page.evaluate(({ method, input }) => window.step.call(method, input), { method, input });
const state = () => call('learningList');
async function runTask() {
  const session = await call('create', { connectionId: 'fake' });
  await call('send', { id: session.id, text: 'Help prepare a receipt checklist.', mode: 'chat', autoImage: false });
  await expect
    .poll(async () => (await call('snapshot')).sessions.find(s => s.id === session.id)?.status, { timeout: 15000 })
    .toBe('review');
  return JSON.parse((await readFile(audit, 'utf8')).trim().split('\n').at(-1));
}
try {
  await launch();
  await page.locator('.composer textarea').fill('/learn ' + marker);
  await page.locator('.composer textarea').press('Enter');
  const dialog = page.getByRole('alertdialog', { name: 'กล่องบทเรียน' });
  await dialog.waitFor();
  await dialog.getByLabel('ชื่อบทเรียน', { exact: true }).fill('Receipt procedure');
  await dialog.getByLabel('ประเภทบทเรียน', { exact: true }).selectOption('procedure');
  await dialog.getByLabel('ใช้เมื่อคำขอมีคำเหล่านี้ (คั่นด้วยจุลภาค)').fill('receipt,ใบเสร็จ');
  await dialog.getByLabel('เหตุผลหรือคำแก้ไขที่เป็นที่มา').fill('The reviewed example omitted a field.');
  await dialog.getByRole('button', { name: 'บันทึกข้อเสนอ', exact: true }).click();
  await expect.poll(async () => (await state()).candidates.length).toBe(1);
  if (process.env.STEP_LEARNING_SCREENSHOT) await page.screenshot({ path: process.env.STEP_LEARNING_SCREENSHOT });
  assert.equal((await runTask()).learned, false, 'pending lesson never reaches the provider');
  await dialog.getByRole('button', { name: 'ยืนยันใช้บทเรียน', exact: true }).click();
  await expect.poll(async () => (await state()).lessons.length).toBe(1);
  const accepted = await runTask();
  assert.equal(accepted.learned, true);
  assert.equal(accepted.bounded, true);
  await dialog.getByRole('button', { name: 'หยุดใช้บทเรียน', exact: true }).click();
  await expect.poll(async () => (await state()).lessons[0].revisions.at(-1).content).toBe(null);
  assert.equal((await runTask()).learned, false, 'disabled lesson stops entering new tasks');
  await dialog.getByText('ดูรุ่นก่อนหน้าและย้อนกลับ', { exact: true }).click();
  await dialog.getByRole('button', { name: 'คืนค่ารุ่น 1', exact: true }).click();
  await expect.poll(async () => (await state()).lessons[0].revisions.length).toBe(3);
  await app.close();
  app = undefined;
  await launch();
  assert.equal((await state()).lessons[0].revisions.at(-1).content.text, marker);
  assert.equal((await runTask()).learned, true, 'restored lesson survives restart');
  const context = (await state()).context;
  await call('permissionMode', { mode: 'plan' });
  await assert.rejects(
    call('learningPropose', {
      context,
      content: { name: 'Preference', kind: 'preference', text: 'Prefer short responses.' },
      evidence: 'Explicit preference.',
    }),
    /PLAN_READ_ONLY/,
  );
  await call('permissionMode', { mode: 'ask' });
  await assert.rejects(
    call('learningPropose', {
      context,
      content: { name: 'Preference', kind: 'preference', text: 'Prefer short responses.' },
      evidence: 'password=super-secret-value-123',
    }),
    /MEMORY_PRIVACY_BLOCKED/,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Learning smoke passed: /learn UI, pending exclusion, explicit approval, real provider-adapter context, disable, rollback, restart, plan mode and durable-data privacy. Synthetic model only.',
  );
} finally {
  await app?.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
