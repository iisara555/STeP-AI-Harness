// Employee connection flow through the real renderer/preload, with synthetic account IPC.
// No browser login, credentials, or provider quota is used.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-account-smoke-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_CLAUDE_SUBSCRIPTION: '0' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'การเชื่อมต่อ AI' }).click();
  await expect(page.getByLabel('API key', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: /วิธีเชื่อมต่อ/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /แพ็กเกจของคุณผ่าน Claude Code/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Gemini', exact: true })).toHaveCount(0);
  // Switching back from administrator settings discards API credentials and billing mode.
  await page.getByRole('button', { name: 'ตั้งค่าขั้นสูงสำหรับผู้ดูแล' }).click();
  await page.getByRole('combobox', { name: /ผู้ให้บริการ/ }).selectOption('gemini');
  await page.getByLabel('API key', { exact: true }).fill('synthetic-only');
  await page.getByRole('button', { name: 'กลับไปเลือกบริการ' }).click();
  const snapshot = await page.evaluate(() => window.step.call('snapshot'));
  await app.evaluate(
    ({ ipcMain }, snapshot) => {
      globalThis.accountCalls = [];
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
          await new Promise(resolve => setTimeout(resolve, 200));
          Object.assign(snapshot.connections[0], { ready: true, signedIn: true, note: 'บัญชีทดสอบพร้อมใช้งาน' });
          return snapshot.connections[0];
        }
        throw new Error(`Unexpected synthetic IPC: ${method}`);
      });
    },
    { ...snapshot, connections: [] },
  );
  await page.getByRole('button', { name: 'เชื่อมต่อ ChatGPT', exact: true }).click();
  await expect(page.getByText('บัญชีทดสอบพร้อมใช้งาน', { exact: true })).toBeVisible();
  const calls = await app.evaluate(() => globalThis.accountCalls);
  assert.deepEqual(
    calls.filter(c => ['connection', 'connect'].includes(c.method)).map(c => c.method),
    ['connection', 'connect'],
  );
  const choice = calls.find(c => c.method === 'connection').input;
  assert.equal(choice.provider, 'openai');
  assert.equal(choice.mode, 'subscription');
  assert.equal(choice.apiKey, '');
  console.log('Employee account smoke passed: simple sign-in, automatic connect, advanced credential reset; synthetic IPC only.');
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
