// End-to-end check of the receipt mini app against a fake local OCR service on 127.0.0.1:8765.
// No real OCR, provider, or receipt data is used. Usage: node test/receipt-smoke.mjs <receipt-image> [screenshot-dir]
import { _electron as electron } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const image = resolve(process.argv[2]),
  out = process.argv[3] || (await mkdtemp(join(tmpdir(), 'step-receipt-qa-')));
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
  const saved = resolve(out, 'receipt-provenance.json');
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, saved);
  const saveDraft = async () => {
    await page.getByRole('button', { name: 'บันทึกร่าง (JSON)' }).click();
    await page.getByText('บันทึกร่างการตรวจแล้ว', { exact: true }).waitFor();
    return JSON.parse(await readFile(saved, 'utf8'));
  };
  const checkedDraft = await saveDraft();
  assert.equal(checkedDraft.fields.total.provenance, 'SOURCE_FACT');
  assert.equal(checkedDraft.fields.total.verification, 'human-source-comparison');
  assert.equal(checkedDraft.ocr.provenance, 'EXTRACTED_UNVERIFIED');
  assert.equal(checkedDraft.afp_mapping.fields.total.candidates[0].provenance, 'EXTRACTED_UNVERIFIED');
  // Editing a field after confirming clears the confirmation.
  await page.getByLabel('ยอดรวมที่ชำระ').fill('107.50');
  assert.equal(await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).isChecked(), false);
  // Await the changed file content, rather than a toast left over from the preceding save.
  await page.getByRole('button', { name: 'บันทึกร่าง (JSON)' }).click();
  await page.waitForFunction(async path => {
    // The save completed when the host's source revision is reflected by the next toast.
    return Boolean(path && document.body.textContent.includes('บันทึกร่างการตรวจแล้ว'));
  }, saved);
  let editedDraft;
  for (let attempt = 0; attempt < 40; attempt++) {
    editedDraft = JSON.parse(await readFile(saved, 'utf8'));
    if (editedDraft.fields.total.value === '107.50') break;
    await page.waitForTimeout(50);
  }
  assert.equal(editedDraft.fields.total.provenance, 'USER_INPUT');
  assert.equal(editedDraft.fields.total.verification, null);
  await page.getByLabel('ยอดรวมที่ชำระ').fill('107.00');
  await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).check();
  await page.getByText('พร้อมให้ AFP ตรวจ').waitFor();
  await page.screenshot({ path: join(out, 'receipt-ready.png') });
  // The Desktop pilot freezes the local reading before edits and requires a fresh source comparison.
  await page.getByLabel('ทดลอง OCR ในเครื่อง (สำหรับใบที่เลือกครั้งถัดไป)').check();
  await page.getByRole('button', { name: 'ตรวจใบใหม่' }).click();
  const trial = page.getByLabel('ผลทดลอง OCR');
  await trial.waitFor();
  assert.equal(await page.getByRole('button', { name: 'บันทึกผลทดลอง (JSON)' }).isDisabled(), true);
  await page.getByLabel('ยอดรวมที่ชำระ').fill('108.00');
  await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).check();
  await trial.getByText(/OCR ตรง 6\/7 ช่อง/).waitFor();
  const trialPath = resolve(out, 'receipt-trial.json');
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, trialPath);
  await page.getByRole('button', { name: 'บันทึกผลทดลอง (JSON)' }).click();
  await page.getByText('บันทึกผลทดลองในเครื่องแล้ว', { exact: true }).waitFor();
  const pilot = JSON.parse(await readFile(trialPath, 'utf8'));
  assert.equal(pilot.ocr.fields.total.value, '107.00');
  assert.equal(pilot.fields.total.human.value, '108.00');
  assert.equal(pilot.fields.total.ocr.match, false);
  assert.equal(pilot.summary.ocr.errors, 1);
  assert.equal(pilot.vision, null);
  assert.equal(pilot.acceptanceGate, 'OPEN');
  assert.ok(pilot.ocr.elapsedMs > 0);
  // Verify the actual IPC export guard rejects the checkout before writing the report.
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, resolve('receipt-trial-forbidden.json'));
  const denied = await page.evaluate(async draft => {
    try {
      await window.step.call('ocrTrialSave', { draft });
      return '';
    } catch (error) {
      return String(error);
    }
  }, pilot);
  assert.match(denied, /OCR_TRIAL_REPO_PATH/);
  await page.getByLabel('ยอดรวมที่ชำระ').fill('107.00');
  assert.equal(await page.getByRole('button', { name: 'บันทึกผลทดลอง (JSON)' }).isDisabled(), true);
  await trial.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(out, 'receipt-trial.png') });
  console.log('Receipt mini app smoke passed with a fake local OCR service.');
} finally {
  await app.close();
  ocr.close();
}
