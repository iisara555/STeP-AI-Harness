// Real Settings renderer/preload with synthetic Google IPC; no live accounts, tokens or OS key store.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-google-connect-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const deadline = setTimeout(() => {
  console.error('Google connection Settings smoke timed out');
  process.exitCode = 1;
  app?.process().kill('SIGKILL');
}, 90_000);
deadline.unref();
try {
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop', exact: true })).toHaveCount(0);
  await app.evaluate(({ ipcMain }) => {
    const original = ipcMain._invokeHandlers.get('step:call');
    globalThis.googleFixture = {
      enabled: true,
      configured: true,
      connecting: false,
      services: ['documents', 'calendar-read', 'tasks'],
      accounts: [],
    };
    ipcMain.removeHandler('step:call');
    ipcMain.handle('step:call', async (event, method, input) => {
      if (method === 'vaultState') return { enabled: true, protected: false, suspended: false, entries: [], browsers: [] };
      if (method === 'googleState') return globalThis.googleFixture;
      if (method === 'googleImportClient') {
        globalThis.googleFixture.clientSecretConfigured = true;
        globalThis.googleFixture.connectionError = undefined;
        return globalThis.googleFixture;
      }
      if (method === 'googleConnect') {
        globalThis.googleFixture.connecting = true;
        globalThis.googleFixture.connectionError = undefined;
        try {
          await new Promise((resolve, reject) => {
            globalThis.googleResolve = resolve;
            globalThis.googleReject = reject;
          });
          globalThis.googleFixture.accounts = [
            { id: 'fixture', label: 'fi••••@example.test', domain: 'example.test', services: input.services, paused: false, reauth: false },
          ];
        } catch (error) {
          if (error.message !== 'CANCELLED') globalThis.googleFixture.connectionError = error.message;
          throw error;
        } finally {
          globalThis.googleFixture.connecting = false;
        }
        return globalThis.googleFixture;
      }
      if (method === 'googleCancel') {
        globalThis.googleReject(new Error('CANCELLED'));
        return true;
      }
      return original(event, method, input);
    });
  });
  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'รหัสผ่านและการเชื่อมต่อ', exact: true }).click();
  const settings = page.locator('.credential-settings');
  const connect = settings.getByRole('button', { name: 'เชื่อมบัญชีงาน', exact: true });
  await connect.click();
  await expect(connect).toBeDisabled();
  await expect.poll(() => app.evaluate(() => globalThis.googleFixture.connecting)).toBe(true);
  await expect(settings.getByText('กำลังรอให้คุณลงชื่อในเบราว์เซอร์ เสร็จแล้วกลับมาที่แอปนี้', { exact: true })).toBeVisible();
  await app.evaluate(() => globalThis.googleReject(new Error('GOOGLE_CLIENT_CONFIGURATION')));
  await expect(settings.getByRole('alert')).toContainText('การตั้งค่า OAuth ของ Google ไม่ตรงกับแอป');
  await expect(connect).toBeEnabled();
  await expect(settings.locator('.google-account')).toHaveCount(0);
  // Dismissing the global notification must leave the error next to the connection action.
  const notification = page.locator('.toast');
  if (await notification.count()) await notification.getByRole('button').first().click();
  await expect(settings.getByRole('alert')).toBeVisible();
  // The account error must survive unmounting Settings after the notification has gone.
  await page.getByRole('button', { name: 'กลับไปที่งาน', exact: true }).click();
  await expect(settings).toHaveCount(0);
  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'รหัสผ่านและการเชื่อมต่อ', exact: true }).click();
  await expect(settings.getByRole('alert')).toContainText('การตั้งค่า OAuth ของ Google ไม่ตรงกับแอป');
  await connect.click();
  await expect.poll(() => app.evaluate(() => globalThis.googleFixture.connecting)).toBe(true);
  await app.evaluate(() => globalThis.googleReject(new Error('GOOGLE_CLIENT_SECRET_REQUIRED')));
  await expect(settings.getByRole('alert')).toContainText('Google ต้องใช้ client secret');
  await settings.getByRole('button', { name: 'นำเข้าไฟล์ OAuth client', exact: true }).click();
  await expect(settings.getByRole('alert')).toHaveCount(0);
  await expect(settings.getByText('ตั้งค่า OAuth client บนเครื่องนี้แล้ว กดเชื่อมบัญชีงานเพื่อลองอีกครั้ง', { exact: true })).toBeVisible();
  await connect.click();
  await expect(settings.getByRole('alert')).toHaveCount(0);
  await expect(connect).toBeDisabled();
  await settings.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await expect(connect).toBeEnabled();
  await expect(settings.locator('.google-account')).toHaveCount(0);
  await connect.click();
  await expect(connect).toBeDisabled();
  await expect.poll(() => app.evaluate(() => globalThis.googleFixture.connecting)).toBe(true);
  await app.evaluate(() => globalThis.googleResolve());
  await expect(settings.getByText('fi••••@example.test', { exact: true })).toBeVisible();
  await expect(settings.getByRole('alert')).toHaveCount(0);
  await expect(settings.getByText('กำลังรอให้คุณลงชื่อในเบราว์เซอร์ เสร็จแล้วกลับมาที่แอปนี้', { exact: true })).toHaveCount(0);
  await expect(connect).toBeEnabled();
  // Organization-provisioned installers need only the regular OAuth action; staff never import a client file.
  await app.evaluate(() => {
    globalThis.googleFixture.clientPreconfigured = true;
    globalThis.googleFixture.clientSecretConfigured = true;
    globalThis.googleFixture.accounts = [];
  });
  await page.getByRole('button', { name: 'กลับไปที่งาน', exact: true }).click();
  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'รหัสผ่านและการเชื่อมต่อ', exact: true }).click();
  await expect(settings.getByText('ตั้งค่าการเชื่อม Google ขององค์กร', { exact: true })).toHaveCount(0);
  await expect(settings.getByRole('button', { name: 'นำเข้าไฟล์ OAuth client', exact: true })).toHaveCount(0);
  await connect.click();
  await expect.poll(() => app.evaluate(() => globalThis.googleFixture.connecting)).toBe(true);
  await app.evaluate(() => globalThis.googleResolve());
  await expect(settings.getByText('fi••••@example.test', { exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    'Google connection smoke passed: pending, persistent errors, Desktop client import, cancellation, retry and preconfigured organization OAuth without employee JSON import. Synthetic Google IPC only.',
  );
} finally {
  if (app) await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  clearTimeout(deadline);
}
