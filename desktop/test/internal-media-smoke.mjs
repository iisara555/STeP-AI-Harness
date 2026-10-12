// The internal media page opens from the sidebar, gates copying on missing input, keeps the draft across a reload and
// switches language. Synthetic data only; no provider is called.
import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'step-internal-media-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor();
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.getByRole('button', { name: 'สื่อภายใน' }).click();
  const copy = page.getByRole('button', { name: 'คัดลอก Prompt' });
  await copy.waitFor();
  assert.equal(await copy.isDisabled(), true, 'nothing to copy before a topic and content');
  await page.getByText('กรอก เรื่องที่ต้องการสื่อสาร').waitFor();

  await page.getByRole('button', { name: 'ประกาศ' }).click();
  await page.getByRole('button', { name: 'ใส่ตัวอย่าง' }).click();
  await page.getByText('พร้อมคัดลอก · ตรวจเนื้อหาก่อนใช้จริง').waitFor();
  const prompt = page.getByRole('textbox', { name: 'Prompt พร้อมใช้' });
  assert.match(await prompt.inputValue(), /Create one ประกาศ visual for INTERNAL communication only/);
  assert.match(await prompt.inputValue(), /MANDATORY LOGO RESTRICTION/);

  await app.evaluate(({ clipboard }) => clipboard.writeText(''));
  await copy.click();
  await page.getByText('คัดลอกแล้ว').first().waitFor();
  assert.match(await app.evaluate(({ clipboard }) => clipboard.readText()), /Topic: ช่วยกันรักษาพื้นที่ส่วนกลาง/);

  await page.getByRole('combobox', { name: 'ข้อความในภาพ' }).selectOption('SPACE');
  await page.getByRole('combobox', { name: 'ตำแหน่งที่ต้องการเว้นว่าง' }).selectOption('RIGHT');
  assert.match(await prompt.inputValue(), /Keep the right third completely clean and empty/);
  await page.locator('.media-layout-empty').waitFor();

  const content = page.getByRole('textbox', { name: 'เนื้อหา / ขั้นตอนที่จะใช้' });
  await content.fill('วันที่ [รอยืนยัน]');
  await page.getByText('เนื้อหายังมีช่องรอข้อมูล กรุณาเติมก่อนใช้จริง').waitFor();
  assert.equal(await copy.isDisabled(), true, 'placeholders block copying');

  await page.reload();
  await page.getByRole('button', { name: 'สื่อภายใน' }).click();
  assert.equal(await page.getByRole('textbox', { name: 'เนื้อหา / ขั้นตอนที่จะใช้' }).inputValue(), 'วันที่ [รอยืนยัน]');
  assert.equal(await page.getByRole('button', { name: 'ประกาศ' }).getAttribute('aria-pressed'), 'true');

  // Leaving and coming back keeps the page as it was.
  await page.getByRole('button', { name: /เครื่องมือร่างเอกสาร/ }).click();
  await page.getByRole('button', { name: 'สื่อภายใน' }).click();
  assert.equal(await page.getByRole('combobox', { name: 'ตำแหน่งที่ต้องการเว้นว่าง' }).inputValue(), 'RIGHT');

  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'รูปลักษณ์และภาษา' }).click();
  await page.getByRole('radio', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Internal media' }).click();
  await page.getByRole('button', { name: 'Copy prompt' }).waitFor();
  await page.getByText('Your prompt').waitFor();
  // Labels, options and the audit line follow the language; only the employee's own text stays Thai.
  const labels = await page.locator('.internal-media label, .internal-media summary, .media-types, [role=status]').allInnerTexts();
  assert.doesNotMatch(labels.join('\n'), /[฀-๿]/, labels.join('\n'));
  console.log('internal media smoke passed');
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true });
}
