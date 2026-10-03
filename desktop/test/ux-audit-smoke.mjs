import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-ux-fixes-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_CLAUDE_SUBSCRIPTION: '0' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 800, height: 650 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const wizard = page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' });
  await page.getByRole('button', { name: 'เริ่มตั้งค่า', exact: true }).click();
  await expect(wizard.getByRole('heading', { name: 'เชื่อมต่อ AI', exact: true })).toBeVisible();
  await expect(wizard).not.toContainText('USER.md');
  await expect(wizard).not.toContainText('OCR');
  const assertVisibleButton = async locator => {
    const bounds = await locator.boundingBox();
    assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 650, JSON.stringify(bounds));
    assert.ok(
      await locator.evaluate(el => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }),
    );
  };
  await assertVisibleButton(wizard.getByRole('button', { name: 'เชื่อมต่อ ChatGPT', exact: true }));
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    assert.ok(await wizard.evaluate(el => el.contains(document.activeElement)));
  }
  await page.getByRole('button', { name: 'ทำภายหลัง', exact: true }).click();
  await expect(wizard.getByRole('heading')).toHaveText('บันทึกการตั้งค่าแล้ว');
  await expect(wizard).toContainText('เชื่อมต่อ AI · ทำภายหลัง');
  await page.getByRole('button', { name: 'เชื่อมต่อ AI', exact: true }).click();
  await expect(wizard.getByRole('heading')).toHaveText('เชื่อมต่อ AI');
  await page.getByRole('button', { name: 'ทำภายหลัง', exact: true }).click();
  // The usage terms must be ticked before the workspace opens; ticking records the accepted version.
  const enter = page.getByRole('button', { name: 'เข้าชมพื้นที่ทำงาน', exact: true });
  await expect(enter).toBeDisabled();
  await expect(wizard.getByLabel('ข้อตกลงการใช้งาน', { exact: true })).toContainText('ระบบไม่ได้ตรวจหรือปิดบังข้อมูลให้');
  await wizard.getByRole('checkbox', { name: 'ฉันอ่านและรับทราบข้อตกลงการใช้งาน' }).check();
  await enter.click();
  await expect(wizard).toHaveCount(0);
  assert.equal((await page.evaluate(() => window.step.call('snapshot'))).settings.termsVersion, '2026-10-02');
  await page.keyboard.press('ControlOrMeta+,');
  await page.getByRole('tab', { name: 'การเชื่อมต่อ AI' }).click();
  await assertVisibleButton(page.getByRole('button', { name: 'เชื่อมต่อ ChatGPT', exact: true }));
  await expect(page.getByRole('status')).toContainText('ใช้แพ็กเกจบัญชีที่คุณลงชื่อ');
  // Gemini API key sits on the main page: the connect button waits for a key, cost shows as API budget,
  // and going back to ChatGPT drops the key.
  await page.getByRole('button', { name: 'Gemini · API key', exact: true }).click();
  const geminiConnect = page.getByRole('button', { name: 'เชื่อมต่อ Gemini', exact: true });
  await expect(geminiConnect).toBeDisabled();
  await expect(page.locator('.connection-cost')).toContainText('ใช้งบ API');
  await page.getByLabel('Gemini API key').fill('synthetic-gemini-key');
  await expect(geminiConnect).toBeEnabled();
  await assertVisibleButton(geminiConnect);
  await page.getByRole('button', { name: 'ChatGPT', exact: true }).click();
  await page.getByRole('button', { name: 'Gemini · API key', exact: true }).click();
  await expect(page.getByLabel('Gemini API key')).toHaveValue('');
  await page.getByRole('button', { name: 'ChatGPT', exact: true }).click();
  await page.getByRole('button', { name: 'ตั้งค่าขั้นสูงสำหรับผู้ดูแล' }).click();
  await page.getByRole('combobox', { name: /ผู้ให้บริการ/ }).selectOption('claude');
  await expect(page.locator('.connection-cost')).toContainText('ใช้งบ API');
  await page.getByRole('button', { name: 'กลับไปเชื่อมต่อบัญชีส่วนตัว' }).click();
  await mkdir('release/qa/ux-fixes', { recursive: true });
  await page.screenshot({ path: 'release/qa/ux-fixes/small-window.png' });
  await page.getByRole('button', { name: 'กลับไปที่งาน', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'เปิดร่าง', exact: true }).click();
  await page.getByRole('button', { name: 'เว็บ', exact: true }).click();
  await page.getByRole('button', { name: 'ให้ผู้ช่วยทำงานบนเว็บ', exact: true }).click();
  await expect(page.locator('.composer textarea')).toHaveValue(/ให้ผู้ช่วยทำงานบนเว็บ/);
  await expect(page.locator('.composer textarea')).toBeFocused();
  // The app draws its own title bar: no system menu bar on Windows/Linux, the STeP menu holds the commands,
  // and zoom (which the menu bar used to give) still works.
  assert.equal(await app.evaluate(({ Menu }) => Menu.getApplicationMenu() === null), process.platform !== 'darwin');
  const titlebar = page.locator('header.titlebar');
  await titlebar.getByRole('button', { name: 'เมนู STeP' }).click();
  const menu = page.getByRole('menu', { name: 'เมนู STeP' });
  await menu.getByRole('menuitem', { name: /ขยายตัวอักษร/ }).click();
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomLevel())).toBe(0.5);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+0' : 'Control+0');
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomLevel())).toBe(0);
  await titlebar.getByRole('button', { name: 'ค้นหางานและคำสั่ง' }).click();
  await page.getByRole('dialog', { name: 'คำสั่ง' }).waitFor();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'release/qa/ux-fixes/titlebar.png' });
  assert.deepEqual(errors, []);
  console.log(
    'UX audit fixes passed: short onboarding, accurate readiness, keyboard containment, visible small-window actions, billing labels, browser task entry and the app-drawn title bar.',
  );
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
