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
  await page.getByRole('button', { name: 'เข้าชมพื้นที่ทำงาน', exact: true }).click();
  await expect(wizard).toHaveCount(0);
  await page.keyboard.press('Control+,');
  await page.getByRole('tab', { name: 'การเชื่อมต่อ AI' }).click();
  await assertVisibleButton(page.getByRole('button', { name: 'เชื่อมต่อ ChatGPT', exact: true }));
  await expect(page.getByRole('status')).toContainText('ใช้แพ็กเกจบัญชีที่คุณลงชื่อ');
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
  assert.deepEqual(errors, []);
  console.log(
    'UX audit fixes passed: short onboarding, accurate readiness, keyboard containment, visible small-window actions, billing labels and browser task entry.',
  );
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
