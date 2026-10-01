// English UI smoke: switch language from the first wizard step, use the app in English, then switch back to Thai
// from Settings. Uses an isolated profile and never calls a provider. Pass a folder to also save screenshots.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-i18n-'));
const shots = process.argv[2];
if (shots) await mkdir(shots, { recursive: true });
const shot = async (page, name) => shots && (await page.screenshot({ path: join(shots, name) }));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 820 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor();
  await page.getByRole('radio', { name: 'English', exact: true }).click();
  const wizard = page.getByRole('dialog', { name: 'STeP Desktop setup' });
  await expect(wizard.getByRole('heading', { name: 'Welcome to STeP Desktop' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await shot(page, 'en-wizard.png');
  await page.getByRole('button', { name: 'Skip, set up later', exact: true }).click();
  await wizard.waitFor({ state: 'detached' });

  // Welcome copy, trust points and starters follow the language; Thai text from the code must not leak.
  await expect(page.getByRole('heading', { name: /Let AI do the heavy drafting/ })).toBeVisible();
  await expect(page.locator('.welcome-trust')).toContainText('AI drafts; people review and approve');
  await expect(page.locator('.suggestions button')).toHaveCount(3);
  const starter = (await page.locator('.suggestions button').first().innerText()).trim();
  assert.doesNotMatch(starter, /[฀-๿]/, starter);
  await page.locator('.suggestions button').first().click();
  assert.equal(await page.locator('.composer textarea').inputValue(), starter.split('\n').pop());
  await expect(page.getByRole('button', { name: 'New task' }).first()).toBeVisible();
  await expect(page.locator('.statusbar')).toContainText('No AI connected');
  const visible = await page.locator('main, .sidebar, .statusbar').allInnerTexts();
  const thai = visible.join('\n').match(/[฀-๿][^\n]*/g) || [];
  assert.deepEqual(thai, [], 'visible Thai text in English mode');
  await shot(page, 'en-welcome.png');

  // Team-specific starters use the manifest's English team name.
  await page.evaluate(async () => {
    const s = (await window.step.call('snapshot')).settings;
    await window.step.call('settings', { assistant: s.assistant, team: 'qs', theme: s.theme });
  });
  await page.reload();
  await expect(page.locator('.suggestions-label')).toContainText('First tasks for Quality System');
  await expect(page.locator('.suggestions')).toContainText('ISO 9001 internal audit checklist');
  await shot(page, 'en-welcome-qs.png');

  await page.getByRole('button', { name: 'Workspace settings' }).click();
  await page.getByRole('tab', { name: 'Appearance & language' }).click();
  await shot(page, 'en-settings.png');
  await page.getByRole('radio', { name: 'ไทย', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'รูปลักษณ์และภาษา' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  const saved = await page.evaluate(() => window.step.call('snapshot'));
  assert.equal(saved.settings.language, 'th');
  assert.equal(saved.settings.team, 'qs', 'switching language keeps other settings');
  assert.deepEqual(errors, []);
  console.log('English UI smoke passed: wizard switch, English welcome and starters, team names, and switching back to Thai.');
} finally {
  await app.close().catch(() => {});
  await rm(home, { recursive: true, force: true }).catch(() => {});
}
