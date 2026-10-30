// Task notifications in the task list, used the way an employee would: a dot on each task that waits on them, runs,
// or finished or stopped since they last opened it; the dot clears on opening; the folded list counts the tasks that
// wait on them; and search sits in the title bar. Answers come from a local fake AI service that holds one reply
// until the test lets it go; nothing leaves this computer.
import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

let release;
const held = new Promise(resolve => (release = resolve));
const server = createServer(async (req, res) => {
  let body = '';
  for await (const part of req) body += part;
  if (req.method === 'GET') return res.writeHead(404).end();
  const asked = JSON.stringify(JSON.parse(body).messages);
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  if (asked.includes('สรุปยอดขาย')) await held;
  res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'สรุปยอดขายเรียบร้อย' } }] }) + '\n\n');
  res.end('data: [DONE]\n\n');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));

const home = await mkdtemp(join(tmpdir(), 'step-task-alerts-')),
  workspace = join(home, 'work'),
  out = join('release', 'qa', 'task-alerts');
await mkdir(workspace);
await mkdir(out, { recursive: true });
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
const put = db.prepare('INSERT INTO records VALUES(?,?,?)');
put.run(
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
const minutes = n => new Date(Date.now() - n * 60_000).toISOString();
const seeded = (id, title, status, updatedAt) =>
  put.run(
    'session',
    id,
    JSON.stringify({
      id,
      title,
      project: '',
      team: 'cc',
      connectionId: '',
      messages: [{ role: 'user', text: title, at: updatedAt }],
      draft: '',
      revision: 0,
      versions: [],
      proposals: [],
      originalQuery: title,
      answers: [],
      clarification: status === 'waiting',
      status,
      updatedAt,
      sources: [],
    }),
  );
seeded('s-wait', 'ร่างหนังสือเชิญประชุมคณะกรรมการ', 'waiting', minutes(5));
seeded('s-review', 'สรุปรายงานประชุมทีม', 'review', minutes(30));
seeded('s-error', 'ตรวจใบเสร็จเดือนตุลาคม', 'error', minutes(90));
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
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptString = s => Buffer.from('k' + s);
    safeStorage.decryptString = b => b.toString().slice(1);
  });
  await page.evaluate(async () => {
    const c = await window.step.call('connection', { provider: 'compatible', mode: 'api', preset: 'groq', apiKey: 'k', model: 'm' });
    await window.step.call('connect', { id: c.id });
  });
  await page.reload();
  const sidebar = page.locator('aside.sidebar');
  const task = title => sidebar.locator('.session').filter({ hasText: title });
  const dot = title => task(title).locator('.task-alert');

  // On first launch the history counts as seen: only the task waiting on the employee shows its dot.
  await expect(dot('ร่างหนังสือเชิญประชุมคณะกรรมการ')).toHaveAttribute('aria-label', 'รอคุณ');
  await expect(dot('สรุปรายงานประชุมทีม')).toHaveCount(0);
  await expect(dot('ตรวจใบเสร็จเดือนตุลาคม')).toHaveCount(0);

  // Tasks finished or stopped since they were last opened show a dot each, until opened.
  await page.evaluate(() => localStorage.setItem('step.taskSeen', '{}'));
  await page.reload();
  await expect(dot('สรุปรายงานประชุมทีม')).toHaveAttribute('aria-label', 'เสร็จแล้ว ยังไม่ได้เปิดดู');
  await expect(dot('ตรวจใบเสร็จเดือนตุลาคม')).toHaveAttribute('aria-label', 'ไม่สำเร็จ ยังไม่ได้เปิดดู');
  await page.mouse.move(900, 400);
  await page.screenshot({ path: join(out, 'dots.png') });
  await task('สรุปรายงานประชุมทีม').locator('.session-open').click();
  await expect(page.locator('.message.user').first()).toContainText('สรุปรายงานประชุมทีม');
  await expect(dot('สรุปรายงานประชุมทีม')).toHaveCount(0);
  await expect(dot('ตรวจใบเสร็จเดือนตุลาคม')).toHaveCount(1);
  // Opening the waiting task does not clear its dot: it still waits on the employee.
  await task('ร่างหนังสือเชิญประชุมคณะกรรมการ').locator('.session-open').click();
  await page.mouse.move(900, 400);
  await expect(dot('ร่างหนังสือเชิญประชุมคณะกรรมการ')).toHaveCount(1);
  await expect(dot('สรุปรายงานประชุมทีม')).toHaveCount(0, { timeout: 2000 });

  // A new task runs with a dot; when it finishes while another task is open, its dot turns to "finished".
  await sidebar.getByRole('button', { name: 'เริ่มงานใหม่' }).click();
  const composer = page.locator('.composer textarea');
  await composer.fill('ช่วยสรุปยอดขายไตรมาสนี้');
  await page.keyboard.press('Enter');
  const running = sidebar.locator('.task-alert.running');
  await expect(running).toHaveCount(1, { timeout: 30000 });
  await task('ตรวจใบเสร็จเดือนตุลาคม').locator('.session-open').click();
  await page.mouse.move(900, 400);
  release();
  await expect(running).toHaveCount(0, { timeout: 30000 });
  await expect(sidebar.locator('.task-alert.done')).toHaveCount(1);

  // Search is in the title bar while the list is open, and filters the list by conversation text.
  const search = page.locator('header.titlebar').getByRole('searchbox', { name: 'ค้นหางานหรือเนื้อหา' });
  await search.fill('ใบเสร็จ');
  await expect(sidebar.locator('.session')).toHaveCount(1);
  await page.screenshot({ path: join(out, 'search.png') });
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(sidebar.locator('.session')).toHaveCount(4);

  // Folded to icons on a narrow dark window, the task list icon counts the tasks waiting on the employee.
  await page.setViewportSize({ width: 760, height: 860 });
  await page.evaluate(() => window.step.call('settings', { assistant: 'STeP Mate', team: 'cc', theme: 'dark' }));
  await page.reload();
  await expect(sidebar).toHaveClass(/rail/);
  await expect(page.locator('header.titlebar').getByRole('button', { name: 'ค้นหางานและคำสั่ง' })).toBeVisible();
  const railTasks = sidebar.getByRole('button', { name: 'งานทั้งหมด (1)' });
  await expect(railTasks.locator('.rail-badge')).toHaveText('1');
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(width <= 760, `no sideways scroll at 760px (${width})`);
  await page.screenshot({ path: join(out, 'narrow.png') });
  assert.deepEqual(errors, []);
  console.log(
    'Task alerts smoke passed: waiting, unseen finished and stopped dots, clearing on open, running dot, title bar search, rail badge.',
  );
} finally {
  release?.();
  await app.close();
  server.close();
}
