// Shared two-step flow in first-run setup; isolated profile and synthetic IPC only.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-setup-connect-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_CLAUDE_SUBSCRIPTION: '0' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 800, height: 650 });
  await page.getByRole('button', { name: 'เริ่มตั้งค่า', exact: true }).click();
  const wizard = page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' });
  await expect(wizard.getByRole('heading', { name: 'เลือก AI และเชื่อมต่อ', exact: true })).toBeVisible();
  await expect(wizard.getByRole('heading', { name: 'ตรวจว่าพร้อมใช้งาน', exact: true })).toBeVisible();
  await expect(wizard.getByRole('radio', { name: /Gemini via Antigravity/ })).toHaveAttribute('aria-checked', 'true');
  const connect = wizard.getByRole('button', { name: 'เชื่อมต่อ Antigravity', exact: true });
  await expect(connect).toBeVisible();
  await mkdir('release/qa/connect-ai', { recursive: true });
  await page.screenshot({ path: 'release/qa/connect-ai/wizard-layout-check.png' });
  const bounds = await connect.boundingBox();
  assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 650, JSON.stringify(bounds));
  assert.ok(
    await connect.evaluate(el => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }),
    'connect action must not be covered by the wizard footer',
  );
  await mkdir('release/qa/connect-ai', { recursive: true });
  await page.screenshot({ path: 'release/qa/connect-ai/wizard-new-user.png' });
  const snapshot = await page.evaluate(() => window.step.call('snapshot'));
  await app.evaluate(({ ipcMain }, snapshot) => {
    globalThis.setupCalls = [];
    ipcMain.removeHandler('step:call');
    ipcMain.handle('step:call', async (_event, method, input) => {
      globalThis.setupCalls.push({ method, input });
      if (method === 'snapshot') return snapshot;
      if (method === 'connection') {
        const c = {
          id: 'synthetic-agy',
          provider: input.provider,
          mode: input.mode,
          model: input.model,
          ready: false,
          note: 'ยังไม่พร้อม',
        };
        snapshot.connections.push(c);
        return c;
      }
      if (method === 'connect') {
        await new Promise(resolve => {
          globalThis.finishSetupConnect = resolve;
        });
        Object.assign(snapshot.connections[0], { signedIn: true, ready: true, note: 'บัญชีทดสอบพร้อมใช้งาน' });
        return snapshot.connections[0];
      }
      throw new Error(`Unexpected synthetic IPC: ${method}`);
    });
  }, snapshot);
  await connect.click();
  await expect(wizard.getByRole('button', { name: 'ทำภายหลัง', exact: true })).toBeDisabled();
  await expect(wizard.getByRole('button', { name: 'ยกเลิก', exact: true })).toBeVisible();
  await app.evaluate(() => globalThis.finishSetupConnect());
  await expect(wizard.getByText('ทดสอบผ่าน · พร้อมใช้งาน', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'release/qa/connect-ai/wizard-ready.png' });
  const calls = await app.evaluate(() => globalThis.setupCalls);
  assert.deepEqual(
    calls.filter(c => ['connection', 'connect'].includes(c.method)).map(c => c.method),
    ['connection', 'connect'],
  );
  assert.equal(calls.find(c => c.method === 'connection').input.provider, 'antigravity');
  await wizard.getByRole('button', { name: 'ถัดไป', exact: true }).click();
  await expect(wizard.getByRole('heading', { level: 1 })).toHaveText('พร้อมเริ่มงานแล้ว');
  await expect(wizard.getByRole('button', { name: 'เริ่มใช้งานเลย', exact: true })).toBeDisabled();
  console.log(
    'Setup connect smoke passed: recommended Antigravity, visible small-window connect, automatic test, busy navigation, readiness and preserved terms gate; synthetic IPC only.',
  );
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
