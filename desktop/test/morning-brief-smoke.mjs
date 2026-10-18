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
          services: ['calendar-read', 'tasks'],
          accounts: [
            {
              id: 'fixture',
              label: 'fi••••@example.test',
              domain: 'example.test',
              services: ['calendar-read', 'tasks'],
              paused: false,
              reauth: false,
            },
          ],
        };
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
  await expect(settings).toContainText('อนุญาตให้อ่านนัดและงานวันนี้ทุกวันแล้ว (fi••••@example.test)');
  await settings.getByRole('button', { name: 'ยกเลิกการอนุญาตทุกวัน', exact: true }).click();
  await expect(settings.getByRole('button', { name: 'ยกเลิกการอนุญาตทุกวัน', exact: true })).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    'Morning brief smoke passed: card, one consent with every-day option, summary, ask AI into the composer, dismiss and revoke. Synthetic IPC only.',
  );
} finally {
  if (app) await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  clearTimeout(deadline);
}
