// Speaking styles in Settings > Appearance & language: one picker holds the four First Run presets and the documented
// styles (src/speaking-styles.ts), so nothing a person picked before goes missing. Uses an isolated profile and never
// calls a provider. Pass a folder to also save a screenshot.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-speaking-styles-'));
const shots = process.argv[2];
if (shots) await mkdir(shots, { recursive: true });
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
const settings = async page => (await page.evaluate(() => window.step.call('snapshot'))).settings;
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor();
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง', exact: true }).click();

  const open = async () => {
    await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
    await page.getByRole('tab', { name: 'รูปลักษณ์และภาษา' }).click();
    return page.getByRole('radiogroup', { name: 'สไตล์การพูดของผู้ช่วย' });
  };
  let picker = await open();
  const names = (await picker.getByRole('radio').allInnerTexts()).map(text => text.split('\n')[0].trim());
  assert.deepEqual(names, ['เพื่อนร่วมงาน', 'มืออาชีพ', 'กระชับ', 'กำหนดเอง', 'Witty', 'Ob-Oon']);
  await expect(picker.getByRole('radio', { name: /เพื่อนร่วมงาน/ })).toHaveAttribute('aria-checked', 'true');
  if (shots) await page.screenshot({ path: join(shots, 'speaking-styles.png'), fullPage: true });

  // A preset is saved as the conversation style; custom asks for the wording.
  await picker.getByRole('radio', { name: /กำหนดเอง/ }).click();
  await page.getByLabel('สไตล์ที่ต้องการ').fill('ตอบเป็นข้อ ๆ');
  await page.getByRole('button', { name: 'บันทึกและไปที่งาน' }).click();
  let saved = await settings(page);
  assert.equal(saved.personality, 'custom');
  assert.equal(saved.assistantTone, 'ตอบเป็นข้อ ๆ');
  assert.equal(saved.interactionStyle, 'standard');

  // A documented style is layered over the preset, with a dialect on top.
  picker = await open();
  await picker.getByRole('radio', { name: /Witty/ }).click();
  await expect(page.getByLabel('สไตล์ที่ต้องการ')).toHaveCount(0);
  await page
    .getByRole('radiogroup', { name: 'สำเนียงภาษา' })
    .getByRole('radio', { name: /ภาษาเหนือ/ })
    .click();
  await page.getByRole('button', { name: 'บันทึกและไปที่งาน' }).click();
  saved = await settings(page);
  assert.equal(saved.interactionStyle, 'witty');
  assert.equal(saved.languageStyle, 'northern-thai');

  // Picking a preset again turns the documented style off.
  picker = await open();
  await expect(picker.getByRole('radio', { name: /Witty/ })).toHaveAttribute('aria-checked', 'true');
  await picker.getByRole('radio', { name: /กระชับ/ }).click();
  await page.getByRole('button', { name: 'บันทึกและไปที่งาน' }).click();
  saved = await settings(page);
  assert.equal(saved.personality, 'concise');
  assert.equal(saved.interactionStyle, 'standard');
  assert.equal(saved.languageStyle, 'northern-thai');
  assert.deepEqual(errors, []);
  console.log('Speaking styles smoke passed: presets and documented styles in one picker, custom wording, dialect.');
} finally {
  await app.close().catch(() => {});
  await rm(home, { recursive: true, force: true }).catch(() => {});
}
