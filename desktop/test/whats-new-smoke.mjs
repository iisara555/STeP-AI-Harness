// "What's new": a new install never sees it; a profile from an older version sees this version's notes once, and the
// command palette opens them again. Uses an isolated profile and never calls a provider.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-whats-new-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const version = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../package.json', import.meta.url))).version;
const launch = async () => {
  const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1100, height: 760 });
  return { app, page };
};
try {
  let { app, page } = await launch();
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง', exact: true }).click();
  await expect(page.getByRole('button', { name: 'เริ่มงานใหม่' }).first()).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'มีอะไรใหม่' })).toHaveCount(0);
  await app.close();

  // The same profile as if it was last used before this version.
  const db = new DatabaseSync(join(home, 'workspace.sqlite'));
  const row = db.prepare("SELECT value FROM records WHERE kind='settings' AND id='main'").get();
  const settings = JSON.parse(String(row.value));
  assert.equal(settings.whatsNewSeen, version, 'a new install starts from its own version');
  delete settings.whatsNewSeen;
  db.prepare("UPDATE records SET value=? WHERE kind='settings' AND id='main'").run(JSON.stringify(settings));
  db.close();

  ({ app, page } = await launch());
  const dialog = page.getByRole('dialog', { name: 'มีอะไรใหม่' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: `STeP Desktop รุ่น ${version}` })).toBeVisible();
  await expect(dialog.locator('li').first()).not.toBeEmpty();
  if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
  await dialog.getByRole('button', { name: 'รับทราบ', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await app.close();

  ({ app, page } = await launch());
  await expect(page.getByRole('button', { name: 'เริ่มงานใหม่' }).first()).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('dialog', { name: 'มีอะไรใหม่' })).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+k');
  await page
    .getByRole('dialog', { name: 'คำสั่ง' })
    .getByRole('option', { name: /มีอะไรใหม่ในรุ่นนี้/ })
    .click();
  await expect(page.getByRole('dialog', { name: 'มีอะไรใหม่' })).toBeVisible();
  await app.close();
  console.log('whats-new smoke passed');
} finally {
  await rm(home, { recursive: true, force: true });
}
