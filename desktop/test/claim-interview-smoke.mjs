// The claim interview inside a case's chat (ผู้ช่วยเบิกจ่าย): quick answers, answers typed in the chat composer,
// "why", summary and apply, with no AI connected.
// All packet details are synthetic. Pass an output folder to keep the screenshots.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const out = resolve(process.argv[2] || (await mkdtemp(join(tmpdir(), 'step-claim-interview-output-'))));
await mkdir(out, { recursive: true });
const home = await mkdtemp(join(tmpdir(), 'step-claim-interview-home-'));
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
  await page.getByLabel('ชื่อเรื่องเบิก', { exact: true }).fill('ประชุมคณะทำงาน ข้อมูลสมมติ');

  // A blank packet opens the interview; the title already suggests the activity.
  const chat = page.getByRole('region', { name: 'ถามทีละข้อ' });
  await expect(chat.getByText('เบิกค่าอะไร', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ใช้กับชุดเอกสารนี้' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ต่อ: เพิ่มหลักฐาน', exact: true })).toHaveClass(/primary/);

  // Typed in the case chat's composer, read locally.
  const input = page.getByLabel('พิมพ์ในแชตเรื่องนี้', { exact: true });
  await expect(page.locator('.case-composer-ai')).toHaveText('ยังไม่ได้เลือก AI · ตอบจากกฎในเครื่อง');
  await input.fill('ค่าน้ำดื่มสำหรับประชุม');
  await page.getByRole('button', { name: 'ตอบ', exact: true }).click();
  await expect(chat.locator('.claim-reply').first()).toHaveText('ค่าน้ำดื่ม');
  await expect(chat.locator('.claim-recommend')).toContainText('แนะนำ: ประชุม');
  await expect(chat.locator('.claim-option.recommended')).toHaveText('ประชุม');

  // An unreadable answer asks again instead of guessing; "why" answers from the rule's source.
  await input.fill('ไม่รู้สิ');
  await input.press('Enter');
  await expect(chat).toContainText('ยังอ่านคำตอบนี้ไม่ออก');
  await input.fill('ทำไมต้องบอก');
  await input.press('Enter');
  await expect(chat.locator('.claim-why')).toContainText('QP-AF-003 ข้อ 4.2 a');
  await shot('1-chat-why');

  await chat.getByRole('button', { name: 'ประชุม', exact: true }).click();
  await chat.getByRole('button', { name: 'จ่ายแล้ว', exact: true }).click();
  await chat.getByRole('button', { name: 'ยืมเงินจากการเงิน', exact: true }).click();
  await input.fill('800');
  await input.press('Enter');
  await input.fill('20 พ.ย. 2569');
  await input.press('Enter');

  // Summary: category, deadline and documents, with one primary action on the page.
  const summary = chat.getByRole('status');
  await expect(summary.getByRole('heading', { name: 'เบิกค่าน้ำดื่ม' })).toBeVisible();
  await expect(summary).toContainText('B10');
  await expect(summary).toContainText('25 พ.ย. 2569');
  await expect(summary).toContainText('ใบเซ็นชื่อเข้าร่วม FM-AF-015');
  await expect(page.getByRole('button', { name: 'ต่อ: เพิ่มหลักฐาน', exact: true })).not.toHaveClass(/primary/);
  assert.equal(await page.locator('.receipt-packets button.primary:visible').count(), 1, 'one primary action');
  await chat.locator('.claim-actions').scrollIntoViewIfNeeded();
  await shot('2-chat-summary');

  // Undo goes back one question and keeps the earlier answers.
  await chat.getByRole('button', { name: 'ย้อนข้อก่อน' }).click();
  await expect(chat.getByText('ใบเสร็จลงวันที่เท่าไร', { exact: true })).toBeVisible();
  await expect(chat.locator('.claim-reply')).toHaveCount(5);
  await chat.getByRole('button', { name: 'ยังไม่มีใบเสร็จ', exact: true }).click();
  await expect(summary).not.toContainText('รายงานขอความเห็นชอบภายใน');
  await chat.getByRole('button', { name: 'ย้อนข้อก่อน' }).click();
  await input.fill('20 พ.ย. 2569');
  await input.press('Enter');

  // Apply keeps the typed title and fills the evidence guidance.
  await page.getByRole('button', { name: 'ใช้กับชุดเอกสารนี้' }).click();
  await expect(page.getByText('ตอบแล้ว: เบิกค่าน้ำดื่ม · B10', { exact: true })).toBeVisible();
  await expect(page.getByLabel('ชื่อเรื่องเบิก', { exact: true })).toHaveValue('ประชุมคณะทำงาน ข้อมูลสมมติ');
  await expect(page.getByRole('button', { name: 'ต่อ: เพิ่มหลักฐาน', exact: true })).toHaveClass(/primary/);
  await shot('3-details-answered');
  await page.getByRole('button', { name: 'ต่อ: เพิ่มหลักฐาน', exact: true }).click();
  const panel = page.getByRole('region', { name: 'แนะนำเอกสารตามกิจกรรม' });
  await expect(panel).toContainText('แนวปฏิบัติ AFP หมวด B');
  await expect(panel).toContainText('หมวด: หมวด B (B1–B12)');
  await expect(panel).toContainText('กรณีการเงิน: เคลียร์เงินยืม');
  await shot('4-evidence-after-answers');

  // Phone-width and dark views of the same chat.
  await page.getByRole('button', { name: 'ข้อมูลเรื่อง', exact: true }).click();
  await page.getByRole('button', { name: 'แก้คำตอบ' }).click();
  // Reopening keeps the answers; undo walks back to an earlier question.
  await expect(chat.getByRole('status')).toContainText('B10');
  await chat.getByRole('button', { name: 'ย้อนข้อก่อน' }).click();
  await chat.getByRole('button', { name: 'ย้อนข้อก่อน' }).click();
  await expect(chat.getByText('ยอดประมาณเท่าไร', { exact: true })).toBeVisible();
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.setViewportSize({ width: 760, height: 900 });
  await chat.scrollIntoViewIfNeeded();
  await shot('5-chat-dark-narrow');
  const overflow = await page.evaluate(() => {
    const box = document.querySelector('.claim-interview').getBoundingClientRect();
    return box.right - document.documentElement.clientWidth;
  });
  assert.ok(overflow <= 0, `chat overflows by ${overflow}px`);
  assert.deepEqual(errors, []);
  console.log(`Claim interview smoke passed. Screenshots: ${out}`);
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
