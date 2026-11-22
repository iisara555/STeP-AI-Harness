// ผู้ช่วยเบิกจ่าย: several files dropped on a case chat at once, read on this computer one at a time and typed from the
// words printed on them. PDFs are read from their own text; a picture waits for local OCR, then the synthetic OCR reads
// it. Kinds reach the case only when the person applies them. No AI is asked; all files and text are synthetic.
import { _electron as electron, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { deflateSync } from 'node:zlib';

const out = resolve(process.argv[2] || (await mkdtemp(join(tmpdir(), 'step-case-files-output-'))));
await mkdir(out, { recursive: true });
const pdf = async lines => {
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([420, 300]);
  lines.forEach((line, index) => page.drawText(line, { x: 24, y: 260 - index * 22, size: 13, font }));
  return Buffer.from(await doc.save()).toString('base64');
};
const files = {
  'synthetic-shop-1.pdf': await pdf(['RECEIPT / TAX INVOICE', 'Synthetic Shop Co., Ltd.', 'Drinking water 200.00']),
  'quote.pdf': await pdf(['QUOTATION', 'Synthetic Venue', 'Meeting room 1,500.00']),
  'scan-03.pdf': await pdf(['FM-AF-015', 'Attendance sheet (synthetic)', 'Participant 1 ..........']),
  'memo.pdf': await pdf(['Synthetic note', 'No title the app knows']),
};
// Small one-colour PNGs: pictures, so only OCR could read them.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = bytes => (bytes.reduce((c, b) => crcTable[(c ^ b) & 0xff] ^ (c >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0;
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4),
    sum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([length, body, sum]);
};
const png = shade => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(40, 0);
  header.writeUInt32BE(40, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(40 * 3, shade)]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: 40 }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
};
files['photo-1.png'] = png(200);
files['photo-2.png'] = png(120);
files['notes.docx'] = Buffer.from('synthetic').toString('base64');

let ocrOn = false;
const ocrCalls = [];
const ocr = createServer((req, res) => {
  if (req.url === '/api/health')
    return ocrOn
      ? res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, service: 'STeP Local Thai OCR' }))
      : res.writeHead(503).end();
  ocrCalls.push(req.url);
  req.resume();
  const lines = ['ร้านทดสอบระบบ', 'ใบเสร็จรับเงิน', 'ยอดรวม 80.00'];
  req.on('end', () =>
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        ok: true,
        result: { text: lines.join('\n'), pages: [{ page: 1, lines: lines.map(text => ({ text, confidence: 0.99 })) }] },
      }),
    ),
  );
});
await new Promise(done => ocr.listen(0, '127.0.0.1', done));
const ai = [];
const server = createServer((req, res) => {
  ai.push(req.url);
  res.writeHead(500).end();
});
await new Promise(done => server.listen(0, '127.0.0.1', done));

const home = await mkdtemp(join(tmpdir(), 'step-case-files-'));
const workspace = join(home, 'work');
await mkdir(workspace);
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
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
  // Keep the synthetic OCR isolated from a real OCR service that may run on this computer.
  await app.evaluate((_, port) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input, options) =>
      typeof input === 'string' && input.startsWith('http://127.0.0.1:8765/')
        ? originalFetch(input.replace('http://127.0.0.1:8765/', `http://127.0.0.1:${port}/`), options)
        : originalFetch(input, options);
  }, ocr.address().port);
  const page = await app.firstWindow();
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 1600, height: 960 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  const shot = name => page.screenshot({ path: join(out, `${name}.png`) });
  const drop = async names =>
    page.evaluate(
      ({ names, files }) => {
        const bytes = base64 => Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const transfer = new DataTransfer();
        for (const name of names) {
          const type = name.endsWith('.pdf') ? 'application/pdf' : name.endsWith('.png') ? 'image/png' : 'application/octet-stream';
          transfer.items.add(new File([bytes(files[name])], name, { type }));
        }
        const target = document.querySelector('.case-main');
        for (const type of ['dragenter', 'dragover', 'drop'])
          target.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
      },
      { names, files },
    );

  await page.getByRole('button', { name: /ผู้ช่วยเบิกจ่าย/ }).click();
  await page.getByRole('button', { name: 'ชุดเอกสารเบิกจ่าย', exact: true }).click();
  await page.getByRole('button', { name: 'เรื่องใหม่', exact: true }).click();
  await page.getByLabel('ชื่อเรื่องเบิก', { exact: true }).fill('ประชุมคณะทำงาน ข้อมูลสมมติ');
  await expect(page.locator('.case-head [role="status"]')).toHaveText('บันทึกในเครื่องแล้ว');

  // Dragging files over the chat says where they go.
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    document.querySelector('.case-main').dispatchEvent(new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true }));
  });
  await expect(page.locator('.case-drop')).toContainText('วางไฟล์เพื่อเพิ่มเป็นหลักฐานในเรื่องนี้');
  await shot('1-drag-over-case');

  // Five supported files and one Word file in one drop: the Word file is skipped and said so, the rest are read.
  await drop(['synthetic-shop-1.pdf', 'quote.pdf', 'scan-03.pdf', 'memo.pdf', 'photo-1.png', 'notes.docx']);
  await expect(page.locator('.case-drop')).toHaveCount(0);
  await expect(page.locator('.toast').filter({ hasText: 'notes.docx' })).toBeVisible();
  const chat = page.getByRole('region', { name: 'แชตในเรื่องนี้' });
  const card = chat.getByRole('group', { name: 'อ่านไฟล์ที่เพิ่ม' }).first();
  await expect(card).toContainText('อ่านไฟล์ที่เพิ่มแล้ว 5 ไฟล์', { timeout: 30_000 });
  const line = name => card.locator('li', { hasText: name });
  await expect(line('synthetic-shop-1.pdf')).toContainText('ใบกำกับภาษี (เต็มรูป) · พบ “TAX INVOICE” ในเนื้อหา');
  await expect(line('quote.pdf')).toContainText('ใบแจ้งหนี้ / ใบเสนอราคา / ใบส่งของ');
  // The name says nothing; the form code printed on the page does.
  await expect(line('scan-03.pdf')).toContainText('ใบเซ็นชื่อเข้าร่วม FM-AF-015');
  await expect(line('memo.pdf')).toContainText('ไม่พบหัวเอกสารที่รู้จัก');
  await expect(line('photo-1.png')).toContainText('ยังไม่ได้เปิด OCR');
  await expect(card).toContainText('อ่านในเครื่องนี้ ไม่ได้ส่งไฟล์ให้ AI');
  await expect(page.locator('.case-list li button[aria-current="true"]')).toContainText('หลักฐาน 5 ไฟล์');
  assert.equal(await page.locator('.receipt-packets button.primary:visible').count(), 1, 'one primary action');
  await shot('2-files-read');

  // Nothing is typed until the person applies it.
  await page.getByRole('button', { name: 'หลักฐาน', exact: true }).click();
  await expect(page.getByLabel('ประเภทของ quote.pdf', { exact: true })).toHaveValue('other');
  await card.getByRole('button', { name: 'ใช้ประเภทที่อ่านได้ (3 ไฟล์)', exact: true }).click();
  await expect(card).toContainText('ใช้ประเภทแล้ว');
  await expect(page.getByLabel('ประเภทของ synthetic-shop-1.pdf', { exact: true })).toHaveValue('tax_invoice');
  await expect(page.getByLabel('ประเภทของ quote.pdf', { exact: true })).toHaveValue('invoice_or_quotation');
  await expect(page.getByLabel('ประเภทของ scan-03.pdf', { exact: true })).toHaveValue('attendance');
  await expect(page.getByLabel('ประเภทของ memo.pdf', { exact: true })).toHaveValue('other');
  await expect(page.getByLabel('ประเภทของ photo-1.png', { exact: true })).toHaveValue('other');
  await expect(page.locator('.case-head [role="status"]')).toHaveText('บันทึกในเครื่องแล้ว');
  await shot('3-types-applied');

  // With local OCR on, a dropped picture is read too; a file already in the case is skipped, not added twice.
  ocrOn = true;
  await drop(['photo-2.png', 'quote.pdf']);
  await expect(page.locator('.toast').filter({ hasText: 'ข้ามไฟล์ที่มีในชุดแล้ว' })).toBeVisible();
  await expect(chat.getByRole('group', { name: 'อ่านไฟล์ที่เพิ่ม' })).toHaveCount(2);
  const latest = chat.getByRole('group', { name: 'อ่านไฟล์ที่เพิ่ม' }).last();
  await expect(latest).toContainText('อ่านไฟล์ที่เพิ่มแล้ว 1 ไฟล์', { timeout: 30_000 });
  await expect(latest).toContainText('ใบเสร็จรับเงิน · อ่านด้วย OCR ในเครื่อง พบ “ใบเสร็จรับเงิน”');
  assert.equal(ocrCalls.length, 1, 'only the picture went to local OCR');
  await latest.getByRole('button', { name: 'ไม่ใช้', exact: true }).click();
  await expect(latest.getByRole('button', { name: /ใช้ประเภทที่อ่านได้/ })).toHaveCount(0);
  await expect(page.getByLabel('ประเภทของ photo-2.png', { exact: true })).toHaveValue('other');

  const packets = await page.evaluate(() => window.step.call('receiptPacketList'));
  assert.equal(packets[0].documentCount, 6);
  assert.deepEqual(ai, [], 'no AI was asked');

  // Dark and narrow.
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await shot('4-files-dark');
  await page.setViewportSize({ width: 900, height: 900 });
  const overflow = await page.evaluate(
    () => document.querySelector('.receipt-packets').getBoundingClientRect().right - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 0, `case view overflows by ${overflow}px`);
  await shot('5-files-narrow');
  assert.deepEqual(errors, []);
  console.log(`Case files smoke passed. Screenshots: ${out}`);
} finally {
  await app?.close();
  ocr.close();
  server.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
