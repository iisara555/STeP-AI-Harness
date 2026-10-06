// Real renderer/preload/host/native-stream boundary with a synthetic runtime; no account or quota.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-antigravity-smoke-'));
const executable = join(home, 'agy.mjs');
const marker = join(home, 'unsafe');
const calls = join(home, 'calls');
const ocrPrompt = join(home, 'ocr-prompt.json');
let ocrServer;
await writeFile(
  executable,
  `
import fs from 'node:fs';import {createInterface} from 'node:readline';
const args=process.argv.slice(2),marker=${JSON.stringify(marker)},calls=${JSON.stringify(calls)},ocrPrompt=${JSON.stringify(ocrPrompt)};
if(args[0]==='--version'){console.log('1.2.14');process.exit(0);}
if(args[0]==='models'){console.log('gemini-3.8-flash-medium\\tGemini fixture');process.exit(0);}
const send=x=>console.log(JSON.stringify(x));
send({event:'init',conversation_id:'fixture',init:{cwd:process.cwd(),agent:'step-draft',model:'gemini-3.8-flash-medium',permission_mode:fs.existsSync(marker)?'always-proceed':'strict',tools:['run_command','view_file','finish']}});
createInterface({input:process.stdin}).on('line',line=>{
fs.appendFileSync(calls,'prompt\\n');
const prompt=JSON.parse(line).message.content;
let response='OK';
if(prompt.includes('strict OCR reconciliation')){
 const input=JSON.parse(prompt.split('Input:\\n').at(-1));fs.writeFileSync(ocrPrompt,JSON.stringify(input));
 response=JSON.stringify({decisions:Object.fromEntries(input.fields.map(f=>[f.field,{choice:(f.field==='merchant'?f.candidates.find(c=>c.engine==='easyocr'):f.candidates[0])?.token||'UNMAPPED',reason:'synthetic OCR evidence'}]))});
}
send({event:'result',result:{status:'SUCCESS',conversation_id:'fixture',num_turns:1,response,usage:{input_tokens:2,output_tokens:1,total_tokens:3}}});
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
  await expect(page.getByText(/ปิดเครื่องมือของ Antigravity ทั้งหมด/)).toBeVisible();
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
  assert.match(stopped.note, /ANTIGRAVITY_POLICY_UNCONFIRMED/);
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
  // Antigravity is text-only. A newly started OCR retains that capability and automatically requests token mapping.
  await rm(marker);
  assert.equal((await page.evaluate(id => window.step.call('connect', { id }), connection.id)).ready, true);
  const folder = join(home, 'ocr'),
    python = process.platform === 'win32' ? join(folder, '.venv', 'Scripts', 'python.exe') : join(folder, '.venv', 'bin', 'python');
  await mkdir(dirname(python), { recursive: true });
  await mkdir(join(folder, 'web'), { recursive: true });
  await writeFile(python, 'not executed: the fixture service becomes ready during startup');
  await writeFile(join(folder, 'app.py'), '# synthetic fixture');
  await writeFile(join(folder, 'web', 'receipt-review.js'), '// synthetic fixture');
  const receipt = join(home, 'synthetic-receipt.png');
  await writeFile(
    receipt,
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhS0AAAAASUVORK5CYII=', 'base64'),
  );
  const texts = [
    'บิลเงินสด CASH SALE',
    'ผู้ขาย',
    'ร้านอ่านผิด',
    'เล่มที่ BOOK NO. 003',
    'เลขที่ BILL NO. 042',
    'วันที่ DATE',
    '๔ พ.ย. ๒๕๖๙',
    'นามลูกค้า NAME',
    'บริษัท ผู้ซื้อสมมติ จำกัด',
    'รายการ DESCRIPTION',
    'หน่วย UNIT',
    'จำนวนเงิน AMOUNT',
    '1',
    'ค่าเครื่องดื่ม',
    '147.00',
    'รวมเงิน 147.00',
  ];
  let warming = false,
    healthRequests = 0;
  ocrServer = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/health') {
      const ready = warming && ++healthRequests >= 2;
      res.statusCode = ready ? 200 : 503;
      return res.end(JSON.stringify({ ok: ready, service: 'STeP Local Thai OCR', crosscheck_installed: true }));
    }
    req.resume();
    req.on('end', () =>
      res.end(
        JSON.stringify({
          ok: true,
          result: {
            text: texts.join('\n'),
            summary: { needs_review: 1 },
            pages: [
              {
                page: 1,
                source: 'ocr',
                lines: texts.map(text => ({
                  text,
                  confidence: 0.98,
                  ...(text === 'ร้านอ่านผิด'
                    ? {
                        crosscheck_candidate: 'ร้านตัวอย่างถูกต้อง',
                        crosscheck_status: 'disagree',
                        crosscheck_confidence: 0.96,
                        needs_review: true,
                      }
                    : {}),
                })),
              },
            ],
          },
        }),
      ),
    );
  });
  await new Promise((resolve, reject) => {
    ocrServer.once('error', reject);
    ocrServer.listen(8765, '127.0.0.1', resolve);
  });
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, folder);
  const initial = await page.evaluate(connectionId => window.step.call('ocrFolder', { connectionId }), connection.id);
  assert.equal(initial.vision, false);
  assert.equal(initial.textOnly, true);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    globalThis.receiptDialogs = [];
    dialog.showMessageBox = async (_window, options) => {
      globalThis.receiptDialogs.push(options.title);
      return { response: 1 };
    };
  }, receipt);
  warming = true;
  await page.reload();
  await page.getByRole('button', { name: /ตรวจใบเสร็จ AFP/ }).click();
  await page.getByText('AI ที่เลือกช่วยจัดข้อความ OCR เข้าฟอร์ม แต่เส้นทางนี้ยังไม่อ่านภาพใบเสร็จ').waitFor();
  await page.getByText('OCR ในเครื่องพร้อมใช้', { exact: false }).waitFor();
  const started = await page.evaluate(connectionId => window.step.call('ocrStart', { connectionId }), connection.id);
  assert.equal(started.textOnly, true);
  assert.equal(started.vision, false);
  await page.getByRole('button', { name: 'เลือกใบเสร็จ' }).click();
  await expect(page.getByLabel('ผู้ออกใบเสร็จ / ร้านค้า')).toHaveValue('ร้านตัวอย่างถูกต้อง');
  await expect(page.getByLabel('เลขที่ใบเสร็จ', { exact: true })).toHaveValue('เล่ม 003 เลขที่ 042');
  await expect(page.getByLabel(/^วันที่/)).toHaveValue('04/11/2569');
  await expect(page.getByLabel('รายการค่าใช้จ่าย', { exact: true })).toHaveValue('ค่าเครื่องดื่ม');
  assert.equal(await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).isChecked(), false);
  const prompt = JSON.parse(await readFile(ocrPrompt, 'utf8'));
  assert.ok(prompt.fields.some(field => field.field === 'expenseDescription'));
  assert.doesNotMatch(JSON.stringify(prompt), /data:image|inlineData/);
  const denied = await page.evaluate(
    connectionId =>
      window.step.call('receiptVision', { connectionId }).then(
        () => 'ALLOWED',
        e => String(e),
      ),
    connection.id,
  );
  assert.match(denied, /VISION_UNAVAILABLE/);
  assert.deepEqual(await app.evaluate(() => globalThis.receiptDialogs), ['ให้ AI ช่วยกรองผล OCR']);
  await page.getByLabel('ผู้ออกใบเสร็จ / ร้านค้า').fill('ร้านที่คนแก้แล้ว');
  await page.getByLabel('รายการค่าใช้จ่าย', { exact: true }).fill('รายการที่คนแก้แล้ว');
  await page.getByText('อ่านซ้ำหรือดูรายละเอียด AI', { exact: true }).click();
  await page.getByRole('button', { name: 'AI กรอง OCR อีกชั้น' }).click();
  await expect(page.getByRole('button', { name: 'AI กรอง OCR อีกชั้น' })).toBeEnabled();
  await expect(page.getByLabel('ผู้ออกใบเสร็จ / ร้านค้า')).toHaveValue('ร้านที่คนแก้แล้ว');
  await expect(page.getByLabel('รายการค่าใช้จ่าย', { exact: true })).toHaveValue('รายการที่คนแก้แล้ว');
  const disconnected = await page.evaluate(id => window.step.call('disconnect', { id }), connection.id);
  assert.equal(disconnected.ready, false);
  assert.match(disconnected.note, /native Google account remains signed in/);
  assert.deepEqual(errors, []);
  console.log('Antigravity renderer/IPC/native-stream smoke passed; no live account or quota used.');
} finally {
  await app.close();
  if (ocrServer) await new Promise(resolve => ocrServer.close(resolve));
  assert.equal(dirname(resolve(home)), resolve(tmpdir()));
  assert.ok(home.startsWith(join(resolve(tmpdir()), 'step-antigravity-smoke-')));
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
