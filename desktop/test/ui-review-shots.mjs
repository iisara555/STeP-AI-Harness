// Screenshot walk of every main screen for UI reviews, in one theme and window size.
// Usage: node test/ui-review-shots.mjs <out-dir> [light|dark] [width] [height] [axe.min.js]
// Uses an isolated profile and never calls a provider. With an axe-core path it also writes axe.json.
import { _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [out = 'release/qa/ui-review', theme = 'light', width = '1440', height = '900', axePath] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const home = await mkdtemp(join(tmpdir(), 'step-ui-review-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_CLAUDE_SUBSCRIPTION: '0' };
delete env.ELECTRON_RUN_AS_NODE;
const axeSource = axePath ? await readFile(axePath, 'utf8') : '';
const report = {};
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: Number(width), height: Number(height) });
  const shot = async name => {
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(out, name + '.png') });
    if (!axeSource) return;
    if (!(await page.evaluate(() => Boolean(window.axe)))) await page.evaluate(axeSource);
    const result = await page.evaluate(() =>
      window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } }),
    );
    report[name] = result.violations.map(v => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 6).map(n => ({ target: n.target.join(' '), summary: n.failureSummary?.split('\n').slice(0, 3).join(' ') })),
      count: v.nodes.length,
    }));
  };
  const palette = async label => {
    await page.keyboard.press('ControlOrMeta+K');
    const dialog = page.getByRole('dialog', { name: 'คำสั่ง' });
    await dialog.waitFor();
    await page.keyboard.type(label);
    await dialog
      .getByRole('option', { name: new RegExp(label) })
      .first()
      .click();
  };
  const escape = async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  };

  const wizard = page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' });
  await wizard.waitFor();
  // The default theme follows the system, so emulating the colour scheme themes every screen, wizard included.
  await page.emulateMedia({ colorScheme: theme === 'dark' ? 'dark' : 'light' });
  await shot('01-wizard-welcome');
  await page.getByRole('button', { name: 'เริ่มตั้งค่า', exact: true }).click();
  await shot('02-wizard-connect');
  await page.getByRole('button', { name: 'ทำภายหลัง', exact: true }).click();
  await shot('03-wizard-ready');
  await wizard.getByRole('checkbox', { name: 'ฉันอ่านและรับทราบข้อตกลงการใช้งาน' }).check();
  await page.getByRole('button', { name: 'เข้าชมพื้นที่ทำงาน', exact: true }).click();
  await wizard.waitFor({ state: 'detached' });
  await shot('04-welcome-no-ai');

  await page.evaluate(async () => {
    const c = await window.step.call('connection', { provider: 'openai', mode: 'subscription' });
    for (const [title, pinned] of [
      ['บรีฟงานสัมมนา AI สำหรับ SME', true],
      ['สรุปประชุมทีม CC และติดตามงานค้างจากไตรมาสก่อนหน้าทั้งหมด', false],
      ['ร่างข่าวประชาสัมพันธ์', false],
    ]) {
      const s = await window.step.call('create', { connectionId: c.id, project: 'สื่อสารองค์กร' });
      await window.step.call('edit', { id: s.id, text: title, revision: 0 });
      await window.step.call('rename', { id: s.id, title });
      if (pinned) await window.step.call('pin', { id: s.id, pinned: true });
    }
  });
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
  await page.waitForTimeout(400);
  if (await page.getByRole('dialog', { name: 'มีอะไรใหม่' }).count()) await escape();
  await shot('05-welcome-ready');
  await page.locator('.session-open').nth(1).click();
  await shot('06-task-with-draft');

  const screens = [
    ['07-skills-hub', 'ศูนย์รวม Skill'],
    ['08-documents', 'เครื่องมือร่างเอกสาร'],
    ['09-receipt', 'ตรวจใบเสร็จก่อนส่ง AFP'],
  ];
  for (const [name, label] of screens) {
    await palette(label);
    await page.waitForTimeout(500);
    await shot(name);
  }
  await page.locator('.session-open').first().click();
  for (const [name, label] of [
    ['10-usage', 'ดูการใช้งาน AI'],
    ['11-memory', 'ดูและแก้ไขความจำ'],
    ['12-learning', 'กล่องบทเรียน'],
    ['13-automations', 'งานตามรอบและเครื่องมือเพิ่มเติม'],
    ['14-keyboard', 'คีย์ลัดและ Vim'],
    ['15-packs', 'Skill Packs'],
    ['16-whats-new', 'มีอะไรใหม่ในรุ่นนี้'],
  ]) {
    await palette(label);
    await page.waitForTimeout(400);
    await shot(name);
    await escape();
  }
  await palette('ดูทัวร์แนะนำอีกครั้ง');
  await shot('17-tour');
  await escape();
  await palette('ตั้งค่าพื้นที่ทำงาน');
  for (const [i, tab] of ['ทั่วไป', 'การเชื่อมต่อ AI', 'รูปลักษณ์และภาษา', 'ความเป็นส่วนตัว', 'นโยบายองค์กร'].entries()) {
    await page.getByRole('tab', { name: tab }).click();
    await shot(`18-settings-${i + 1}`);
  }
  await page.locator('.session-open').first().click();
  await page.keyboard.press('ControlOrMeta+K');
  await page.keyboard.type('ธีม');
  await shot('19-palette');
  await escape();
  await page.locator('.session').first().hover();
  await page.getByRole('button', { name: 'ลบงาน' }).first().click();
  await page.getByRole('alertdialog').waitFor();
  await shot('20-confirm-delete');
  await page.getByRole('button', { name: 'ยกเลิก' }).click();
  if (axeSource) await writeFile(join(out, 'axe.json'), JSON.stringify(report, null, 1));
  if (errors.length) console.log('Page errors:', errors);
  console.log('UI review screenshots written to ' + out);
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
