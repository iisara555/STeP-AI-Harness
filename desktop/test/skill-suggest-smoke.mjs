// "ลองใช้ Skill": a Skill that clearly fits what is typed is offered above the composer and is used only when pressed.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'step-skill-suggest-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const shots = process.env.STEP_SHOTS;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor();
  await page.evaluate(async () => {
    const snapshot = await window.step.call('snapshot');
    await window.step.call('settings', { ...snapshot.settings, onboarding: true, tourDone: true, whatsNewSeen: '999.0.0', team: 'ga' });
  });
  await page.reload();
  const composer = page.locator('.composer textarea');
  await composer.waitFor();
  const suggestion = page.locator('.skill-suggestion');

  // An ordinary question gets no suggestion.
  await composer.fill('วันนี้อากาศที่เชียงใหม่เป็นอย่างไรบ้าง');
  await page.waitForTimeout(1200);
  await expect(suggestion).toHaveCount(0);

  await composer.fill('ช่วยตรวจหนังสือราชการฉบับนี้ให้ถูกระเบียบงานสารบรรณ');
  const offer = suggestion.getByRole('button', { name: /^ลองใช้ Skill: / });
  await expect(offer).toBeVisible();
  const label = await offer.textContent();
  if (shots) await page.screenshot({ path: join(shots, 'suggest-light-1440.png') });
  // Nothing is chosen until the button is pressed.
  await expect(page.locator('.skill-chip:not(.skill-suggestion)')).toHaveCount(0);
  await offer.click();
  const chosen = page.locator('.skill-chip:not(.skill-suggestion)');
  await expect(chosen).toContainText(label.replace('ลองใช้ Skill: ', ''));
  await expect(suggestion).toHaveCount(0);
  await expect(composer).toHaveValue('ช่วยตรวจหนังสือราชการฉบับนี้ให้ถูกระเบียบงานสารบรรณ');
  if (shots) {
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.screenshot({ path: join(shots, 'suggest-chosen-dark-1440.png') });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  }
  await chosen.getByRole('button', { name: 'เลิกใช้ Skill นี้' }).click();

  // Waved away: the same Skill is not offered again in this window.
  await composer.fill('ช่วยตรวจหนังสือราชการฉบับนี้ให้ถูกระเบียบงานสารบรรณอีกฉบับ');
  await expect(offer).toBeVisible();
  await suggestion.getByRole('button', { name: 'ไม่ใช้ Skill ที่แนะนำ' }).click();
  await expect(suggestion).toHaveCount(0);
  await composer.fill('ช่วยตรวจหนังสือราชการฉบับที่สามให้ถูกระเบียบงานสารบรรณ');
  await page.waitForTimeout(1200);
  await expect(suggestion).toHaveCount(0);

  // The host refuses to suggest when the text is too short.
  assert.equal(await page.evaluate(() => window.step.call('skillSuggest', { text: 'ตรวจ' })), null);
  console.log('skill suggestion smoke passed');
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true });
}
