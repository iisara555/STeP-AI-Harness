// ศูนย์ควบคุมงาน (task overview), used the way an employee would: tasks waiting on them on top with a count on the
// menu, a task running in the background, finished and failed tasks, opening one, and starting a new one. Answers come
// from a local fake AI service that holds one reply until the test lets it go; nothing leaves this computer.
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

const home = await mkdtemp(join(tmpdir(), 'step-agent-manager-')),
  workspace = join(home, 'work'),
  out = join('release', 'qa', 'agent-manager');
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
const seeded = (id, title, status, updatedAt, extra = {}) =>
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
      ...extra,
    }),
  );
seeded('s-wait', 'ร่างหนังสือเชิญประชุมคณะกรรมการ', 'waiting', minutes(5));
seeded('s-review', 'สรุปรายงานประชุมทีม', 'review', minutes(30), {
  workPlan: {
    goal: 'สรุปรายงาน',
    tasks: [
      { title: 'อ่านบันทึก', status: 'done' },
      { title: 'ร่างสรุป', status: 'done' },
      { title: 'ตรวจตัวเลข', status: 'todo' },
    ],
  },
});
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
  const entry = sidebar.locator('.manager-entry');
  // The task waiting for more information is counted on the menu entry before the overview is opened.
  await expect(entry.locator('.count.attention')).toHaveText('1');
  await entry.click();
  const manager = page.locator('.agent-manager');
  await expect(manager.getByRole('heading', { name: 'ศูนย์ควบคุมงาน', exact: true })).toBeAttached();
  const group = name => manager.getByRole('region', { name });
  await expect(group('รอคุณ').locator('.agent-task')).toHaveCount(1);
  await expect(group('รอคุณ')).toContainText('ร่างหนังสือเชิญประชุมคณะกรรมการ');
  await expect(group('รอคุณ')).toContainText('รอข้อมูลเพิ่มจากคุณ');
  await expect(group('เสร็จแล้ว รอตรวจ')).toContainText('แผนงาน เสร็จ 2/3');
  await expect(group('หยุดหรือไม่สำเร็จ')).toContainText('ตรวจใบเสร็จเดือนตุลาคม');
  await expect(group('กำลังทำ')).toHaveCount(0);
  await page.screenshot({ path: join(out, 'overview.png') });

  // A new task from the overview opens an empty chat; while its answer is held it shows as running in the overview.
  await manager.getByRole('button', { name: 'เริ่มงานใหม่' }).click();
  const composer = page.locator('.composer textarea');
  await expect(composer).toBeFocused();
  await composer.fill('ช่วยสรุปยอดขายไตรมาสนี้');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).sessions.some(s => s.status === 'running'), {
      timeout: 30000,
    })
    .toBe(true);
  await entry.click();
  await expect(group('กำลังทำ').locator('.agent-task')).toHaveCount(1);
  await expect(manager.locator('.agent-manager-counts')).toContainText('1/3');
  await page.screenshot({ path: join(out, 'running.png') });
  release();
  await expect(group('กำลังทำ')).toHaveCount(0, { timeout: 30000 });
  await expect(group('เสร็จแล้ว รอตรวจ').locator('.agent-task')).toHaveCount(2);

  // Opening a task goes to its conversation.
  await group('รอคุณ').locator('.agent-task').click();
  await expect(manager).toHaveCount(0);
  await expect(page.locator('.message.user').first()).toContainText('ร่างหนังสือเชิญประชุมคณะกรรมการ');

  // Folded to icons on a narrow dark window, the overview keeps its count on the rail icon.
  await page.setViewportSize({ width: 760, height: 860 });
  await page.evaluate(() => window.step.call('settings', { assistant: 'STeP Mate', team: 'cc', theme: 'dark' }));
  await page.reload();
  await expect(sidebar).toHaveClass(/rail/);
  const railEntry = sidebar.getByRole('button', { name: 'ศูนย์ควบคุมงาน (1)' });
  await expect(railEntry.locator('.rail-badge')).toHaveText('1');
  await railEntry.click();
  await expect(manager).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(width <= 760, `no sideways scroll at 760px (${width})`);
  await page.screenshot({ path: join(out, 'narrow.png') });
  assert.deepEqual(errors, []);
  console.log('Agent manager smoke passed: waiting count, groups, plan progress, running task, open, new task and rail badge.');
} finally {
  release?.();
  await app.close();
  server.close();
}
