// สรุปเช้านี้ on the real chat home and Settings renderer, with synthetic morning-brief IPC; no Google account or token.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-morning-brief-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const deadline = setTimeout(() => {
  console.error('Morning brief smoke timed out');
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
  // Without a connected Calendar account the chat home has no card.
  await expect(page.getByRole('heading', { name: 'สรุปเช้านี้' })).toHaveCount(0);
  await app.evaluate(({ ipcMain }) => {
    const original = ipcMain._invokeHandlers.get('step:call');
    const brief = {
      date: '2026-10-19',
      retrievedAt: '2026-10-19T00:30:00.000Z',
      events: [
        {
          title: 'ประชุมสรุปงบ',
          start: '2026-10-19T10:00:00+07:00',
          end: '2026-10-19T11:00:00+07:00',
          allDay: false,
          tentative: true,
          conflict: true,
        },
        {
          title: 'ประชุมทีม',
          start: '2026-10-19T10:30:00+07:00',
          end: '2026-10-19T11:30:00+07:00',
          allDay: false,
          conflict: true,
          location: 'ห้อง 2',
        },
      ],
      dueToday: [{ title: 'ส่งรายงาน', due: '2026-10-19', list: 'งานของฉัน' }],
      overdue: [{ title: 'เตรียมสไลด์', due: '2026-10-12', list: 'งานของฉัน' }],
      tips: [{ text: 'มีงาน {0} รายการเลยกำหนดแล้ว', args: ['1'] }],
      gaps: [],
    };
    globalThis.briefCalls = [];
    globalThis.googleConnectCalls = [];
    globalThis.googleAllowedServices = ['documents', 'calendar-read', 'calendar', 'tasks'];
    globalThis.briefFixture = {
      feature: true,
      available: true,
      enabled: true,
      time: '09:00',
      account: 'fi••••@example.test',
      tasks: true,
      rememberAllowed: true,
      remembered: false,
      due: true,
    };
    ipcMain.removeHandler('step:call');
    ipcMain.handle('step:call', async (event, method, input) => {
      if (method.startsWith('morningBrief')) globalThis.briefCalls.push([method, input]);
      if (method === 'morningBriefState') return globalThis.briefFixture;
      if (method === 'morningBriefRun') {
        if (input?.remember) globalThis.briefFixture.remembered = true;
        return (globalThis.briefFixture = { ...globalThis.briefFixture, brief });
      }
      if (method === 'morningBriefSettings') {
        if (input.remember === false) globalThis.briefFixture.remembered = false;
        if (typeof input.enabled === 'boolean') globalThis.briefFixture.enabled = input.enabled;
        if (input.time) globalThis.briefFixture.time = input.time;
        return globalThis.briefFixture;
      }
      if (method === 'morningBriefDismiss') return (globalThis.briefFixture = { ...globalThis.briefFixture, due: false, brief: undefined });
      if (method === 'vaultState') return { enabled: true, protected: false, suspended: false, entries: [], browsers: [] };
      if (method === 'googleState')
        return {
          enabled: true,
          configured: true,
          connecting: false,
          clientPreconfigured: true,
          clientSecretConfigured: true,
          services: globalThis.googleAllowedServices,
          accounts: [
            {
              id: 'fixture',
              label: 'fi••••@example.test',
              domain: 'example.test',
              services: ['calendar-read', 'calendar', 'tasks'],
              paused: false,
              reauth: false,
            },
          ],
        };
      if (method === 'googleConnect') {
        globalThis.googleConnectCalls.push(input.services);
        return true;
      }
      return original(event, method, input);
    });
  });
  await page.reload();
  const card = page.locator('.morning-brief');
  await expect(card.getByRole('heading', { name: 'สรุปเช้านี้' })).toBeVisible();
  await expect(card).toContainText('fi••••@example.test');
  await card.getByRole('checkbox', { name: 'อนุญาตทุกวัน ไม่ต้องถามอีก' }).check();
  await card.getByRole('button', { name: 'ดูสรุปวันนี้', exact: true }).click();
  await expect(card.getByText('ประชุมสรุปงบ', { exact: true })).toBeVisible();
  await expect(card.getByText('10:00–11:00', { exact: true })).toBeVisible();
  await expect(card.getByText('ยังไม่ตอบรับ', { exact: true })).toBeVisible();
  await expect(card.getByText('ชนกัน', { exact: true })).toHaveCount(2);
  await expect(card.getByText('เลยกำหนด 12/10', { exact: true })).toBeVisible();
  await expect(card.getByText('มีงาน 1 รายการเลยกำหนดแล้ว', { exact: true })).toBeVisible();
  assert.deepEqual(await app.evaluate(() => globalThis.briefCalls.find(c => c[0] === 'morningBriefRun')), [
    'morningBriefRun',
    { remember: true },
  ]);
  if (process.env.STEP_SMOKE_SHOTS) await page.screenshot({ path: join(process.env.STEP_SMOKE_SHOTS, 'morning-brief-light-1280.png') });
  // "ถาม AI ต่อ" only fills the composer; nothing is sent until the employee sends it.
  await card.getByRole('button', { name: 'ถาม AI ต่อ', exact: true }).click();
  const composer = page.getByRole('textbox').last();
  await expect(composer).toHaveValue(/ช่วยวางแผนวันนี้ให้หน่อย[\s\S]*10:00–11:00 ประชุมสรุปงบ[\s\S]*เตรียมสไลด์ \(เลยกำหนด\)/);
  await composer.fill('');
  await card.getByRole('button', { name: 'ไม่ต้องแสดงวันนี้', exact: true }).last().click();
  await expect(card).toHaveCount(0);
  // Settings show the every-day OK and can withdraw it.
  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'รหัสผ่านและการเชื่อมต่อ', exact: true }).click();
  const settings = page.locator('.morning-brief-settings');
  assert.equal(
    await settings
      .getByRole('checkbox', { name: 'แสดงสรุปเช้านี้', exact: true })
      .evaluate(el => getComputedStyle(el.closest('label')).flexDirection),
    'row',
    'the morning brief switch and its label stay together horizontally',
  );
  await expect(settings).toContainText('อนุญาตให้อ่านนัดและงานวันนี้ทุกวันแล้ว (fi••••@example.test)');
  await settings.getByRole('button', { name: 'ยกเลิกการอนุญาตทุกวัน', exact: true }).click();
  await expect(settings.getByRole('button', { name: 'ยกเลิกการอนุญาตทุกวัน', exact: true })).toHaveCount(0);
  const enabled = settings.getByRole('checkbox', { name: 'แสดงสรุปเช้านี้', exact: true });
  const time = settings.getByLabel('แสดงตั้งแต่เวลา', { exact: true });
  await enabled.click();
  await expect(enabled).not.toBeChecked();
  await expect(time).toBeDisabled();
  await enabled.click();
  await expect(enabled).toBeChecked();
  await expect(time).toBeEnabled();
  await time.fill('08:45');
  await settings.getByRole('heading', { name: 'สรุปเช้านี้', exact: true }).click();
  await expect.poll(() => app.evaluate(() => globalThis.briefFixture.time)).toBe('08:45');
  const calendar = page.locator('.google-calendar');
  const connect = page.getByRole('button', { name: 'เชื่อมบัญชีงาน', exact: true });
  await expect(calendar).toHaveCount(1);
  await expect(page.locator('.google-services .google-service')).toHaveCount(3);
  await expect(page.locator('.google-chips li'), 'legacy calendar read/write grants share one account badge').toHaveCount(2);
  await calendar.getByText('ปฏิทิน', { exact: true }).click();
  await expect(calendar.getByRole('radio', { name: 'ดูอย่างเดียว', exact: true })).toBeChecked();
  await connect.click();
  await expect.poll(() => app.evaluate(() => globalThis.googleConnectCalls.at(-1))).toEqual(['documents', 'calendar-read']);
  await calendar.getByRole('radio', { name: 'ดูและสร้างนัด', exact: true }).check();
  await connect.click();
  await expect.poll(() => app.evaluate(() => globalThis.googleConnectCalls.at(-1))).toEqual(['documents', 'calendar']);
  if (process.env.STEP_SMOKE_SHOTS) {
    await settings.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(process.env.STEP_SMOKE_SHOTS, 'morning-settings-light-1280.png') });
  }
  await page.setViewportSize({ width: 700, height: 1000 });
  const bounds = await settings.locator('.morning-brief-controls').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
  assert.ok(bounds.scroll <= bounds.width, 'morning brief controls fit a narrow window');
  if (process.env.STEP_SMOKE_SHOTS) {
    await settings.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(process.env.STEP_SMOKE_SHOTS, 'morning-settings-light-700.png') });
  }
  // A read-only organization policy never offers or sends event-write access.
  await app.evaluate(() => {
    globalThis.googleAllowedServices = ['calendar-read', 'tasks'];
  });
  await page.getByRole('button', { name: 'กลับไปที่งาน', exact: true }).click();
  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'รหัสผ่านและการเชื่อมต่อ', exact: true }).click();
  await expect(connect).toBeDisabled();
  await calendar.getByText('ปฏิทิน', { exact: true }).click();
  await expect(calendar.getByRole('radio', { name: 'ดูและสร้างนัด', exact: true })).toHaveCount(0);
  await connect.click();
  await expect.poll(() => app.evaluate(() => globalThis.googleConnectCalls.at(-1))).toEqual(['calendar-read']);
  await app.evaluate(() => {
    globalThis.googleAllowedServices = ['documents', 'calendar-read', 'calendar', 'tasks'];
  });
  await page.evaluate(async () => {
    const { settings } = await window.step.call('snapshot');
    await window.step.call('settings', { ...settings, theme: 'dark' });
  });
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'รหัสผ่านและการเชื่อมต่อ', exact: true }).click();
  await calendar.getByText('ปฏิทิน', { exact: true }).click();
  await expect(calendar.getByRole('radio', { name: 'ดูอย่างเดียว', exact: true })).toBeChecked();
  if (process.env.STEP_SMOKE_SHOTS) {
    await settings.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(process.env.STEP_SMOKE_SHOTS, 'morning-settings-dark-1280.png') });
  }
  await page.evaluate(async () => {
    const { settings } = await window.step.call('snapshot');
    await window.step.call('settings', { ...settings, language: 'en' });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Workspace settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Passwords and connections', exact: true }).click();
  await calendar.getByText('Calendar', { exact: true }).click();
  await expect(calendar.getByRole('radio', { name: 'View only', exact: true })).toBeChecked();
  await calendar.getByRole('radio', { name: 'View and create events', exact: true }).check();
  await page.getByRole('button', { name: 'Connect work account', exact: true }).click();
  await expect.poll(() => app.evaluate(() => globalThis.googleConnectCalls.at(-1))).toEqual(['documents', 'calendar']);
  assert.deepEqual(errors, []);
  console.log(
    'Morning brief smoke passed: summary consent, switch/time persistence, one Calendar card, exact read/write scopes, read-only policy, narrow/dark and English settings. Synthetic IPC only.',
  );
} finally {
  if (app) await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  clearTimeout(deadline);
}
