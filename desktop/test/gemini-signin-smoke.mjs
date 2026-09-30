// Gemini sign-in with a fake ACP runtime: OAuth stays in browser + loopback-callback mode.
// The STeP app must never ask ACP stdin for a pasted authorization code. Uses no Google account.
import { _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-gemini-signin-'));
// Named like the real CLI and answering --version, as the runtime picker requires.
const runtime = join(home, 'gemini.js');
await writeFile(
  runtime,
  `
if (process.argv.includes('--version')) { console.log('0.61.0'); process.exit(0); }
const send = m => process.stdout.write(JSON.stringify(m) + '\\n');
// Like the real CLI, a successful sign-in is remembered in the runtime home, so later runs do not prompt.
const fs = require('node:fs'), creds = require('node:path').join(process.env.GEMINI_CLI_HOME || '.', 'fake-oauth-creds');
require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') send({ id: m.id, result: { protocolVersion: 1, authMethods: [{ id: 'oauth-personal', name: 'Log in with Google' }] } });
  else if (m.method === 'authenticate' && fs.existsSync(creds)) send({ id: m.id, result: {} });
  else if (m.method === 'authenticate') {
    if (process.env.NO_BROWSER) return send({ id: m.id, error: { code: -1, message: 'NO_BROWSER must not be set in ACP mode' } });
    process.stdout.write('Attempting to open authentication page in your browser.\\nhttps://accounts.google.com/o/oauth2/v2/auth?fake=1\\n');
    setTimeout(() => { fs.writeFileSync(creds, 'ok'); send({ id: m.id, result: {} }); }, 30);
  }
  else if (m.method === 'session/new') send({ id: m.id, result: { sessionId: 's', models: { availableModels: [{ modelId: 'gemini-test', name: 'Gemini Test' }], currentModelId: 'gemini-test' } } });
  else if (m.method === 'session/prompt' && fs.existsSync(require('node:path').join(__dirname, 'stall'))) { /* never answer */ }
  else if (m.method === 'session/prompt') { send({ method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'OK' } } } }); send({ id: m.id, result: {} }); }
  else if (m.id !== undefined) send({ id: m.id, result: {} });
});`,
);

const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor();
  const opened = [];
  await app.evaluate(({ dialog, shell }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    globalThis.__opened = [];
    shell.openExternal = async url => {
      globalThis.__opened.push(url);
    };
  }, runtime);
  // Connect while the wizard stays open, as an employee would from its "เชื่อมต่อ AI" step.
  await page.evaluate(async () => {
    const c = await window.step.call('connection', { provider: 'gemini', mode: 'subscription' });
    await window.step.call('runtime', { id: c.id });
    window.__connect = window.step.call('connect', { id: c.id });
  });
  await page.getByText('เปิดหน้าลงชื่อ Google แล้ว · รอการยืนยันจากเบราว์เซอร์').waitFor({ timeout: 20000 });
  assert.equal(await page.getByRole('textbox', { name: 'Authorization code' }).count(), 0, 'ACP OAuth must not use pasted codes');
  opened.push(...(await app.evaluate(() => globalThis.__opened)));
  assert.deepEqual(opened, [], 'Gemini CLI owns browser launch; STeP does not open a duplicate tab');
  const connection = await page.evaluate(() => window.__connect);
  assert.equal(connection.ready, true, connection.note);
  assert.equal(connection.models?.[0]?.id, 'gemini-test');
  // A provider that stalls in the test step shows progress and can be cancelled from the settings page.
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.evaluate(async file => {
    const c = await window.step.call('connection', { provider: 'gemini', mode: 'subscription' });
    await window.step.call('runtime', { id: c.id });
    window.__stall = c.id;
  }, runtime);
  await writeFile(join(home, 'stall'), '1');
  await page.evaluate(() => window.step.call('snapshot'));
  await page.keyboard.press('Control+K');
  await page.keyboard.type('ตั้งค่าพื้นที่ทำงาน');
  await page.keyboard.press('Enter');
  await page.getByRole('tab', { name: /การเชื่อมต่อ AI/ }).click();
  await page.getByRole('button', { name: 'เชื่อมต่อและทดสอบ' }).last().click();
  await page.getByText('ลงชื่อสำเร็จ · กำลังทดสอบส่งข้อความสั้น ๆ').waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await page.getByText(/ยกเลิกการเชื่อมต่อแล้ว \(CANCELLED\)/).waitFor({ timeout: 20000 });
  console.log(
    'Gemini sign-in smoke passed: browser OAuth uses no pasted code, connection ready; a stalled test shows progress and cancels.',
  );
} finally {
  await app.close();
}
