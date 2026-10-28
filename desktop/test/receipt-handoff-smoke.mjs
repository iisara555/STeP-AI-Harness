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
      globalThis.receiptSendFixture = { fail: true, sent: [], delayPreview: false, previewCompleted: 0 };
      ipcMain.removeHandler('step:call');
      ipcMain.handle('step:call', async (event, method, input) => {
        const state = globalThis.receiptSendFixture;
        if (method === 'models') return (await original(event, 'snapshot', {})).connections.find(c => c.id === id);
        if (method === 'ocrStatus') return { installed: true, running: true, vision: false, localOnly: false };
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
            preview:
              'data:image/svg+xml;base64,' +
              Buffer.from(
                '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700"><rect width="500" height="700" fill="white"/><g fill="#231f20" font-family="sans-serif" font-size="24"><text x="32" y="60">SYNTHETIC RECEIPT</text><text x="32" y="120">RC-SYNTHETIC</text><text x="32" y="160">01/01/2569</text><text x="32" y="240">Water 107.00</text><text x="32" y="320">Total 107.00 THB</text><text x="32" y="640">Fixture only</text></g></svg>',
              ).toString('base64'),
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
        if (method === 'receiptPacketPrivacyPreview' && state.delayPreview) {
          const result = await original(event, method, input);
          await new Promise(resolve => setTimeout(resolve, 500));
          state.previewCompleted++;
          return result;
        }
        if (['receiptVision', 'connect', 'run'].includes(method)) throw new Error('LIVE_PROVIDER_NOT_ALLOWED_IN_FIXTURE');
        return original(event, method, input);
      });
    },
    { home, id: connection.id },
  );
  await page.reload();
  await page.getByRole('button', { name: 'ตรวจใบเสร็จ AFP', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ตรวจใบเสร็จ AFP' })).toBeVisible();
  await page.getByRole('button', { name: 'เลือกใบเสร็จ' }).click();
  await page.getByText('ตรวจ/แก้ข้อมูลที่อ่านได้', { exact: true }).click();
  await expect(page.getByLabel('ยอดรวมที่ชำระ')).toHaveValue('107.00');
  await page.setViewportSize({ width: 1280, height: 820 });
  const sourcePane = page.getByRole('region', { name: 'ใบเสร็จต้นฉบับ' });
  const reviewPane = page.getByRole('region', { name: 'ข้อมูลที่ต้องตรวจ' });
  await expect(reviewPane.getByRole('heading', { level: 2 })).toHaveText([
    'ต้องแก้หรือเติมข้อมูลก่อนใช้ประกอบการเบิก',
    'ทำอะไรต่อ',
    'ดูองค์ประกอบพื้นฐานใบเสร็จ',
  ]);
  const left = await sourcePane.boundingBox(),
    right = await reviewPane.boundingBox();
  assert.ok(left.x + left.width <= right.x, 'source must be left of the review');
  await expect(page.getByRole('button', { name: 'AI กรอง OCR อีกชั้น' })).toHaveCount(0);
  await expect(page.getByText('เครื่องมือทดลองและวัดผล OCR', { exact: true })).toHaveCount(0);
  const components = page.getByRole('region', { name: 'องค์ประกอบพื้นฐานใบเสร็จ' });
  await expect(components).toContainText('รอตรวจ');
  const check = page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/);
  await expect(page.getByRole('button', { name: 'ให้ AI ตรวจทานต่อ' })).toBeDisabled();
  await check.check();
  await page.getByLabel('ยอดรวมที่ชำระ').fill('108.00');
  await expect(check).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'ให้ AI ตรวจทานต่อ' })).toBeDisabled();
  await page.getByLabel('ยอดรวมที่ชำระ').fill('107.00');
  await page.getByText('ตรวจ/แก้ข้อมูลที่อ่านได้', { exact: true }).click();
  await page.locator('.receipt-app').evaluate(el => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: '/tmp/step-ocr-minimal-light.png', fullPage: true });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/step-ocr-minimal-dark.png', fullPage: true });
  await page.setViewportSize({ width: 800, height: 600 });
  assert.ok(await page.locator('.receipt-app').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await page.screenshot({ path: '/tmp/step-ocr-minimal-small.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 820 });

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
  await page.getByRole('button', { name: 'ตรวจใบเสร็จ AFP', exact: true }).click();
  await page.getByRole('button', { name: 'ชุดเอกสารเบิกจ่าย', exact: true }).click();
  await page.getByRole('button', { name: 'สร้างชุดใหม่', exact: true }).click();
  await page.getByLabel('ชื่อเรื่องเบิก', { exact: true }).fill('อบรม SECRET_PERSON 1234567890123');
  await page.getByLabel('โครงการหรือหน่วยงาน', { exact: true }).fill('SECRET_PROJECT');
  await page.getByLabel('วัตถุประสงค์ของชุดเอกสาร', { exact: true }).fill('SECRET_PURPOSE');
  await page.getByRole('combobox', { name: 'กรณีการเงินที่ทราบ', exact: true }).selectOption('b_clearance');
  const guidance = page.getByRole('region', { name: 'แนะนำเอกสารตามกิจกรรม' });
  await guidance.getByText('รายการอื่นที่ต้องการตรวจ (0)', { exact: true }).click();
  await guidance.getByRole('button', { name: 'เพิ่มรายการตรวจ', exact: true }).click();
  await guidance.getByLabel('รายการเพิ่มเติม 1', { exact: true }).fill('SECRET_EXTRA');
  await guidance.getByRole('button', { name: 'ให้ AI ช่วยพิจารณาต่อ', exact: true }).click();
  await expect(guidance.locator('.evidence-ai-preview pre')).not.toContainText('SECRET_PERSON');
  assert.equal((await app.evaluate(() => globalThis.receiptSendFixture.sent)).length, 3);
  const contextInput = guidance.getByRole('textbox', { name: 'บริบทเพิ่มเติมสำหรับ AI (ไม่บังคับ)', exact: true });
  const sendContext = guidance.getByRole('button', { name: 'ส่งบริบทนี้ให้ AI วิเคราะห์', exact: true });
  await app.evaluate(() => {
    globalThis.receiptSendFixture.delayPreview = true;
  });
  await contextInput.fill('OLD_CONTEXT_SHOULD_NOT_RETURN');
  await guidance.getByRole('button', { name: 'ตรวจและปิดบังบริบท', exact: true }).click();
  await guidance.getByRole('button', { name: 'ให้ AI ช่วยพิจารณาต่อ', exact: true }).click();
  await guidance.getByRole('button', { name: 'ให้ AI ช่วยพิจารณาต่อ', exact: true }).click();
  await expect(contextInput).toHaveValue('');
  await expect.poll(() => app.evaluate(() => globalThis.receiptSendFixture.previewCompleted), { timeout: 10000 }).toBe(1);
  await expect(guidance.locator('.evidence-ai-preview pre')).not.toContainText('OLD_CONTEXT_SHOULD_NOT_RETURN');
  await app.evaluate(() => {
    globalThis.receiptSendFixture.delayPreview = false;
  });
  await contextInput.fill('อบรมหนึ่งวัน มีวิทยากร โทร 081-234-5678');
  await expect(sendContext).toBeDisabled();
  await guidance.getByRole('button', { name: 'ตรวจและปิดบังบริบท', exact: true }).click();
  await expect(guidance.locator('.evidence-ai-preview pre')).toContainText('[หมายเลขโทรศัพท์ถูกปิดบัง]');
  await expect(guidance.locator('.evidence-ai-preview pre')).not.toContainText('081-234-5678');
  await contextInput.fill('อบรมหนึ่งวัน มีวิทยากรและอาหาร โทร 081-234-5678');
  await expect(sendContext).toBeDisabled();
  await guidance.getByRole('button', { name: 'ตรวจและปิดบังบริบท', exact: true }).click();
  await expect(sendContext).toBeEnabled();
  const blocked = await page.evaluate(async () => {
    try {
      await window.step.call('receiptPacketPrivacyPreview', { text: 'ผู้รับบริการ โทร 0812345678 มีข้อมูลสุขภาพเกี่ยวกับผลตรวจสุขภาพ' });
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(blocked, true);
  await app.evaluate(() => {
    globalThis.receiptSendFixture.fail = true;
  });
  await sendContext.click();
  await expect(page.locator('.packet-error')).toBeVisible();
  await expect(contextInput).toHaveValue('อบรมหนึ่งวัน มีวิทยากรและอาหาร โทร 081-234-5678');
  await app.evaluate(() => {
    globalThis.receiptSendFixture.fail = false;
  });
  await sendContext.click();
  const guidanceConsent = page.getByRole('alertdialog', { name: 'ยืนยันการส่งข้อมูลให้ AI' });
  await guidanceConsent.getByRole('button', { name: 'มีสิทธิ์ส่งข้อมูลนี้' }).click();
  await expect(guidanceConsent).toBeHidden();
  const allSent = await app.evaluate(() => globalThis.receiptSendFixture.sent);
  assert.equal(allSent.length, 6);
  for (const request of allSent.slice(3)) {
    assert.deepEqual(request.attachments, []);
    assert.ok(!request.sourceText);
    assert.equal(request.autoImage, false);
    assert.match(request.text, /ประเภทกิจกรรม: อบรม \/ workshop/);
    assert.match(request.text, /วิทยากรและอาหาร/);
    for (const secret of ['SECRET_PERSON', '1234567890123', 'SECRET_PROJECT', 'SECRET_PURPOSE', 'SECRET_EXTRA', '081-234-5678'])
      assert.ok(!JSON.stringify(request).includes(secret), secret);
  }
  assert.equal(allSent[5].consent, 'synthetic-consent');
  assert.deepEqual(errors, []);
  console.log(
    'Receipt handoff smoke passed: one-page review, preserved values on failure, isolated chat send and consent replay with provenance.',
  );
} finally {
  if (app) await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
