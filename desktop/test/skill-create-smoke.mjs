// "เพิ่ม Skill ของฉัน" → "สร้างจากวิธีทำงานของฉัน": three answers go to a synthetic AI, the draft is previewed with its
// review, an edit is kept, and "ใช้ Skill นี้" saves it for personal use after one confirmation. Isolated profile.
import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const headings = ['Purpose', 'เมื่อควรใช้', 'Inputs', 'Source', 'Workflow', 'Output', 'Authority', 'Handoff', 'Guardrails'];
const body = headings
  .map(
    h =>
      `## ${h}\n${h === 'Authority' ? 'AI ร่างได้ ผู้ใช้ต้องยืนยันก่อนส่ง' : h === 'Source' ? 'ไม่มี source ภายนอกที่จำเป็น' : 'เนื้อหาสังเคราะห์'}\n`,
  )
  .join('\n');
const skill = `<skill_md>\n---\nname: room-booking-email\ndescription: ใช้เมื่อพนักงานต้องร่างอีเมลขอจองห้องประชุมให้ครบรายละเอียด\nstandardVersion: 2\n---\n\n# ร่างอีเมลจองห้องประชุม\n\n${body}</skill_md>`;
const asked = [];
const server = createServer(async (request, response) => {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  if (request.method !== 'POST') return response.writeHead(404).end();
  const input = JSON.parse(raw);
  const system = (input.messages || [])
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n');
  const drafting = system.includes('one Skill file for STeP');
  if (drafting)
    asked.push(
      input.messages
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .join('\n'),
    );
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.write(
    'data: ' + JSON.stringify({ choices: [{ delta: { content: drafting ? skill : 'Synthetic connection check' } }] }) + '\n\n',
  );
  response.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\n');
  response.end('data: [DONE]\n\n');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const home = await mkdtemp(join(tmpdir(), 'step-skill-create-smoke-'));
const workspace = join(home, 'work');
await mkdir(workspace);
await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ pilot: false, features: { toolLoop: false, autoRouting: false } }));
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT,id TEXT,value TEXT,PRIMARY KEY(kind,id))');
db.prepare('INSERT INTO records VALUES(?,?,?)').run(
  'settings',
  'main',
  JSON.stringify({
    team: 'cc',
    userName: 'พนักงานสังเคราะห์',
    assistant: 'Synthetic',
    workspace,
    theme: 'light',
    onboarding: true,
    tourDone: true,
    whatsNewSeen: '999.0.0',
    consentedAt: new Date().toISOString(),
    termsVersion: '2026-10-02',
  }),
);
db.close();
const env = {
  ...process.env,
  STEP_DESKTOP_TEST_HOME: home,
  STEP_DISABLE_UPDATES: '1',
  STEP_TEST_PRESET_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`,
};
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 900 });
  await app.evaluate(({ safeStorage, dialog }) => {
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptString = value => Buffer.from('k' + value);
    safeStorage.decryptString = value => value.toString().slice(1);
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  });
  await page.evaluate(async () => {
    const c = await window.step.call('connection', {
      provider: 'compatible',
      mode: 'api',
      preset: 'groq',
      apiKey: 'synthetic',
      model: 'm',
    });
    await window.step.call('connect', { id: c.id });
  });
  await page.reload();
  await page.locator('[data-tour="skills"]').click();
  await page.locator('.skills-hub').getByRole('button', { name: 'เพิ่ม Skill ของฉัน', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'เพิ่ม Skill ของฉัน' });
  await dialog.getByRole('button', { name: 'สร้างจากวิธีทำงานของฉัน', exact: true }).click();
  const draftButton = dialog.getByRole('button', { name: 'ให้ AI ร่าง Skill', exact: true });
  await expect(draftButton).toBeDisabled();
  await dialog.getByLabel('1. งานนี้คืออะไร และใช้เมื่อไร').fill('ร่างอีเมลขอจองห้องประชุม ใช้เมื่อมีคนขอให้จองห้อง');
  await dialog.getByLabel('2. ทำทีละขั้นอย่างไร').fill('1. ถามวัน เวลา จำนวนคน\n2. เช็กห้องว่าง\n3. ร่างอีเมลให้หัวหน้าตรวจ');
  await expect(dialog).toContainText('ข้อความนี้จะส่งให้');
  await draftButton.click();
  const preview = dialog.getByLabel('ตัวอย่าง Skill ที่ AI ร่าง แก้ได้ก่อนใช้');
  await expect(preview).toHaveValue(/name: room-booking-email/);
  await expect(dialog.getByRole('status').first()).toContainText('ผ่านการตรวจความปลอดภัย พร้อมใช้');
  assert.equal(asked.length, 1);
  assert.match(asked[0], /เช็กห้องว่าง/);
  // The person's edit is what gets saved.
  await preview.fill((await preview.inputValue()).replace('เนื้อหาสังเคราะห์', 'ถามวัน เวลา และจำนวนคนที่เข้าประชุม'));
  await dialog.getByRole('button', { name: 'ใช้ Skill นี้', exact: true }).click();
  const item = dialog.locator('section.pack-item').filter({ hasText: 'room-booking-email ·' });
  await expect(item.getByRole('button', { name: 'เลิกใช้เอง', exact: true })).toBeVisible();
  await expect(item).toContainText('นำเข้าโดย พนักงานสังเคราะห์');
  const saved = await readFile(join(workspace, '.step', 'packs', 'room-booking-email', 'assets', 'SKILL.md'), 'utf8');
  assert.match(saved, /ถามวัน เวลา และจำนวนคนที่เข้าประชุม/);
  console.log('Skill create smoke passed: three answers, AI draft preview with review, edit kept, one-step personal use.');
} finally {
  await app?.close().catch(() => {});
  server.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
