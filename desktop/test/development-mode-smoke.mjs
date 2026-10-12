import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Development mode (Settings → AI): an administrator permits the switch, then a developer turns it on to test on their own Claude Pro/Max plan. Without it, the
// Claude plan connection is refused as before; with it, the connection is accepted; a policy can remove the switch.
const home = await mkdtemp(join(tmpdir(), 'step-development-mode-smoke-'));
const workspace = join(home, 'work');
await mkdir(workspace);
const terms = /TERMS_VERSION = '([^']+)'/.exec(await readFile('src/terms-version.ts', 'utf8'))[1];
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
db.prepare('INSERT INTO records VALUES(?,?,?)').run(
  'settings',
  'main',
  JSON.stringify({
    team: 'cc',
    assistant: 'STeP Mate',
    workspace,
    theme: 'light',
    onboarding: true,
    whatsNewSeen: '999.0.0',
    tourDone: true,
    termsVersion: terms,
  }),
);
db.close();
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
delete env.STEP_CLAUDE_SUBSCRIPTION;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForFunction(() => Boolean(window.step));
  const call = (method, input) => page.evaluate(({ method, input }) => window.step.call(method, input), { method, input });
  const claudePlan = { provider: 'claude', mode: 'subscription', model: '' };

  // Off (the default): the Claude plan connection is refused, as before.
  assert.equal((await call('snapshot')).features.claudeSubscription, false);
  await assert.rejects(call('connection', claudePlan), /INVALID_CONNECTION/);

  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'การเชื่อมต่อ AI' }).click();
  const toggle = page.locator('.development-mode button');
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeDisabled();
  await assert.rejects(call('developmentMode', { enabled: true }), /FEATURE_DISABLED/);

  // The administrator explicitly allows developer testing; the employee opt-in is still off.
  await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ features: { developmentMode: true } }));
  await expect.poll(async () => (await call('snapshot')).policy.features.developmentMode, { timeout: 15000 }).toBe(true);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveAttribute('title', /สำหรับนักพัฒนาที่ผู้ดูแลอนุญาตให้ทดสอบ/);
  assert.equal((await call('snapshot')).features.claudeSubscription, false);

  // On: the discoverable one-click action uses the existing policy-gated host method.
  await expect(toggle).toHaveText('เปิด Dev mode');
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(toggle).toHaveText('กลับโหมดปกติ');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await call('snapshot')).features.claudeSubscription).toBe(true);
  assert.equal((await call('snapshot')).settings.developmentMode, true);
  const connection = await call('connection', claudePlan);
  assert.equal(connection.provider, 'claude');
  assert.equal(connection.mode, 'subscription');
  // A previously successful account remains stored when policy is revoked.
  await app.evaluate(({ app }, id) => {
    const { DatabaseSync } = process.mainModule.require('node:sqlite');
    const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
    const c = JSON.parse(db.prepare("SELECT value FROM records WHERE kind='connection' AND id=?").get(id).value);
    db.prepare("UPDATE records SET value=? WHERE kind='connection' AND id=?").run(
      JSON.stringify({ ...c, ready: true, signedIn: true }),
      id,
    );
    db.close();
  }, connection.id);
  assert.equal((await call('snapshot')).connections.find(c => c.id === connection.id).ready, true);
  await assert.rejects(call('developmentMode', { enabled: 'yes' }), /INVALID_INPUT/);

  // Off again.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await call('snapshot')).features.claudeSubscription).toBe(false);
  await assert.rejects(call('connection', claudePlan), /INVALID_CONNECTION/);
  const revoked = (await call('snapshot')).connections.find(c => c.id === connection.id);
  assert.equal(revoked.ready, false, 'stored success must not mean ready when policy disables the provider');
  assert.equal(revoked.policyBlocked, true);
  await expect(page.locator('.ai-connection-status')).toContainText('ปิดโดยองค์กร');
  await expect(page.getByRole('button', { name: 'ทดสอบใช้งาน', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'เริ่มใช้งาน', exact: true })).toHaveCount(0);
  await page.getByText('โมเดลและการจัดการบัญชี', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'ออกจากระบบ', exact: true })).toBeEnabled();

  // An administrator removes the switch: hidden, refused, and an earlier "on" no longer counts.
  await call('developmentMode', { enabled: true });
  const resumed = (await call('snapshot')).connections.find(c => c.id === connection.id);
  assert.equal(resumed.ready, true, 'policy projection must preserve the stored test result');
  assert.equal(resumed.policyBlocked, false);
  await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ features: { developmentMode: false } }));
  await expect.poll(async () => (await call('snapshot')).policy.features.developmentMode, { timeout: 15000 }).toBe(false);
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeDisabled();
  assert.equal((await call('snapshot')).features.claudeSubscription, false);
  await assert.rejects(call('developmentMode', { enabled: true }), /FEATURE_DISABLED/);
  await assert.rejects(call('connection', claudePlan), /INVALID_CONNECTION/);

  // The explicit developer opt-in cannot enable access when the environment forces the feature off.
  await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ features: { developmentMode: true } }));
  await expect.poll(async () => (await call('snapshot')).policy.features.developmentMode, { timeout: 15000 }).toBe(true);
  await app.evaluate(() => {
    process.env.STEP_CLAUDE_SUBSCRIPTION = '0';
  });
  assert.equal((await call('snapshot')).features.claudeSubscription, false);
  await assert.rejects(call('connection', claudePlan), /INVALID_CONNECTION/);
  assert.deepEqual(errors, []);
  console.log('Development mode smoke passed: policy and employee opt-in both required, off/revocation refuses, forced-off override wins.');
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
