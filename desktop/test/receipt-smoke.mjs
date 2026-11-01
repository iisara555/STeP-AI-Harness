// End-to-end check of the receipt mini app against a fake local OCR service on 127.0.0.1:8765.
// No real OCR, provider, or receipt data is used. Usage: node test/receipt-smoke.mjs <receipt-image> [screenshot-dir]
import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const out = process.argv[3] || (await mkdtemp(join(tmpdir(), 'step-receipt-qa-')));
await mkdir(out, { recursive: true });
const fixtureDir = await mkdtemp(join(tmpdir(), 'step-receipt-fixture-'));
const image = process.argv[2] ? resolve(process.argv[2]) : join(fixtureDir, 'synthetic-receipt.png');
if (!process.argv[2])
  await writeFile(
    image,
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhS0AAAAASUVORK5CYII=', 'base64'),
  );
// Compile the production scoring module for this Node fixture; no application or dependency changes.
const trialModule = join(out, 'trial-scoring.mjs');
await build({ entryPoints: ['src/receipt-trial.ts'], outfile: trialModule, bundle: true, platform: 'node', format: 'esm' });
const { trialReading, trialReport } = await import(pathToFileURL(trialModule).href);
const lines = [
  'ใบเสร็จรับเงิน',
  'ร้านตัวอย่าง จำกัด',
  'เลขที่ใบเสร็จ RC-1024',
  'วันที่ 23/09/2569',
  'เลขประจำตัวผู้เสียภาษี 0105559999999',
  'ยอดก่อนภาษี 100.00',
  'ภาษีมูลค่าเพิม 7.00', // Real OCR can lose the Thai tone mark; recovery must stay visibly uncertain.
  'ยอดสุทธิ 107.00',
  'รายการ ค่าน้ำดื่ม',
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

const home = await mkdtemp(join(tmpdir(), 'step-receipt-'));
// Private trial APIs remain tested separately from the simplified employee UI. Local-only is no longer the default
// (receipts go to the employee's AI), so this smoke sets it to keep the no-model-call path covered.
await writeFile(
  join(home, 'desktop-policy.json'),
  JSON.stringify({
    receiptLocalOnly: true,
    features: { ocrTrial: true },
    receiptCloud: { url: 'https://ocr.example.test', model: 'gemini-3.8-flash' },
  }),
);
// Existing API profiles and organization routing cannot turn local receipt processing into a model call.
const storeModule = join(out, 'store.cjs');
await build({ entryPoints: ['electron/store.ts'], outfile: storeModule, bundle: true, platform: 'node', format: 'cjs' });
const { Store } = createRequire(import.meta.url)(storeModule);
const store = new Store(join(home, 'workspace.sqlite'));
store.put('connection', 'existing-api', { id: 'existing-api', provider: 'gemini', mode: 'api', model: 'gemini-3.8-flash', ready: true });
store.close();
let externalCalls = 0;
const external = createServer((req, res) => {
  externalCalls++;
  req.resume();
  res.writeHead(503).end();
});
await new Promise(resolve => external.listen(0, '127.0.0.1', resolve));
const externalUrl = 'http://127.0.0.1:' + external.address().port;
const env = {
  ...process.env,
  STEP_DESKTOP_TEST_HOME: home,
  STEP_TEST_RECEIPT_CLOUD_URL: externalUrl,
  STEP_TEST_GEMINI_BASE_URL: externalUrl,
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.getByRole('button', { name: /ตรวจใบเสร็จ AFP/ }).click();
  await page.getByText('OCR ในเครื่องพร้อมใช้').waitFor();
  await expect(page.getByText('อ่านและตรวจใบเสร็จในเครื่อง ไม่มีค่าบริการ OCR หรือ API และไม่ต้องลงชื่อเข้าใช้ Google')).toBeVisible();
  await expect(page.getByLabel('Google AI สำหรับอ่านใบเสร็จ')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ลงชื่อเข้าใช้ Google สำหรับ OCR', exact: true })).toHaveCount(0);
  const status = await page.evaluate(() => window.step.call('ocrStatus', { connectionId: 'existing-api', localOnly: false }));
  assert.equal(status.localOnly, true);
  assert.equal(status.geminiApi, false);
  assert.equal(status.cloud, undefined);
  assert.equal(status.vision, false);
  assert.equal(status.textOnly, false);
  for (const method of ['receiptVision', 'ocrResolve'])
    await assert.rejects(
      page.evaluate(method => window.step.call(method, { connectionId: 'existing-api', localOnly: false }), method),
      /OCR_LOCAL_ONLY/,
    );
  await assert.rejects(
    page.evaluate(() => window.step.call('receiptCloudConnect')),
    /FEATURE_DISABLED/,
  );
  await page.screenshot({ path: join(out, 'receipt-empty.png') });
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, image);
  await page.getByRole('button', { name: 'เลือกใบเสร็จ' }).click();
  await page.getByText('ตรวจ/แก้ข้อมูลที่อ่านได้', { exact: true }).click();
  await page.getByLabel('ยอดรวมที่ชำระ').waitFor();
  assert.equal(await page.getByLabel('ยอดรวมที่ชำระ').inputValue(), '107.00');
  assert.equal(await page.getByLabel('ภาษีมูลค่าเพิ่ม').inputValue(), '7.00');
  await expect(page.locator('.receipt-value-row.uncertain').filter({ has: page.locator('#rf-vat') })).toHaveCount(1);
  assert.equal(await page.getByLabel('ผู้ออกใบเสร็จ / ร้านค้า').inputValue(), 'ร้านตัวอย่าง จำกัด');
  assert.equal(await page.getByLabel('รายการค่าใช้จ่าย', { exact: true }).inputValue(), 'ค่าน้ำดื่ม');
  const outcome = page.getByRole('region', { name: 'ข้อมูลที่ต้องตรวจ' });
  await expect(outcome).toContainText('B10 · ค่าน้ำดื่ม');
  assert.equal(await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).count(), 1);
  await page.getByRole('heading', { name: 'ต้องแก้หรือเติมข้อมูลก่อนใช้ประกอบการเบิก', exact: true }).waitFor();
  await page.screenshot({ path: join(out, 'receipt-review.png') });
  // One confirmation covers every field and the flagged line: the verdict flips to ready, never to "approved".
  await expect(page.getByRole('button', { name: 'ให้ AI ตรวจทานต่อ' })).toHaveCount(0);
  await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).check();
  await expect(page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/)).toBeChecked();
  // Local processing permits saving after review without handing off to the existing API profile.
  await expect(page.getByRole('button', { name: 'ให้ AI ตรวจทานต่อ' })).toHaveCount(0);
  await expect(page.getByText('เชื่อมต่อและทดสอบ AI ก่อนส่งตรวจทาน ข้อมูลในหน้านี้ยังอยู่')).toHaveCount(0);
  const saved = resolve(out, 'receipt-provenance.json');
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, saved);
  const saveDraft = async () => {
    await page.getByRole('button', { name: 'บันทึกผลตรวจเก็บไว้' }).click();
    await page.getByText('บันทึกร่างการตรวจแล้ว', { exact: true }).waitFor();
    return JSON.parse(await readFile(saved, 'utf8'));
  };
  const checkedDraft = await saveDraft();
  assert.equal(checkedDraft.fields.total.provenance, 'SOURCE_FACT');
  assert.equal(checkedDraft.fields.total.verification, 'human-source-comparison');
  assert.equal(checkedDraft.ocr.provenance, 'EXTRACTED_UNVERIFIED');
  assert.equal(checkedDraft.afp_mapping.fields.total.candidates[0].provenance, 'EXTRACTED_UNVERIFIED');
  assert.equal(checkedDraft.expense_description.provenance, 'SOURCE_FACT');
  assert.equal(checkedDraft.compliance.claim_category, 'B');
  assert.equal(checkedDraft.compliance.category_suggestion.code, 'B10');
  assert.equal(checkedDraft.compliance.category_suggestion.provenance, 'AI_RECOMMENDATION');
  assert.equal(checkedDraft.compliance.assessment.paymentApproved, false);
  // Editing a field after confirming clears the confirmation.
  await page.getByLabel('ยอดรวมที่ชำระ').fill('107.50');
  assert.equal(await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).isChecked(), false);
  // Await the changed file content, rather than a toast left over from the preceding save.
  await page.getByRole('button', { name: 'บันทึกผลตรวจเก็บไว้' }).click();
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
  await expect(page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/)).toBeChecked();
  await page.getByLabel('รายการค่าใช้จ่าย', { exact: true }).fill('ค่าเครื่องดื่ม');
  assert.equal(await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).isChecked(), false);
  await expect(outcome).toContainText('ยังระบุหมวดจากรายการนี้ไม่ได้');
  await page.getByLabel('รายการค่าใช้จ่าย', { exact: true }).fill('ค่าน้ำดื่ม');
  await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).check();
  await page.getByText('เพิ่มวัตถุประสงค์หรือแก้หมวด (ถ้าจำเป็น)', { exact: true }).click();
  await page.getByLabel('หมวดที่จะเบิก', { exact: true }).selectOption('other');
  assert.equal(await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).isChecked(), false);
  await page.getByLabel('หมวดที่จะเบิก', { exact: true }).selectOption('auto');
  await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).check();
  await page.getByLabel('ประเภทเอกสาร', { exact: true }).selectOption('invoice_or_quotation');
  await outcome.getByText('ยังใช้แทนหลักฐานรับเงินไม่ได้', { exact: true }).waitFor();
  assert.equal(await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).isChecked(), false);
  await page.getByLabel('ประเภทเอกสาร', { exact: true }).selectOption('receipt');
  await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).check();
  await page.getByLabel('หมายเหตุการเบิก', { exact: true }).fill('ใช้ในกิจกรรมสังเคราะห์');
  assert.equal(await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).isChecked(), false);
  await page.getByLabel('หมายเหตุการเบิก', { exact: true }).fill('');
  await page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/).check();
  await page.screenshot({ path: join(out, 'receipt-ready.png') });
  // Pilot scoring/export stays available to development tools, without advanced controls on the employee page.
  await expect(page.getByText('เครื่องมือทดลองและวัดผล OCR', { exact: true })).toHaveCount(0);
  const local = await page.evaluate(async () => {
    const reading = await window.step.call('ocrRead', { localOnly: true });
    const extracted = window.ReceiptReview.extractReceipt(reading.result);
    return {
      fields: Object.fromEntries(Object.entries(extracted.fields).map(([key, field]) => [key, field.value])),
      elapsedMs: reading.elapsedMs,
    };
  });
  const frozen = trialReading(local.fields, ['date'], local.elapsedMs);
  const pilot = trialReport(frozen, null, { ...local.fields, total: '108.00' }, true, 'receipt:synthetic-pilot');
  assert.equal(pilot.summary.ocr.exact, 6);
  const trialPath = resolve(fixtureDir, 'receipt-trial.json');
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, trialPath);
  await assert.rejects(
    page.evaluate(draft => window.step.call('ocrTrialSave', { draft }), { ...pilot, checked: false }),
    /INVALID_INPUT/,
  );
  await page.evaluate(draft => window.step.call('ocrTrialSave', { draft }), pilot);
  const exported = JSON.parse(await readFile(trialPath, 'utf8'));
  assert.equal(exported.ocr.fields.total.value, '107.00');
  assert.equal(exported.fields.total.human.value, '108.00');
  assert.equal(exported.fields.total.ocr.match, false);
  assert.equal(exported.summary.ocr.errors, 1);
  assert.equal(exported.vision, null);
  assert.equal(exported.acceptanceGate, 'OPEN');
  assert.ok(exported.ocr.elapsedMs > 0);
  // The actual host export guard still refuses a report in the public checkout.
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, resolve('receipt-trial-forbidden.json'));
  await assert.rejects(
    page.evaluate(draft => window.step.call('ocrTrialSave', { draft }), pilot),
    /OCR_TRIAL_REPO_PATH/,
  );
  await page.getByLabel('ยอดรวมที่ชำระ').fill('108.00');
  await expect(page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/)).not.toBeChecked();
  await page.getByLabel('ยอดรวมที่ชำระ').fill('107.00');
  await page.getByRole('region', { name: 'องค์ประกอบพื้นฐานใบเสร็จ' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(out, 'receipt-components.png') });
  await new Promise(resolve => ocr.close(resolve));
  await assert.rejects(
    page.evaluate(() => window.step.call('ocrRead', { connectionId: 'existing-api', localOnly: false })),
    /OCR_UNAVAILABLE/,
  );
  assert.equal(externalCalls, 0);
  console.log(
    'Local receipt smoke passed: existing API/cloud configuration ignored, external OCR/text/Google calls blocked, human review preserved and no model fallback when local OCR is unavailable.',
  );
} finally {
  await app.close();
  if (ocr.listening) await new Promise(resolve => ocr.close(resolve));
  await new Promise(resolve => external.close(resolve));
  assert.ok(home.startsWith(tmpdir()) && fixtureDir.startsWith(tmpdir()));
  await rm(home, { recursive: true, force: true });
  await rm(fixtureDir, { recursive: true, force: true });
}
