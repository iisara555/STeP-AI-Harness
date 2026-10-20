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
  // A new user sees only the picker; the account list appears once there is an account.
  await expect(page.getByRole('heading', { name: 'บัญชี AI ของคุณ', exact: true })).toHaveCount(0);
  await mkdir('release/qa/connect-ai', { recursive: true });
  await page.screenshot({ path: 'release/qa/connect-ai/new-user.png' });
  await expect(page.getByRole('radio', { name: /Gemini ผ่าน Antigravity/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: /Gemini ผ่าน Antigravity/ })).toContainText('แนะนำ');
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
      globalThis.accountSnapshot = snapshot;
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
          if (globalThis.expireNext) {
            globalThis.expireNext = false;
            Object.assign(snapshot.connections[0], {
              ready: false,
              signedIn: undefined,
              problem: 'LOGIN_REQUIRED',
              note: 'การลงชื่อเข้าใช้หมดอายุ กดลงชื่อใหม่',
            });
            return snapshot.connections[0];
          }
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
        if (method === 'disconnect') return snapshot.connections[0];
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
  await expect(page.getByRole('heading', { name: 'บัญชี AI ของคุณ', exact: true })).toBeVisible();
  await expect(page.locator('.connection-state')).toHaveText('ลงชื่อแล้ว แต่ทดสอบไม่ผ่าน');
  // One footer label on every Settings tab; it becomes the primary button only once an account is ready.
  await expect(page.getByRole('button', { name: 'กลับไปที่งาน', exact: true })).toHaveClass(/quiet/);
  await page.screenshot({ path: 'release/qa/connect-ai/test-failed.png' });
  await page.getByRole('button', { name: 'ทดสอบใช้งาน', exact: true }).click();
  await expect(page.getByRole('button', { name: 'กำลังเชื่อมต่อและทดสอบ…', exact: true })).toBeDisabled();
  await app.evaluate(() => globalThis.finishConnect());
  await expect(page.getByText('บัญชีทดสอบพร้อมใช้งาน', { exact: true })).toBeVisible();
  await expect(page.locator('.connection-state')).toHaveText('พร้อมใช้งาน');
  await expect(page.locator('.connection-card')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByRole('button', { name: 'กลับไปที่งาน', exact: true })).not.toHaveClass(/quiet/);
  await expect(page.getByRole('combobox', { name: 'โมเดลสำหรับงานใหม่' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'ลบบัญชีนี้', exact: true })).toBeHidden();

  const capabilities = page.locator('.ai-connect-step .ai-capabilities');
  await capabilities.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(capabilities.locator('[data-capability="chat"]')).toContainText('ผ่านการทดสอบข้อความสั้นแล้ว');
  await expect(capabilities.locator('[data-capability="web"] .ai-capability-state')).toHaveText('ใช้ได้');
  await expect(capabilities.locator('[data-capability="image"]')).toContainText('OAuth อย่างเดียวใช้ไม่ได้');
  const organization = page.locator('.ai-organization-capabilities');
  await organization.locator('summary').click();
  await expect(organization.locator('[data-capability="routing"] .ai-capability-state')).toHaveText('ใช้ได้');
  await expect(organization.locator('[data-capability="routing"]')).toContainText('AI ค้นหาและเลือก Skill');
  await expect(organization.locator('[data-capability="mcp"] .ai-capability-state')).toHaveText('ยังใช้ไม่ได้');
  await page.screenshot({ path: 'release/qa/connect-ai/ready.png' });
  await page.getByText('โมเดลและการจัดการบัญชี', { exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'โมเดลสำหรับงานใหม่' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ลบบัญชีนี้', exact: true })).toBeVisible();
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

  // Changing the effective policy must refresh the capability display; no provider call is used.
  await app.evaluate(() => {
    globalThis.accountSnapshot.policy.features.toolLoop = false;
  });
  await page.getByRole('button', { name: 'ทดสอบอีกครั้ง', exact: true }).click();
  await app.evaluate(() => globalThis.finishConnect());
  await expect(capabilities.locator('[data-capability="web"] .ai-capability-state')).toHaveText('ยังใช้ไม่ได้');
  await expect(capabilities.locator('[data-capability="web"]')).toContainText('ติดต่อ IT');
  // An expired sign-in shows as one plain status with one button that signs in again from a clean state.
  await app.evaluate(() => {
    globalThis.expireNext = true;
  });
  await page.getByRole('button', { name: 'ทดสอบอีกครั้ง', exact: true }).click();
  await app.evaluate(() => globalThis.finishConnect());
  await expect(page.locator('.connection-state')).toHaveText('ต้องลงชื่อใหม่');
  await expect(page.locator('.connection-card')).toHaveAttribute('data-state', 'attention');
  await page.screenshot({ path: 'release/qa/connect-ai/sign-in-expired.png' });
  const before = (await app.evaluate(() => globalThis.accountCalls)).length;
  await page.getByRole('button', { name: 'ลงชื่อใหม่', exact: true }).click();
  await expect(page.getByRole('button', { name: 'กำลังเชื่อมต่อและทดสอบ…', exact: true })).toBeDisabled();
  await app.evaluate(() => globalThis.finishConnect());
  await expect(page.locator('.connection-state')).toHaveText('พร้อมใช้งาน');
  assert.deepEqual(
    (await app.evaluate(() => globalThis.accountCalls))
      .slice(before)
      .map(c => c.method)
      .filter(m => ['disconnect', 'connect'].includes(m)),
    ['disconnect', 'connect'],
  );
  await page.getByRole('button', { name: 'กลับไปที่งาน', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'การเชื่อมต่อ AI' })).toHaveCount(0);
  console.log(
    'Employee account smoke passed: guided connection, busy state, signed-in/test-failed recovery without duplicate account, expired sign-in with one-click sign-in again, readiness, collapsed management, narrow dark layout; synthetic IPC only.',
  );
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
