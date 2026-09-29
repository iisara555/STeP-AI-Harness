// Gemini sign-in with a fake ACP runtime: the sign-in code dialog must appear above the setup
// wizard, accept a code, and finish the connection. Uses a test profile; no Google account.
import { _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-gemini-signin-'));
const runtime = join(home, 'fake-gemini.cjs');
await writeFile(runtime, `
const send = m => process.stdout.write(JSON.stringify(m) + '\\n');
// Like the real CLI, a successful sign-in is remembered in the runtime home, so later runs do not prompt.
const fs = require('node:fs'), creds = require('node:path').join(process.env.GEMINI_CLI_HOME || '.', 'fake-oauth-creds');
let waitingCode = null;
require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
  let m; try { m = JSON.parse(line); } catch { if (waitingCode !== null) { const id = waitingCode; waitingCode = null; line.trim() === 'TEST-CODE' ? (fs.writeFileSync(creds, 'ok'), send({ id, result: {} })) : send({ id, error: { code: -1, message: 'bad code' } }); } return; }
  if (m.method === 'initialize') send({ id: m.id, result: { protocolVersion: 1, authMethods: [] } });
  else if (m.method === 'authenticate' && fs.existsSync(creds)) send({ id: m.id, result: {} });
  else if (m.method === 'authenticate') { process.stdout.write('Please visit the following URL to authorize the application:\\n\\nhttps://accounts.google.com/o/oauth2/v2/auth?fake=1\\n'); waitingCode = m.id; }
  else if (m.method === 'session/new') send({ id: m.id, result: { sessionId: 's', models: { availableModels: [{ modelId: 'gemini-test', name: 'Gemini Test' }], currentModelId: 'gemini-test' } } });
  else if (m.method === 'session/prompt') { send({ method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'OK' } } } }); send({ id: m.id, result: {} }); }
  else if (m.id !== undefined) send({ id: m.id, result: {} });
});`);

const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor();
  const opened = [];
  await app.evaluate(({ dialog, shell }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    globalThis.__opened = []; shell.openExternal = async url => { globalThis.__opened.push(url); };
  }, runtime);
  // Connect while the wizard stays open, as an employee would from its "เชื่อมต่อ AI" step.
  await page.evaluate(async () => {
    const c = await window.step.call('connection', { provider: 'gemini', mode: 'subscription' });
    await window.step.call('runtime', { id: c.id });
    window.__connect = window.step.call('connect', { id: c.id });
  });
  const codeBox = page.getByRole('textbox', { name: 'Authorization code' });
  await codeBox.waitFor({ timeout: 20000 });
  const box = await codeBox.boundingBox();
  const topmost = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[aria-label="ลงชื่อเข้าใช้ Google"]') !== null, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  assert.ok(topmost, 'the sign-in code dialog must sit above the setup wizard');
  opened.push(...await app.evaluate(() => globalThis.__opened));
  assert.ok(opened.some(url => url.startsWith('https://accounts.google.com/')), 'the Google sign-in page is opened');
  await codeBox.fill('TEST-CODE');
  await page.getByRole('button', { name: 'ยืนยัน' }).click();
  const connection = await page.evaluate(() => window.__connect);
  assert.equal(connection.ready, true, connection.note);
  assert.equal(connection.models?.[0]?.id, 'gemini-test');
  console.log('Gemini sign-in smoke passed: code dialog above the wizard, code accepted, connection ready.');
} finally { await app.close(); }
