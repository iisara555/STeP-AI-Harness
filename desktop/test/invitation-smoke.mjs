// Full renderer/preload/host/export path with synthetic data and an isolated profile.
import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

const draft = (await readFile(new URL('./fixtures/step-invitation.md', import.meta.url), 'utf8')).trim();
const calls = [];
const server = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  if (request.method !== 'POST') return response.writeHead(404).end();
  const input = JSON.parse(body);
  const system =
    input.messages
      ?.filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n') || '';
  if (system.includes('<document_tool_contract>')) calls.push(system);
  const text = system.includes('<document_tool_contract>')
    ? `<document_draft>${draft}</document_draft><document_review>ผลตรวจสังเคราะห์</document_review>`
    : 'Synthetic connection check';
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.write('data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n');
  response.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\n');
  response.end('data: [DONE]\n\n');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const home = await mkdtemp(join(tmpdir(), 'step-invitation-smoke-'));
const workspace = join(home, 'work');
await mkdir(workspace);
await writeFile(
  join(home, 'desktop-policy.json'),
  JSON.stringify({ pilot: false, checks: { authority: true, privacy: true }, features: { toolLoop: false, autoRouting: false } }),
);
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT,id TEXT,value TEXT,PRIMARY KEY(kind,id))');
db.prepare('INSERT INTO records VALUES(?,?,?)').run(
  'settings',
  'main',
  JSON.stringify({
    team: 'ga',
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
const qa = process.env.STEP_INVITATION_QA_DIR && resolve(process.env.STEP_INVITATION_QA_DIR);
if (qa) await mkdir(qa, { recursive: true });
let app;
try {
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => {
    void dialog.accept().catch(() => {});
  });
  await app.evaluate(({ safeStorage }) => {
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptString = value => Buffer.from('k' + value);
    safeStorage.decryptString = value => value.toString().slice(1);
  });
  const connection = await page.evaluate(async () => {
    const c = await window.step.call('connection', {
      provider: 'compatible',
      mode: 'api',
      preset: 'groq',
      apiKey: 'synthetic',
      model: 'm',
    });
    await window.step.call('connect', { id: c.id });
    return c.id;
  });
  await page.reload();
  await page.locator('aside.sidebar').getByRole('button', { name: 'เครื่องมือร่างเอกสาร', exact: true }).click();
  await page
    .locator('.document-tool-picker')
    .getByRole('button', { name: /^ร่างหนังสือราชการ/ })
    .click();
  const form = page.locator('.document-form');
  await form.getByLabel('ชนิด / เรื่อง', { exact: true }).selectOption('invitation');
  const number = form.getByLabel('เลขหนังสือ', { exact: true });
  await expect(number).toHaveAttribute('placeholder', 'เช่น ศธ 0000/0123');
  await expect(number).toHaveValue('');
  await expect(form.getByLabel('วันปิดตอบรับ', { exact: true })).toHaveAttribute('placeholder', 'เช่น 15 มกราคม 2570');
  await expect(form.getByLabel('ลิงก์ตอบรับเข้าร่วมงาน')).toHaveAttribute('placeholder', 'https://example.org/rsvp');
  await expect(form.getByRole('button', { name: 'ให้ AI ร่างเอกสาร' })).toBeDisabled();
  await form.getByLabel('เรื่อง', { exact: true }).fill('กิจกรรมสังเคราะห์');
  await form.getByLabel('ตำแหน่ง / หน่วยงานผู้รับ').fill('ตำแหน่งสังเคราะห์');
  await form.getByLabel('วันปิดตอบรับ', { exact: true }).fill('15 มกราคม 2570');
  await form.getByLabel('ลิงก์ตอบรับเข้าร่วมงาน').fill('javascript:alert(1)');
  await expect(form.getByRole('button', { name: 'ให้ AI ร่างเอกสาร' })).toBeDisabled();
  await expect(form.getByRole('alert')).toContainText('http://');
  await form.getByLabel('ลิงก์ตอบรับเข้าร่วมงาน').fill('https://example.org/rsvp?code=0007');
  await form.getByLabel('ลิงก์แผนที่สถานที่จัดงาน').fill('https://example.org/map#room');
  await expect(form.getByRole('img')).toHaveCount(2);
  if (qa) await page.screenshot({ path: join(qa, 'form.png'), fullPage: true });
  await form.getByRole('button', { name: 'ให้ AI ร่างเอกสาร' }).click();
  const consent = page.getByRole('button', { name: 'มีสิทธิ์ส่งข้อมูลนี้', exact: true });
  await expect(consent).toBeVisible();
  await consent.click();
  const snapshot = () => page.evaluate(() => window.step.call('snapshot'));
  await expect
    .poll(async () => (await snapshot()).sessions.find(s => s.documentVariant === 'invitation')?.status, { timeout: 30000 })
    .toBe('review');
  const session = (await snapshot()).sessions.find(s => s.documentVariant === 'invitation');
  assert.ok(calls.at(-1).includes('STeP invitations use the single STeP invitation standard'));
  assert.ok(session.proposals[0].sources.some(p => p.endsWith('step-invitation-guide.md')));
  const editor = page.locator('.tiptap');
  const accept = page.getByRole('button', { name: 'ใช้ร่างนี้', exact: true });
  const format = page.getByLabel('รูปแบบส่งออก');
  const exportDraft = 'ร่างสังเคราะห์ที่แก้ก่อนรับข้อเสนอ';
  await expect(accept).toBeVisible();
  await editor.fill(exportDraft);
  await format.selectOption('pdf');
  await page.getByRole('button', { name: 'ส่งออก', exact: true }).click();
  const invalidLayout = page.getByRole('alert').filter({ hasText: 'การตั้งค่ารูปแบบเอกสารไม่ถูกต้อง' });
  const exportStatus = page.locator('.document-export-info');
  await expect(exportStatus.or(invalidLayout)).toBeVisible();
  assert.equal(await invalidLayout.count(), 0, 'exporting the edited invitation before acceptance must save its STeP presentation');
  await expect(exportStatus).toContainText('TH SarabunPSK');
  const current = async () => (await snapshot()).sessions.find(s => s.id === session.id);
  assert.equal((await current()).draft, exportDraft);
  assert.deepEqual((await current()).presentation.invitation, session.presentation.invitation);

  // A chat beside the pending proposal also saves edits first and keeps the invitation and its QR links.
  const unsaved = 'ร่างสังเคราะห์ที่แก้ก่อนคุยต่อ';
  const followUp = 'ควรตรวจข้อมูลส่วนไหนก่อนส่งเอกสารนี้?';
  await editor.fill(unsaved);
  const composer = page.locator('.composer textarea');
  await composer.fill(followUp);
  await composer.press('Enter');
  const answer = page.getByText('Synthetic connection check', { exact: true });
  await expect(consent.or(answer)).toBeVisible({ timeout: 30000 });
  if (await consent.isVisible()) await consent.click();
  await expect(answer).toBeVisible({ timeout: 30000 });
  assert.equal((await current()).draft, unsaved);
  assert.equal((await current()).documentVariant, 'invitation');
  assert.deepEqual((await current()).presentation.invitation, session.presentation.invitation);
  await expect(accept).toBeVisible();
  await accept.click();
  await page.getByRole('button', { name: 'ยืนยันใช้ร่างนี้', exact: true }).click();
  await expect(accept).toHaveCount(0);
  await format.selectOption('docx');
  await editor.click();
  await editor.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await editor.press('Enter');
  await page.keyboard.insertText('บรรทัดที่เจ้าของแก้ไขเอง');
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect.poll(async () => (await snapshot()).sessions.find(s => s.id === session.id)?.draft).toContain('บรรทัดที่เจ้าของแก้ไขเอง');
  await page.getByRole('button', { name: 'ตั้งค่าส่งออก', exact: true }).click();
  await expect(page.getByLabel('ฟอนต์ DOCX', { exact: true })).toHaveCount(0);
  const settings = page.locator('.export-settings');
  await settings.getByLabel('ลิงก์ตอบรับเข้าร่วมงาน').fill('https://example.org/updated?code=0007');
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect
    .poll(async () => (await snapshot()).sessions.find(s => s.id === session.id)?.presentation?.invitation?.rsvpUrl)
    .toBe('https://example.org/updated?code=0007');
  await expect(page.getByRole('button', { name: 'บันทึก', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.locator('.export-settings').getByLabel('ลิงก์ตอบรับเข้าร่วมงาน')).toHaveValue('https://example.org/updated?code=0007');
  await expect(page.locator('.tiptap')).toContainText('บรรทัดที่เจ้าของแก้ไขเอง');
  for (const format of ['docx', 'pdf']) {
    const exported = await page.evaluate(({ id, format }) => window.step.call('export', { id, format }), { id: session.id, format });
    const bytes = await readFile(exported.path);
    if (format === 'docx') {
      const zip = await JSZip.loadAsync(bytes);
      const xml = (await zip.file('word/document.xml').async('string')).replaceAll('\u200b', '');
      assert.ok(xml.includes('บรรทัดที่เจ้าของแก้ไขเอง'));
      assert.ok(!xml.includes('ผลตรวจสังเคราะห์'));
      assert.ok(!xml.includes('[รอยืนยัน:') && !xml.includes('ศธ 0000/0123'));
    } else assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    if (qa) await copyFile(exported.path, join(qa, 'invitation.' + format));
  }
  const register = page.locator('.export-settings .invitation-register');
  await register.getByRole('button', { name: 'เพิ่มผู้รับ / หน่วยงาน', exact: true }).click();
  await register.getByRole('button', { name: 'เพิ่มผู้รับ / หน่วยงาน', exact: true }).click();
  const rows = register.locator('.invitation-recipient-row');
  await expect(rows).toHaveCount(2);
  await rows.nth(0).getByLabel('เลขหนังสือรายฉบับ').fill('ศธ 0000/0201');
  await rows.nth(0).getByLabel('ผู้รับ (เรียน)').fill('ผู้อำนวยการสำนักงานตัวอย่างที่ 1');
  await rows.nth(0).getByLabel('ตำแหน่ง / หน่วยงานผู้รับ').fill('สำนักงานตัวอย่างที่ 1');
  await rows.nth(0).getByLabel('จำนวนที่นั่งที่เชิญ').fill('2');
  await rows.nth(0).getByLabel('สถานะตอบรับ').selectOption('confirmed');
  await rows.nth(1).getByLabel('เลขหนังสือรายฉบับ').fill('ศธ 0000/0202');
  await rows.nth(1).getByLabel('ผู้รับ (เรียน)').fill('คณบดีคณะตัวอย่างที่ 2');
  await rows.nth(1).getByLabel('ตำแหน่ง / หน่วยงานผู้รับ').fill('มหาวิทยาลัยตัวอย่างที่ 2');
  await rows.nth(1).getByLabel('จำนวนที่นั่งที่เชิญ').fill('3');
  await rows.nth(1).getByLabel('สถานะตอบรับ').selectOption('delegate');
  await rows.nth(1).getByLabel('จำนวนผู้ยืนยันเข้าร่วม').fill('1');
  await expect(register.locator('.invitation-summary')).toContainText(
    'หนังสือ 2 ฉบับ · ที่นั่งเชิญรวม 5 ที่นั่ง · ตอบรับแล้ว 2 ฉบับ (ยืนยันเข้าร่วม 3 คน)',
  );
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect
    .poll(async () => (await snapshot()).sessions.find(s => s.id === session.id)?.presentation?.invitation?.recipients?.length)
    .toBe(2);
  const batchDocx = await page.evaluate(({ id }) => window.step.call('export', { id, format: 'docx' }), { id: session.id });
  assert.equal(batchDocx.count, 2);
  assert.equal(batchDocx.paths.length, 2);
  for (const [index, expectedText] of [
    [0, 'ผู้อำนวยการสำนักงานตัวอย่างที่ 1'],
    [1, 'คณบดีคณะตัวอย่างที่ 2'],
  ]) {
    const zip = await JSZip.loadAsync(await readFile(batchDocx.paths[index]));
    const xml = (await zip.file('word/document.xml').async('string')).replaceAll('\u200b', '');
    assert.ok(xml.includes(expectedText));
  }
  const registerXlsx = await page.evaluate(({ id }) => window.step.call('export', { id, format: 'xlsx' }), { id: session.id });
  const xlsxZip = await JSZip.loadAsync(await readFile(registerXlsx.path));
  const workbookXml = await xlsxZip.file('xl/workbook.xml').async('string');
  assert.ok(workbookXml.includes('ทะเบียนหนังสือเชิญ'));
  // A long letter retains the signature/contact/QR group while its narrative flows to later pages.
  await page.evaluate(async id => {
    const current = (await window.step.call('snapshot')).sessions.find(s => s.id === id);
    const document = structuredClone(current.document);
    const index = document.content.findIndex(n => n.content?.some(c => c.text === 'ขอแสดงความนับถือ'));
    document.content.splice(
      index,
      0,
      ...Array.from({ length: 32 }, () => ({
        type: 'paragraph',
        content: [
          { type: 'text', text: 'เนื้อหาสังเคราะห์สำหรับตรวจการไหลต่อหน้ากระดาษ โดยคงรายละเอียดและขนาดตัวอักษรตามมาตรฐานขององค์กร' },
        ],
      })),
    );
    await window.step.call('edit', { id, text: '', document, presentation: current.presentation, revision: current.revision });
  }, session.id);
  for (const format of ['docx', 'pdf']) {
    const result = await page.evaluate(({ id, format }) => window.step.call('export', { id, format }), { id: session.id, format });
    if (qa) await copyFile(result.path, join(qa, 'long.' + format));
  }
  await page.evaluate(async connectionId => {
    const s = await window.step.call('create', { connectionId });
    const request = { id: s.id, text: 'ช่วยร่างหนังสือเชิญ', mode: 'chat' };
    let result = await window.step.call('send', request);
    if (result.consent) result = await window.step.call('send', { ...request, consent: result.consent.token });
    if (!result.started) throw new Error('Chat invitation did not start');
  }, connection);
  await expect
    .poll(async () => (await snapshot()).sessions.find(s => s.id !== session.id && s.documentVariant === 'invitation')?.proposals.length, {
      timeout: 30000,
    })
    .toBe(1);
  const other = (await snapshot()).sessions.find(s => s.id !== session.id && s.documentVariant === 'invitation');
  assert.deepEqual(other.presentation.invitation, { rsvpUrl: '', venueUrl: '' }, 'new chat invitations do not inherit another event QR');
  assert.deepEqual(errors, []);
  console.log('PASS: STeP invitation form/chat, export and follow-up before acceptance, QR persistence, latest edits and long letters.');
} catch (error) {
  if (app && qa) await (await app.firstWindow()).screenshot({ path: join(qa, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  if (app) {
    await app
      .evaluate(({ BrowserWindow }) => {
        for (const window of BrowserWindow.getAllWindows()) window.destroy();
      })
      .catch(() => {});
    await app.close().catch(() => {});
  }
  await new Promise(r => server.close(r));
  await rm(home, { recursive: true, force: true, maxRetries: 5 });
}
