// Comments on plan tasks, used the way an employee would: comment on a step of an approved plan, edit it, and ask the
// assistant to revise the plan by the comments. Answers come from a local fake AI service that records what it was
// sent; nothing leaves this computer.
import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

const sent = [];
const server = createServer(async (req, res) => {
  let body = '';
  for await (const part of req) body += part;
  if (req.method === 'GET') return res.writeHead(404).end();
  sent.push(JSON.stringify(JSON.parse(body).messages));
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'ปรับแผนตามความเห็นแล้ว' } }] }) + '\n\n');
  res.end('data: [DONE]\n\n');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));

const home = await mkdtemp(join(tmpdir(), 'step-plan-comments-')),
  workspace = join(home, 'work'),
  out = join('release', 'qa', 'plan-comments');
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
const at = new Date(Date.now() - 10 * 60_000).toISOString();
put.run(
  'session',
  's-plan',
  JSON.stringify({
    id: 's-plan',
    title: 'จัดสัมมนา AI Harness',
    project: '',
    team: 'cc',
    connectionId: '',
    messages: [
      { role: 'user', text: 'วางแผนจัดสัมมนา AI Harness', at },
      { role: 'assistant', text: 'แผนพร้อมให้อนุมัติแล้ว', at },
    ],
    draft: '',
    revision: 0,
    versions: [],
    proposals: [],
    originalQuery: 'วางแผนจัดสัมมนา AI Harness',
    answers: [],
    status: 'review',
    updatedAt: at,
    sources: [],
    workPlan: {
      goal: 'จัดสัมมนา AI Harness ภายในเดือนธันวาคม',
      approvedAt: at,
      tasks: [
        { title: 'ร่างกำหนดการ — เสร็จเมื่อมีกำหนดการครึ่งวัน', status: 'done', note: 'ส่งให้ทีมแล้ว' },
        { title: 'จองห้องประชุม — เสร็จเมื่อได้เลขการจอง', status: 'todo' },
        { title: 'ขออนุมัติงบ (ผู้มีอำนาจ) — เสร็จเมื่อผู้อำนวยการลงนาม', status: 'todo' },
      ],
    },
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
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptString = s => Buffer.from('k' + s);
    safeStorage.decryptString = b => b.toString().slice(1);
  });
  const connection = await page.evaluate(async () => {
    const c = await window.step.call('connection', { provider: 'compatible', mode: 'api', preset: 'groq', apiKey: 'k', model: 'm' });
    await window.step.call('connect', { id: c.id });
    return c.id;
  });
  // The seeded task belongs to this AI connection, as one the employee started would.
  await app.evaluate(({ app }, connection) => {
    const { DatabaseSync } = process.mainModule.require('node:sqlite');
    const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
    const s = JSON.parse(db.prepare("SELECT value FROM records WHERE kind='session' AND id='s-plan'").get().value);
    db.prepare("UPDATE records SET value=? WHERE kind='session' AND id='s-plan'").run(JSON.stringify({ ...s, connectionId: connection }));
    db.close();
  }, connection);
  await page.reload();
  const stored = async () => (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.id === 's-plan');
  await page.locator('aside.sidebar').getByText('จัดสัมมนา AI Harness', { exact: true }).click();
  const card = page.locator('.work-plan');
  await card.getByText('เสร็จ 1/3').waitFor();
  // No comments yet: no revise button, and carrying out the plan stays the main action.
  await expect(card.getByRole('button', { name: /ให้ผู้ช่วยแก้แผนตามความเห็น/ })).toHaveCount(0);

  // A comment on step 2, saved with Ctrl+Enter, shows under the step and is kept on the task.
  await card.getByRole('button', { name: 'แสดงความเห็นข้อ 2' }).click();
  const box = card.getByRole('textbox', { name: 'ความเห็นต่อข้อนี้' });
  await expect(box).toBeFocused();
  await box.fill('ใช้ห้อง D203 ถ้าว่าง ติดต่อฝ่ายอาคาร');
  await page.keyboard.press('Control+Enter');
  await expect(card.locator('.work-plan-comment')).toHaveText('ความเห็นของคุณ: ใช้ห้อง D203 ถ้าว่าง ติดต่อฝ่ายอาคาร');
  assert.equal((await stored()).workPlan.tasks[1].comment, 'ใช้ห้อง D203 ถ้าว่าง ติดต่อฝ่ายอาคาร');

  // A second comment with the save button; Escape on a third leaves that step uncommented.
  await card.getByRole('button', { name: 'แสดงความเห็นข้อ 3' }).click();
  await box.fill('แยกเป็นขอใบเสนอราคาก่อน แล้วค่อยขออนุมัติ');
  await card.getByRole('button', { name: 'บันทึกความเห็น' }).click();
  await card.getByRole('button', { name: 'แสดงความเห็นข้อ 1' }).click();
  await box.fill('ไม่บันทึก');
  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);
  await expect(card.locator('.work-plan-comment')).toHaveCount(2);
  const revise = card.getByRole('button', { name: 'ให้ผู้ช่วยแก้แผนตามความเห็น (2)' });
  await expect(revise).toBeVisible();
  await card.evaluate(el => (el.scrollTop = 0));
  await page.screenshot({ path: join(out, 'comments.png') });

  // Editing a comment opens it with its text.
  await card.getByRole('button', { name: 'แก้ความเห็นข้อ 3' }).click();
  await expect(box).toHaveValue('แยกเป็นขอใบเสนอราคาก่อน แล้วค่อยขออนุมัติ');
  await box.fill('แยกเป็นขอใบเสนอราคา 3 ราย ก่อนขออนุมัติ');
  await page.keyboard.press('Control+Enter');
  await expect(card.getByText('ความเห็นของคุณ: แยกเป็นขอใบเสนอราคา 3 ราย ก่อนขออนุมัติ')).toBeVisible();

  // Revising sends the comments as the employee's request in the plan workflow, which then revises the current plan.
  await revise.click();
  await expect(page.getByRole('combobox', { name: 'โหมดทำงาน' })).toHaveValue('plan');
  // The task was already finished before the click, so wait for the request itself, then for its answer to be kept.
  await expect
    .poll(() => sent.some(body => body.includes('REVISE THE CURRENT PLAN')), {
      timeout: 30000,
      message: 'the plan workflow was asked to revise the plan',
    })
    .toBe(true);
  await expect
    .poll(async () => (await stored()).messages.some(m => m.role === 'assistant' && m.text === 'ปรับแผนตามความเห็นแล้ว'), {
      timeout: 30000,
    })
    .toBe(true);
  const request = sent.find(body => body.includes('REVISE THE CURRENT PLAN'));
  assert.match(request, /ปรับแผนตามความเห็นของฉันในแต่ละข้อ/);
  assert.match(request, /ข้อ 3 «ขออนุมัติงบ \(ผู้มีอำนาจ\)[^»]*»: แยกเป็นขอใบเสนอราคา 3 ราย ก่อนขออนุมัติ/);
  assert.match(request, /employee comment: ใช้ห้อง D203/);
  const user = (await stored()).messages.filter(m => m.role === 'user').at(-1);
  assert.match(user.text, /^ปรับแผนตามความเห็นของฉันในแต่ละข้อ\n- ข้อ 2/);

  // The narrow dark window keeps the card readable without sideways scrolling.
  await page.setViewportSize({ width: 760, height: 860 });
  await page.evaluate(() => window.step.call('settings', { assistant: 'STeP Mate', team: 'cc', theme: 'dark' }));
  await page.reload();
  await page
    .locator('aside.sidebar')
    .getByRole('button', { name: /จัดสัมมนา AI Harness/ })
    .first()
    .click()
    .catch(() => {});
  await card.getByText('เสร็จ 1/3').waitFor();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(width <= 760, `no sideways scroll at 760px (${width})`);
  await page.screenshot({ path: join(out, 'narrow.png') });
  assert.deepEqual(errors, []);
  console.log('Plan comments smoke passed: comment, edit, cancel, revise request in the plan workflow, narrow dark window.');
} finally {
  await app.close();
  server.close();
}
