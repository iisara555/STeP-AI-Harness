// Real renderer and native public configuration; OAuth/account changes use synthetic IPC, never live Google.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'step-google-services-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1' };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const deadline = setTimeout(() => {
  console.error('Google services smoke exceeded its deadline');
  process.exit(1);
}, 90_000);
deadline.unref();
try {
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 1100 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง', exact: true }).click();
  await writeFile(
    join(home, 'desktop-policy.json'),
    JSON.stringify({
      googleWorkspace: {
        clientId: 'synthetic-client.apps.googleusercontent.com',
        domains: ['step.cmu.ac.th'],
        services: ['documents', 'calendar-read', 'tasks'],
      },
    }),
  );
  // The managed policy watcher polls every five seconds; allow it to observe the newly created file.
  await expect
    .poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).policy.source, { timeout: 15000 })
    .toBe('managed');
  const native = await page.evaluate(() => window.step.call('googleState'));
  for (const service of [
    'gmail-read',
    'gmail-draft',
    'gmail-send',
    'gmail-manage',
    'drive',
    'docs',
    'sheets',
    'slides',
    'forms',
    'appscript',
    'calendar',
    'chat',
    'meet',
  ])
    assert.ok(native.services.includes(service), service);
  await app.evaluate(({ ipcMain }, state) => {
    const original = ipcMain._invokeHandlers.get('step:call');
    globalThis.googleServiceCalls = [];
    globalThis.googleAllowedServices = [...state.services];
    let accounts = [];
    ipcMain.removeHandler('step:call');
    ipcMain.handle('step:call', async (event, method, input) => {
      if (method === 'googleState')
        return { ...state, services: globalThis.googleAllowedServices, clientPreconfigured: true, clientSecretConfigured: true, accounts };
      if (method === 'googleConnect') {
        globalThis.googleServiceCalls.push(structuredClone(input));
        accounts = [
          {
            id: 'synthetic-google-account',
            label: 'sy••••@example.test',
            domain: 'example.test',
            services: [...input.services],
            paused: false,
            reauth: false,
          },
        ];
        return true;
      }
      if (method.startsWith('google')) throw new Error('Unexpected Google IPC in synthetic fixture: ' + method);
      return original(event, method, input);
    });
  }, native);
  await page.getByRole('button', { name: 'การตั้งค่า', exact: true }).click();
  await page.getByRole('tab', { name: 'บัญชีและบริการ', exact: true }).click();
  const services = page.locator('.google-services');
  const setCard = async (checkbox, checked) => {
    if ((await checkbox.isChecked()) !== checked) await checkbox.locator('xpath=..').click();
    if (checked) await expect(checkbox).toBeChecked();
    else await expect(checkbox).not.toBeChecked();
  };
  for (const name of ['Google Docs', 'Google Sheets', 'Google Slides']) {
    const checkbox = services.getByRole('checkbox', { name: new RegExp('^' + name) });
    await expect(checkbox).not.toBeChecked();
    await setCard(checkbox, true);
  }
  await expect(services.getByText('เอกสาร ชีต และสไลด์', { exact: true })).toHaveCount(0);
  await expect(page.locator('.google-drive')).toHaveCount(1);
  await expect(page.locator('.google-calendar')).toHaveCount(1);
  const drive = page.locator('.google-drive');
  await setCard(drive.getByRole('checkbox', { name: 'Google Drive', exact: true }), true);
  await drive.getByRole('radio', { name: 'อ่าน สร้าง และจัดการไฟล์', exact: true }).check();
  for (const name of [/^อ่าน Gmail/, /^ร่างอีเมล/, /^จัดป้ายกำกับ/, /^Google Forms/, /^Google Apps Script/])
    await setCard(services.getByRole('checkbox', { name }), true);
  await expect(services.getByRole('checkbox', { name: /^ส่งอีเมล/ })).not.toBeChecked();
  await services.scrollIntoViewIfNeeded();
  await mkdir('release/qa/google-services', { recursive: true });
  await services.screenshot({ path: 'release/qa/google-services/seven-services.png' });
  await page.getByRole('button', { name: 'เชื่อมบัญชี Google', exact: true }).click();
  await expect.poll(() => app.evaluate(() => globalThis.googleServiceCalls.length)).toBe(1);
  const first = await app.evaluate(() => globalThis.googleServiceCalls[0]);
  assert.deepEqual(
    [...first.services].sort(),
    ['docs', 'sheets', 'slides', 'drive', 'gmail-read', 'gmail-draft', 'gmail-manage', 'forms', 'appscript'].sort(),
  );
  assert.equal(first.id, undefined);
  await expect(page.locator('.google-account')).toHaveCount(1);
  await page.getByRole('button', { name: 'ปรับบริการที่อนุญาต', exact: true }).click();
  await setCard(services.getByRole('checkbox', { name: /^ส่งอีเมล/ }), true);
  await page.getByRole('button', { name: 'เชื่อมบัญชี Google', exact: true }).click();
  await expect.poll(() => app.evaluate(() => globalThis.googleServiceCalls.length)).toBe(2);
  const second = await app.evaluate(() => globalThis.googleServiceCalls[1]);
  assert.equal(second.id, 'synthetic-google-account');
  assert.ok(second.services.includes('gmail-send'));
  assert.equal(second.services.includes('drive-read'), false, 'one explicit Drive access choice');
  await expect(page.locator('.google-account')).toHaveCount(1);
  await page.getByRole('button', { name: 'ปรับบริการที่อนุญาต', exact: true }).click();
  await expect(page.getByRole('button', { name: 'เลือกสิทธิ์เต็มทุกบริการ', exact: true })).toHaveCount(0);
  for (const checkbox of await services.getByRole('checkbox').all()) await setCard(checkbox, true);
  await page.locator('.google-calendar').getByRole('radio', { name: 'ดูและสร้างนัด', exact: true }).check();
  await page.locator('.google-drive').getByRole('radio', { name: 'อ่าน สร้าง และจัดการไฟล์', exact: true }).check();
  await page.getByRole('button', { name: 'เชื่อมบัญชี Google', exact: true }).click();
  await expect.poll(() => app.evaluate(() => globalThis.googleServiceCalls.length)).toBe(3);
  const full = await app.evaluate(() => globalThis.googleServiceCalls[2]);
  for (const service of [
    'gmail-send',
    'gmail-manage',
    'drive',
    'docs',
    'sheets',
    'slides',
    'forms',
    'appscript',
    'calendar',
    'tasks',
    'chat',
    'meet',
  ])
    assert.ok(full.services.includes(service), service);
  assert.equal(full.id, 'synthetic-google-account');
  await page.evaluate(async () => {
    const { settings } = await window.step.call('snapshot');
    await window.step.call('settings', { ...settings, theme: 'dark', language: 'en' });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Accounts and services', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Change allowed services', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Change allowed services', exact: true }).click();
  await page.setViewportSize({ width: 800, height: 650 });
  await services.getByRole('checkbox', { name: /^Google Apps Script/ }).scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await setCard(services.getByRole('checkbox', { name: /^Google Apps Script/ }), false);
  await expect(services.getByRole('checkbox', { name: /^Google Apps Script/ })).not.toBeChecked();
  await page.screenshot({ path: 'release/qa/google-services/narrow-dark-english.png' });
  await expect(page.locator('.google-admin')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Accounts and services', exact: true }).click();
  await expect(page.locator('.google-admin')).toHaveCount(0);
  for (const name of ['Google Forms', 'Google Apps Script', 'Google Chat', 'Google Meet'])
    await expect(services.getByRole('checkbox', { name: new RegExp('^' + name) })).toBeVisible();
  await expect(page.getByText(/Updating the app does not add account permissions/)).toBeVisible();
  await page.screenshot({ path: 'release/qa/google-services/restricted-policy.png' });
  assert.deepEqual(errors, []);
  console.log(
    'Google services smoke passed: legacy managed service list upgrades to all eleven supported families, explicit full-access selection, Gmail send intent, one Drive/Calendar card, account-bound upgrades, English and narrow/dark settings. Synthetic OAuth only.',
  );
} finally {
  clearTimeout(deadline);
  await app?.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
