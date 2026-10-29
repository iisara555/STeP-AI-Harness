// Native local-only AFP draft flow using synthetic data; no approval, banking or live provider operation.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import assert from 'node:assert/strict';

const out = resolve(process.argv[2] || (await mkdtemp(join(tmpdir(), 'step-pv-evidence-'))));
await mkdir(out, { recursive: true });
const home = await mkdtemp(join(tmpdir(), 'step-pv-home-')),
  sourceRoot = await mkdtemp(join(tmpdir(), 'step-pv-source-'));
const modulePath = join(sourceRoot, 'seed.cjs');
await build({ entryPoints: ['electron/store.ts'], outfile: modulePath, bundle: true, platform: 'node', format: 'cjs' });
const { Store } = createRequire(import.meta.url)(modulePath);
const store = new Store(join(home, 'workspace.sqlite'));
const id = '11111111-1111-4111-8111-111111111111';
// An actual v1 packet without the new fields exercises additive migration through the real host.
store.put('receipt-packet', id, {
  schema: 'step-receipt-packet/v1',
  id,
  revision: 0,
  title: 'ร่างใบสำคัญจ่าย — ข้อมูลสมมติ',
  project: 'โครงการทดสอบระบบ',
  purpose: 'ทดสอบการเตรียมข้อมูลให้ AFP ข้อมูลทั้งหมดเป็นข้อมูลสมมติ',
  mode: 'awaiting-payment',
  voucher: {
    date: '27/10/2569',
    recipient: 'ผู้รับเงินตัวอย่าง',
    address: 'ที่อยู่สมมติสำหรับตรวจแบบฟอร์ม',
    payer: 'อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่',
    payerSignatory: '',
    items: [{ description: 'ค่าตอบแทนทดสอบระบบ', amount: '1000.25' }],
    checked: true,
  },
  includeVoucher: true,
  documents: [],
  createdAt: '2026-10-27T00:00:00Z',
  updatedAt: '2026-10-27T00:00:00Z',
  paymentApproved: false,
});
store.put('settings', 'main', {
  team: 'shared',
  assistant: 'STeP Mate',
  workspace: out,
  theme: 'light',
  onboarding: true,
  whatsNewSeen: '999.0.0',
  tourDone: true,
  consentedAt: new Date().toISOString(),
  termsVersion: '2026-10-02',
});
store.close();
const sourcePath = join(sourceRoot, 'synthetic-payment-evidence.pdf');
const source = await PDFDocument.create();
source.addPage([421, 500]).drawText('SYNTHETIC PAYMENT EVIDENCE ONLY', { x: 20, y: 450, size: 12 });
await writeFile(sourcePath, await source.save());
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1' };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const exports = new Map();
async function saveAs(path) {
  exports.set(path, (await stat(path).catch(() => null))?.mtimeMs || 0);
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, path);
}
async function waitFile(path) {
  await expect
    .poll(
      async () => {
        const info = await stat(path).catch(() => null);
        return info && info.mtimeMs > exports.get(path) ? info.size : 0;
      },
      { timeout: 45000 },
    )
    .toBeGreaterThan(100);
}
async function launch() {
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1500, height: 1050 });
  await page.getByRole('button', { name: /ตรวจใบเสร็จ AFP/ }).click();
  await page.getByRole('button', { name: 'ชุดเอกสารเบิกจ่าย', exact: true }).click();
  await page.getByRole('button', { name: 'ร่างและส่งออก', exact: true }).click();
  await page.getByRole('button', { name: 'ใบสำคัญจ่ายสำหรับ AFP', exact: true }).click();
  return page;
}
try {
  let page = await launch();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByLabel('ผู้รับเงินสำหรับใบสำคัญจ่าย', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'นำข้อมูล FM-AF-014 ที่ตรวจแล้วมาเริ่มร่าง', exact: true }).click();
  await expect(page.getByLabel('ผู้รับเงินสำหรับใบสำคัญจ่าย', { exact: true })).toHaveValue('ผู้รับเงินตัวอย่าง');
  await expect(page.getByLabel('ยอดรายการจ่าย 1', { exact: true })).toHaveValue('1000.25');
  await expect(page.getByLabel('ยอดหัก ณ ที่จ่ายรายการ 1', { exact: true })).toHaveValue('');
  await expect(page.getByText('รอข้อมูลยอดหักครบ', { exact: true })).toBeVisible();
  await page.getByLabel('วันที่ร่างใบสำคัญจ่าย', { exact: true }).fill('27 ตุลาคม 2569');
  await page.getByLabel('วิธีจ่ายสำหรับ AFP', { exact: true }).selectOption('transfer');
  await page.getByLabel('เลขอ้างอิงเอกสารประกอบ', { exact: true }).fill('SYNTHETIC-REF-001');
  await page.getByLabel('ยอดหัก ณ ที่จ่ายรายการ 1', { exact: true }).fill('10.01');
  await page.getByLabel('ยอดหักอื่นรายการ 1', { exact: true }).fill('2.02');
  await expect(page.locator('.payment-voucher-form .packet-total strong')).toHaveText('988.22 บาท');
  await page.getByLabel('ตรวจข้อมูลร่างใบสำคัญจ่ายเทียบหลักฐานแล้ว', { exact: true }).check();
  await page.getByLabel('ยอดหักอื่นรายการ 1', { exact: true }).fill('2.03');
  await expect(page.getByLabel('ตรวจข้อมูลร่างใบสำคัญจ่ายเทียบหลักฐานแล้ว', { exact: true })).not.toBeChecked();
  await page.getByLabel('ยอดหักอื่นรายการ 1', { exact: true }).fill('2.02');
  await page.getByLabel('ตรวจข้อมูลร่างใบสำคัญจ่ายเทียบหลักฐานแล้ว', { exact: true }).check();
  await page.getByLabel('แนบร่างใบสำคัญจ่ายใน PDF รวม', { exact: true }).check();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, sourcePath);
  await page.getByRole('button', { name: 'หลักฐาน', exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่มเอกสาร', exact: true }).click();
  await page.getByLabel('ประเภทของ synthetic-payment-evidence.pdf', { exact: true }).selectOption('invoice_or_quotation');
  await page.getByLabel('ตรวจเทียบหน้าที่เลือกของ synthetic-payment-evidence.pdf แล้ว', { exact: true }).check();
  await page.getByRole('button', { name: 'ร่างและส่งออก', exact: true }).click();
  await expect(page.getByLabel('ตรวจข้อมูลร่างใบสำคัญจ่ายเทียบหลักฐานแล้ว', { exact: true })).not.toBeChecked();
  await page.getByLabel('ตรวจข้อมูลร่างใบสำคัญจ่ายเทียบหลักฐานแล้ว', { exact: true }).check();
  await expect(page.getByText('บันทึกในเครื่องแล้ว', { exact: true })).toBeVisible();
  await app.close();
  app = undefined;
  page = await launch();
  await expect(page.getByLabel('ยอดหัก ณ ที่จ่ายรายการ 1', { exact: true })).toHaveValue('10.01');
  await expect(page.getByLabel('ตรวจข้อมูลร่างใบสำคัญจ่ายเทียบหลักฐานแล้ว', { exact: true })).toBeChecked();
  await page.evaluate(async id => {
    let packet = await window.step.call('receiptPacketGet', { id });
    packet.voucher.items[0].amount = '1000.26';
    packet = await window.step.call('receiptPacketSave', { packet });
    packet.voucher.checked = true;
    await window.step.call('receiptPacketSave', { packet });
  }, id);
  await app.close();
  app = undefined;
  page = await launch();
  await expect(page.getByLabel('ตรวจข้อมูลร่างใบสำคัญจ่ายเทียบหลักฐานแล้ว', { exact: true })).not.toBeChecked();
  await expect(page.getByText('ข้อมูล FM-AF-014 ต้นทางเปลี่ยนไป โปรดตรวจต้นทางและนำข้อมูลล่าสุดมาเทียบ', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'นำข้อมูล FM-AF-014 ที่ตรวจแล้วมาเริ่มร่าง', exact: true }).click();
  await expect(page.getByLabel('ยอดรายการจ่าย 1', { exact: true })).toHaveValue('1000.25');
  await expect(page.getByLabel('ยอดหัก ณ ที่จ่ายรายการ 1', { exact: true })).toHaveValue('10.01');
  await page.getByLabel('ยอดรายการจ่าย 1', { exact: true }).fill('1000.26');
  await page.getByLabel('ตรวจข้อมูลร่างใบสำคัญจ่ายเทียบหลักฐานแล้ว', { exact: true }).check();
  const pdfPath = join(out, 'AFP-document-packet.pdf'),
    draftPath = join(out, 'AFP-payment-voucher-draft.docx'),
    blankPath = join(out, 'AFP-payment-voucher-template.docx');
  await saveAs(pdfPath);
  await page.getByRole('button', { name: 'ส่งออก PDF รวม', exact: true }).click();
  await waitFile(pdfPath);
  const pdf = await PDFDocument.load(await readFile(pdfPath));
  assert.equal(pdf.getPageCount(), 4);
  assert.equal(pdf.getPages().at(-1).getWidth(), 421);
  await saveAs(draftPath);
  await page.getByRole('button', { name: 'ส่งออกร่างใบสำคัญจ่าย Word', exact: true }).click();
  await waitFile(draftPath);
  const draft = await JSZip.loadAsync(await readFile(draftPath));
  assert.match(await draft.file('word/document.xml').async('string'), /988.23/);
  await saveAs(blankPath);
  await page.getByRole('button', { name: 'แม่แบบใบสำคัญจ่าย Word เปล่า', exact: true }).click();
  await waitFile(blankPath);
  const blank = await JSZip.loadAsync(await readFile(blankPath));
  const blankBody = await blank.file('word/document.xml').async('string');
  assert.ok(!blankBody.includes('ผู้รับเงินตัวอย่าง') && !blankBody.includes('โครงการทดสอบระบบ'));
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await page.locator('.receipt-app').evaluate(element => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: join(out, 'payment-desktop.png') });
  await page.locator('.receipt-app').evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await page.screenshot({ path: join(out, 'payment-desktop-bottom.png') });
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.getByRole('region', { name: 'ร่างใบสำคัญจ่ายสำหรับ AFP', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(out, 'payment-narrow.png') });
  assert.ok(await page.locator('.receipt-app').evaluate(element => element.scrollWidth <= element.clientWidth));
  await page.locator('.receipt-app').evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await page.screenshot({ path: join(out, 'payment-narrow-bottom.png') });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  for (const label of ['ส่งออกร่างใบสำคัญจ่าย Word', 'ส่งออก PDF รวม']) {
    const button = page.getByRole('button', { name: label, exact: true });
    await expect(button).toHaveCSS('color', 'rgb(35, 31, 32)');
    await expect(button).toHaveCSS('background-color', 'rgb(255, 199, 9)');
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.screenshot({ path: join(out, 'payment-dark.png') });
  const packet = await page.evaluate(id => window.step.call('receiptPacketGet', { id }), id);
  assert.equal(packet.paymentApproved, false);
  assert.equal(packet.disbursement.checked, true);
  assert.equal(packet.disbursement.items[0].deduction, '2.02');
  assert.deepEqual(errors, []);
  await writeFile(
    join(out, 'verification.json'),
    JSON.stringify(
      {
        synthetic: true,
        combinedPages: pdf.getPageCount(),
        netSatang: 98823,
        legacyMigration: true,
        restartPersistence: true,
        unknownDeductionsPreserved: true,
        staleReceiptFlagged: true,
        manualDeductionsPreserved: true,
        blankTemplateHasNoCaseFacts: true,
        paymentApproved: false,
        controlledFormVerified: false,
      },
      null,
      2,
    ),
  );
  console.log(
    'AFP payment voucher smoke passed: legacy migration, explicit receipt import, unknown deductions, net amount, invalidation, stale-source review, manual preservation, restart and Word/four-page PDF exports. Synthetic data only.',
  );
} catch (error) {
  if (app)
    for (const [index, page] of app.windows().entries()) {
      await page.screenshot({ path: join(out, `failure-${index}.png`) }).catch(() => undefined);
      console.log(
        (
          await page
            .locator('body')
            .innerText()
            .catch(() => '')
        ).slice(-1400),
      );
    }
  throw error;
} finally {
  if (app) await app.close();
  assert.ok(home.startsWith(tmpdir()) && sourceRoot.startsWith(tmpdir()));
  await rm(home, { recursive: true, force: true });
  await rm(sourceRoot, { recursive: true, force: true });
}
