// Visual check of the workspace shell: grouped sessions, status bar, consent dialog, and command palette.
// Uses an isolated profile and never calls a provider.
import { _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const home = await mkdtemp(join(tmpdir(), 'step-desktop-shots-'));
const out = process.argv[2] || 'release/qa';
await mkdir(out, { recursive: true });
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  // Walk the setup wizard: welcome, name, assistant style, then finish and take the tour.
  const wizard = page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' });
  await wizard.waitFor();
  await page.screenshot({ path: join(out, 'wizard-1-welcome.png') });
  await page.getByRole('button', { name: 'ตั้งชื่อและรูปแบบผู้ช่วยก่อน (ไม่บังคับ)' }).click();
  await page.getByLabel('ชื่อเรียก').fill('ต้น');
  await page.getByRole('button', { name: 'ถัดไป' }).click();
  await page.getByRole('button', { name: 'น้องสเต็ป' }).click();
  await page.getByRole('button', { name: /กระชับ/ }).click();
  await page.screenshot({ path: join(out, 'wizard-3-assistant.png') });
  await page.getByRole('button', { name: 'ถัดไป' }).click();
  await page.screenshot({ path: join(out, 'wizard-4-connect.png') });
  await page.getByRole('button', { name: 'ทำภายหลัง' }).click();
  await page.screenshot({ path: join(out, 'wizard-ready-without-ai.png') });
  await page.getByRole('checkbox', { name: 'ฉันอ่านและรับทราบข้อตกลงการใช้งาน' }).check();
  await page.getByRole('button', { name: 'เข้าชมพื้นที่ทำงาน' }).click();
  await wizard.waitFor({ state: 'detached' });
  const saved = await page.evaluate(() => window.step.call('snapshot'));
  if (
    saved.settings.userName !== 'ต้น' ||
    saved.settings.assistant !== 'น้องสเต็ป' ||
    saved.settings.personality !== 'concise' ||
    !saved.userFile
  )
    throw new Error('Wizard did not save USER.md settings');
  await page.screenshot({ path: join(out, 'welcome.png') });
  await page.evaluate(async () => {
    const c = await window.step.call('connection', { provider: 'openai', mode: 'subscription' });
    for (const [title, pinned] of [
      ['บรีฟงานสัมมนา AI สำหรับ SME', true],
      ['สรุปประชุมทีม CC', false],
      ['ร่างข่าวประชาสัมพันธ์', false],
    ]) {
      const s = await window.step.call('create', { connectionId: c.id, project: 'สื่อสารองค์กร' });
      // Tasks that were never used stay out of the list, so each seeded task gets a draft.
      await window.step.call('edit', { id: s.id, text: title, revision: 0 });
      await window.step.call('rename', { id: s.id, title });
      if (pinned) await window.step.call('pin', { id: s.id, pinned: true });
    }
  });
  // The consent screenshot needs a ready account; mark the seeded connection ready in this isolated
  // profile only. Consent is shown before any provider call, so nothing is sent.
  await app.evaluate(async ({ app }) => {
    const { DatabaseSync } = process.mainModule.require('node:sqlite');
    const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
    for (const row of db.prepare("SELECT id, value FROM records WHERE kind='connection'").all()) {
      const value = { ...JSON.parse(row.value), ready: true, note: 'Screenshot fixture' };
      db.prepare("UPDATE records SET value=? WHERE kind='connection' AND id=?").run(JSON.stringify(value), row.id);
    }
    db.close();
  });
  await page.reload();
  await page.locator('.session-group').first().waitFor();
  await page.locator('.session-open').nth(1).click();
  await page.screenshot({ path: join(out, 'shell.png') });
  await page.getByRole('button', { name: /ศูนย์รวม Skill/ }).click();
  await page.locator('.skill-card').first().waitFor();
  await page.screenshot({ path: join(out, 'skills-hub.png') });
  await page.getByRole('button', { name: 'ใช้ Skill นี้' }).first().click();
  await page.locator('.skill-chip').waitFor();
  await page.getByRole('button', { name: 'เลิกใช้ Skill นี้' }).click();
  await page.getByRole('textbox', { name: 'พิมพ์คำขอ' }).fill('/rec');
  await page.locator('.slash-menu').waitFor();
  if (!(await page.locator('.slash-menu button').first().textContent()).includes('/receipt-audit'))
    throw new Error('Prefix matches should rank first');
  await page.screenshot({ path: join(out, 'slash-menu.png') });
  await page.keyboard.press('Enter');
  await page.locator('.skill-chip').waitFor();
  await page.screenshot({ path: join(out, 'skill-chip.png') });
  await page.getByRole('button', { name: 'เลิกใช้ Skill นี้' }).click();
  await page.keyboard.press('ControlOrMeta+K');
  await page.getByRole('dialog', { name: 'คำสั่ง' }).waitFor();
  await page.keyboard.type('ธีม');
  await page.screenshot({ path: join(out, 'palette.png') });
  await page.keyboard.press('Escape');
  await page.locator('.session').first().hover();
  await page.getByRole('button', { name: 'ลบงาน' }).first().click();
  await page.getByRole('alertdialog').waitFor();
  await page.screenshot({ path: join(out, 'confirm.png') });
  await page.getByRole('button', { name: 'ยกเลิก' }).click();
  // Consent is answered in-app with a one-time token bound to the exact request.
  const tokens = await page.evaluate(async () => {
    const [s] = (await window.step.call('snapshot')).sessions;
    const first = await window.step.call('send', { id: s.id, text: 'ทดสอบ', attachments: [] });
    const edited = await window.step.call('send', { id: s.id, text: 'ข้อความอื่น', attachments: [], consent: first.consent.token });
    return { first: Boolean(first.consent?.token), rebound: Boolean(edited.consent?.token) };
  });
  if (!tokens.first || !tokens.rebound) throw new Error('Consent token was not bound to the request');
  await page.getByRole('textbox', { name: 'พิมพ์คำขอ' }).fill('ช่วยคิดชื่อแคมเปญเปิดตัวบริการใหม่');
  await page.keyboard.press('Enter');
  await page.getByRole('alertdialog').waitFor();
  await page.screenshot({ path: join(out, 'consent.png') });
  await page.getByRole('button', { name: 'ยกเลิก' }).click();
  await page.evaluate(() => window.step.call('settings', { assistant: 'STeP Mate', team: '', theme: 'dark' }));
  await page.reload();
  await page.locator('.session-group').first().waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, 'shell-dark.png') });
  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน' }).click();
  await page.getByRole('tab', { name: 'ความเป็นส่วนตัว' }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(out, 'settings-dark.png') });
  console.log('UI screenshots written to ' + out);
} finally {
  await app.close();
}
