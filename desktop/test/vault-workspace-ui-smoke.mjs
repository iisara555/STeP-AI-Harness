import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
const home = await mkdtemp(join(tmpdir(), 'step-credential-ui-'));
const seed = new DatabaseSync(join(home, 'workspace.sqlite'));
seed.exec('CREATE TABLE records (kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
seed
  .prepare('INSERT INTO records VALUES (?,?,?)')
  .run('settings', 'main', JSON.stringify({ team: '', assistant: 'STeP Mate', workspace: home, theme: 'system', onboarding: false }));
seed.close();
await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ features: { vault: false, googleWorkspace: false } }));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
let app;
let phase = 'launch legacy profile';
const checkpoint = name => {
  phase = name;
  console.log(`Credential Settings phase: ${name}`);
};
const deadline = setTimeout(() => {
  console.error(`Credential Settings timed out during ${phase}`);
  process.exitCode = 1;
  app?.process().kill('SIGKILL');
}, 90_000);
deadline.unref();
try {
  checkpoint('launch legacy profile');
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const before = await app.firstWindow();
  await expect(before.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง', exact: true })).toBeVisible();
  checkpoint('save encrypted legacy key');
  await before.evaluate(() =>
    window.step.call('connection', { provider: 'openai', mode: 'api', apiKey: 'synthetic-api-marker', model: 'synthetic-model' }),
  );
  checkpoint('close legacy process');
  await app.close();
  app = undefined;
  await writeFile(
    join(home, 'desktop-policy.json'),
    JSON.stringify({
      features: { vault: true, googleWorkspace: true },
      googleWorkspace: null,
      credentialStorage: { blockHostExecution: true },
    }),
  );
  checkpoint('restart with Vault enabled');
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean(window.step));
  const dormant = await page.evaluate(() => window.step.call('vaultState'));
  assert.equal(dormant.enabled, true);
  assert.equal(dormant.protected, false, 'exposing Vault does not enroll an API-only profile');
  assert.equal(dormant.entries.length, 0);
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  checkpoint('open credential settings');
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง', exact: true }).click();
  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'รหัสผ่านและการเชื่อมต่อ', exact: true }).click();
  await expect(
    page.getByText('รอผู้ดูแลตั้งค่า Google OAuth client ID และโดเมนที่อนุญาต จึงจะเชื่อมบัญชีงานได้', { exact: true }),
  ).toBeVisible();
  assert.equal(await page.getByRole('button', { name: 'เชื่อมบัญชีงาน', exact: true }).count(), 0);
  await expect(page.getByRole('button', { name: 'เพิ่มบัตรชำระเงิน', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'เพิ่มที่อยู่', exact: true })).toBeVisible();
  checkpoint('remember website account');
  await page.getByRole('button', { name: 'เพิ่มบัญชีเว็บไซต์', exact: true }).click();
  const form = page.locator('.credential-form');
  await form.getByLabel('ชื่อเรียกบัญชี', { exact: true }).fill('Synthetic work account');
  await form.getByLabel('เว็บไซต์ที่ใช้ได้', { exact: true }).fill('https://accounts.example.test');
  await form.getByLabel('ชื่อผู้ใช้หรืออีเมล', { exact: true }).fill('synthetic-employee');
  await form.getByLabel('รหัสผ่านของเว็บไซต์นี้', { exact: true }).fill('synthetic-password');
  await expect(form.getByRole('button', { name: 'บันทึก', exact: true })).toBeDisabled();
  await form.getByLabel('จำบัญชีนี้บนเครื่องส่วนตัวของฉัน').check();
  await form.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(page.getByText('Synthetic work account', { exact: true })).toBeVisible();
  checkpoint('inspect metadata and migration');
  const state = await page.evaluate(() => window.step.call('vaultState'));
  assert.equal(state.entries.filter(v => v.kind === 'website').length, 1);
  assert.equal(state.entries.filter(v => v.kind === 'api-key').length, 1, 'legacy API key migrates after explicit credential enrollment');
  assert.equal(state.protected, true);
  assert.doesNotMatch(JSON.stringify(state), /synthetic-employee|synthetic-password/);
  await page.getByRole('button', { name: 'แก้ไข', exact: true }).click();
  assert.equal(await form.getByLabel('ชื่อผู้ใช้หรืออีเมล', { exact: true }).inputValue(), '');
  assert.equal(await form.getByLabel('รหัสผ่านของเว็บไซต์นี้', { exact: true }).inputValue(), '');
  await form.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  checkpoint('import Desktop OAuth client through native dialog');
  const clientId = 'synthetic-client.apps.googleusercontent.com';
  const clientPath = join(home, 'client.json');
  await writeFile(clientPath, JSON.stringify({ installed: { client_id: clientId, client_secret: 'synthetic-client-secret' } }));
  await writeFile(
    join(home, 'desktop-policy.json'),
    JSON.stringify({
      features: { vault: true, googleWorkspace: true },
      googleWorkspace: { clientId, domains: ['example.test'], services: ['documents'] },
      credentialStorage: { blockHostExecution: true },
    }),
  );
  await expect.poll(() => page.evaluate(() => window.step.call('googleState').then(s => s.configured)), { timeout: 15000 }).toBe(true);
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  });
  assert.equal(await page.evaluate(() => window.step.call('googleImportClient')), false);
  assert.equal(await page.evaluate(() => window.step.call('googleState').then(s => s.clientSecretConfigured)), false);
  await app.evaluate(({ dialog }, clientPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [clientPath] });
  }, clientPath);
  const imported = await page.evaluate(() => window.step.call('googleImportClient'));
  assert.equal(imported.clientSecretConfigured, true);
  assert.doesNotMatch(JSON.stringify(imported), /synthetic-client-secret|client\.json/);
  const metadata = await page.evaluate(() => window.step.call('vaultState'));
  assert.equal(metadata.entries.length, 2, 'the client credential is not exposed in the website/API credential list');
  assert.doesNotMatch(JSON.stringify(metadata), /synthetic-client-secret/);
  await writeFile(clientPath, JSON.stringify({ web: { client_id: clientId, client_secret: 'synthetic-client-secret' } }));
  const invalid = await page.evaluate(() =>
    window.step.call('googleImportClient').then(
      () => '',
      e => String(e),
    ),
  );
  assert.match(invalid, /GOOGLE_CLIENT_FILE_INVALID/);
  assert.doesNotMatch(invalid, /synthetic-client-secret|client\.json/);
  assert.equal(await page.evaluate(() => window.step.call('googleState').then(s => s.clientSecretConfigured)), true);
  checkpoint('pause and deny host execution');
  assert.equal(await page.evaluate(() => window.step.call('vaultState').then(state => state.blockHostExecution)), true);
  await page.getByRole('button', { name: 'พักการใช้งาน', exact: true }).click();
  await expect(page.getByRole('button', { name: 'กลับมาใช้งาน', exact: true })).toBeVisible();
  checkpoint('capture paused Settings');
  await mkdir('release/qa/vault', { recursive: true });
  await page.screenshot({ path: 'release/qa/vault/settings-1280.png', timeout: 15000 });
  await page.setViewportSize({ width: 800, height: 700 });
  await page.screenshot({ path: 'release/qa/vault/settings-800.png', timeout: 15000 });
  checkpoint('strict policy terminal refusal');
  const rejected = await page.evaluate(() =>
    window.step.call('toolRun', { command: 'echo should-not-run' }).then(
      () => false,
      e => String(e),
    ),
  );
  assert.match(rejected, /VAULT_HOST_EXECUTION_BLOCKED/);
  const migrated = new DatabaseSync(join(home, 'workspace.sqlite'));
  try {
    assert.equal(migrated.prepare("SELECT value FROM records WHERE kind='secret'").get()?.value, 'null');
    assert.ok(migrated.prepare("SELECT value FROM records WHERE kind='credential-ref'").get());
  } finally {
    migrated.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    'Credential Settings smoke passed: real renderer/preload/IPC, explicit remember consent, metadata-only state/edit, native Desktop client import, rejected web client, missing Google config, pause and host-execution denial.',
  );
} finally {
  checkpoint('close application');
  if (app) await app.close();
  checkpoint('remove private fixture');
  assert.ok(home.startsWith(tmpdir()));
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  clearTimeout(deadline);
}
