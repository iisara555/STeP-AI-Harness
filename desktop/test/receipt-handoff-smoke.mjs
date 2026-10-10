// Real renderer/IPC, synthetic OCR and controlled send/consent responses. No files or accounts leave the machine.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-receipt-handoff-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1' };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ['.'], env, timeout: 45_000 });
  const page = await app.firstWindow();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  const connection = await page.evaluate(() =>
    window.step.call('connection', { provider: 'antigravity', mode: 'subscription', model: 'gemini-synthetic' }),
  );
  await app.evaluate(
    ({ ipcMain }, { home, id }) => {
      const db = new (process.getBuiltinModule('node:sqlite').DatabaseSync)(home + '/workspace.sqlite');
      const row = db.prepare("SELECT value FROM records WHERE kind='connection' AND id=?").get(id);
      db.prepare("UPDATE records SET value=? WHERE kind='connection' AND id=?").run(
        JSON.stringify({ ...JSON.parse(row.value), ready: true }),
        id,
      );
      db.close();
      const original = ipcMain._invokeHandlers.get('step:call');
      globalThis.receiptSendFixture = { fail: true, sent: [] };
      ipcMain.removeHandler('step:call');
      ipcMain.handle('step:call', async (event, method, input) => {
        const state = globalThis.receiptSendFixture;
        if (method === 'models') return (await original(event, 'snapshot', {})).connections.find(c => c.id === id);
        if (method === 'ocrStatus') return { installed: true, running: true, vision: false };
        if (method === 'ocrResolve') return { cancelled: true };
        if (method === 'ocrRead') {
          const lines = [
            'ใบเสร็จรับเงิน',
            'ร้านสังเคราะห์',
            'เลขที่ RC-SYNTHETIC',
            'วันที่ 01/01/2569',
            'ยอดสุทธิ 107.00',
            'รายการ ค่าน้ำดื่ม',
          ];
          return {
            name: 'synthetic.png',
            result: {
              text: lines.join('\n'),
              summary: { needs_review: 0 },
              pages: [{ page: 1, lines: lines.map(text => ({ text, confidence: 0.95 })) }],
            },
          };
        }
        if (method === 'send') {
          state.sent.push(input);
          if (state.fail) throw new Error('CONNECTION_NOT_READY');
          if (!input.consent)
            return { consent: { token: 'synthetic-consent', first: false, flagged: false, labels: [], attachment: false } };
          return { started: true };
        }
        if (['receiptVision', 'connect', 'run'].includes(method)) throw new Error('LIVE_PROVIDER_NOT_ALLOWED_IN_FIXTURE');
        return original(event, method, input);
      });
    },
    { home, id: connection.id },
  );
  await page.reload();
  await page.getByRole('button', { name: /ตรวจใบเสร็จ AFP/ }).click();
  await expect(page.getByRole('heading', { name: 'ตรวจใบเสร็จก่อนส่ง AFP' })).toBeVisible();
  await page.getByRole('button', { name: 'เลือกใบเสร็จ' }).click();
  await expect(page.getByLabel('ยอดรวมที่ชำระ')).toHaveValue('107.00');
  await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).check();
  const send = page.getByRole('button', { name: 'ให้ AI ตรวจทานต่อ' });
  await send.click();
  await expect(page.locator('.receipt-error')).toContainText('ข้อมูลที่ตรวจยังอยู่ในหน้านี้');
  await expect(page.getByLabel('ยอดรวมที่ชำระ')).toHaveValue('107.00');
  await expect(send).toBeEnabled();
  await app.evaluate(() => {
    globalThis.receiptSendFixture.fail = false;
  });
  await send.click();
  const consent = page.getByRole('alertdialog', { name: 'ยืนยันการส่งข้อมูลให้ AI' });
  await consent.getByRole('button', { name: 'มีสิทธิ์ส่งข้อมูลนี้' }).click();
  await expect(consent).toBeHidden();
  const sent = await app.evaluate(() => globalThis.receiptSendFixture.sent);
  assert.equal(sent.length, 3);
  for (const request of sent) {
    assert.equal(request.mode, 'chat');
    assert.equal(request.coordinator, false);
    assert.equal(request.autoImage, false);
    assert.equal(request.workflow, undefined);
    assert.deepEqual(request.attachments, []);
    assert.ok(request.sourceText.length <= 90_000);
    const source = JSON.parse(request.sourceText.slice(request.sourceText.indexOf('{')));
    assert.equal(source.fields.total.value, '107.00');
    assert.equal(source.fields.total.provenance, 'SOURCE_FACT');
    assert.equal(source.ocr.provenance, 'EXTRACTED_UNVERIFIED');
  }
  assert.equal(sent[2].consent, 'synthetic-consent');
  assert.deepEqual(errors, []);
  console.log(
    'Receipt handoff smoke passed: one-page review, preserved values on failure, isolated chat send and consent replay with provenance.',
  );
} finally {
  if (app) await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
