// Gemini API key from Settings: pressing "connect" must test the key and finish ready or with a clear error, never
// sit untested. Runs the bundled Gemini CLI against a local fake Gemini API; no Google account, key or quota is used.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';

let mode = 'quota';
let ocrServer;
const chatTurns = [];
const receiptReply = {
  fields: {
    merchant: { value: 'ร้านตัวอย่าง จำกัด', evidence: 'ร้านตัวอย่าง จำกัด' },
    date: { value: '2 ต.ค. 2569', evidence: 'วันที่ 2 ต.ค. 2569' },
    total: {
      value: '๑๐๗.๐๐',
      evidence: 'ยอดสุทธิ ๑๐๗.๐๐',
      is_handwritten: true,
      confidence: 0.7,
      needs_review: true,
      region: { page: 1, x: 0.5, y: 0.7, width: 0.4, height: 0.15 },
    },
    vat: { value: '7.00', evidence: 'ภาษีมูลค่าเพิ่ม 7.00' },
  },
  buyerTaxId: '',
  merchantAddress: 'ที่อยู่สังเคราะห์สำหรับทดสอบ',
  amountInWords: 'หนึ่งร้อยเจ็ดบาทถ้วน',
  signatures: {
    receiver: {
      status: 'absent',
      evidence: 'ช่องผู้รับเงินว่าง',
      confidence: 0.9,
      region: { page: 1, x: 0.1, y: 0.85, width: 0.5, height: 0.1 },
    },
  },
  documentType: 'cash_bill',
  features: { handwritten: true, receiverSigned: false, itemsListed: true },
  notes: 'ตัวเลขยอดสุทธิจางเล็กน้อย',
  items: [{ description: 'สินค้าสังเคราะห์', quantity: '2', unitPrice: '50.00', amount: '100.00' }],
};
const prompts = [];
let slowTest = false;
const server = createServer((req, res) => {
  let body = '';
  req.on('data', d => (body += d));
  req.on('end', () => {
    if (mode === 'quota') {
      res.writeHead(429, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { code: 429, message: 'Quota exceeded, limit: 0', status: 'RESOURCE_EXHAUSTED' } }));
    }
    const reply = text => ({
      candidates: [{ content: { parts: [{ text }], role: 'model' }, finishReason: 'STOP', index: 0 }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1, totalTokenCount: 6 },
    });
    if (req.url.includes('streamGenerateContent')) {
      prompts.push(body);
      // The receipt page's vision reading: answer with the JSON the receipt prompt asks for.
      let text = body.includes('You read Thai and English receipts') ? JSON.stringify(receiptReply) : 'OK';
      // A chat question: the first turn asks for the reference tool, the next answers from its result.
      const request = JSON.parse(body);
      const said = (request.contents || []).map(c => (c.parts || []).map(p => p.text || '').join('')).join('\n');
      if (said.includes('ผอ.วิน คือใคร')) {
        chatTurns.push({
          contents: request.contents.length,
          last: request.contents
            .at(-1)
            .parts.map(p => p.text || '')
            .join(''),
        });
        text = said.includes('<tool_results>')
          ? 'ผอ. STeP คือ รศ.ดร.ปิติวัฒน์ วัฒนชัย (จากเอกสาร step-executive-board)'
          : '```step-tool\n{"tool":"reference","input":"step-executive-board"}\n```';
      }
      // The receipt reading answers slowly, so the test can switch pages while it is still running.
      const send = () => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.end('data: ' + JSON.stringify(reply(text)) + '\r\n\r\n');
      };
      const slow = body.includes('You read Thai and English receipts') || (slowTest && body.includes('Reply with exactly OK'));
      return void (slow ? setTimeout(send, 2500) : send());
    }
    // The CLI's model router asks a small model which model to use before the real request.
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply('{"reasoning":"short","model_choice":"flash"}')));
  });
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');

const home = await mkdtemp(join(tmpdir(), 'step-gemini-api-'));
const env = {
  ...process.env,
  STEP_DESKTOP_TEST_HOME: home,
  STEP_TEST_GEMINI_BASE_URL: `http://127.0.0.1:${server.address().port}`,
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor({ state: 'detached' });
  // CI runners may have no OS keychain; this stands in for it so the key can be stored.
  await app.evaluate(({ safeStorage }) => {
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptString = s => Buffer.from('k' + s);
    safeStorage.decryptString = b => b.toString().slice(1);
  });
  const gemini = async () => (await page.evaluate(() => window.step.call('snapshot'))).connections.filter(c => c.provider === 'gemini');
  const connect = async () => {
    const add = page.getByText('เพิ่ม AI อีกบัญชี', { exact: true });
    if ((await add.count()) && !(await page.getByRole('radio', { name: /^Gemini(?! via)/ }).isVisible())) await add.click();
    await page.getByRole('radio', { name: /^Gemini(?! via)/ }).click();
    await page.getByLabel('Gemini API key').fill('synthetic-gemini-key-for-smoke');
    await page.getByRole('button', { name: 'เชื่อมต่อ Gemini', exact: true }).click();
  };
  await page.keyboard.press('ControlOrMeta+,');
  await page.getByRole('tab', { name: 'การเชื่อมต่อ AI' }).click();

  // An exhausted free-tier key ends with a clear quota message instead of an untested connection.
  await connect();
  await expect.poll(async () => (await gemini())[0]?.note || '', { timeout: 60000 }).toContain('PROVIDER_QUOTA');
  assert.equal((await gemini())[0].ready, false);

  // A working key is tested right away and becomes ready. Closing Settings while the test runs keeps it going, and
  // reopening shows it still connecting rather than offering to start again.
  mode = 'ok';
  slowTest = true;
  await connect();
  await page.locator('.ai-connection-status').filter({ hasText: 'กำลังเชื่อมต่อและทดสอบ…' }).waitFor();
  await page.getByRole('button', { name: /ศูนย์รวม Skill/ }).click();
  await page.getByRole('tab', { name: 'การเชื่อมต่อ AI' }).waitFor({ state: 'hidden' });
  await page.keyboard.press('ControlOrMeta+,');
  await page.getByRole('tab', { name: 'การเชื่อมต่อ AI' }).click();
  await page.locator('.ai-connection-status').filter({ hasText: 'กำลังเชื่อมต่อและทดสอบ…' }).waitFor();
  await expect.poll(async () => (await gemini()).some(c => c.ready), { timeout: 60000 }).toBe(true);
  slowTest = false;
  assert.ok(
    prompts.some(p => p.includes('Reply with exactly OK')),
    'the connection test reached the Gemini API',
  );

  // With no local OCR, the receipt page reads a receipt with the connected vision model alone: one consent, the image
  // sent as image data, and every field it fills left unconfirmed for a person to check.
  await page.keyboard.press('Escape');
  const receipt = join(home, 'receipt.png');
  const png = await app.evaluate(({ nativeImage }) =>
    nativeImage
      .createFromBitmap(Buffer.alloc(64 * 64 * 4, 0xff), { width: 64, height: 64 })
      .toPNG()
      .toString('base64'),
  );
  await writeFile(receipt, Buffer.from(png, 'base64'));
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    globalThis.receiptConsents = 0;
    dialog.showMessageBox = async () => (globalThis.receiptConsents++, { response: 1 });
  }, receipt);
  await page.getByRole('button', { name: /ตรวจใบเสร็จ AFP/ }).click();
  await page.getByText('ยังไม่มี OCR ในเครื่อง ใช้ AI อ่านภาพได้เลย', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'เลือกใบเสร็จ' }).click();
  // Switching to another page while the receipt is read keeps the work: the sidebar shows it running, and the result
  // is there on return.
  await page.getByText('receipt.png', { exact: true }).waitFor();
  await page.getByRole('button', { name: /ศูนย์รวม Skill/ }).click();
  await page.getByLabel('กำลังตรวจใบเสร็จอยู่').waitFor();
  await page.getByRole('button', { name: /ตรวจใบเสร็จ AFP/ }).click();
  await expect(page.getByLabel('ยอดรวมที่ชำระ')).toHaveValue('107.00', { timeout: 60000 });
  assert.equal(await page.getByLabel('ผู้ออกใบเสร็จ / ร้านค้า').inputValue(), 'ร้านตัวอย่าง จำกัด');
  await page.getByText('AI ฝากตรวจ: ตัวเลขยอดสุทธิจางเล็กน้อย').waitFor();
  assert.ok((await page.getByText('AI อ่านจากภาพ · ตรวจกับต้นฉบับ').count()) >= 3, 'each AI-read field is marked');
  const confirmAll = page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/);
  assert.equal(await confirmAll.isChecked(), false, 'nothing is confirmed for the person');
  await expect(page.getByLabel('ที่อยู่ผู้รับเงิน / ร้าน', { exact: true })).toHaveValue(receiptReply.merchantAddress);
  await expect(page.getByLabel('จำนวนเงินตัวอักษร', { exact: true })).toHaveValue(receiptReply.amountInWords);
  const signature = page.getByLabel('ลายเซ็นผู้รับเงิน', { exact: true });
  await expect(signature).toHaveValue('absent');
  await signature.focus();
  await page.getByText('ภาพขยายช่อง ลายเซ็นผู้รับเงิน · ตำแหน่งจาก AI โปรดเทียบต้นฉบับ').waitFor();
  await expect(page.getByRole('region', { name: 'องค์ประกอบพื้นฐานใบเสร็จ' })).toContainText('ใบเสร็จยังขาดองค์ประกอบ');
  await page.getByLabel('ยอดรวมที่ชำระ').focus();
  await expect(page.locator('.receipt-preview-frame')).toHaveClass(/field-focused/);
  assert.equal(await page.locator('.receipt-preview').evaluate(image => image.style.width), '250%');
  assert.equal(await page.locator('.receipt-preview').evaluate(image => image.style.transform), 'translate(-50%, -70%)');
  await page.getByText('ภาพขยายช่อง ยอดรวมที่ชำระ · ตำแหน่งจาก AI โปรดเทียบต้นฉบับ').waitFor();
  await expect(page.locator('#rf-total').locator('..').locator('..')).toHaveClass(/uncertain/);
  await page.getByText('ความมั่นใจที่ AI รายงาน: 70% · ไม่ใช่ความแม่นยำที่วัด').waitFor();
  await page.getByText('ตารางรายการที่ AI อ่านได้ · ยังไม่ยืนยัน', { exact: true }).click();
  await page.getByRole('cell', { name: 'สินค้าสังเคราะห์', exact: true }).waitFor();
  assert.equal(await app.evaluate(() => globalThis.receiptConsents), 1);
  // The AI's document type and what it saw drive the checklist; the AFP clearing set shows while the category is open.
  assert.equal(await page.getByLabel('ประเภทเอกสาร', { exact: true }).inputValue(), 'cash_bill');
  // Since the outcome-first receipt page, a flagged item shows in "ทำอะไรต่อ" and again in the full checklist.
  await page.getByText('ยังไม่เห็นลายมือชื่อผู้รับเงิน', { exact: false }).first().waitFor();
  // The B clearing set sits in the folded full checklist, so it is present but not on screen.
  await page.getByText('ถ้าเบิกหมวด B: ชุดเคลียร์เงิน', { exact: false }).first().waitFor({ state: 'attached' });
  await page.getByText('แก้ไขประเภท หมวด และดูเกณฑ์ตรวจทั้งหมด', { exact: true }).click();
  await page.getByLabel('หมวดที่จะเบิก', { exact: true }).selectOption('other');
  assert.equal(await page.getByText('ชุดเคลียร์เงิน', { exact: false }).count(), 0);
  // Enter in a field moves to the next one; one confirmation then covers every field.
  await page.getByLabel('ภาษีมูลค่าเพิ่ม').press('Enter');
  await expect(page.getByLabel('ยอดรวมที่ชำระ')).toBeFocused();
  await confirmAll.check();
  await signature.selectOption('present');
  assert.equal(await confirmAll.isChecked(), false, 'correcting signature presence revokes the one confirmation');
  await expect(page.getByRole('region', { name: 'องค์ประกอบพื้นฐานใบเสร็จ' })).toContainText('พบองค์ประกอบพื้นฐานครบ');
  await confirmAll.check();
  await expect(page.getByRole('region', { name: 'องค์ประกอบพื้นฐานใบเสร็จ' })).toContainText('ครบองค์ประกอบพื้นฐานที่ตรวจ');
  // The confirmation survives a trip to Settings and back.
  await page
    .getByRole('button', { name: /ตั้งค่า/ })
    .first()
    .click();
  await page.getByRole('button', { name: /ตรวจใบเสร็จ AFP/ }).click();
  assert.equal(await confirmAll.isChecked(), true);
  assert.equal(await page.getByLabel('ยอดรวมที่ชำระ').inputValue(), '107.00');
  const visionRequest = prompts.find(p => p.includes('You read Thai and English receipts'));
  assert.ok(visionRequest && /"inlineData"|"inline_data"/.test(visionRequest), 'the receipt went to the model as an image');
  const imageParts = JSON.parse(visionRequest)
    .contents.flatMap(c => c.parts)
    .filter(part => part.inlineData || part.inline_data);
  assert.equal(imageParts.length, 4, 'a full page and three detail crops use the same image consent');
  const sizes = await app.evaluate(
    ({ nativeImage }, data) => data.map(encoded => nativeImage.createFromBuffer(Buffer.from(encoded, 'base64')).getSize()),
    imageParts.map(part => (part.inlineData || part.inline_data).data),
  );
  assert.deepEqual(sizes[0], { width: 64, height: 64 });
  assert.ok(
    sizes.slice(1).every(size => size.width === 64 && size.height < 64),
    'detail images are actual crops, not full-image duplicates',
  );
  assert.ok(visionRequest.includes('detail of page 1') && visionRequest.includes('full page 1'));
  await page.getByLabel('ยอดรวมที่ชำระ').fill('108.00');
  assert.equal(await confirmAll.isChecked(), false, 'editing after final confirmation revokes it');

  // Chat with tools on Gemini: the reference turn and the answer turn share one Gemini CLI conversation, so the second
  // request carries the first exchange plus only the new tool results, not the whole prompt again.
  await page.getByRole('button', { name: 'เริ่มงานใหม่' }).first().click();
  await page.locator('.composer textarea').fill('ผอ.วิน คือใคร');
  await page.keyboard.press('Enter');
  // The usage terms appear on the first send on this computer; wait for them, or for the answer if they do not.
  const terms = page.getByText('ฉันอ่านและรับทราบข้อตกลงการใช้งาน');
  const answer = page.getByText('รศ.ดร.ปิติวัฒน์ วัฒนชัย (จากเอกสาร step-executive-board)');
  await terms.or(answer).first().waitFor({ timeout: 60000 });
  if (await terms.isVisible()) {
    await terms.click();
    await page.getByRole('button', { name: 'รับทราบและส่ง' }).click();
  }
  await page.getByText('รศ.ดร.ปิติวัฒน์ วัฒนชัย (จากเอกสาร step-executive-board)').waitFor({ timeout: 90000 });
  assert.equal(chatTurns.length, 2, JSON.stringify(chatTurns.map(t => t.contents)));
  assert.equal(chatTurns[0].contents, 1);
  assert.ok(chatTurns[1].contents >= 3, 'the second turn continues the same conversation');
  assert.ok(chatTurns[1].last.includes('<tool_results>') && !chatTurns[1].last.includes('<routing_contract>'), 'only the new part is sent');

  // PDF receipt reads use the selected snapshot, and never silently omit a fourth page.
  const pdf = join(home, 'synthetic-receipt.pdf');
  const pdfFixture = async count =>
    Buffer.from(
      await app.evaluate(async ({ BrowserWindow }, count) => {
        const fixture = new BrowserWindow({
          show: false,
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
        });
        try {
          const html =
            '<style>@page{margin:0}.page{height:200mm;break-after:page}.page:last-child{break-after:auto}</style>' +
            Array.from({ length: count }, (_, i) => `<div class="page">SYNTHETIC RECEIPT PAGE ${i + 1}</div>`).join('');
          await fixture.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
          return (await fixture.webContents.printToPDF({ pageSize: 'A4' })).toString('base64');
        } finally {
          fixture.destroy();
        }
      }, count),
      'base64',
    );
  await writeFile(pdf, await pdfFixture(3));
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, pdf);
  const connectionId = (await gemini()).find(c => c.ready).id;
  await page.evaluate(connectionId => window.step.call('ocrRead', { connectionId }), connectionId);
  await writeFile(pdf, await pdfFixture(4));
  const pdfReading = await page.evaluate(connectionId => window.step.call('receiptVision', { connectionId }), connectionId);
  assert.equal(pdfReading.pagePreviews.length, 3, 'changing a path cannot replace the consented snapshot');
  await page.evaluate(connectionId => window.step.call('ocrRead', { connectionId }), connectionId);
  const beforeLongPdf = prompts.length;
  const tooLong = await page.evaluate(async connectionId => {
    try {
      await window.step.call('receiptVision', { connectionId });
      return 'unexpected success';
    } catch (error) {
      return error.message;
    }
  }, connectionId);
  assert.ok(tooLong.includes('ATTACH_SCANNED_TOO_LONG'), tooLong);
  assert.equal(prompts.length, beforeLongPdf, 'incomplete PDF input is rejected before a provider call');
  // Every OCR lifecycle result must retain Gemini's image capability, not just ocrStatus.
  ocrServer = createServer((_req, res) => res.end(JSON.stringify({ ok: true, service: 'STeP Local Thai OCR' })));
  await new Promise((resolve, reject) => {
    ocrServer.once('error', reject);
    ocrServer.listen(8765, '127.0.0.1', resolve);
  });
  const started = await page.evaluate(connectionId => window.step.call('ocrStart', { connectionId }), connectionId);
  assert.equal(started.vision, true);
  assert.equal(started.textOnly, false);
  assert.equal(started.installing, false);
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  });
  const canceled = await page.evaluate(connectionId => window.step.call('ocrFolder', { connectionId }), connectionId);
  assert.equal(canceled.vision, true);
  assert.equal(canceled.textOnly, false);
  assert.deepEqual(errors, []);
  console.log(
    'Gemini API key smoke passed: Settings tests the key on connect; quota errors and success both finish; the receipt page reads an image with the vision model; chat tool turns share one Gemini conversation.',
  );
} finally {
  await app.close().catch(() => {});
  if (ocrServer) await new Promise(resolve => ocrServer.close(resolve));
  server.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
