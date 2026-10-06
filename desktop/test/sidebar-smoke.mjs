// Every control in the sidebar, used the way an employee would: new task, search, the command palette, the task
// filters, opening, pinning, renaming and deleting tasks, the Skill hub, the receipt check, settings and hiding the
// sidebar. Answers come from a local fake AI service; nothing leaves this computer.
import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

const server = createServer(async (req, res) => {
  let body = '';
  for await (const part of req) body += part;
  if (req.method === 'GET') return res.writeHead(404).end();
  const asked = JSON.parse(body).messages.at(-1).content;
  const reply = asked.includes('วันหยุด') ? 'วันหยุดราชการปีนี้มี 19 วัน' : 'ร่างรายงานการประชุมเรียบร้อย';
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: reply } }] }) + '\n\n');
  res.end('data: [DONE]\n\n');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));

const home = await mkdtemp(join(tmpdir(), 'step-sidebar-')),
  workspace = join(home, 'work');
await mkdir(workspace);
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
db.prepare('INSERT INTO records VALUES(?,?,?)').run(
  'settings',
  'main',
  JSON.stringify({
    team: 'cc',
    assistant: 'STeP Mate',
    workspace,
    theme: 'light',
    onboarding: true,
    whatsNewSeen: '999.0.0',
    tourDone: true,
    consentedAt: new Date().toISOString(),
    termsVersion: '2026-10-02',
  }),
);
db.close();
const env = {
  ...process.env,
  STEP_DESKTOP_TEST_HOME: home,
  STEP_TEST_PRESET_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`,
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 860 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await app.evaluate(({ safeStorage }) => {
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.encryptString = s => Buffer.from('k' + s);
    safeStorage.decryptString = b => b.toString().slice(1);
  });
  await page.evaluate(async () => {
    const c = await window.step.call('connection', { provider: 'compatible', mode: 'api', preset: 'groq', apiKey: 'k', model: 'm' });
    await window.step.call('connect', { id: c.id });
  });
  await page.reload();
  const sidebar = page.locator('aside.sidebar');
  const composer = page.locator('.composer textarea');
  const sessions = async () => (await page.evaluate(() => window.step.call('snapshot'))).sessions;
  const task = title => sidebar.locator('.session').filter({ hasText: title });
  const ask = async text => {
    await composer.fill(text);
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await sessions()).find(s => s.messages.some(m => m.text === text))?.status, { timeout: 30000 })
      .not.toMatch(/running|queued/);
  };

  // New task: a blank page with the cursor in the message box; nothing is saved until the first message.
  await sidebar.getByRole('button', { name: 'เริ่มงานใหม่' }).click();
  await expect(composer).toBeFocused();
  assert.equal((await sessions()).length, 0);
  await ask('ประกาศวันหยุดราชการปีงบ 2570');
  await sidebar.getByRole('button', { name: 'เริ่มงานใหม่' }).click();
  await expect(page.locator('.message')).toHaveCount(0);
  await ask('ช่วยร่างรายงานการประชุมทีม');
  assert.equal((await sessions()).length, 2);
  await expect(sidebar.getByRole('region', { name: 'วันนี้' }).locator('.session')).toHaveCount(2);
  const holiday = (await sessions()).find(s => s.messages[0].text.includes('วันหยุด'));
  const report = (await sessions()).find(s => s.messages[0].text.includes('รายงาน'));

  // Opening a task shows its own conversation.
  await task(holiday.title).locator('.session-open').click();
  await expect(page.locator('.message.assistant').last()).toContainText('19 วัน');
  await expect(task(holiday.title)).toHaveClass(/selected/);

  // Search finds text inside the conversation, in Thai, and says so when nothing matches.
  const search = sidebar.getByPlaceholder('ค้นหางานหรือเนื้อหา');
  await search.fill('รายงานการประชุม');
  await expect(sidebar.locator('.session')).toHaveCount(1);
  await expect(sidebar.locator('.session')).toContainText(report.title);
  await search.fill('19 วัน');
  await expect(sidebar.locator('.session')).toHaveCount(1);
  await expect(sidebar.locator('.session')).toContainText(holiday.title);
  await search.fill('ไม่มีคำนี้แน่นอน');
  await expect(sidebar.getByText('ไม่พบงานที่ตรงกับคำค้น')).toBeVisible();
  await search.fill('');
  await expect(sidebar.locator('.session')).toHaveCount(2);

  // The shortcut button beside search opens the command palette.
  await sidebar.getByRole('button', { name: 'เปิดคำสั่ง' }).click();
  await expect(page.getByRole('dialog').getByRole('combobox').or(page.getByRole('dialog').getByRole('textbox')).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // "มีผลงาน" lists only tasks with a saved draft.
  await sidebar.getByRole('tab', { name: 'มีผลงาน' }).click();
  await expect(sidebar.locator('.session')).toHaveCount(0);
  await sidebar.getByRole('tab', { name: 'งานทั้งหมด' }).click();
  await task(report.title).locator('.session-open').click();
  await page.locator('.message.assistant').last().getByRole('button', { name: 'เปิดใน Output' }).click();
  await expect.poll(async () => Boolean((await sessions()).find(s => s.id === report.id).draft)).toBe(true);
  await sidebar.getByRole('tab', { name: 'มีผลงาน' }).click();
  await expect(sidebar.locator('.session')).toHaveCount(1);
  await expect(sidebar.locator('.session')).toContainText(report.title);
  await sidebar.getByRole('tab', { name: 'งานทั้งหมด' }).click();
  await expect(sidebar.locator('.session')).toHaveCount(2);

  // Pin moves a task into its own group at the top; unpin puts it back.
  await task(report.title).hover();
  await task(report.title).getByRole('button', { name: 'ปักหมุด' }).click();
  await expect(sidebar.locator('section').first()).toHaveAttribute('aria-label', 'ปักหมุด');
  await expect(sidebar.getByRole('region', { name: 'ปักหมุด' })).toContainText(report.title);
  await task(report.title).hover();
  await task(report.title).getByRole('button', { name: 'เลิกปักหมุด' }).click();
  await expect(sidebar.getByRole('region', { name: 'ปักหมุด' })).toHaveCount(0);

  // Rename: Enter saves, Escape keeps the old name, clicking away saves.
  await task(report.title).hover();
  await task(report.title).getByRole('button', { name: 'เปลี่ยนชื่อ' }).click();
  await sidebar.getByRole('textbox', { name: 'ชื่องาน' }).fill('รายงานประชุม ต.ค.');
  await page.keyboard.press('Enter');
  await expect(task('รายงานประชุม ต.ค.')).toHaveCount(1);
  assert.equal((await sessions()).find(s => s.id === report.id).title, 'รายงานประชุม ต.ค.');
  await task('รายงานประชุม ต.ค.').hover();
  await task('รายงานประชุม ต.ค.').getByRole('button', { name: 'เปลี่ยนชื่อ' }).click();
  await sidebar.getByRole('textbox', { name: 'ชื่องาน' }).fill('ไม่ใช้ชื่อนี้');
  await page.keyboard.press('Escape');
  await expect(task('รายงานประชุม ต.ค.')).toHaveCount(1);
  await page.waitForTimeout(300);
  assert.equal((await sessions()).find(s => s.id === report.id).title, 'รายงานประชุม ต.ค.', 'Escape must not save the typed name');
  // Clicking away keeps the new name, as in other chat apps.
  await task('รายงานประชุม ต.ค.').hover();
  await task('รายงานประชุม ต.ค.').getByRole('button', { name: 'เปลี่ยนชื่อ' }).click();
  await sidebar.getByRole('textbox', { name: 'ชื่องาน' }).fill('รายงานประชุมทีม ต.ค.');
  await page.locator('.composer textarea').click();
  await expect(task('รายงานประชุมทีม ต.ค.')).toHaveCount(1);
  assert.equal((await sessions()).find(s => s.id === report.id).title, 'รายงานประชุมทีม ต.ค.');

  // Delete asks first; cancelling keeps the task, confirming removes it for good.
  await task(holiday.title).locator('.session-open').click();
  await expect(page.locator('.message.assistant').last()).toContainText('19 วัน');
  await task(holiday.title).hover();
  await task(holiday.title).getByRole('button', { name: 'ลบงาน' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'ยกเลิก' }).click();
  await expect(task(holiday.title)).toHaveCount(1);
  await task(holiday.title).hover();
  await task(holiday.title).getByRole('button', { name: 'ลบงาน' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'ลบงาน' }).click();
  await expect(task(holiday.title)).toHaveCount(0);
  assert.equal(
    (await sessions()).some(s => s.id === holiday.id),
    false,
  );
  // Deleting the open task clears its conversation from the main pane too.
  await expect(page.locator('.message')).toHaveCount(0);

  // Tools: the Skill hub, the receipt check and settings each open their page and mark themselves active.
  await sidebar.getByRole('button', { name: /ศูนย์รวม Skill/ }).click();
  await expect(page.locator('.topbar-heading strong')).toHaveText('ศูนย์รวม Skill');
  await expect(sidebar.getByRole('button', { name: /ศูนย์รวม Skill/ })).toHaveClass(/nav-active/);
  const count = Number(await sidebar.locator('nav .count').innerText());
  assert.ok(count > 0, 'the Skill hub shows how many Skills and tools there are');
  await sidebar.getByRole('button', { name: /ตรวจใบเสร็จ AFP/ }).click();
  await expect(page.locator('.topbar-heading strong')).toHaveText('ตรวจใบเสร็จก่อนส่ง AFP');
  await sidebar.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน' }).click();
  await expect(page.locator('.topbar-heading strong')).toHaveText('ตั้งค่าพื้นที่ทำงาน');
  await expect(page.getByRole('tab', { name: 'ทั่วไป' })).toHaveAttribute('aria-selected', 'true');
  // Opening a task from settings leaves settings.
  await task('รายงานประชุมทีม ต.ค.').locator('.session-open').click();
  await expect(page.locator('.topbar-heading strong')).toHaveText('รายงานประชุมทีม ต.ค.');

  // The profile shows the team; the sidebar can be hidden and shown again.
  await expect(sidebar.locator('.profile')).toContainText('ทีม CC');
  await page.getByRole('button', { name: 'ซ่อนแถบงาน' }).click();
  await expect(sidebar).toHaveCount(0);
  await page.getByRole('button', { name: 'แสดงแถบงาน' }).click();
  await expect(sidebar).toBeVisible();

  assert.deepEqual(errors, []);
  console.log('Sidebar smoke passed: new task, search, palette, filters, open, pin, rename, delete, Skill hub, receipt, settings, hide.');
} finally {
  await app.close();
  server.close();
}
