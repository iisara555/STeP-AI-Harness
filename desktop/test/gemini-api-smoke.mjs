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
const chatTurns = [];
const receiptReply = {
  fields: {
    merchant: { value: 'ร้านตัวอย่าง จำกัด', evidence: 'ร้านตัวอย่าง จำกัด' },
    total: { value: '๑๐๗.๐๐', evidence: 'ยอดสุทธิ ๑๐๗.๐๐' },
    vat: { value: '7.00', evidence: 'ภาษีมูลค่าเพิ่ม 7.00' },
  },
  buyerTaxId: '',
  documentType: 'cash_bill',
  features: { handwritten: true, receiverSigned: false, itemsListed: true },
  notes: 'ตัวเลขยอดสุทธิจางเล็กน้อย',
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
    safeStorage.encryptString = s => Buffer.from('k' + s);
    safeStorage.decryptString = b => b.toString().slice(1);
  });
  const gemini = async () => (await page.evaluate(() => window.step.call('snapshot'))).connections.filter(c => c.provider === 'gemini');
  const connect = async () => {
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
  await page.getByText('กำลังเชื่อมต่อ…').waitFor();
  await page.getByRole('button', { name: /ศูนย์รวม Skill/ }).click();
  await page.getByRole('tab', { name: 'การเชื่อมต่อ AI' }).waitFor({ state: 'hidden' });
  await page.keyboard.press('ControlOrMeta+,');
  await page.getByRole('tab', { name: 'การเชื่อมต่อ AI' }).click();
  await page.getByText('กำลังเชื่อมต่อ…').waitFor();
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
  assert.equal(await page.locator('.receipt-field .check input:checked').count(), 0, 'nothing is confirmed for the person');
  assert.equal(await app.evaluate(() => globalThis.receiptConsents), 1);
  // The AI's document type and what it saw drive the checklist; the AFP clearing set shows while the category is open.
  assert.equal(await page.getByLabel('ประเภทเอกสาร', { exact: true }).inputValue(), 'cash_bill');
  await page.getByText('ยังไม่เห็นลายมือชื่อผู้รับเงิน', { exact: false }).waitFor();
  await page.getByText('ถ้าเบิกหมวด B: ชุดเคลียร์เงิน', { exact: false }).waitFor();
  await page.getByLabel('หมวดที่จะเบิก', { exact: true }).selectOption('other');
  assert.equal(await page.getByText('ชุดเคลียร์เงิน', { exact: false }).count(), 0);
  // Enter in a filled field ticks it as checked and moves to the next field.
  await page.getByLabel('ภาษีมูลค่าเพิ่ม').press('Enter');
  assert.equal(await page.locator('.receipt-field .check input:checked').count(), 1);
  await expect(page.getByLabel('ยอดรวมที่ชำระ')).toBeFocused();
  // Checked fields survive a trip to Settings and back.
  await page
    .getByRole('button', { name: /ตั้งค่า/ })
    .first()
    .click();
  await page.getByRole('button', { name: /ตรวจใบเสร็จ AFP/ }).click();
  assert.equal(await page.locator('.receipt-field .check input:checked').count(), 1);
  assert.equal(await page.getByLabel('ยอดรวมที่ชำระ').inputValue(), '107.00');
  const visionRequest = prompts.find(p => p.includes('You read Thai and English receipts'));
  assert.ok(visionRequest && /"inlineData"|"inline_data"/.test(visionRequest), 'the receipt went to the model as an image');

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
  assert.deepEqual(errors, []);
  console.log(
    'Gemini API key smoke passed: Settings tests the key on connect; quota errors and success both finish; the receipt page reads an image with the vision model; chat tool turns share one Gemini conversation.',
  );
} finally {
  await app.close().catch(() => {});
  server.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
