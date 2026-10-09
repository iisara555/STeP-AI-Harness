import { _electron as electron } from '@playwright/test';
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
  const splashSeenAt = Date.now();
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
  // The loading window stays up for at least 5 seconds from when it opened (it was found a little after that).
  assert.ok(Date.now() - splashSeenAt >= 4500, `the loading window closed after ${Date.now() - splashSeenAt} ms`);
  assert.ok(windows[0].visible && windows[0].url.includes('index.html'), JSON.stringify(windows));
  const page = app.windows().find(w => w.url().includes('index.html'));
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor({ timeout: 5000 });
  console.log('splash smoke passed');
} finally {
  await app.close();
}
