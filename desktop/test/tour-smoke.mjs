// The welcome tour, walked the way a new staff member would: opened from the welcome screen, through the basics to the
// checkpoint, on into the work tools, and closed. Uses an isolated profile and never calls a provider. Pass a folder to
// save a screenshot of every step, and "dark" to run in the dark theme.
import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const [shots, theme = 'light'] = process.argv.slice(2);
const home = await mkdtemp(join(tmpdir(), 'step-tour-')),
  workspace = join(home, 'work');
await mkdir(workspace);
const seed = tourDone => {
  const db = new DatabaseSync(join(home, 'workspace.sqlite'));
  db.exec('CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
  db.prepare('INSERT OR REPLACE INTO records VALUES(?,?,?)').run(
    'settings',
    'main',
    JSON.stringify({
      userName: 'สมใจ',
      team: 'cc',
      assistant: 'STeP Mate',
      workspace,
      theme,
      onboarding: true,
      whatsNewSeen: '999.0.0',
      tourDone,
      consentedAt: new Date().toISOString(),
      termsVersion: '2026-10-02',
    }),
  );
  db.close();
};
seed(false);
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const launch = async () => {
  const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 820 });
  return { app, page };
};
try {
  let { app, page } = await launch();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // A new person is offered the tour on the welcome screen.
  await page.getByRole('button', { name: 'ใช้ครั้งแรก? ดูทัวร์แนะนำการใช้งาน' }).click();
  const tour = page.locator('.tour[role="dialog"]');
  await expect(tour).toBeVisible();
  const total = Number((await tour.getAttribute('aria-label')).match(/จาก (\d+)/)[1]);
  assert.ok(total >= 12, `the tour covers the main features (${total} steps)`);
  const seen = [];
  for (let i = 1; i <= total; i++) {
    await expect(tour).toHaveAttribute('aria-label', new RegExp(`^ทัวร์แนะนำ ${i} จาก ${total}:`));
    const title = await tour.locator('h2').innerText();
    seen.push(`${i}. ${title}${(await page.locator('.tour-spot').count()) ? '' : ' (กลางจอ)'}`);
    // The card always stays fully on screen.
    const box = await tour.locator('.tour-card').boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1280 && box.y + box.height <= 820, `step ${i} card is on screen`);
    await page.waitForTimeout(250);
    if (shots) await page.screenshot({ path: join(shots, `tour-${theme}-${String(i).padStart(2, '0')}.png`) });
    const checkpoint = await tour.getByRole('button', { name: 'ดูเครื่องมือต่อ' }).count();
    if (checkpoint) {
      await expect(tour.getByRole('button', { name: 'เริ่มใช้งานเลย' })).toBeVisible();
      await expect(tour.locator('.tour-checkpoint')).toBeVisible();
    }
    if (i < total) await tour.getByRole('button', { name: checkpoint ? 'ดูเครื่องมือต่อ' : i === 1 ? 'เริ่มทัวร์' : 'ถัดไป' }).click();
  }
  console.log(seen.join('\n'));
  // Back works, then the last step closes the tour and it is remembered.
  await page.keyboard.press('ArrowLeft');
  await expect(tour).toHaveAttribute('aria-label', new RegExp(`^ทัวร์แนะนำ ${total - 1} จาก`));
  await page.keyboard.press('ArrowRight');
  await tour.getByRole('button', { name: 'เริ่มใช้งาน', exact: true }).click();
  await expect(tour).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ใช้ครั้งแรก? ดูทัวร์แนะนำการใช้งาน' })).toHaveCount(0);
  // The command palette replays it, and stopping at the checkpoint ends it.
  await page.keyboard.press('ControlOrMeta+k');
  await page
    .getByRole('dialog', { name: 'คำสั่ง' })
    .getByRole('option', { name: /ดูทัวร์แนะนำอีกครั้ง/ })
    .click();
  await expect(tour).toBeVisible();
  while (!(await tour.getByRole('button', { name: 'เริ่มใช้งานเลย' }).count())) await page.keyboard.press('ArrowRight');
  await tour.getByRole('button', { name: 'เริ่มใช้งานเลย' }).click();
  await expect(tour).toHaveCount(0);
  assert.deepEqual(errors, []);
  await app.close();
  console.log('tour smoke passed');
} finally {
  await rm(home, { recursive: true, force: true });
}
