// Real renderer/preload/host/native-stream boundary with a synthetic runtime; no account or quota.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-antigravity-smoke-'));
const executable = join(home, 'agy.mjs');
const marker = join(home, 'unsafe');
const calls = join(home, 'calls');
await writeFile(
  executable,
  `
import fs from 'node:fs';import {createInterface} from 'node:readline';
const args=process.argv.slice(2),marker=${JSON.stringify(marker)},calls=${JSON.stringify(calls)};
if(args[0]==='--version'){console.log('1.2.14');process.exit(0);}
if(args[0]==='models'){console.log('gemini-3.8-flash-medium\\tGemini fixture');process.exit(0);}
const send=x=>console.log(JSON.stringify(x));
send({event:'init',conversation_id:'fixture',init:{cwd:process.cwd(),agent:'step-draft',model:'gemini-3.8-flash-medium',permission_mode:'strict',tools:fs.existsSync(marker)?['run_command']:['finish']}});
createInterface({input:process.stdin}).on('line',line=>{
fs.appendFileSync(calls,'prompt\\n');
send({event:'result',result:{status:'SUCCESS',conversation_id:'fixture',num_turns:1,response:'OK',usage:{input_tokens:2,output_tokens:1,total_tokens:3}}});
});
`,
);
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'การเชื่อมต่อ AI' }).click();
  // Employees find Antigravity among the services, not only in the administrators' form.
  await page.getByRole('radio', { name: /Gemini via Antigravity/ }).click();
  assert.equal(await page.getByLabel('โมเดล', { exact: true }).inputValue(), 'gemini-3.8-flash-medium');
  assert.equal(await page.getByLabel(/API key/).count(), 0);
  await expect(page.getByRole('button', { name: 'วิธีติดตั้งและลงชื่อเข้าใช้ Antigravity' })).toBeVisible();
  await page.getByRole('button', { name: 'ตั้งค่าขั้นสูงสำหรับผู้ดูแล' }).click();
  await page.getByRole('combobox', { name: /ผู้ให้บริการ/ }).selectOption('antigravity');
  assert.equal(await page.getByRole('combobox', { name: /วิธีเชื่อมต่อ/ }).inputValue(), 'subscription');
  assert.equal(await page.getByLabel('API key', { exact: true }).count(), 0);
  assert.equal(await page.getByLabel(/Google Cloud Project ID/).count(), 0);
  assert.equal(await page.getByLabel('Gemini model').inputValue(), 'gemini-3.8-flash-medium');
  await expect(page.getByText(/Current CLI 1.2.14 cannot confirm/)).toBeVisible();
  await page.getByRole('button', { name: 'เพิ่มการเชื่อมต่อ', exact: true }).click();
  const snapshot = await page.evaluate(() => window.step.call('snapshot'));
  const connection = snapshot.connections.find(c => c.provider === 'antigravity');
  assert.ok(connection && !connection.ready && connection.model === 'gemini-3.8-flash-medium');
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, executable);
  await page.evaluate(id => window.step.call('runtime', { id }), connection.id);
  const ready = await page.evaluate(id => window.step.call('connect', { id }), connection.id);
  assert.equal(ready.ready, true);
  assert.equal(ready.signedIn, true);
  assert.equal(ready.models.length, 1);
  assert.equal((await readFile(calls, 'utf8')).trim(), 'prompt');
  await writeFile(marker, '1');
  const stopped = await page.evaluate(id => window.step.call('connect', { id }), connection.id);
  assert.equal(stopped.ready, false);
  assert.equal(stopped.signedIn, undefined);
  assert.match(stopped.note, /ANTIGRAVITY_TOOLS_UNAVAILABLE/);
  assert.equal((await readFile(calls, 'utf8')).trim(), 'prompt', 'unsafe init must not transmit another request');
  for (const input of [
    { provider: 'antigravity', mode: 'api', model: 'gemini-test' },
    { provider: 'antigravity', mode: 'subscription', model: 'claude-other' },
    { provider: 'gemini', mode: 'subscription', model: '' },
  ]) {
    const code = await page.evaluate(async input => {
      try {
        await window.step.call('connection', input);
        return 'ALLOWED';
      } catch (error) {
        return error.message;
      }
    }, input);
    assert.match(code, /INVALID_CONNECTION|GEMINI_PERSONAL_DISCONTINUED/);
  }
  const disconnected = await page.evaluate(id => window.step.call('disconnect', { id }), connection.id);
  assert.equal(disconnected.ready, false);
  assert.match(disconnected.note, /native Google account remains signed in/);
  assert.deepEqual(errors, []);
  console.log('Antigravity renderer/IPC/native-stream smoke passed; no live account or quota used.');
} finally {
  await app.close();
  assert.equal(dirname(resolve(home)), resolve(tmpdir()));
  assert.ok(home.startsWith(join(resolve(tmpdir()), 'step-antigravity-smoke-')));
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
