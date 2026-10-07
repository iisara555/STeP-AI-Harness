// Employee connection flow through the real renderer/preload, with synthetic account IPC.
// No browser login, credentials, or provider quota is used.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-account-smoke-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_CLAUDE_SUBSCRIPTION: '0' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'การเชื่อมต่อ AI' }).click();
  await expect(page.getByRole('heading', { name: 'เลือก AI และเชื่อมต่อ', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ตรวจว่าพร้อมใช้งาน', exact: true })).toBeVisible();
  await expect(page.getByText('เชื่อมต่อก่อน แล้วระบบจะทดสอบให้โดยอัตโนมัติ', { exact: true })).toBeVisible();
  await mkdir('release/qa/connect-ai', { recursive: true });
  await page.screenshot({ path: 'release/qa/connect-ai/new-user.png' });
  await expect(page.getByRole('radio', { name: /Gemini via Antigravity/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: /Gemini via Antigravity/ })).toContainText('แนะนำ');
  await expect(page.getByLabel('API key', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: /วิธีเชื่อมต่อ/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /แพ็กเกจของคุณผ่าน Claude Code/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Gemini', exact: true })).toHaveCount(0);
  // Switching back from administrator settings discards API credentials and billing mode.
  await page.getByRole('button', { name: 'ตั้งค่าขั้นสูงสำหรับผู้ดูแล' }).click();
  await page.getByRole('combobox', { name: /ผู้ให้บริการ/ }).selectOption('gemini');
  await page.getByLabel('API key', { exact: true }).fill('synthetic-only');
  await page.getByRole('button', { name: 'กลับไปเลือกบริการ' }).click();
  await page.getByRole('radio', { name: /^ChatGPT/ }).click();
  const snapshot = await page.evaluate(() => window.step.call('snapshot'));
  await app.evaluate(
    ({ ipcMain }, snapshot) => {
      globalThis.accountCalls = [];
      globalThis.connectAttempts = 0;
      ipcMain.removeHandler('step:call');
      ipcMain.handle('step:call', async (_event, method, input) => {
        globalThis.accountCalls.push({ method, input });
        if (method === 'snapshot') return snapshot;
        if (method === 'connection') {
          const connection = {
            id: 'synthetic-account',
            provider: input.provider,
            mode: input.mode,
            ready: false,
            model: '',
            note: 'กำลังเชื่อมต่อ',
          };
          snapshot.connections.push(connection);
          return connection;
        }
        if (method === 'connect') {
          globalThis.connectAttempts++;
          await new Promise(resolve => {
            globalThis.finishConnect = resolve;
          });
          Object.assign(
            snapshot.connections[0],
            globalThis.connectAttempts === 1
              ? { ready: false, signedIn: true, note: 'ทดสอบไม่สำเร็จ · ตรวจอินเทอร์เน็ตแล้วลองใหม่' }
              : {
                  ready: true,
                  signedIn: true,
                  note: 'บัญชีทดสอบพร้อมใช้งาน',
                  models: [{ id: 'synthetic-model', label: 'Synthetic model' }],
                },
          );
          return snapshot.connections[0];
        }
        throw new Error(`Unexpected synthetic IPC: ${method}`);
      });
    },
    { ...snapshot, connections: [] },
  );
  await page.getByRole('button', { name: 'เชื่อมต่อ ChatGPT', exact: true }).click();
  await expect(page.getByRole('button', { name: 'ยกเลิก', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'ทั่วไป', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'กำลังเชื่อมต่อและทดสอบ…', exact: true })).toBeDisabled();
  await app.evaluate(() => globalThis.finishConnect());
  await expect(page.getByText('ลงชื่อแล้ว แต่ยังไม่พร้อมใช้งาน', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'เริ่มใช้งาน', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'release/qa/connect-ai/test-failed.png' });
  await page.getByRole('button', { name: 'ทดสอบใช้งาน', exact: true }).click();
  await expect(page.getByRole('button', { name: 'กำลังเชื่อมต่อและทดสอบ…', exact: true })).toBeDisabled();
  await app.evaluate(() => globalThis.finishConnect());
  await expect(page.getByText('บัญชีทดสอบพร้อมใช้งาน', { exact: true })).toBeVisible();
  await expect(page.getByText('ทดสอบผ่าน · พร้อมใช้งาน', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'เริ่มใช้งาน', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'โมเดลเริ่มต้นสำหรับงานใหม่' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'ลบ', exact: true })).toBeHidden();
  await page.screenshot({ path: 'release/qa/connect-ai/ready.png' });
  await page.getByText('โมเดลและการจัดการบัญชี', { exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'โมเดลเริ่มต้นสำหรับงานใหม่' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ลบ', exact: true })).toBeVisible();
  await page.getByText('โมเดลและการจัดการบัญชี', { exact: true }).click();
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await page.setViewportSize({ width: 820, height: 650 });
  await page.screenshot({ path: 'release/qa/connect-ai/ready-narrow-dark.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  const calls = await app.evaluate(() => globalThis.accountCalls);
  assert.deepEqual(
    calls.filter(c => ['connection', 'connect'].includes(c.method)).map(c => c.method),
    ['connection', 'connect', 'connect'],
  );
  const choice = calls.find(c => c.method === 'connection').input;
  assert.equal(choice.provider, 'openai');
  assert.equal(choice.mode, 'subscription');
  assert.equal(choice.apiKey, '');
  await page.getByRole('button', { name: 'เริ่มใช้งาน', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'การเชื่อมต่อ AI' })).toHaveCount(0);
  console.log(
    'Employee account smoke passed: guided connection, busy state, signed-in/test-failed recovery without duplicate account, readiness, collapsed management, narrow dark layout; synthetic IPC only.',
  );
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
