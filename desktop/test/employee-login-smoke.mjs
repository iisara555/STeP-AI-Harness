import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// All identities, keys and tokens are generated fixtures. Only the loopback callback uses real networking.
// Real OS encryption runs in a throwaway STEP_DESKTOP_TEST_HOME, never the employee's application profile.
const home = await mkdtemp(join(tmpdir(), 'step-employee-login-smoke-'));
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
    assistant: 'Fixture Assistant',
    userName: 'Fixture Employee',
    workspace,
    language: 'th',
    theme: 'light',
    onboarding: true,
    tourDone: true,
    whatsNewSeen: '0.6.5',
    dataAcknowledged: true,
    termsAccepted: true,
    termsVersion: terms,
  }),
);
db.prepare('INSERT INTO records VALUES(?,?,?)').run(
  'session',
  'fixture-existing',
  JSON.stringify({
    id: 'fixture-existing',
    title: 'Preserved fixture work',
    status: 'idle',
    mode: 'chat',
    draft: '',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revision: 1,
    project: '',
    team: 'cc',
    connectionId: '',
    versions: [],
    proposals: [],
    originalQuery: '',
    answers: [],
    clarification: false,
    sources: [],
  }),
);
db.close();
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DESKTOP_TEST_LOGIN: '1', HOME: home, USERPROFILE: home };
delete env.ELECTRON_RUN_AS_NODE;
let application;
const screenshots = resolve('../tmp/login-preview');
await mkdir(screenshots, { recursive: true });
const call = (page, method, input) => page.evaluate(({ method, input }) => window.step.call(method, input), { method, input });

async function fixtures(application) {
  await application.evaluate(({ shell }) => {
    const crypto = process.mainModule.require('node:crypto');
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const original = globalThis.fetch;
    globalThis.employeeFixture = { subject: '123456789', domain: 'example.test', grants: [] };
    let authorization;
    globalThis.fetch = async (url, init) => {
      if (String(url) === 'https://www.googleapis.com/oauth2/v3/certs')
        return Response.json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256' }] });
      if (String(url) !== 'https://oauth2.googleapis.com/token') throw new Error('Unexpected fixture network request');
      const body = new URLSearchParams(String(init.body));
      if (body.get('grant_type') !== 'authorization_code') throw new Error('Unexpected fixture grant');
      if (
        crypto.createHash('sha256').update(body.get('code_verifier')).digest('base64url') !==
        authorization.searchParams.get('code_challenge')
      )
        throw new Error('Invalid fixture PKCE');
      const data =
        Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fixture' })).toString('base64url') +
        '.' +
        Buffer.from(
          JSON.stringify({
            iss: 'https://accounts.google.com',
            aud: authorization.searchParams.get('client_id'),
            nonce: authorization.searchParams.get('nonce'),
            sub: employeeFixture.subject,
            hd: employeeFixture.domain,
            email: 'fixture@step.cmu.ac.th',
            email_verified: true,
            name: 'Fixture Employee',
            exp: Math.floor(Date.now() / 1000) + 3600,
          }),
        ).toString('base64url');
      return Response.json({
        id_token: data + '.' + crypto.sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url'),
        access_token: 'synthetic-employee-access',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: authorization.searchParams.get('scope'),
        ...(authorization.searchParams.get('access_type') === 'offline' ? { refresh_token: 'synthetic-workspace-refresh' } : {}),
      });
    };
    shell.openExternal = async value => {
      authorization = new URL(value);
      if (authorization.origin !== 'https://accounts.google.com') throw new Error('Unexpected fixture origin');
      employeeFixture.grants.push(Object.fromEntries(authorization.searchParams));
      const callback = new URL(authorization.searchParams.get('redirect_uri'));
      callback.searchParams.set('state', authorization.searchParams.get('state'));
      callback.searchParams.set('code', 'synthetic-code');
      await original(callback);
    };
  });
}

try {
  application = await electron.launch({ args: ['dist/main.cjs'], env, timeout: 60000 });
  let login = await application.firstWindow();
  await expect(login.getByRole('button', { name: 'ลงชื่อเข้าใช้ด้วย Google', exact: true })).toBeEnabled();
  assert.equal((await call(login, 'employeeLoginState')).required, true);
  assert.equal(
    await application.evaluate(({ app }) => {
      const { DatabaseSync } = process.mainModule.require('node:sqlite');
      const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
      const count = db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name='session_search'").get().count;
      db.close();
      return count;
    }),
    0,
    'the workspace store must not initialize before identity verification',
  );
  for (const method of ['snapshot', 'vaultState', 'googleState', 'create', 'send', 'settings'])
    await assert.rejects(call(login, method), /AUTH_REQUIRED/);
  if (await login.getByRole('button', { name: 'ใช้ธีมสว่าง' }).count()) await login.getByRole('button', { name: 'ใช้ธีมสว่าง' }).click();
  await expect
    .poll(() => login.locator('.employee-login-google').evaluate(element => getComputedStyle(element).backgroundColor))
    .toBe('rgb(255, 255, 255)');
  await login.screenshot({ path: join(screenshots, 'light.png') });
  await login.getByRole('button', { name: 'ใช้ธีมมืด' }).click();
  await expect
    .poll(() => login.locator('.employee-login-google').evaluate(element => getComputedStyle(element).backgroundColor))
    .toBe('rgb(19, 19, 20)');
  await login.screenshot({ path: join(screenshots, 'dark.png') });
  await login.setViewportSize({ width: 800, height: 600 });
  assert.equal(await login.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await login.screenshot({ path: join(screenshots, 'compact.png') });
  await login.getByRole('button', { name: 'Switch to English' }).click();
  await expect(login.getByRole('heading', { name: 'Sign in to your workspace', exact: true })).toBeVisible();
  assert.equal(await login.evaluate(() => document.documentElement.lang), 'en');
  await login.getByRole('button', { name: 'เปลี่ยนเป็นภาษาไทย' }).click();
  await fixtures(application);
  await login.getByRole('button', { name: 'ลงชื่อเข้าใช้ด้วย Google', exact: true }).click();
  await expect(login.getByRole('alert')).toContainText('กรุณาใช้บัญชี Google Workspace');
  await assert.rejects(call(login, 'snapshot'), /AUTH_REQUIRED/);
  await application.evaluate(() => {
    employeeFixture.domain = 'step.cmu.ac.th';
  });
  await login.getByRole('button', { name: 'ลงชื่อเข้าใช้ด้วย Google', exact: true }).click();
  await expect(login.getByRole('heading', { name: 'ใช้ข้อมูลเดิมของคุณ' })).toBeVisible();
  await assert.rejects(call(login, 'snapshot'), /AUTH_REQUIRED/);
  await login.getByRole('button', { name: 'ยืนยันว่าเป็นข้อมูลของฉัน' }).click();
  const appPage = await expect
    .poll(async () => (await application.windows()).find(page => page !== login && page.url().includes('index.html')))
    .not.toBeUndefined()
    .then(async () => (await application.windows()).find(page => page !== login && page.url().includes('index.html')));
  await expect(appPage.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true })).toBeVisible({ timeout: 30000 });
  const snapshot = await call(appPage, 'snapshot');
  assert.equal(snapshot.employeeLogin.email, 'fixture@step.cmu.ac.th');
  assert.ok(snapshot.sessions.some(session => session.id === 'fixture-existing'));
  assert.equal((await call(appPage, 'vaultState')).protected, false);
  assert.equal((await call(appPage, 'googleState')).accounts.length, 0);
  const grants = await application.evaluate(() => employeeFixture.grants);
  assert.ok(grants.every(grant => grant.scope === 'openid email profile' && grant.access_type === 'online'));
  const bytes = await readFile(join(home, 'employee-session.bin'));
  assert.equal(bytes.includes(Buffer.from('fixture@step.cmu.ac.th')), false);
  assert.equal(bytes.includes(Buffer.from('synthetic-employee-access')), false);
  await appPage.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await appPage.getByRole('tab', { name: 'ทั่วไป', exact: true }).click();
  await expect(appPage.getByRole('button', { name: 'ออกจากบัญชีพนักงาน' })).toBeVisible();
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1 });
  });
  await call(appPage, 'employeeLogout');
  await expect.poll(async () => (await application.windows()).filter(page => page.url().includes('#employee-login')).length).toBe(1);
  login = (await application.windows()).find(page => page.url().includes('#employee-login'));
  await expect(login.getByRole('button', { name: 'ลงชื่อเข้าใช้ด้วย Google', exact: true })).toBeEnabled();
  await appPage.evaluate(() => {
    window.employeeFixtureDirty = event => event.preventDefault();
    window.addEventListener('beforeunload', window.employeeFixtureDirty);
  });
  await application.evaluate(({ dialog }) => {
    employeeFixture.closeChecks = 0;
    dialog.showMessageBox = async () => {
      employeeFixture.closeChecks++;
      return { response: 0 };
    };
  });
  await call(login, 'windowControl', { action: 'quit' });
  await expect.poll(() => application.evaluate(() => employeeFixture.closeChecks)).toBe(1);
  await expect(login.getByRole('button', { name: 'ลงชื่อเข้าใช้ด้วย Google', exact: true })).toBeVisible();
  await assert.rejects(call(appPage, 'snapshot'), /UNTRUSTED_SENDER|AUTH_REQUIRED/);
  assert.equal(
    await application.evaluate(({ app, BrowserWindow }) => {
      const workspace = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('index.html'));
      workspace.show();
      app.emit('second-instance');
      return workspace.isVisible();
    }),
    false,
    'window activation must not reveal a locked workspace',
  );
  await application.evaluate(() => {
    employeeFixture.subject = '987654321';
  });
  await login.getByRole('button', { name: 'ลงชื่อเข้าใช้ด้วย Google', exact: true }).click();
  await expect(login.getByRole('alert')).toContainText('ไม่ตรงกับเจ้าของข้อมูล');
  await application.evaluate(() => {
    employeeFixture.subject = '123456789';
  });
  await login.getByRole('button', { name: 'ลงชื่อเข้าใช้ด้วย Google', exact: true }).click();
  await expect.poll(async () => (await application.windows()).filter(page => page.url().includes('#employee-login')).length).toBe(0);
  assert.ok((await call(appPage, 'snapshot')).sessions.some(session => session.id === 'fixture-existing'));
  await appPage.evaluate(() => window.removeEventListener('beforeunload', window.employeeFixtureDirty));
  await application.close();
  application = await electron.launch({ args: ['dist/main.cjs'], env, timeout: 60000 });
  const resumed = await application.firstWindow();
  await expect(resumed.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true })).toBeVisible({ timeout: 30000 });
  assert.equal((await call(resumed, 'snapshot')).employeeLogin.phase, 'authenticated');
  await application.evaluate(() => {
    const original = Date.now;
    Date.now = () => original() + 13 * 3600000;
  });
  await expect
    .poll(async () => (await application.windows()).filter(page => page.url().includes('#employee-login')).length, { timeout: 15000 })
    .toBe(1);
  await assert.rejects(call(resumed, 'snapshot'), /UNTRUSTED_SENDER|AUTH_REQUIRED/);
  console.log(
    'Employee login: identity-only PKCE, signed domain denial, legacy adoption, IPC gate, OS encryption, owner-bound logout/resume and expiry lock passed.',
  );
} finally {
  await application?.close().catch(() => {});
  assert.ok(home.startsWith(join(tmpdir(), 'step-employee-login-smoke-')));
  await rm(home, { recursive: true, force: true });
}
