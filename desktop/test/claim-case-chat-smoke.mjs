// ผู้ช่วยเบิกจ่าย: the chat inside a case, through the real renderer, preload, host and a local synthetic AI. The case
// chat asks the AI without opening the main chat, the consent dialog sends back into the case, a field proposal is
// accepted into the case, and the case's chat stays out of the chat list. All data is synthetic.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';

const out = resolve(process.argv[2] || (await mkdtemp(join(tmpdir(), 'step-claim-case-chat-output-'))));
await mkdir(out, { recursive: true });
const calls = [];
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  // Two models, so the case's own picker has a choice.
  if (req.method === 'GET' && req.url.endsWith('/models'))
    return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'm' }, { id: 'm2' }] }));
  if (req.method === 'GET') return res.writeHead(404).end();
  const parsed = JSON.parse(body);
  const system = (parsed.messages || [])
    .filter(message => message.role === 'system')
    .map(message => message.content)
    .join('\n');
  const prompt = parsed.messages?.at(-1)?.content || '';
  calls.push({ system, prompt, model: parsed.model });
  const current = /<current_message>\n([\s\S]*?)\n<\/current_message>/.exec(prompt)?.[1] || '';
  const answer = /ยืมเงิน/.test(current)
    ? 'ถ้ายืมเงินจากการเงินแล้วจ่ายไปแล้ว ต้องเคลียร์เงินยืมภายใน 3 วันทำการ ตามแนวปฏิบัติ AFP ข้อ 3.1 (ข้อความทดสอบ)\n\n```claim-update\n{"category":"B","finance":"b_clearance","activity":"meeting","amount":800}\n```'
    : 'SYNTHETIC-CASE-ANSWER';
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: answer } }] }) + '\n\n');
  res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\n');
  res.end('data: [DONE]\n\n');
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const home = await mkdtemp(join(tmpdir(), 'step-claim-case-chat-'));
const workspace = join(home, 'work');
await mkdir(workspace);
await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ features: { toolLoop: false, autoRouting: true } }));
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
// No accepted usage terms yet, so the first question asks for them.
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
  app = await electron.launch({ args: ['.'], env, timeout: 45_000 });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 1600, height: 960 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ safeStorage }) => {
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptString = value => Buffer.from('k' + value);
    safeStorage.decryptString = value => value.toString().slice(1);
  });
  await page.evaluate(async () => {
    const connection = await window.step.call('connection', {
      provider: 'compatible',
      mode: 'api',
      preset: 'groq',
      apiKey: 'synthetic',
      model: 'm',
    });
    await window.step.call('connect', { id: connection.id });
  });
  await page.reload();
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  const shot = name => page.screenshot({ path: join(out, `${name}.png`) });
  const snapshot = () => page.evaluate(() => window.step.call('snapshot'));

  await page.getByRole('button', { name: /ผู้ช่วยเบิกจ่าย/ }).click();
  await expect(page.locator('.topbar-heading strong')).toHaveText('ผู้ช่วยเบิกจ่าย');
  await page.getByRole('button', { name: 'ชุดเอกสารเบิกจ่าย', exact: true }).click();
  await page.getByRole('button', { name: 'เรื่องใหม่', exact: true }).click();
  await page.getByLabel('ชื่อเรื่องเบิก', { exact: true }).fill('ประชุมคณะทำงาน ข้อมูลสมมติ');
  await expect(page.locator('.case-list li button[aria-current="true"]')).toContainText('ประชุมคณะทำงาน ข้อมูลสมมติ');
  await expect(page.locator('.case-composer-ai')).toContainText('m');
  await expect(page.locator('.case-head [role="status"]')).toHaveText('บันทึกในเครื่องแล้ว');

  // A question that is not an interview answer goes to the AI in this case; the usage terms are asked first.
  const input = page.getByLabel('พิมพ์ในแชตเรื่องนี้', { exact: true });
  await input.fill('ถ้ายืมเงินจากการเงินไปจ่ายแล้วต้องทำอะไรต่อ ต้องเคลียร์ภายในกี่วัน?');
  await input.press('Enter');
  const consent = page.getByRole('button', { name: 'รับทราบและส่ง', exact: true });
  await expect(consent).toBeVisible();
  await page.getByLabel('ฉันอ่านและรับทราบข้อตกลงการใช้งาน', { exact: true }).check();
  await consent.click();

  const chat = page.getByRole('region', { name: 'แชตในเรื่องนี้' });
  await expect(chat.getByText(/ต้องเคลียร์เงินยืมภายใน 3 วันทำการ/)).toBeVisible({ timeout: 30_000 });
  await expect(chat.getByRole('meter', { name: 'หน้าต่างบริบท' })).toBeVisible();
  await expect(chat.locator('.message.user')).toContainText('ต้องเคลียร์ภายในกี่วัน');
  // The view never left the claims assistant, and the proposal block shows as a card, not as code.
  await expect(page.locator('.topbar-heading strong')).toHaveText('ผู้ช่วยเบิกจ่าย');
  await expect(chat).not.toContainText('claim-update');
  const proposal = chat.getByRole('group', { name: 'เสนอกรอกในเรื่องนี้' });
  await expect(proposal).toContainText('หมวด B (B1–B12)');
  await expect(proposal).toContainText('เคลียร์เงินยืม');
  await expect(proposal).toContainText('ประชุม');
  await expect(proposal).not.toContainText('800');
  assert.equal(await page.locator('.receipt-packets button.primary:visible').count(), 1, 'one primary action');
  await expect(page.locator('.case-head [role="status"]')).toHaveText('บันทึกในเครื่องแล้ว');
  await shot('1-case-chat-proposal');

  // The AI saw the claims rule and the case's fixed-label context, not the typed title.
  const asked = calls.find(call => call.prompt.includes('ต้องเคลียร์ภายในกี่วัน'));
  assert.ok(asked.system.includes('claim-update'));
  // ...and answered with the claims expert Skill (AFP categories, forms and deadlines).
  assert.ok(JSON.stringify(asked).includes('ผู้เชี่ยวชาญเรื่องเบิกจ่าย (แชตของเรื่อง)'), 'the case chat uses claims-case-expert');
  assert.ok(asked.prompt.includes('หมวด: ยังไม่แน่ใจ'));
  assert.ok(!asked.prompt.includes('ประชุมคณะทำงาน ข้อมูลสมมติ'));

  await proposal.getByRole('button', { name: 'ใช้ข้อมูลนี้', exact: true }).click();
  await expect(proposal).toHaveCount(0);
  await expect(chat.getByText('ข้อมูลที่เสนออยู่ในเรื่องนี้แล้ว', { exact: true })).toBeVisible();
  // Filled from the chat, the interview steps aside instead of asking what the claim is for.
  await expect(chat.getByText('เบิกค่าอะไร', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'หลักฐาน', exact: true }).click();
  const evidence = page.getByRole('region', { name: 'แนะนำเอกสารตามกิจกรรม' });
  await expect(evidence).toContainText('หมวด: หมวด B (B1–B12)');
  await expect(evidence).toContainText('กรณีการเงิน: เคลียร์เงินยืม');
  await expect(page.locator('.case-list li button[aria-current="true"]')).toContainText('หมวด B (B1–B12)');

  // A follow-up in the same case goes to the same chat; no second chat is made.
  await input.fill('ต้องแนบอะไรเพิ่มอีกบ้าง?');
  await input.press('Enter');
  await expect(chat.getByText('SYNTHETIC-CASE-ANSWER', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.case-head [role="status"]')).toHaveText('บันทึกในเครื่องแล้ว');
  await shot('2-case-chat-follow-up');

  // The case's chat is not in the chat list, the palette or the main chat.
  const all = (await snapshot()).sessions;
  const cases = all.filter(s => s.claimPacketId);
  assert.equal(cases.length, 1);
  assert.equal(cases[0].messages.filter(m => m.role === 'user').length, 2);
  await page.getByRole('button', { name: 'เริ่มงานใหม่' }).first().click();
  await expect(page.locator('.composer textarea')).toBeVisible();
  await expect(page.locator('.session')).toHaveCount(0);
  await expect(page.locator('.chat-content').getByText('SYNTHETIC-CASE-ANSWER', { exact: true })).toHaveCount(0);

  // Another case has its own chat, and coming back shows the first case's conversation again.
  await page.getByRole('button', { name: /ผู้ช่วยเบิกจ่าย/ }).click();
  await page.getByRole('button', { name: 'เรื่องใหม่', exact: true }).click();
  await expect(chat.locator('.message')).toHaveCount(0);
  await page.locator('.case-list li button', { hasText: 'ประชุมคณะทำงาน ข้อมูลสมมติ' }).click();
  await expect(chat.getByText('SYNTHETIC-CASE-ANSWER', { exact: true })).toBeVisible();

  // The case has its own AI picker like the main composer: another model for this case only.
  const picker = chat.getByRole('button', { name: 'เลือกบริการ โมเดลและระดับการคิด', exact: true });
  await picker.click();
  const menu = chat.getByRole('group', { name: 'AI ของเรื่องนี้' });
  await expect(menu.getByLabel('เลือกโมเดล', { exact: true }).locator('option[value="m2"]')).toHaveCount(1);
  await menu.getByLabel('เลือกโมเดล', { exact: true }).selectOption('m2');
  await expect(page.locator('.case-composer-ai')).toHaveText('m2');
  await shot('5-case-chat-model-picker');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  assert.equal((await snapshot()).sessions.find(s => s.claimPacketId).model, 'm2');

  // A file attached for the AI goes with the next question, as in the main chat; case evidence stays separate.
  const note = join(home, 'บันทึกประชุม-สมมติ.txt');
  await writeFile(note, 'SYNTHETIC-ATTACHED-NOTE ค่าอาหารว่าง 25 คน');
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, note);
  await chat.getByRole('button', { name: 'แนบไฟล์ให้ AI อ่าน', exact: true }).click();
  const chip = chat.locator('.attachments > span');
  await expect(chip).toContainText('บันทึกประชุม-สมมติ.txt');
  await input.fill('ไฟล์นี้ใช้เป็นหลักฐานได้ไหม?');
  await shot('6-case-chat-attached-file');
  const before = calls.length;
  await input.press('Enter');
  await expect(chat.getByText('SYNTHETIC-CASE-ANSWER', { exact: true })).toHaveCount(2, { timeout: 30_000 });
  await expect(chip).toHaveCount(0);
  const withFile = calls.slice(before).find(call => call.prompt.includes('ไฟล์นี้ใช้เป็นหลักฐานได้ไหม'));
  assert.ok(withFile, 'the question reached the AI');
  assert.ok(JSON.stringify(withFile).includes('SYNTHETIC-ATTACHED-NOTE'), 'the attached file went with it');
  assert.equal(withFile.model, 'm2');

  // A case is deleted from its row after a confirm in the same row; its chat goes with it.
  const rows = page.locator('.case-list li');
  const count = await rows.count();
  const doomed = rows.filter({ hasText: 'ประชุมคณะทำงาน ข้อมูลสมมติ' });
  await doomed.hover();
  await doomed.getByRole('button', { name: 'ลบเรื่อง “ประชุมคณะทำงาน ข้อมูลสมมติ”', exact: true }).click();
  const confirm = page.getByRole('group', { name: 'ยืนยันการลบ' });
  await confirm.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await expect(rows).toHaveCount(count);
  await doomed.hover();
  await doomed.getByRole('button', { name: 'ลบเรื่อง “ประชุมคณะทำงาน ข้อมูลสมมติ”', exact: true }).click();
  await confirm.getByRole('button', { name: 'ลบ', exact: true }).click();
  await expect(rows).toHaveCount(count - 1);
  await expect(rows.filter({ hasText: 'ประชุมคณะทำงาน ข้อมูลสมมติ' })).toHaveCount(0);
  await expect.poll(async () => (await snapshot()).sessions.filter(s => s.claimPacketId).length).toBe(0);
  await shot('7-case-deleted');

  // Dark and narrow.
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await shot('3-case-chat-dark');
  await page.setViewportSize({ width: 900, height: 900 });
  const overflow = await page.evaluate(() => {
    const box = document.querySelector('.receipt-packets').getBoundingClientRect();
    return box.right - document.documentElement.clientWidth;
  });
  assert.ok(overflow <= 0, `case view overflows by ${overflow}px`);
  await shot('4-case-chat-narrow');
  assert.deepEqual(errors, []);
  console.log(`Claim case chat smoke passed. Screenshots: ${out}`);
} finally {
  await app?.close();
  server.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
