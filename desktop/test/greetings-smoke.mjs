// Real renderer/preload/privacy/provider path with an isolated profile and a synthetic RPC runtime. No live AI calls.
import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile, readFile, rm, appendFile, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-greetings-'));
const workspace = join(home, 'work'),
  profile = join(workspace, 'USER.md');
const executable = join(home, 'fixture.mjs'),
  audit = join(home, 'calls.jsonl'),
  go = join(home, 'continue');
const headlines = [
  'เริ่มจากไอเดียไหนดี',
  'วันนี้อยากลองอะไรใหม่',
  'มาช่วยกันคิดให้ชัดขึ้น',
  'อยากให้ช่วยจัดเรื่องไหนก่อน',
  'มีอะไรอยากเล่าให้ฟัง',
];
await mkdir(workspace);
await mkdir(join(home, 'memory'));
await mkdir('release/qa/greetings', { recursive: true });
await writeFile(audit, '');
await writeFile(
  profile,
  '## User Profile\n- **ชื่อ / ชื่อเรียก (Name/Nickname)**: ดวงดาว\n- **บทบาทหน้าที่ (Role/Function)**: สื่อสาร\n' +
    '## Personal Assistant\n- **บุคลิกผู้ช่วย (Personality)**: concise\n- **รูปแบบการคุย (Conversation Style)**: สั้นและชัดเจน\n' +
    '## Working Preferences\n- **รูปแบบ**: ชอบตารางเปรียบเทียบ\n',
);
for (const [text, days, updated] of [
  ['Prefer concise lists for comparisons.', 0, new Date().toISOString()],
  ['EXPIRED_ONLY_MEMORY', 1, '2020-01-01T00:00:00.000Z'],
]) {
  const id = randomUUID();
  const metadata = {
    schema_version: 1,
    id,
    name: 'Response preference',
    type: 'user',
    scope: 'private',
    importance: 0.8,
    ttl_days: days,
    created_at: updated,
    updated_at: updated,
    source: 'user-confirmed',
  };
  await writeFile(
    join(home, 'memory', id + '.md'),
    '---\n' +
      Object.entries(metadata)
        .map(([k, v]) => k + ': ' + JSON.stringify(v))
        .join('\n') +
      '\n---\n\n' +
      text +
      '\n',
  );
}
await writeFile(
  join(home, 'desktop-policy.json'),
  JSON.stringify({ pilot: false, checks: { privacy: true }, features: { learningReview: false } }),
);
await writeFile(
  executable,
  `import {createInterface} from 'node:readline';import fs from 'node:fs';
let system='',model='';const send=o=>console.log(JSON.stringify(o));
createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;let result={};
if(r.method==='thread/start'){system=r.params.developerInstructions||'';model=r.params.model;result={thread:{id:'greeting-fixture'}};}
if(r.method==='model/list')result={data:[{id:'chosen-greeting-model',displayName:'Synthetic Chat',isDefault:true}]};
send({id:r.id,result});if(r.method==='turn/start'){const prompt=r.params.input.filter(v=>v.type==='text').map(v=>v.text).join('');
fs.appendFileSync(${JSON.stringify(audit)},JSON.stringify({system,prompt,model,turnModel:r.params.model})+'\\n');
const timer=setInterval(()=>{if(!fs.existsSync(${JSON.stringify(go)}))return;clearInterval(timer);
send({method:'thread/tokenUsage/updated',params:{tokenUsage:{total:{inputTokens:15,outputTokens:7,totalTokens:22}}}});
send({method:'item/agentMessage/delta',params:{delta:${JSON.stringify(JSON.stringify({ headlines }))}}});
send({method:'turn/completed',params:{turn:{status:'completed'}}});},25);}});`,
);
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
const put = (kind, id, value) => db.prepare('INSERT INTO records VALUES(?,?,?)').run(kind, id, JSON.stringify(value));
put('settings', 'main', {
  team: 'cc',
  assistant: 'STeP Mate',
  userName: 'ดวงดาว',
  workspace,
  theme: 'light',
  onboarding: true,
  tourDone: true,
  whatsNewSeen: '0.6.27',
  consentedAt: new Date().toISOString(),
  termsVersion: '2026-10-02',
});
put('connection', 'fixture', {
  id: 'fixture',
  provider: 'openai',
  mode: 'subscription',
  model: 'chosen-greeting-model',
  executable,
  customRuntime: true,
  ready: true,
  note: 'Synthetic',
  modelsAt: new Date().toISOString(),
  models: [{ id: 'chosen-greeting-model', label: 'Synthetic Chat', isDefault: true }],
});
db.close();
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1', STEP_CLAUDE_SUBSCRIPTION: '0' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
const calls = async () =>
  (await readFile(audit, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const heading = page.locator('.welcome h1'),
    textarea = page.locator('.composer textarea');
  const approval = page.getByRole('alertdialog', { name: 'ใช้ข้อมูลที่บันทึกไว้ปรับคำทักทาย?' });
  const notes = page.getByRole('dialog', { name: 'มีอะไรใหม่' });
  await expect(notes).toBeVisible();
  await expect(approval).toHaveCount(0);
  assert.equal((await calls()).length, 0, 'release notes cannot be interrupted by a greeting request');
  await notes.getByRole('button', { name: 'รับทราบ', exact: true }).click();
  await expect(page.locator('.welcome-greeting')).toHaveText('สวัสดี คุณดวงดาว');
  await expect(heading).toHaveText('เริ่มจากเรื่องไหนดี');
  await expect(approval).toBeVisible();
  assert.equal((await calls()).length, 0, 'no context reaches the provider before approval');
  await approval.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await expect(approval).toHaveCount(0);
  assert.equal((await calls()).length, 0);
  assert.equal((await page.evaluate(() => window.step.call('snapshot'))).sessions.length, 0);
  // A changed profile gets a fresh attempt; the declined request is not retried on every visit.
  await appendFile(profile, '\n## Working Notes\n- Prefer concrete examples.\n');
  await page.locator('[data-tour="new-work"]').click();
  await expect(approval).toBeVisible();
  await approval.getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true }).click();
  await expect.poll(async () => (await calls()).length).toBe(1);
  const sent = (await calls())[0];
  assert.ok(sent.system.startsWith('Write a batch of five'));
  assert.match(sent.prompt, /Prefer concise lists/);
  assert.match(sent.prompt, /ชอบตารางเปรียบเทียบ/);
  assert.doesNotMatch(sent.prompt, /ดวงดาว|EXPIRED_ONLY_MEMORY/);
  assert.equal(sent.model, 'chosen-greeting-model');
  await textarea.fill('กำลังเตรียมคำขอ ยังไม่ส่ง');
  const sessionsBefore = (await page.evaluate(() => window.step.call('snapshot'))).sessions.length;
  await writeFile(go, 'ok');
  await expect
    .poll(() =>
      app.evaluate(({ app }) => {
        const { DatabaseSync } = process.mainModule.require('node:sqlite');
        const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
        const ready = db
          .prepare("SELECT value FROM records WHERE kind='greeting'")
          .all()
          .some(r => JSON.parse(r.value).headlines.length === 5);
        db.close();
        return ready;
      }),
    )
    .toBe(true);
  await expect(heading).toHaveText('เริ่มจากเรื่องไหนดี', 'generation finishing cannot replace the headline while typing');
  assert.equal((await page.evaluate(() => window.step.call('snapshot'))).sessions.length, sessionsBefore);
  await textarea.fill('');
  await page.locator('[data-tour="new-work"]').click();
  await expect(heading).toHaveText(headlines[0]);
  await page.locator('[data-tour="new-work"]').click();
  await expect(heading).toHaveText(headlines[1]);
  assert.equal((await calls()).length, 1, 'rotation uses the cached batch');
  const usage = await page.evaluate(() => window.step.call('usage'));
  assert.ok(usage.entries.some(e => e.model === 'chosen-greeting-model' && e.total >= 22));
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => (document.documentElement.dataset.theme = theme), theme);
    for (const [size, width, height] of [
      ['wide', 1440, 900],
      ['narrow', 900, 640],
      ['small', 720, 560],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(heading).toBeInViewport();
      await expect(textarea).toBeInViewport();
      await page.screenshot({ path: `release/qa/greetings/${theme}-${size}.png` });
    }
  }
  // The background feature uses the same canonical file guard: it cannot read a hard-linked USER.md.
  const original = await readFile(profile, 'utf8');
  await writeFile(join(home, 'linked-profile'), original);
  await rm(profile);
  await link(join(home, 'linked-profile'), profile);
  await page.locator('[data-tour="new-work"]').click();
  await expect(heading).toHaveText('เริ่มจากเรื่องไหนดี');
  assert.equal((await calls()).length, 1);
  await rm(profile);
  await writeFile(profile, original);
  // Offline account plus an empty display name still opens immediately, in the UI language.
  await app.evaluate(({ app }) => {
    const { DatabaseSync } = process.mainModule.require('node:sqlite');
    const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
    for (const [kind, id] of [
      ['settings', 'main'],
      ['connection', 'fixture'],
    ]) {
      const value = JSON.parse(db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind, id).value);
      if (kind === 'settings') {
        value.language = 'en';
        value.userName = '';
        value.theme = 'light';
      } else value.ready = false;
      db.prepare('UPDATE records SET value=? WHERE kind=? AND id=?').run(JSON.stringify(value), kind, id);
    }
    db.close();
  });
  await page.reload();
  await expect(page.locator('.welcome-greeting')).toHaveText('Hello');
  await expect(heading).toHaveText('Where shall we start?');
  await page.setViewportSize({ width: 900, height: 640 });
  await page.screenshot({ path: 'release/qa/greetings/en-offline.png' });
  assert.equal((await calls()).length, 1);
  // A stored ready flag never overrides a provider disabled by policy.
  await app.evaluate(({ app }) => {
    const { DatabaseSync } = process.mainModule.require('node:sqlite');
    const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
    const value = JSON.parse(db.prepare("SELECT value FROM records WHERE kind='connection' AND id='fixture'").get().value);
    db.prepare("UPDATE records SET value=? WHERE kind='connection' AND id='fixture'").run(
      JSON.stringify({ ...value, provider: 'claude', mode: 'subscription', ready: true }),
    );
    db.close();
  });
  await page.reload();
  await expect(heading).toHaveText('Where shall we start?');
  assert.equal((await calls()).length, 1);
  assert.deepEqual(errors, []);
  console.log(
    'Greetings smoke passed: real IPC, denied/approved context, selected model, profile and confirmed memory, deferred batch, rotation, usage, file guard, Thai/English and six light/dark viewports. Synthetic provider only.',
  );
} catch (error) {
  const log = await readFile(join(home, 'logs', 'diagnostics.jsonl'), 'utf8').catch(() => '');
  console.log(
    log
      .split('\n')
      .filter(line => line.includes('greeting-failed'))
      .join('\n'),
  );
  throw error;
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
