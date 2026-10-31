// Real main/preload/renderer settings. Google and password-manager actions are synthetic; no external accounts.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'step-settings-clarity-'));
const workspace = join(home, 'work');
await mkdir(workspace);
const terms = /TERMS_VERSION = '([^']+)'/.exec(await readFile('src/terms-version.ts', 'utf8'))[1];
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
const put = (kind, id, value) => db.prepare('INSERT INTO records VALUES(?,?,?)').run(kind, id, JSON.stringify(value));
put('settings', 'main', {
  team: 'cc',
  userName: 'Synthetic user',
  assistant: 'STeP Mate',
  workspace,
  theme: 'light',
  onboarding: true,
  whatsNewSeen: '999.0.0',
  tourDone: true,
  termsVersion: terms,
});
for (const [id, provider, mode] of [
  ['ai-one', 'openai', 'subscription'],
  ['ai-two', 'antigravity', 'subscription'],
  ['ai-three', 'gemini', 'api'],
])
  put('connection', id, {
    id,
    provider,
    mode,
    model: 'synthetic-model',
    executable: '',
    ready: true,
    note: 'ผ่านการเชื่อมต่อและรับคำตอบบนเครื่องนี้แล้ว',
    testedAt: '2026-10-21T10:00:00Z',
    modelsAt: new Date().toISOString(),
    models: [],
  });
db.close();
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1' };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const deadline = setTimeout(() => {
  console.error('Settings clarity smoke exceeded deadline');
  app?.process().kill('SIGKILL');
}, 180000);
deadline.unref();
try {
  app = await electron.launch({ args: ['--force-prefers-reduced-motion', '.'], env, timeout: 45000 });
  await expect.poll(() => app.windows().some(w => w.url().includes('renderer/index.html')), { timeout: 45000 }).toBe(true);
  const page = app.windows().find(w => w.url().includes('renderer/index.html'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ ipcMain }) => {
    const original = ipcMain._invokeHandlers.get('step:call');
    globalThis.settingsFixture = {
      failSave: false,
      suspended: false,
      googleCalls: [],
      sources: [
        { source: 'onepassword', enabled: true, installed: false, unlocked: false },
        { source: 'bitwarden', enabled: false, installed: true, unlocked: false },
      ],
      accounts: [
        {
          id: 'synthetic-google',
          label: 'fi••••@example.test',
          domain: 'example.test',
          services: ['gmail-read', 'drive-read'],
          paused: false,
          reauth: false,
        },
      ],
    };
    ipcMain.removeHandler('step:call');
    ipcMain.handle('step:call', async (event, method, input) => {
      const f = globalThis.settingsFixture;
      if (method === 'settings' && f.failSave) throw new Error('SYNTHETIC_SAVE_FAILED');
      if (method === 'vaultState')
        return { enabled: true, protected: true, suspended: f.suspended, entries: [], browsers: [], sources: f.sources };
      if (method === 'googleState')
        return {
          enabled: true,
          configured: true,
          connecting: false,
          clientPreconfigured: true,
          clientSecretConfigured: true,
          vaultSuspended: f.suspended,
          accounts: f.accounts,
          services: [
            'documents',
            'gmail-read',
            'gmail-draft',
            'gmail-send',
            'gmail-manage',
            'calendar-read',
            'calendar',
            'drive-read',
            'drive',
            'docs',
            'sheets',
            'slides',
            'forms',
            'appscript',
            'tasks',
            'chat',
            'meet',
          ],
        };
      if (method === 'vaultSuspend') {
        f.suspended = input.enabled;
        return true;
      }
      if (method === 'googlePause') {
        f.accounts[0].paused = input.paused;
        return true;
      }
      if (method === 'googleConnect') {
        f.googleCalls.push(input);
        return true;
      }
      if (method.startsWith('google') || method === 'vaultSource') throw new Error('Unexpected synthetic account action: ' + method);
      return original(event, method, input);
    });
  });
  const open = () => page.getByRole('button', { name: 'การตั้งค่า', exact: true }).click();
  const tab = name => page.getByRole('tab', { name, exact: true }).click();
  const panel = page.locator('.settings-content');
  console.log('Settings clarity: profile and unsaved values');
  await open();
  await tab('ทั่วไป');
  await expect(panel.getByRole('radiogroup', { name: 'รูปโปรไฟล์', exact: true })).toHaveCount(0);
  await expect(panel.getByLabel('ชื่อเรียกของคุณ', { exact: true })).toHaveValue('Synthetic user');
  await panel.getByRole('button', { name: 'เปลี่ยนรูป', exact: true }).click();
  await expect(panel.getByRole('radiogroup', { name: 'รูปโปรไฟล์', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'เปลี่ยนรูป', exact: true }).click();
  await panel.getByLabel('ชื่อเรียกของคุณ', { exact: true }).fill('Synthetic edited');
  await panel.getByLabel('ภาษาในแชต', { exact: true }).selectOption('en');
  await expect(panel.getByText('มีการเปลี่ยนแปลงที่ยังไม่บันทึก', { exact: true })).toBeVisible();
  console.log('Settings clarity: selected AI and capabilities');
  await tab('เชื่อมต่อ AI');
  await expect(panel.getByRole('heading', { name: 'เชื่อมต่อ AI', exact: true })).toHaveCount(1);
  await expect(panel.getByRole('heading', { name: 'บัญชี AI ของคุณ', level: 2, exact: true })).toBeVisible();
  await expect(panel.locator('.connection-card[data-selected=true]')).toHaveCount(1);
  await expect(panel.locator('.selected-ai')).toHaveText('ใช้สำหรับงานใหม่');
  const antigravity = panel.locator('.connection-card').filter({ has: page.locator('.connection-name', { hasText: 'Antigravity' }) });
  await expect(antigravity.locator('[data-capability=vision]')).toContainText('ต้องตรวจเงื่อนไข');
  await antigravity.getByRole('button', { name: 'ใช้สำหรับงานใหม่', exact: true }).click();
  await expect(antigravity).toHaveAttribute('data-selected', 'true');
  await expect(panel.locator('.connection-note').first()).toHaveText('ทดสอบรับคำตอบสำเร็จ');
  await expect(panel.locator('.connection-card').first()).toContainText('ทดสอบสำเร็จล่าสุด');
  await tab('ทั่วไป');
  await expect(panel.getByLabel('ชื่อเรียกของคุณ', { exact: true })).toHaveValue('Synthetic edited');
  console.log('Settings clarity: cancel exit and failed save');
  await panel.getByRole('button', { name: 'กลับไปทำงาน', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('ออกโดยไม่บันทึก');
  await page.getByRole('alertdialog').getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  assert.equal(await page.evaluate(() => window.dispatchEvent(new Event('step:check-unsaved', { cancelable: true }))), false);
  await app.evaluate(() => {
    globalThis.settingsFixture.failSave = true;
  });
  const save = panel.getByRole('button', { name: 'บันทึกการเปลี่ยนแปลง', exact: true });
  await save.click();
  await expect(save).toBeEnabled();
  assert.equal((await page.evaluate(() => window.step.call('snapshot'))).settings.userName, 'Synthetic user');
  await app.evaluate(() => {
    globalThis.settingsFixture.failSave = false;
  });
  await save.click();
  await expect(save).toBeDisabled();
  await expect(panel).toBeVisible();
  const saved = (await page.evaluate(() => window.step.call('snapshot'))).settings;
  assert.equal(saved.userName, 'Synthetic edited');
  assert.equal(saved.chatLanguage, 'en');
  assert.equal(saved.language || 'th', 'th');
  await panel.getByLabel('ค้นหาการตั้งค่า').fill('Google');
  await panel.getByRole('region', { name: 'ผลค้นหาการตั้งค่า' }).getByRole('button', { name: 'บัญชีและบริการ', exact: true }).click();
  console.log('Settings clarity: account scopes');
  const accounts = panel.locator('.credential-settings');
  const headings = await accounts
    .locator('> section > h2, > section > .credential-heading h2, > section > .google-hero h2')
    .allTextContents();
  assert.deepEqual(
    headings.map(s => s.trim()),
    ['การใช้ข้อมูลบัญชีในแอป', 'Google Workspace', 'บัญชีเว็บไซต์และข้อมูลกรอกฟอร์ม', 'โปรแกรมจัดการรหัสผ่าน'],
  );
  await expect(accounts.locator('.google-services input:checked')).toHaveCount(0);
  await expect(accounts.getByRole('button', { name: 'เลือกสิทธิ์เต็มทุกบริการ', exact: true })).toHaveCount(0);
  await expect(accounts.getByRole('button', { name: 'เชื่อมบัญชี Google', exact: true })).toBeDisabled();
  await accounts
    .locator('.google-services')
    .getByRole('checkbox', { name: /^อ่าน Gmail/ })
    .locator('xpath=..')
    .click();
  await accounts.getByRole('button', { name: 'เชื่อมบัญชี Google', exact: true }).click();
  await expect.poll(() => app.evaluate(() => globalThis.settingsFixture.googleCalls.length)).toBe(1);
  assert.deepEqual(await app.evaluate(() => globalThis.settingsFixture.googleCalls[0].services), ['gmail-read']);
  await expect(save).toBeDisabled();
  await accounts.getByRole('button', { name: 'หยุดใช้ข้อมูลทุกบัญชีชั่วคราว', exact: true }).click();
  await expect(accounts.locator('.google-account .connection-state')).toHaveText('พักอยู่');
  await expect(accounts.locator('.google-account')).toContainText('พักจากปุ่มหยุดใช้ข้อมูลทุกบัญชีชั่วคราว');
  await accounts.getByRole('button', { name: 'กลับมาใช้ข้อมูลทุกบัญชี', exact: true }).click();
  await accounts.getByRole('button', { name: 'พักบัญชีนี้', exact: true }).click();
  await expect(accounts.locator('.google-account .connection-state')).toHaveText('พักอยู่');
  assert.equal(await app.evaluate(() => globalThis.settingsFixture.suspended), false);
  await accounts.getByRole('button', { name: 'กลับมาใช้บัญชีนี้', exact: true }).click();
  await expect(accounts.locator('.google-account .connection-state')).toHaveText('เชื่อมแล้ว');
  await expect(accounts.getByRole('checkbox', { name: 'เปิดให้ใช้ 1Password', exact: true })).toBeChecked();
  await expect(accounts.locator('.password-managers')).toContainText('ยังไม่พบโปรแกรมเชื่อมต่อ');
  await expect(accounts.getByRole('button', { name: 'ดูรายชื่อไฟล์ที่บัญชีนี้เข้าถึงได้', exact: true })).toBeVisible();
  await mkdir('release/qa/settings-clarity', { recursive: true });
  for (const zoom of [1.25, 1.5]) {
    await app.evaluate(({ BrowserWindow }, zoom) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom), zoom);
    await page.setViewportSize({ width: 1100, height: 850 });
    await accounts.locator('.google-services').scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
      `no horizontal overflow at ${zoom}`,
    );
    await expect(accounts.locator('.google-services').getByRole('checkbox', { name: /^อ่าน Gmail/ })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'บันทึกการเปลี่ยนแปลง', exact: true })).toBeInViewport({ ratio: 1 });
    await expect(panel.getByRole('button', { name: 'กลับไปทำงาน', exact: true })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `release/qa/settings-clarity/accounts-${zoom}.png` });
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
  await page.setViewportSize({ width: 1280, height: 1000 });
  await tab('การแสดงผลและภาษา');
  await panel.getByRole('radio', { name: 'English', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Accounts and services', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'General', exact: true }).click();
  await expect(panel.getByLabel('Chat language', { exact: true })).toHaveValue('en');
  await expect(panel.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  assert.doesNotMatch(await panel.locator('.settings-save').innerText(), /[ก-๛]/, 'saved status changes with the UI language');
  await page.screenshot({ path: 'release/qa/settings-clarity/general-en.png' });
  await panel.getByLabel('What should we call you?', { exact: true }).fill('Synthetic discarded');
  await panel.getByRole('button', { name: 'Back to work', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard and leave', exact: true }).click();
  await expect(panel).toHaveCount(0);
  assert.equal((await page.evaluate(() => window.step.call('snapshot'))).settings.userName, 'Synthetic edited');
  // Selecting an AI for a saved task updates that task, rather than claiming to set a global default.
  const task = await page.evaluate(() => window.step.call('create', { connectionId: 'ai-one', project: 'Synthetic selection task' }));
  await page.reload();
  await page.locator('.session').filter({ hasText: 'Synthetic selection task' }).locator('.session-open').click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Connect AI', exact: true }).click();
  await expect(panel.locator('.selected-ai')).toHaveText('Use for this task');
  const taskAI = panel.locator('.connection-card').filter({ has: page.locator('.connection-name', { hasText: 'Antigravity' }) });
  await taskAI.getByRole('button', { name: 'Use for this task', exact: true }).click();
  assert.equal((await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.id === task.id).connectionId, 'ai-two');
  // A legacy app-managed document grant must not silently preselect broader full-document scopes.
  await app.evaluate(() => {
    globalThis.settingsFixture.accounts[0].services = ['documents'];
  });
  await page.getByRole('tab', { name: 'Accounts and services', exact: true }).click();
  await accounts.getByRole('button', { name: 'Change allowed services', exact: true }).click();
  await expect(accounts.locator('.google-services').getByRole('checkbox', { name: /^Docs, Sheets and Slides/ })).toBeChecked();
  for (const name of ['Google Docs', 'Google Sheets', 'Google Slides'])
    await expect(accounts.locator('.google-services').getByRole('checkbox', { name: new RegExp('^' + name) })).not.toBeChecked();
  assert.deepEqual(errors, []);
  console.log(
    'Settings clarity passed: collapsed portraits, dirty/save failure/recovery/discard, selected AI, visible capability limits, separate chat/UI language, minimum Google intent, individual/global pause, manager status, search and 125–150% layouts. Synthetic accounts only.',
  );
} catch (error) {
  console.error(error);
  await app
    ?.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.destroy();
    })
    .catch(() => {});
  throw error;
} finally {
  clearTimeout(deadline);
  await app?.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
