import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
// The loading window opens first and the workspace stays hidden behind it until its first screen is drawn.
const home = await mkdtemp(join(tmpdir(), 'step-desktop-splash-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DESKTOP_SPLASH: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  // Both windows open at startup in either order; the loading window is the one drawn from a data: URL.
  let splash;
  for (const started = Date.now(); !splash && Date.now() - started < 15000;) {
    splash = app.windows().find(w => w.url().startsWith('data:text/html'));
    if (!splash) await new Promise(done => setTimeout(done, 50));
  }
  assert.ok(splash, 'the loading window did not open');
  // The page's own start time stands in for when the window opened; a slow runner can find the window late.
  const splashOpenedAt = await splash.evaluate(() => performance.timeOrigin);
  await splash.getByRole('img', { name: 'STeP Desktop' }).waitFor();
  assert.ok((await splash.getByRole('status').textContent())?.startsWith('กำลัง'));
  const visible = () =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => ({ url: w.webContents.getURL(), visible: w.isVisible() })));
  // While the splash is up, the main window has not been shown.
  const early = await visible();
  assert.ok(
    early.filter(w => w.url.includes('index.html')).every(w => !w.visible),
    JSON.stringify(early),
  );
  // Once the workspace has drawn, only the main window remains, visible and on its first screen.
  const deadline = Date.now() + 30000;
  let windows = early;
  while (Date.now() < deadline) {
    windows = await visible();
    if (windows.length === 1 && windows[0].visible) break;
    await new Promise(done => setTimeout(done, 200));
  }
  assert.equal(windows.length, 1, JSON.stringify(windows));
  // The loading window stays up for at least 5 seconds from when it opened.
  const shownFor = Math.round(Date.now() - splashOpenedAt);
  assert.ok(shownFor >= 4800, `the loading window closed after ${shownFor} ms`);
  assert.ok(windows[0].visible && windows[0].url.includes('index.html'), JSON.stringify(windows));
  const page = app.windows().find(w => w.url().includes('index.html'));
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor({ timeout: 5000 });
  // A transient snapshot failure can recover without losing local history or replaying a provider operation.
  const retained = await page.evaluate(async () => {
    const snapshot = await window.step.call('snapshot');
    await window.step.call('settings', { ...snapshot.settings, onboarding: true, tourDone: true, whatsNewSeen: '999.0.0' });
    const connection = await window.step.call('connection', { provider: 'openai', mode: 'subscription', model: '' });
    return window.step.call('create', { connectionId: connection.id, project: 'Synthetic retained task' });
  });
  await app.evaluate(({ ipcMain }) => {
    const handler = ipcMain._invokeHandlers.get('step:call');
    let failures = 2;
    globalThis.startupProviderCalls = 0;
    ipcMain._invokeHandlers.set('step:call', (event, method, raw) => {
      if (method === 'send' || method === 'connect') globalThis.startupProviderCalls++;
      if (method === 'snapshot' && failures-- > 0) throw new Error('SYNTHETIC_TRANSIENT_STARTUP_FAILURE');
      return handler(event, method, raw);
    });
  });
  await page.reload();
  const retry = page.getByRole('button', { name: 'ลองเปิดอีกครั้ง', exact: true });
  await expect(retry).toBeVisible();
  await expect(page.locator('.browser-message .spin')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('ยังเปิดพื้นที่ทำงานไม่ได้');
  await retry.click();
  await expect(retry).toBeEnabled();
  await expect(page.getByRole('alert')).toBeVisible();
  await retry.click();
  await expect(page.locator('.composer textarea')).toBeVisible();
  const recovered = await page.evaluate(() => window.step.call('snapshot'));
  assert.ok(recovered.sessions.some(s => s.id === retained.id));
  assert.equal(await app.evaluate(() => globalThis.startupProviderCalls), 0);
  await expect(page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' })).toHaveCount(0);
  console.log('splash smoke passed, including startup failure/retry/history recovery without provider replay');
} finally {
  await app.close();
}
