// "ให้ AI แก้ตามมาตรฐาน": an imported Skill that fails Standard v2 (short description, no version, no headings) gets one
// next step. A synthetic AI restructures it, the preview shows the new review and the one original line it dropped, the
// person restores that line, and "ใช้ฉบับนี้" saves over the same pack, keeps the credit and the original, and offers
// use after one confirmation. Isolated profile. Set STEP_SHOTS=<folder> to keep screenshots.
import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const shots = process.env.STEP_SHOTS;
const headings = ['Purpose', 'เมื่อควรใช้', 'Inputs', 'Source', 'Workflow', 'Output', 'Authority', 'Handoff', 'Guardrails'];
const legacy = `---
name: weekly-report
description: รายงาน
---

# รายงานประจำสัปดาห์

## ขั้นตอน
1. รวมงานที่เสร็จจากตารางงานประจำสัปดาห์
2. เขียนสรุปไม่เกินครึ่งหน้า แยกงานที่เสร็จ งานค้าง และปัญหา
3. ส่งให้หัวหน้าฝ่ายตรวจก่อนวันศุกร์

ห้ามใส่ราคาที่ยังไม่อนุมัติในรายงาน
`;
// The synthetic AI keeps everything except step 2, so the preview has a dropped line to show.
const section = h =>
  h === 'Workflow'
    ? '1. รวมงานที่เสร็จจากตารางงานประจำสัปดาห์\n2. ส่งให้หัวหน้าฝ่ายตรวจก่อนวันศุกร์'
    : h === 'Guardrails'
      ? 'ห้ามใส่ราคาที่ยังไม่อนุมัติในรายงาน\nห้ามส่งรายงานแทนผู้ใช้'
      : h === 'Authority'
        ? 'AI ร่างได้ ผู้ใช้ต้องยืนยันก่อนส่ง'
        : h === 'Source'
          ? 'ตารางงานประจำสัปดาห์ของฝ่าย'
          : 'เนื้อหาสังเคราะห์';
const fixed = `<skill_md>\n---\nname: weekly-report\ndescription: ใช้เมื่อพนักงานต้องเขียนรายงานประจำสัปดาห์ส่งหัวหน้าฝ่าย\nstandardVersion: 2\n---\n\n# รายงานประจำสัปดาห์\n\n${headings.map(h => `## ${h}\n${section(h)}\n`).join('\n')}</skill_md>`;
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
  const fixing = system.includes('restructure one existing Skill file');
  if (fixing)
    asked.push(
      input.messages
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .join('\n'),
    );
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.write('data: ' + JSON.stringify({ choices: [{ delta: { content: fixing ? fixed : 'Synthetic connection check' } }] }) + '\n\n');
  response.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\n');
  response.end('data: [DONE]\n\n');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const home = await mkdtemp(join(tmpdir(), 'step-skill-fix-smoke-'));
const workspace = join(home, 'work');
await mkdir(workspace);
const source = join(home, 'SKILL.md');
await writeFile(source, legacy);
await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ pilot: false, features: { toolLoop: false, autoRouting: false } }));
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT,id TEXT,value TEXT,PRIMARY KEY(kind,id))');
db.prepare('INSERT INTO records VALUES(?,?,?)').run(
  'settings',
  'main',
  JSON.stringify({
    team: 'cc',
    userName: 'ก้อง',
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
  await app.evaluate(({ safeStorage, dialog }, file) => {
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptString = value => Buffer.from('k' + value);
    safeStorage.decryptString = value => value.toString().slice(1);
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, source);
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
  await dialog.getByRole('button', { name: 'เลือกไฟล์ Skill (.md)', exact: true }).click();
  const item = dialog.locator('section.pack-item').filter({ hasText: 'weekly-report ·' });
  await expect(item).toContainText('ต้องแก้ 2 ข้อก่อนใช้');
  await expect(item).toContainText('ขาดหัวข้อบังคับตามมาตรฐาน v2');
  // The failing Skill has one next step instead of "แก้ตามผลตรวจ" with nothing to press.
  await expect(item).not.toContainText('ยังใช้ไม่ได้: แก้ตามผลตรวจ');
  const fix = item.getByRole('button', { name: 'ให้ AI แก้ตามมาตรฐาน', exact: true });
  if (shots) await dialog.screenshot({ path: join(shots, '01-before.png') });
  await fix.click();
  const preview = item.getByLabel('ฉบับที่ AI แก้ แก้ต่อได้ก่อนใช้');
  await expect(preview).toHaveValue(/standardVersion: 2/);
  await expect(item.getByRole('status').first()).toContainText('ผ่านการตรวจความปลอดภัย พร้อมใช้');
  await expect(item.getByRole('alert')).toContainText('เนื้อหาเดิมหายไป 1 บรรทัด ตรวจก่อนใช้');
  await expect(item.locator('.skill-fix-lost li')).toHaveText(['เขียนสรุปไม่เกินครึ่งหน้า แยกงานที่เสร็จ งานค้าง และปัญหา']);
  assert.equal(asked.length, 1);
  assert.match(asked[0], /ส่งให้หัวหน้าฝ่ายตรวจก่อนวันศุกร์/);
  assert.match(asked[0], /description สั้นเกินไป/);
  if (shots) await dialog.screenshot({ path: join(shots, '02-preview.png') });
  // The person puts the dropped step back; what they edit is what gets saved.
  await preview.fill(
    (await preview.inputValue()).replace(
      '2. ส่งให้หัวหน้าฝ่ายตรวจก่อนวันศุกร์',
      '2. เขียนสรุปไม่เกินครึ่งหน้า แยกงานที่เสร็จ งานค้าง และปัญหา\n3. ส่งให้หัวหน้าฝ่ายตรวจก่อนวันศุกร์',
    ),
  );
  await item.getByRole('button', { name: 'ใช้ฉบับนี้', exact: true }).click();
  await expect(item.getByRole('button', { name: 'เลิกใช้เอง', exact: true })).toBeVisible();
  await expect(item).toContainText('ผ่านการตรวจความปลอดภัย พร้อมใช้');
  await expect(item).toContainText('นำเข้าโดย ก้อง');
  const folder = join(workspace, '.step', 'packs', 'weekly-report');
  const saved = await readFile(join(folder, 'assets', 'SKILL.md'), 'utf8');
  assert.match(saved, /^---\nname: weekly-report\n/);
  assert.match(saved, /2\. เขียนสรุปไม่เกินครึ่งหน้า/);
  assert.equal(await readFile(join(folder, 'before-ai-fix.md'), 'utf8'), legacy);
  if (shots) await dialog.screenshot({ path: join(shots, '03-after.png') });
  // "ลบ Skill" sits with the other file actions under เพิ่มเติม, asks once, and removes the pack from the list and disk.
  await item.locator('summary', { hasText: 'เพิ่มเติม' }).click();
  if (shots) await dialog.screenshot({ path: join(shots, '04-delete.png') });
  await item.getByRole('button', { name: 'ลบ Skill', exact: true }).click();
  await expect(dialog.locator('section.pack-item')).toHaveCount(0);
  await expect(dialog).toContainText('ยังไม่มี Skill ของคุณบนเครื่องนี้');
  await expect(readFile(join(folder, 'assets', 'SKILL.md'))).rejects.toThrow();
  console.log(
    'Skill fix smoke passed: one next step, AI restructure with review and dropped-line report, edit kept, same pack, one-step use, then delete.',
  );
} finally {
  await app?.close().catch(() => {});
  server.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
