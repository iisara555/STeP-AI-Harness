import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: resolve('release/win-unpacked/STeP Desktop.exe'), env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.locator('.app').waitFor();
  const snapshot = await page.evaluate(() => window.step.call('snapshot'));
  assert.equal(snapshot.teams.length, 22);
  assert.ok(await page.locator('.topbar').isVisible());
  console.log('Packaged Windows app started and loaded all 22 teams via IPC. No provider calls.');
} finally {
  await app.close();
}
