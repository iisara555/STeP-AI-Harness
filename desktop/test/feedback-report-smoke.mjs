// "แจ้งปัญหา / เสนอแนะ": opens from the help menu, refuses text with personal data, and sends nothing unless the
// employee confirms the native dialog. No network: the confirmation is answered "ยกเลิก" in the main process.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'step-feedback-report-'));
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
    await window.step.call('settings', {
      ...snapshot.settings,
      onboarding: true,
      tourDone: true,
      whatsNewSeen: '999.0.0',
      userName: 'พนักงานสังเคราะห์',
      team: 'ga',
    });
  });
  await page.reload();
  // Every confirmation is answered "ยกเลิก" and counted, so nothing can leave the machine in this test.
  await app.evaluate(({ dialog }) => {
    globalThis.asked = [];
    dialog.showMessageBox = async (_window, options) => {
      globalThis.asked.push(options.message + '\n' + options.detail);
      return { response: 0, checkboxChecked: false };
    };
  });
  await page.getByRole('button', { name: 'เมนู STeP' }).click();
  await page.getByRole('menuitem', { name: 'แจ้งปัญหา / เสนอแนะ' }).click();
  const report = page.getByRole('alertdialog', { name: 'แจ้งปัญหา / เสนอแนะ' });
  await expect(report).toBeVisible();
  const send = report.getByRole('button', { name: 'ส่งถึงผู้ดูแล', exact: true });
  await expect(send).toBeDisabled();
  await expect(report.getByRole('radio', { name: 'ปัญหาการใช้งาน' })).toBeChecked();
  await expect(report.getByRole('checkbox', { name: /ใส่ชื่อของฉัน \(พนักงานสังเคราะห์/ })).toBeChecked();
  // Opened from the menu there is no answer to attach.
  await expect(report.getByRole('checkbox', { name: 'แนบคำตอบของ AI ข้อนี้ไปด้วย' })).toHaveCount(0);

  await report.getByRole('textbox').fill('ติดต่อกลับที่ 081-234-5678 ปุ่มส่งออกไม่ทำงาน');
  await send.click();
  await expect(report.getByText('พบข้อมูลส่วนบุคคลหรือรหัสลับในข้อความ', { exact: false })).toBeVisible();
  assert.deepEqual(await app.evaluate(() => globalThis.asked), [], 'text with personal data never reaches the confirmation');

  await report.getByRole('radio', { name: 'ข้อเสนอแนะ' }).check();
  await report.getByRole('textbox').fill('อยากให้ปุ่มส่งออกอยู่ด้านบน');
  if (shots) await page.screenshot({ path: join(shots, 'report-light-1440.png') });
  await send.click();
  await expect.poll(() => app.evaluate(() => globalThis.asked.length)).toBe(1);
  const asked = await app.evaluate(() => globalThis.asked[0]);
  assert.match(asked, /ส่งเรื่องนี้ถึงผู้ดูแลแอป/);
  assert.match(asked, /พนักงานสังเคราะห์/);
  assert.match(asked, /script\.google\.com/);
  // Cancelled: the form stays as typed, with no error.
  await expect(report).toBeVisible();
  await expect(report.getByRole('textbox')).toHaveValue('อยากให้ปุ่มส่งออกอยู่ด้านบน');
  await expect(report.locator('.error, [role="alert"]')).toHaveCount(0);

  // Without a name, the confirmation does not mention one.
  await report.getByRole('checkbox', { name: /ใส่ชื่อของฉัน/ }).uncheck();
  await send.click();
  await expect.poll(() => app.evaluate(() => globalThis.asked.length)).toBe(2);
  assert.doesNotMatch(await app.evaluate(() => globalThis.asked[1]), /พนักงานสังเคราะห์/);
  if (shots) {
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.screenshot({ path: join(shots, 'report-dark-1440.png') });
  }
  await report.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await expect(report).toHaveCount(0);
  console.log('feedback report smoke passed');
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true });
}
