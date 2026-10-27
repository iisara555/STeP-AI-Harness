// Native packet/Word/PDF flow with synthetic sources only; no provider, account or real staff record.
import { _electron as electron, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

const output = resolve(process.argv[2] || (await mkdtemp(join(tmpdir(), 'step-packet-evidence-'))));
await mkdir(output, { recursive: true });
const home = await mkdtemp(join(tmpdir(), 'step-packet-home-'));
const fixture = await mkdtemp(join(tmpdir(), 'step-packet-source-'));
const source = join(fixture, 'synthetic-mixed.pdf'),
  receipt = join(fixture, 'synthetic-checked-receipt.pdf');
async function createPdf(path, widths) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  widths.forEach((width, index) => {
    const page = pdf.addPage([width, 500]);
    page.drawText(`SYNTHETIC EVIDENCE ${index + 1}`, { x: 20, y: 450, size: 12, font });
    page.drawText('No real staff or payment data', { x: 20, y: 420, size: 10, font });
  });
  await writeFile(path, await pdf.save());
}
await createPdf(source, [301, 302, 303]);
await createPdf(receipt, [421]);
const originalBytes = await readFile(source);
const bundle = join(fixture, 'store.cjs');
await build({ entryPoints: ['electron/store.ts'], outfile: bundle, bundle: true, platform: 'node', format: 'cjs' });
const { Store } = createRequire(import.meta.url)(bundle);
const store = new Store(join(home, 'workspace.sqlite'));
store.put('settings', 'main', {
  team: 'shared',
  assistant: 'STeP Mate',
  workspace: output,
  theme: 'light',
  onboarding: true,
  whatsNewSeen: '999.0.0',
  tourDone: true,
  consentedAt: new Date().toISOString(),
  termsVersion: '2026-10-02',
});
store.close();
const lines = [
  'ใบเสร็จรับเงิน',
  'ร้านทดสอบระบบ จำกัด',
  'วันที่ 27/10/2569',
  'ค่าน้ำดื่ม',
  'ยอดก่อนภาษี 100.00',
  'VAT 7.00',
  'ยอดรวมสุทธิ 107.00',
];
const ocr = createServer((req, res) => {
  if (req.url === '/api/health')
    return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, service: 'STeP Local Thai OCR' }));
  req.resume();
  req.on('end', () =>
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        ok: true,
        result: {
          text: lines.join('\n'),
          warnings: [],
          summary: { needs_review: 0 },
          pages: [{ page: 1, source: 'ocr', lines: lines.map(text => ({ text, confidence: 0.99, needs_review: false })) }],
        },
      }),
    ),
  );
});
await new Promise((resolve, reject) => {
  ocr.once('error', reject);
  ocr.listen(8765, '127.0.0.1', resolve);
});
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1' };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const previousWrites = new Map();
const waitFile = async path =>
  expect
    .poll(
      async () => {
        const info = await stat(path).catch(() => null);
        return info && info.mtimeMs > previousWrites.get(path) ? info.size : 0;
      },
      { timeout: 45000 },
    )
    .toBeGreaterThan(100);
const saveAs = async path => {
  previousWrites.set(path, (await stat(path).catch(() => null))?.mtimeMs || 0);
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, path);
};
const pick = async paths =>
  app.evaluate(({ dialog }, filePaths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths });
  }, paths);
async function launch() {
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1500, height: 1050 });
  await page.getByRole('button', { name: /ตรวจใบเสร็จ AFP/ }).click();
  await page.getByRole('button', { name: 'ชุดเอกสารและ FM-AF-014', exact: true }).click();
  return page;
}
let packetId;
try {
  let page = await launch();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'สร้างชุดใหม่', exact: true }).click();
  await page.getByLabel('ชื่อเรื่องเบิก', { exact: true }).fill('ทดสอบชุดเบิก — ข้อมูลสมมติ');
  await page.getByLabel('โครงการหรือหน่วยงาน', { exact: true }).fill('โครงการทดสอบระบบ');
  await page.getByLabel('วัตถุประสงค์ของชุดเอกสาร', { exact: true }).fill('ตรวจแบบฟอร์มและการรวมหลักฐาน ข้อมูลทั้งหมดเป็นข้อมูลสมมติ');
  await page.getByLabel('วันที่รับเงิน', { exact: true }).fill('27 ตุลาคม 2569');
  await page.getByLabel('ชื่อผู้รับเงิน', { exact: true }).fill('ผู้รับเงินตัวอย่าง');
  await page.getByLabel('ที่อยู่ผู้รับเงิน', { exact: true }).fill('ที่อยู่สมมติสำหรับตรวจรูปแบบเอกสาร');
  await page.getByLabel('ชื่อผู้จ่ายเงินสำหรับช่องลงนาม', { exact: true }).fill('ผู้จ่ายเงินตัวอย่าง');
  await page.getByLabel('รายการรับเงิน 1', { exact: true }).fill('ค่าตอบแทนทดสอบระบบ — ข้อมูลสมมติ');
  await page.getByLabel('จำนวนเงินรายการ 1', { exact: true }).fill('1,234.50');
  const pngPath = join(fixture, 'synthetic-image.png');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 600, 400);
    ctx.fillStyle = '#000';
    ctx.font = '24px sans-serif';
    ctx.fillText('SYNTHETIC SUPPORTING IMAGE', 30, 70);
    ctx.font = '18px sans-serif';
    ctx.fillText('No real payment or personal data', 30, 110);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await writeFile(pngPath, Buffer.from(png, 'base64'));
  await pick([source, pngPath]);
  await page.getByRole('button', { name: 'เพิ่มเอกสาร', exact: true }).click();
  await expect(page.getByLabel('ประเภทของ synthetic-mixed.pdf', { exact: true })).toBeVisible();
  await page.getByLabel('ประเภทของ synthetic-mixed.pdf', { exact: true }).selectOption('receipt');
  await page.getByLabel('ประเภทของ synthetic-image.png', { exact: true }).selectOption('supporting');
  await page.getByText('เลือกหน้าและแยกประเภท (3 หน้า)', { exact: true }).click();
  await page.getByLabel('รวมหน้า 2 ของ synthetic-mixed.pdf', { exact: true }).uncheck();
  await page.getByLabel('ประเภทหน้า 3 ของ synthetic-mixed.pdf', { exact: true }).selectOption('supporting');
  await page.getByLabel('ตรวจเทียบหน้าที่เลือกของ synthetic-mixed.pdf แล้ว', { exact: true }).check();
  await page.getByLabel('ตรวจเทียบหน้าที่เลือกของ synthetic-image.png แล้ว', { exact: true }).check();
  await page.getByLabel('เลื่อนเอกสารขึ้น synthetic-image.png', { exact: true }).click();
  await page.getByLabel('ตรวจข้อมูลร่างใบสำคัญรับเงินเทียบกับหลักฐานแล้ว', { exact: true }).check();
  await expect(page.getByLabel('ตรวจข้อมูลร่างใบสำคัญรับเงินเทียบกับหลักฐานแล้ว', { exact: true })).toBeChecked();
  await page.getByLabel('จำนวนเงินรายการ 1', { exact: true }).fill('1,234.51');
  await expect(page.getByLabel('ตรวจข้อมูลร่างใบสำคัญรับเงินเทียบกับหลักฐานแล้ว', { exact: true })).not.toBeChecked();
  await page.getByLabel('จำนวนเงินรายการ 1', { exact: true }).fill('1,234.50');
  await page.getByLabel('ตรวจข้อมูลร่างใบสำคัญรับเงินเทียบกับหลักฐานแล้ว', { exact: true }).check();
  await page.getByLabel('แนบร่าง FM-AF-014 ใน PDF รวม', { exact: true }).check();
  const pdfPath = join(output, 'receipt-packet.pdf');
  await saveAs(pdfPath);
  await page.getByRole('button', { name: 'ส่งออก PDF รวม', exact: true }).click();
  await waitFile(pdfPath);
  const pdf = await PDFDocument.load(await readFile(pdfPath));
  assert.equal(pdf.getPageCount(), 5, 'one summary, one voucher, one image, two selected source pages');
  assert.deepEqual(
    pdf
      .getPages()
      .slice(-2)
      .map(page => page.getWidth()),
    [301, 303],
  );
  const wordPath = join(output, 'FM-AF-014-draft.docx');
  await saveAs(wordPath);
  await page.getByRole('button', { name: 'ส่งออกร่าง Word', exact: true }).click();
  await waitFile(wordPath);
  const docx = await JSZip.loadAsync(await readFile(wordPath));
  assert.match(await docx.file('word/document.xml').async('string'), /ผู้รับเงินตัวอย่าง/);
  const blankPath = join(output, 'FM-AF-014-template.docx');
  await saveAs(blankPath);
  await page.getByRole('button', { name: 'แม่แบบ Word เปล่า', exact: true }).click();
  await waitFile(blankPath);
  const blankZip = await JSZip.loadAsync(await readFile(blankPath));
  assert.ok(!(await blankZip.file('word/document.xml').async('string')).includes('ผู้รับเงินตัวอย่าง'));
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await page.locator('.receipt-app').evaluate(element => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: join(output, 'packet-desktop.png') });
  await page.locator('.receipt-app').evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await page.screenshot({ path: join(output, 'packet-desktop-bottom.png') });
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.locator('.receipt-app').evaluate(element => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: join(output, 'packet-narrow.png') });
  await page.getByRole('region', { name: 'ร่างใบสำคัญรับเงิน', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, 'packet-narrow-form.png') });
  await page.locator('.receipt-app').evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await page.screenshot({ path: join(output, 'packet-narrow-bottom.png') });
  assert.ok(await page.locator('.receipt-app').evaluate(element => element.scrollWidth <= element.clientWidth));
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await page.locator('.receipt-app').evaluate(element => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: join(output, 'packet-dark.png') });
  await expect(page.locator('.receipt-modes button[aria-pressed="true"]')).toHaveCSS('background-color', 'rgb(58, 50, 25)');
  const packets = await page.evaluate(() => window.step.call('receiptPacketList'));
  packetId = packets[0].id;
  const persisted = await page.evaluate(id => window.step.call('receiptPacketGet', { id }), packetId);
  assert.equal(persisted.documents[0].name, 'synthetic-image.png');
  assert.deepEqual(
    persisted.documents[1].pages.filter(page => page.included).map(page => page.number),
    [1, 3],
  );
  assert.equal(persisted.paymentApproved, false);
  assert.deepEqual(await readFile(source), originalBytes);
  await page.getByRole('button', { name: 'ตรวจใบเสร็จ', exact: true }).click();
  await pick([receipt]);
  await page.getByRole('button', { name: 'เลือกใบเสร็จ', exact: true }).click();
  await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).check();
  await page.getByRole('button', { name: 'ชุดเอกสารและ FM-AF-014', exact: true }).click();
  await page.getByRole('button', { name: 'สร้างชุดใหม่', exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่มใบเสร็จที่ตรวจแล้ว', exact: true }).click();
  await expect(page.getByLabel('จำนวนเงินรายการ 1', { exact: true })).toHaveValue('107.00');
  await expect(page.getByLabel('ตรวจข้อมูลร่างใบสำคัญรับเงินเทียบกับหลักฐานแล้ว', { exact: true })).not.toBeChecked();
  await expect(page.getByText('มีข้อมูลจากใบเสร็จที่คนตรวจเทียบแล้ว เก็บแหล่งที่มาคู่กับไฟล์นี้', { exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  await app.close();
  app = undefined;
  page = await launch();
  await page.getByLabel('เลือกชุดเอกสาร', { exact: true }).selectOption(packetId);
  await expect(page.getByLabel('ชื่อผู้รับเงิน', { exact: true })).toHaveValue('ผู้รับเงินตัวอย่าง');
  await expect(page.getByLabel('ตรวจข้อมูลร่างใบสำคัญรับเงินเทียบกับหลักฐานแล้ว', { exact: true })).toBeChecked();
  const longCase = await page.evaluate(async id => {
    const packet = await window.step.call('receiptPacketGet', { id });
    packet.voucher.items = Array.from({ length: 30 }, (_, index) => ({
      description: `รายการทดสอบการแบ่งหน้า ${index + 1} ข้อมูลสมมติ`,
      amount: '100.25',
    }));
    packet.voucher.checked = false;
    return window.step.call('receiptPacketSave', { packet });
  }, packetId);
  const longWord = join(output, 'FM-AF-014-long.docx');
  await saveAs(longWord);
  await page.evaluate(
    packet =>
      window.step.call('receiptPacketExport', {
        id: packet.id,
        revision: packet.revision,
        format: 'voucher-docx',
      }),
    longCase,
  );
  await waitFile(longWord);
  const longPdf = join(output, 'receipt-packet-long.pdf');
  await saveAs(longPdf);
  await page.evaluate(
    packet =>
      window.step.call('receiptPacketExport', {
        id: packet.id,
        revision: packet.revision,
        format: 'packet-pdf',
      }),
    longCase,
  );
  await waitFile(longPdf);
  const longPages = (await PDFDocument.load(await readFile(longPdf))).getPageCount();
  assert.ok(longPages > 5 && longPages <= 8, 'long form paginates without runaway blank pages');
  await writeFile(
    join(output, 'verification.json'),
    JSON.stringify(
      {
        synthetic: true,
        combinedPdfPages: pdf.getPageCount(),
        longCombinedPdfPages: longPages,
        selectedSourceWidths: [301, 303],
        persistenceAfterRestart: true,
        originalUnchanged: true,
        checkedReceiptReuse: true,
        formComparisonInvalidation: true,
        paymentApproved: false,
        liveOcrAccuracy: 'not-measured',
        misIntegration: 'not-implemented',
      },
      null,
      2,
    ),
  );
  console.log(
    'Receipt packet native smoke passed: source selection/order, review invalidation, checked OCR reuse, restart persistence, editable Word and five-page combined PDF. Synthetic data only.',
  );
} catch (error) {
  if (app)
    for (const [index, window] of app.windows().entries()) {
      await window.screenshot({ path: join(output, `failure-${index}.png`) }).catch(() => undefined);
      console.log(
        (
          await window
            .locator('body')
            .innerText()
            .catch(() => '')
        ).slice(0, 1200),
      );
    }
  throw error;
} finally {
  if (app) await app.close();
  if (ocr.listening) await new Promise(resolve => ocr.close(resolve));
  assert.ok(home.startsWith(tmpdir()) && fixture.startsWith(tmpdir()));
  await rm(home, { recursive: true, force: true });
  await rm(fixture, { recursive: true, force: true });
}
