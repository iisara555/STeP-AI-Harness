// Renderer recovery actions; no real downloads, browser launches or installs.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-update-recovery-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง', exact: true }).click();
  await expect(page.locator('.profile .version-line')).toBeVisible();
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    globalThis.updateCalls = [];
    ipcMain.removeHandler('step:call');
    ipcMain.handle('step:call', async (_event, method) => {
      globalThis.updateCalls.push(method);
      if (method === 'updateCheck') {
        // Exercise delayed IPC: a click can finish before its update event arrives.
        await new Promise(resolve => setTimeout(resolve, 100));
        const update = { status: 'downloading', current: '0.5.23', version: '0.5.24', percent: 20 };
        BrowserWindow.getAllWindows()[0].webContents.send('step:event', { sessionId: '', type: 'update', update });
        return update;
      }
      if (method === 'updateInstall' || method === 'updateDownload') return;
      throw new Error(`Unexpected synthetic IPC: ${method}`);
    });
  });
  const send = update =>
    app.evaluate(
      ({ BrowserWindow }, update) => {
        BrowserWindow.getAllWindows()[0].webContents.send('step:event', { sessionId: '', type: 'update', update });
      },
      { current: '0.5.23', version: '0.5.24', ...update },
    );
  const card = page.locator('.update-card');
  await send({ status: 'error', reason: 'UPDATE_DOWNLOAD_FAILED' });
  await expect(card.getByText('อัปเดตยังไม่สำเร็จ', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: /ดาวน์โหลดเวอร์ชัน/ })).toHaveCount(0);
  await card.getByRole('button', { name: 'ลองอัปเดตอีกครั้ง', exact: true }).click();
  await expect(card).toContainText('กำลังดาวน์โหลดเวอร์ชัน 0.5.24');
  await send({ status: 'ready' });
  await card.getByRole('button', { name: 'รีสตาร์ทเพื่ออัปเดต', exact: true }).click();
  await send({ status: 'manual', reason: 'UPDATE_NOT_REPLACEABLE' });
  await expect(card).toContainText('ย้ายแอปออกจาก DMG');
  await card.getByRole('button', { name: 'ลองอัปเดตอีกครั้ง', exact: true }).click();
  // Finish this request before injecting another state; otherwise its late
  // downloading event can overwrite manual and disable the version-line button.
  await expect(card).toContainText('กำลังดาวน์โหลดเวอร์ชัน 0.5.24');
  await send({ status: 'manual', reason: 'UPDATE_NOT_REPLACEABLE' });
  await expect(card).toContainText('ย้ายแอปออกจาก DMG');
  await page.locator('.profile .version-line').click();
  await expect(card).toContainText('กำลังดาวน์โหลดเวอร์ชัน 0.5.24');
  assert.deepEqual(await app.evaluate(() => globalThis.updateCalls), ['updateCheck', 'updateInstall', 'updateCheck', 'updateCheck']);
  console.log(
    'Update recovery smoke passed: failure retries in-app, restart uses installer, permission fallback explains relocation and allows retry; synthetic IPC only.',
  );
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
