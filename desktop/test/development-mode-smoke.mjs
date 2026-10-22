import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The release offers developer opt-in and configured Workspace on a clean machine. A managed policy can still
// disable the switch; the developer must opt in to their own Claude Pro/Max plan and can turn it off again.
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
  const defaults = await call('snapshot');
  assert.equal(defaults.features.developmentMode, true);
  assert.equal(defaults.policy.features.vault, true);
  assert.equal(defaults.policy.features.googleWorkspace, true);
  const workspaceDefaults = await call('googleState');
  assert.equal(workspaceDefaults.configured, true);
  assert.deepEqual(workspaceDefaults.services, [
    'documents',
    'docs',
    'sheets',
    'slides',
    'drive-read',
    'drive',
    'gmail-read',
    'gmail-draft',
    'gmail-send',
    'gmail-manage',
    'forms',
    'appscript',
    'calendar-read',
    'tasks',
    'calendar',
    'chat',
    'meet',
  ]);
  assert.deepEqual(workspaceDefaults.accounts, [], 'available services do not grant access without employee consent');
  const apiOnly = await call('connection', { provider: 'openai', mode: 'api', apiKey: 'synthetic-demo-api-key', model: 'synthetic-model' });
  assert.equal((await call('vaultState')).protected, false, 'API-only use does not silently enroll Vault');
  await call('removeConnection', { id: apiOnly.id });
  await assert.rejects(call('connection', claudePlan), /INVALID_CONNECTION/);

  await page.getByRole('button', { name: 'การตั้งค่า', exact: true }).click();
  await page.getByRole('tab', { name: 'เชื่อมต่อ AI' }).click();
  const toggle = page.locator('.development-mode button');
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeEnabled();
  await page.getByRole('tab', { name: 'บัญชีและบริการ', exact: true }).click();
  await expect(page.getByRole('button', { name: 'เชื่อมบัญชี Google', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'เพิ่มบัญชีเว็บไซต์', exact: true })).toBeEnabled();
  await page.getByRole('tab', { name: 'เชื่อมต่อ AI' }).click();
  await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ features: { developmentMode: false } }));
  await expect.poll(async () => (await call('snapshot')).policy.features.developmentMode, { timeout: 15000 }).toBe(false);
  await expect(toggle).toBeDisabled();
  await assert.rejects(call('developmentMode', { enabled: true }), /FEATURE_DISABLED/);

  // The administrator explicitly allows developer testing; the employee opt-in is still off.
  await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ features: { developmentMode: true } }));
  await expect.poll(async () => (await call('snapshot')).policy.features.developmentMode, { timeout: 15000 }).toBe(true);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveAttribute('title', /สำหรับทดสอบและ demo/);
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
  // One footer label on every Settings tab; it becomes the primary button only once an account is ready.
  await expect(page.getByRole('button', { name: 'กลับไปทำงาน', exact: true })).toHaveClass(/quiet/);
  await page.getByText('โมเดลและการจัดการบัญชี', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'ออกจากระบบ', exact: true })).toBeEnabled();

  // With an administrator passcode in the policy, turning the switch on asks for it; turning it off never does.
  await call('developmentMode', { enabled: false });
  await writeFile(
    join(home, 'desktop-policy.json'),
    JSON.stringify({
      features: { developmentMode: true },
      developmentPasscodeSha256: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
    }),
  );
  await expect.poll(async () => (await call('snapshot')).features.developmentPasscode, { timeout: 15000 }).toBe(true);
  assert.equal(JSON.stringify(await call('snapshot')).includes('03ac6742'), false, 'the digest never reaches the window');
  await assert.rejects(call('developmentMode', { enabled: true }), /DEV_MODE_PASSCODE/);
  await expect(toggle).toHaveText('เปิด Dev mode');
  await toggle.click();
  const passcodeDialog = page.getByRole('alertdialog', { name: 'เปิด Dev mode' });
  await passcodeDialog.getByLabel('รหัส Dev mode').fill('0000');
  await passcodeDialog.getByRole('button', { name: 'เปิด Dev mode', exact: true }).click();
  await expect(passcodeDialog.getByRole('alert')).toHaveText('รหัส Dev mode ไม่ถูกต้อง');
  await passcodeDialog.getByLabel('รหัส Dev mode').fill('1234');
  await passcodeDialog.getByRole('button', { name: 'เปิด Dev mode', exact: true }).click();
  await expect(toggle).toHaveText('กลับโหมดปกติ');
  await toggle.click();
  await expect(toggle).toHaveText('เปิด Dev mode');
  await expect(passcodeDialog).toHaveCount(0);
  await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ features: { developmentMode: true } }));
  await expect.poll(async () => (await call('snapshot')).features.developmentPasscode, { timeout: 15000 }).toBe(false);

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
  console.log(
    'Development mode smoke passed: clean-install Vault/Workspace availability, dormant API-only protection, local developer opt-in/off, administrator denial/passcode, and forced-off override.',
  );
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
