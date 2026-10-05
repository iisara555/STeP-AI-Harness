// End-to-end check of the receipt mini app against a fake local OCR service on 127.0.0.1:8765.
// No real OCR, provider, or receipt data is used. Usage: node test/receipt-smoke.mjs <receipt-image> [screenshot-dir]
import { _electron as electron } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const image = resolve(process.argv[2]),
  out = process.argv[3] || 'release/qa';
await mkdir(out, { recursive: true });
const lines = [
  'ใบเสร็จรับเงิน',
  'ร้านตัวอย่าง จำกัด',
  'เลขที่ใบเสร็จ RC-1024',
  'วันที่ 23/09/2569',
  'เลขประจำตัวผู้เสียภาษี 0105559999999',
  'ยอดก่อนภาษี 100.00',
  'ภาษีมูลค่าเพิ่ม 7.00',
  'ยอดสุทธิ 107.00',
];
const ocr = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/health')
    return void res.end(JSON.stringify({ ok: true, service: 'STeP Local Thai OCR', crosscheck_installed: false }));
  req.resume();
  req.on('end', () =>
    res.end(
      JSON.stringify({
        ok: true,
        result: {
          text: lines.join('\n'),
          summary: { needs_review: 1 },
          warnings: [],
          pages: [
            { page: 1, source: 'ocr', lines: lines.map((text, i) => ({ text, confidence: i === 3 ? 0.62 : 0.95, needs_review: i === 3 })) },
          ],
        },
      }),
    ),
  );
});
await new Promise((ok, fail) => {
  ocr.once('error', fail);
  ocr.listen(8765, '127.0.0.1', ok);
});

const env = { ...process.env, STEP_DESKTOP_TEST_HOME: await mkdtemp(join(tmpdir(), 'step-receipt-')) };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.getByRole('button', { name: /ตรวจใบเสร็จ AFP/ }).click();
  await page.getByText('OCR ในเครื่องพร้อมใช้').waitFor();
  await page.screenshot({ path: join(out, 'receipt-empty.png') });
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, image);
  await page.getByRole('button', { name: 'เลือกใบเสร็จ' }).click();
  await page.getByLabel('ยอดรวมที่ชำระ').waitFor();
  assert.equal(await page.getByLabel('ยอดรวมที่ชำระ').inputValue(), '107.00');
  assert.equal(await page.getByLabel('ผู้ออกใบเสร็จ / ร้านค้า').inputValue(), 'ร้านตัวอย่าง จำกัด');
  await page.getByText('ยังต้องตรวจหรือแก้เพิ่ม').waitFor();
  await page.screenshot({ path: join(out, 'receipt-review.png') });
  // One confirmation covers every field and the flagged line: the verdict flips to ready, never to "approved".
  assert.equal(await page.getByRole('button', { name: 'ให้ AI pre-check ต่อ' }).isDisabled(), true);
  await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).check();
  await page.getByText('พร้อมให้ AFP ตรวจ').waitFor();
  assert.equal(await page.getByRole('button', { name: 'ให้ AI pre-check ต่อ' }).isDisabled(), false);
  // Editing a field after confirming clears the confirmation.
  await page.getByLabel('ยอดรวมที่ชำระ').fill('107.50');
  assert.equal(await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).isChecked(), false);
  await page.getByLabel('ยอดรวมที่ชำระ').fill('107.00');
  await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).check();
  await page.getByText('พร้อมให้ AFP ตรวจ').waitFor();
  await page.screenshot({ path: join(out, 'receipt-ready.png') });
  console.log('Receipt mini app smoke passed with a fake local OCR service.');
} finally {
  await app.close();
  ocr.close();
}
