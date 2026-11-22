// A vehicle-hire (หมวด BV) case in ผู้ช่วยเบิกจ่าย: the interview asks AFP's five travel-reason parts, drafts the
// reason into the purpose, the details step names what a weak reason lacks, and the export step warns before export.
// No AI connected. All case details are synthetic. Pass an output folder to keep the screenshots.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const out = resolve(process.argv[2] || (await mkdtemp(join(tmpdir(), 'step-bv-reason-output-'))));
await mkdir(out, { recursive: true });
const home = await mkdtemp(join(tmpdir(), 'step-bv-reason-home-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45_000 });
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 900 });
  const shot = name => page.screenshot({ path: join(out, `${name}.png`) });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await page.getByRole('button', { name: /ผู้ช่วยเบิกจ่าย/ }).click();
  await page.getByRole('button', { name: 'ชุดเอกสารเบิกจ่าย', exact: true }).click();
  await page.getByRole('button', { name: 'เรื่องใหม่', exact: true }).click();
  await page.getByLabel('ชื่อเรื่องเบิก', { exact: true }).fill('จ้างรถตู้รับวิทยากร ข้อมูลสมมติ');
  await page.getByLabel('โครงการหรือหน่วยงาน', { exact: true }).fill('กิจกรรมสมมติ 2569');

  const chat = page.getByRole('region', { name: 'ถามทีละข้อ' });
  const input = page.getByLabel('พิมพ์ในแชตเรื่องนี้', { exact: true });
  await chat.getByRole('button', { name: 'จ้างเหมารถหรือเช่ารถ', exact: true }).click();
  await chat.getByRole('button', { name: 'กิจกรรม / งาน', exact: true }).click();
  await chat.getByRole('button', { name: 'ยังไม่จ่าย', exact: true }).click();
  await chat.getByRole('button', { name: 'ยืมเงินจากการเงิน', exact: true }).click();
  await chat.getByRole('button', { name: 'ยังไม่ทราบ', exact: true }).click();

  // The five parts, one at a time: chips for who and what, the person's own words for the rest.
  await expect(chat.getByText('เหตุผลการเดินทาง: ใครเดินทาง', { exact: true })).toBeVisible();
  await expect(chat.locator('.claim-example')).toContainText('คณะผู้ประกอบการ');
  await chat.getByRole('button', { name: 'ทำไมต้องถาม' }).click();
  await expect(chat.locator('.claim-why')).toContainText('ว 119');
  await shot('1-bv-who');
  await chat.getByRole('button', { name: 'วิทยากร', exact: true }).click();
  await chat.getByRole('button', { name: 'รับ', exact: true }).click();
  await expect(chat.getByText('เดินทางวันไหน', { exact: true })).toBeVisible();
  await input.fill('9 ก.ย. 2569');
  await input.press('Enter');
  await input.fill('ท่าอากาศยานเชียงใหม่ - โรงแรมสมมติ');
  await input.press('Enter');
  await expect(chat.locator('.claim-option.recommended')).toHaveText('กิจกรรมสมมติ 2569');
  await input.fill('เข้าร่วมกิจกรรมตามกำหนดการ');
  await input.press('Enter');

  const reason = 'เพื่อรับวิทยากร วันที่ 9 ก.ย. 2569 จากท่าอากาศยานเชียงใหม่ไปยังโรงแรมสมมติ เพื่อเข้าร่วมกิจกรรมตามกำหนดการ';
  const summary = chat.getByRole('status');
  await expect(summary).toContainText('BV');
  await expect(summary.locator('.claim-reason')).toHaveText(reason);
  await chat.locator('.claim-actions').scrollIntoViewIfNeeded();
  await shot('2-bv-summary');

  // Apply fills the purpose, which a BV case labels as the travel reason, and the hint confirms all five parts.
  await page.getByRole('button', { name: 'ใช้กับชุดเอกสารนี้' }).click();
  const purpose = page.getByRole('textbox', { name: 'เหตุผลการเดินทาง (วัตถุประสงค์)', exact: true });
  await expect(purpose).toHaveValue(reason);
  await expect(page.locator('#bv-reason-hint')).toHaveText('ครบ 5 ส่วน');
  await shot('3-details-complete');

  // A reason AFP would send back is named for what it lacks, here and before export.
  await purpose.fill('รับวิทยากร');
  await expect(page.locator('#bv-reason-hint')).toContainText('เหตุผลสั้นเกินไป ยังไม่พบ: เมื่อไร, จากไหนไปไหน, เพื่อกิจกรรมอะไร');
  await expect(page.locator('#bv-reason-hint')).toHaveClass(/bv-reason-warn/);
  await shot('4-details-short');
  await page.getByRole('button', { name: 'ร่างและส่งออก', exact: true }).click();
  const warning = page.locator('.bv-reason-export');
  await expect(warning).toContainText('เหตุผลการเดินทางหมวด BV ยังไม่ครบ');
  await expect(page.getByRole('button', { name: 'ส่งออก PDF รวม' })).toBeVisible();
  await warning.scrollIntoViewIfNeeded();
  await shot('5-export-warning');
  await warning.getByRole('button', { name: 'แก้ในข้อมูลเรื่อง' }).click();
  await expect(purpose).toBeVisible();
  await purpose.fill(reason);
  await page.getByRole('button', { name: 'ร่างและส่งออก', exact: true }).click();
  await expect(warning).toHaveCount(0);

  // Phone-width dark view of the details step.
  await page.getByRole('button', { name: 'ข้อมูลเรื่อง', exact: true }).click();
  await purpose.fill('ใช้รถในกิจกรรม');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.setViewportSize({ width: 760, height: 900 });
  await purpose.scrollIntoViewIfNeeded();
  await shot('6-details-dark-narrow');
  const overflow = await page.evaluate(() => {
    const box = document.querySelector('#bv-reason-hint').getBoundingClientRect();
    return box.right - document.documentElement.clientWidth;
  });
  assert.ok(overflow <= 0, `hint overflows by ${overflow}px`);
  assert.deepEqual(errors, []);
  console.log(`BV travel reason smoke passed. Screenshots: ${out}`);
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
