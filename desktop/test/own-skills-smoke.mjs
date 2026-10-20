// Skills hub: "เพิ่ม Skill ของฉัน" opens the Skill Packs import, the imported Skill shows with its uploader's credit,
// and features.staffSkills: false hides both. Synthetic profile and a repository Skill; no provider calls.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'step-own-skills-check-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1', STEP_CLAUDE_SUBSCRIPTION: '0' };
delete env.ELECTRON_RUN_AS_NODE;
const shots = process.env.STEP_SCREENSHOTS;
const skill = resolve('../skills/common/brand-tone-of-voice');
const launch = () => electron.launch({ args: ['.'], env, timeout: 45000 });
let app = await launch();
try {
  let page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'เริ่มตั้งค่า', exact: true }).click();
  const wizard = page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' });
  await wizard.getByRole('button', { name: 'ทำภายหลัง', exact: true }).click();
  await wizard.getByRole('checkbox', { name: 'ฉันอ่านและรับทราบข้อตกลงการใช้งาน' }).check();
  await wizard.getByRole('button', { name: 'เข้าชมพื้นที่ทำงาน', exact: true }).click();
  await wizard.waitFor({ state: 'detached' });
  await page.evaluate(async () => {
    const { settings } = await window.step.call('snapshot');
    await window.step.call('settings', { ...settings, userName: 'สมหญิง ตัวอย่าง', team: 'cc' });
  });
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  }, skill);

  await page.locator('[data-tour="skills"]').click();
  const hub = page.locator('.skills-hub');
  await hub.getByRole('button', { name: 'เพิ่ม Skill ของฉัน', exact: true }).click();
  const packs = page.getByRole('alertdialog', { name: 'Skill Packs' });
  await packs.getByLabel('ตั้งชื่อชุด (ใช้เมื่อนำเข้าโฟลเดอร์ Skill เดี่ยว)').fill('my-tone');
  await packs.getByRole('button', { name: 'เลือกโฟลเดอร์และนำเข้า', exact: true }).click();
  await packs.getByText('นำเข้าโดย สมหญิง ตัวอย่าง', { exact: false }).waitFor();
  await packs.getByRole('button', { name: 'ใช้เองบนเครื่องนี้', exact: true }).click();
  await packs.getByRole('button', { name: 'เลิกใช้เอง', exact: true }).waitFor();
  await packs.getByRole('button', { name: 'ปิด', exact: true }).click();

  const own = hub.locator('.skills-own .skill-card').filter({ hasText: 'brand-tone-of-voice' });
  await expect(own).toContainText('เพิ่มโดย สมหญิง ตัวอย่าง · cc · ');
  await expect(own.locator('.tag').first()).toHaveText('ใช้เองบนเครื่องนี้');
  if (shots) {
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => (document.documentElement.dataset.theme = theme), theme);
      // Buttons fade their background; wait so the shot shows the settled theme, not a half-switched one.
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(shots, `skills-hub-own-${theme}-1440.png`) });
    }
    await page.setViewportSize({ width: 1024, height: 720 });
    await page.screenshot({ path: join(shots, `skills-hub-own-dark-1024.png`) });
    await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
  }
  await own.getByRole('button', { name: 'ใช้ Skill นี้' }).click();
  await expect(page.locator('.composer')).toBeVisible();

  // An administrator turning staff Skills off removes the button and the list, not just disables them.
  await app.close();
  await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ features: { staffSkills: false } }));
  app = await launch();
  page = await app.firstWindow();
  if (await page.getByRole('dialog', { name: 'มีอะไรใหม่' }).count()) await page.keyboard.press('Escape');
  await page.locator('[data-tour="skills"]').click();
  await expect(page.locator('.skills-grid').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'เพิ่ม Skill ของฉัน' })).toHaveCount(0);
  await expect(page.locator('.skills-own')).toHaveCount(0);
  console.log('Own Skills smoke passed: add button, import with credit, personal use from the hub, hidden by policy.');
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
