// Synthetic UI regressions for PR #112. No provider authentication or generation.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'step-ui-review-check-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1', STEP_CLAUDE_SUBSCRIPTION: '0' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 900, height: 640 });
  const chunks = [];
  page.on('request', request => chunks.push(request.url()));
  await page.getByRole('button', { name: 'เริ่มตั้งค่า', exact: true }).click();
  const wizard = page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' });
  await expect(wizard.getByRole('heading', { name: 'เลือก AI และเชื่อมต่อ', level: 2, exact: true })).toBeVisible();
  await expect(wizard.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง', exact: true })).toHaveCount(0);
  await wizard.getByRole('button', { name: 'ทำภายหลัง', exact: true }).click();
  await wizard.getByRole('checkbox', { name: 'ฉันอ่านและรับทราบข้อตกลงการใช้งาน' }).check();
  await wizard.getByRole('button', { name: 'เข้าชมพื้นที่ทำงาน', exact: true }).click();
  await wizard.waitFor({ state: 'detached' });
  await expect(page.locator('.connection-banner')).toBeVisible();
  await page.locator('.connection-banner').getByRole('button').click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('heading', { name: 'เชื่อมต่อ AI', level: 1, exact: true })).toBeVisible();
  const art = await page.locator('.settings-illustration').boundingBox();
  assert.ok(art && art.width >= 130 && art.height >= 100, JSON.stringify(art));

  await page.evaluate(async () => {
    const c = await window.step.call('connection', { provider: 'openai', mode: 'subscription' });
    const s = await window.step.call('create', { connectionId: c.id });
    await window.step.call('rename', { id: s.id, title: 'งานสังเคราะห์สำหรับตรวจการแสดงชื่อและปุ่มบนหน้าต่างขนาดเล็ก' });
  });
  await app.evaluate(({ app }) => {
    const { DatabaseSync } = process.mainModule.require('node:sqlite');
    const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
    for (const row of db.prepare("SELECT id, value FROM records WHERE kind='connection'").all()) {
      const value = {
        ...JSON.parse(row.value),
        ready: true,
        note: 'Synthetic UI fixture',
        modelsAt: new Date().toISOString(),
        models: [{ id: 'synthetic-model', label: 'โมเดลสังเคราะห์', isDefault: true }],
      };
      db.prepare("UPDATE records SET value=? WHERE kind='connection' AND id=?").run(JSON.stringify(value), row.id);
    }
    db.close();
  });
  await page.reload();
  if (await page.getByRole('dialog', { name: 'มีอะไรใหม่' }).count()) await page.keyboard.press('Escape');
  await page.locator('.session-open').first().click();
  await expect(page.locator('.composer [data-tour="model"]')).toBeVisible();
  assert.ok(!(await page.locator('.statusbar').innerText()).includes('โมเดลสังเคราะห์'));
  await page.setViewportSize({ width: 900, height: 640 });
  await page.locator('.composer textarea').focus();
  await page.mouse.move(880, 100);
  await expect(page.locator('.session.selected .session-actions')).toBeHidden();
  await page.locator('.session-open').first().focus();
  await expect(page.locator('.session.selected .session-actions')).toBeVisible();
  for (const [view, title, selector] of [
    ['skills', 'ศูนย์รวม Skill', '.skills-hub'],
    ['documents', 'เครื่องมือร่างเอกสาร', '.document-tools'],
    ['receipt', 'ตรวจใบเสร็จก่อนส่ง AFP', '.receipt-app'],
  ]) {
    await page.locator(`[data-tour="${view}"]`).click();
    await expect(page.locator(selector)).toBeVisible();
    await expect(page.locator('.main-pane').getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.locator('.titlebar-command')).toContainText(title);
    await expect(page.getByRole('button', { name: 'ค้นหางานและคำสั่ง', exact: true })).toHaveAttribute('aria-description', title);
  }
  await page.locator('[data-tour="documents"]').click();
  assert.ok(
    chunks.some(url => /\/skills-[^/]+\.js/.test(url)),
    'Skills UI must load as a separate chunk',
  );
  assert.ok(
    chunks.some(url => /\/document-tool-app-[^/]+\.js/.test(url)),
    'document UI must load as a separate chunk',
  );
  const navLabel = await page.locator('[data-tour="documents"] .nav-label').evaluate(el => getComputedStyle(el).whiteSpace);
  assert.equal(navLabel, 'nowrap');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    const disabled = page.locator('.document-tools button:disabled').first();
    const color = await disabled.evaluate(el => ({
      opacity: getComputedStyle(el).opacity,
      background: getComputedStyle(el).backgroundColor,
    }));
    assert.equal(color.opacity, '1');
    assert.notEqual(color.background, 'rgb(255, 199, 9)');
  }
  await page.locator('[data-tour="settings"]').click();
  await page.getByRole('tab', { name: 'ความเป็นส่วนตัว', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'ความเป็นส่วนตัว', exact: true })).toBeVisible();
  await expect(page.getByText('ตั้งค่าเพียงครั้งแรก แล้วเริ่มงานได้จากบทสนทนา', { exact: true })).toHaveCount(0);
  console.log(
    'UI review smoke passed: headings, connection banner, deferred screens, current-page title, narrow navigation and themed disabled actions.',
  );
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
