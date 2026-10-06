// Synthetic account fixtures through the real Electron preload, IPC, SQLite and rendered Usage dialog.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const home = await mkdtemp(join(tmpdir(), 'step-provider-usage-')),
  workspace = join(home, 'work'),
  executable = join(home, 'codex.mjs'),
  log = join(home, 'requests.jsonl');
await mkdir(workspace);
await writeFile(
  executable,
  `import readline from 'node:readline';
import {appendFileSync} from 'node:fs';
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);appendFileSync(${JSON.stringify(log)},JSON.stringify(m)+'\\n');
 if(m.id===undefined)return;
 const result=m.method==='initialize'?{}:m.method==='account/rateLimits/read'?{rateLimits:{planType:'plus',
 primary:{usedPercent:35,windowDurationMins:300,resetsAt:1791288000},secondary:{usedPercent:70,windowDurationMins:10080},
 credits:{hasCredits:true,unlimited:false,balance:'12.50'}}}:null;
 console.log(JSON.stringify({id:m.id,...(result?{result}:{error:{message:'unexpected generation request'}})}));
});`,
);
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
const put = (kind, id, value) => db.prepare('INSERT INTO records VALUES(?,?,?)').run(kind, id, JSON.stringify(value));
put('settings', 'main', {
  team: 'pm',
  assistant: 'STeP Mate',
  workspace,
  theme: 'light',
  onboarding: true,
  tourDone: true,
  consentedAt: new Date().toISOString(),
  termsVersion: '2026-10-02',
});
put('connection', 'synthetic-codex', {
  id: 'synthetic-codex',
  provider: 'openai',
  mode: 'subscription',
  model: '',
  executable,
  customRuntime: true,
  ready: true,
  note: 'Synthetic',
});
put('connection', 'synthetic-api', {
  id: 'synthetic-api',
  provider: 'gemini',
  mode: 'api',
  model: 'synthetic',
  executable: '',
  ready: true,
  note: 'Synthetic',
});
put('usage-ledger', 'synthetic', {
  day: new Date().toISOString().slice(0, 10),
  provider: 'gemini',
  model: 'synthetic',
  connectionId: 'synthetic-api',
  mode: 'api',
  total: 75,
  input: 50,
  output: 25,
  usd: 0.001,
  unpricedTokens: 0,
  calls: 1,
});
db.close();
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1' };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await app.firstWindow(),
    errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1100, height: 760 });
  await app.evaluate(({ shell }) => {
    globalThis.usagePages = [];
    shell.openExternal = async url => {
      globalThis.usagePages.push(url);
    };
  });
  await page.locator('.composer textarea').fill('/usage');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('alertdialog', { name: 'การใช้งาน AI' });
  await expect(dialog).toContainText('75 tokens');
  const codex = dialog.locator('[data-usage-account="synthetic-codex"]');
  const api = dialog.locator('[data-usage-account="synthetic-api"]');
  await expect(codex).toContainText('ยังไม่ได้อ่าน Usage จากผู้ให้บริการ');
  await expect(api).toContainText('ยังไม่มีช่องอ่านโควตาหรือเครดิตสำหรับการเชื่อมต่อนี้');
  await expect(api.getByRole('button', { name: 'รีเฟรช Usage' })).toHaveCount(0);
  await codex.getByRole('button', { name: 'รีเฟรช Usage' }).click();
  await expect(codex).toContainText('5h');
  await expect(codex).toContainText('1W');
  await expect(codex).toContainText('35%');
  await expect(codex).toContainText('70%');
  await expect(codex).toContainText('12.5 credits');
  await expect(codex).toContainText('อัปเดต');
  await codex.getByRole('button', { name: 'รีเฟรช Usage' }).click();
  await expect(codex.getByRole('button', { name: 'รีเฟรช Usage' })).toBeEnabled();
  await codex.getByRole('button', { name: 'ดูที่ผู้ให้บริการ' }).click();
  assert.deepEqual(await app.evaluate(() => globalThis.usagePages), ['https://chatgpt.com/codex/settings/usage']);
  await page.setViewportSize({ width: 800, height: 520 });
  await expect(dialog.getByRole('button', { name: 'ปิด', exact: true })).toBeVisible();
  const bounds = await dialog.evaluate(el => ({ width: el.scrollWidth, client: el.clientWidth }));
  assert.ok(bounds.width <= bounds.client + 2, 'usage rows do not overflow the dialog');
  await dialog.getByRole('button', { name: 'ปิด', exact: true }).click();
  const calls = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls.filter(c => c.method === 'account/rateLimits/read').length, 1, 'one-minute cache avoids duplicate polling');
  assert.ok(
    calls.every(c => ['initialize', 'initialized', 'account/rateLimits/read'].includes(c.method)),
    'no generation or auth request',
  );
  const saved = new DatabaseSync(join(home, 'workspace.sqlite'));
  assert.equal(saved.prepare("SELECT count(*) AS count FROM records WHERE kind='usage-ledger'").get().count, 1);
  assert.equal(saved.prepare("SELECT count(*) AS count FROM records WHERE kind LIKE '%quota%' OR kind='provider-usage'").get().count, 0);
  saved.close();
  assert.deepEqual(errors, []);
  console.log('Synthetic provider Usage UI/IPC, read-only refresh, cache, account/local distinction and small-window layout passed');
} finally {
  await app?.close().catch(() => {});
  await rm(home, { recursive: true, force: true });
}
