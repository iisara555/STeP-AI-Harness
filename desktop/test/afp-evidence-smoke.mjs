// Real renderer/IPC and PDF export; all case details and evidence are synthetic.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import assert from 'node:assert/strict';

const out = resolve(process.argv[2] || (await mkdtemp(join(tmpdir(), 'step-afp-evidence-output-'))));
await mkdir(out, { recursive: true });
const home = await mkdtemp(join(tmpdir(), 'step-afp-evidence-home-'));
const sourceRoot = await mkdtemp(join(tmpdir(), 'step-afp-evidence-source-'));
const sourcePath = join(sourceRoot, 'FM-AF-015-synthetic.pdf');
const source = await PDFDocument.create();
source.addPage([421, 500]).drawText('SYNTHETIC ATTENDANCE ONLY', { x: 20, y: 450, size: 12 });
source.addPage([422, 500]).drawText('SECOND SYNTHETIC PAGE', { x: 20, y: 450, size: 12 });
await writeFile(sourcePath, await source.save());
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1' };
delete env.ELECTRON_RUN_AS_NODE;
let app;
async function launch(first = false) {
  app = await electron.launch({ args: ['.'], env, timeout: 45_000 });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1500, height: 1050 });
  if (first) await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.getByRole('button', { name: /ตรวจใบเสร็จ AFP/ }).click();
  await page.getByRole('button', { name: 'ชุดเอกสารเบิกจ่าย', exact: true }).click();
  return page;
}
try {
  let page = await launch(true);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'สร้างชุดใหม่', exact: true }).click();
  await page.getByLabel('ชื่อเรื่องเบิก', { exact: true }).fill('อบรมวิทยากร ข้อมูลสมมติ');
  await page.getByLabel('วัตถุประสงค์ของชุดเอกสาร', { exact: true }).fill('กิจกรรมทดสอบระบบเท่านั้น');
  const panel = page.getByRole('region', { name: 'แนะนำเอกสารตามกิจกรรม' });
  await expect(panel).toContainText('ระบบคาดว่า: อบรม / workshop');
  await expect(panel).toContainText('ประวัติการทำงาน / CV');
  await expect(panel).toContainText('ข้อเสนอให้ตรวจเพิ่ม');
  await page.getByRole('combobox', { name: 'กรณีการเงินที่ทราบ', exact: true }).selectOption('b_clearance');
  await expect(panel).toContainText('แนวปฏิบัติ AFP หมวด B');
  await panel.getByRole('heading', { name: 'แนะนำเอกสารตามกิจกรรม', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(out, 'evidence-overview.png') });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, sourcePath);
  await page.getByRole('button', { name: 'เพิ่มเอกสาร', exact: true }).click();
  await expect(panel).toContainText('ชื่อไฟล์คล้ายกัน · รอยืนยันประเภท');
  await page.getByRole('button', { name: 'ใช้ประเภทที่เสนอในหน้าที่ยังไม่ระบุ', exact: true }).click();
  await expect(panel).toContainText('พบในชุด · รอตรวจเทียบ');
  await page.getByText('เลือกหน้าและแยกประเภท (2 หน้า)', { exact: true }).click();
  await page.getByLabel('รวมหน้า 2 ของ FM-AF-015-synthetic.pdf', { exact: true }).uncheck();
  await page.getByLabel('ตรวจเทียบหน้าที่เลือกของ FM-AF-015-synthetic.pdf แล้ว', { exact: true }).check();
  await expect(panel).toContainText('พบหน้าที่ตรวจเทียบแล้ว');
  await panel.getByText('รายการอื่นที่ต้องการตรวจ (0)', { exact: true }).click();
  await panel.getByRole('button', { name: 'เพิ่มรายการตรวจ', exact: true }).click();
  await panel.getByLabel('รายการเพิ่มเติม 1', { exact: true }).fill('กำหนดการตัวอย่าง');
  await panel.getByRole('combobox', { name: 'เชื่อมไฟล์สำหรับรายการ 1', exact: true }).selectOption({ label: 'FM-AF-015-synthetic.pdf' });
  await expect(panel).toContainText('ตรวจหน้าที่เลือกแล้ว');
  await panel.getByRole('button', { name: 'ให้ AI ช่วยพิจารณาต่อ', exact: true }).click();
  const preview = panel.locator('.evidence-ai-preview pre');
  await expect(preview).toContainText('อบรม / workshop');
  await expect(preview).not.toContainText('FM-AF-015-synthetic.pdf');
  await expect(preview).not.toContainText('กำหนดการตัวอย่าง');
  await expect(preview).not.toContainText('ข้อมูลสมมติ');
  await panel.locator('.evidence-ai-preview').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(out, 'evidence-ai-preview.png') });
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(out, 'evidence-wide.png') });
  await page.setViewportSize({ width: 800, height: 800 });
  await panel.scrollIntoViewIfNeeded();
  assert.ok(await page.locator('.receipt-app').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
  await page.screenshot({ path: join(out, 'evidence-narrow.png') });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await page.screenshot({ path: join(out, 'evidence-dark.png') });
  await expect
    .poll(
      async () => {
        const [item] = await page.evaluate(() => window.step.call('receiptPacketList'));
        const packet = await page.evaluate(id => window.step.call('receiptPacketGet', { id }), item.id);
        return packet.guidance.extra[0]?.label;
      },
      { timeout: 10000 },
    )
    .toBe('กำหนดการตัวอย่าง');
  await app.close();
  app = undefined;
  page = await launch();
  const restored = page.getByRole('region', { name: 'แนะนำเอกสารตามกิจกรรม' });
  await expect(page.getByRole('combobox', { name: 'กรณีการเงินที่ทราบ', exact: true })).toHaveValue('b_clearance');
  await expect(restored).toContainText('พบหน้าที่ตรวจเทียบแล้ว');
  await restored.getByText('รายการอื่นที่ต้องการตรวจ (1)', { exact: true }).click();
  await expect(restored.getByLabel('รายการเพิ่มเติม 1', { exact: true })).toHaveValue('กำหนดการตัวอย่าง');
  const pdfPath = join(out, 'synthetic-afp-guided-packet.pdf');
  const previousWrite = (await stat(pdfPath).catch(() => null))?.mtimeMs || 0;
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, pdfPath);
  await page.getByRole('button', { name: 'ส่งออก PDF รวม', exact: true }).click();
  await expect
    .poll(
      async () => {
        const file = await stat(pdfPath).catch(() => null);
        return file && file.mtimeMs > previousWrite ? file.size : 0;
      },
      { timeout: 45000 },
    )
    .toBeGreaterThan(100);
  await expect(page.getByRole('button', { name: 'ส่งออก PDF รวม', exact: true })).toBeEnabled();
  const pdf = await PDFDocument.load(await readFile(pdfPath));
  assert.ok(pdf.getPageCount() >= 2);
  assert.equal(pdf.getPages().at(-1).getWidth(), 421);
  const [item] = await page.evaluate(() => window.step.call('receiptPacketList'));
  const packet = await page.evaluate(id => window.step.call('receiptPacketGet', { id }), item.id);
  assert.equal(packet.paymentApproved, false);
  assert.equal(packet.guidance.extra[0].sourceId, packet.documents[0].id);
  const longPacket = await page.evaluate(async id => {
    const current = await window.step.call('receiptPacketGet', { id });
    current.guidance.extra = Array.from({ length: 20 }, (_, index) => ({
      id: crypto.randomUUID(),
      label: `เอกสารเพิ่มเติมตัวอย่าง ${index + 1} สำหรับตรวจรายละเอียดและความเกี่ยวข้องกับกิจกรรม`,
      sourceId: '',
    }));
    return window.step.call('receiptPacketSave', { packet: current });
  }, item.id);
  const longPath = join(out, 'synthetic-afp-multipage-packet.pdf');
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, longPath);
  await page.evaluate(({ id, revision }) => window.step.call('receiptPacketExport', { id, revision, format: 'packet-pdf' }), longPacket);
  const longPdf = await PDFDocument.load(await readFile(longPath));
  assert.ok(longPdf.getPageCount() >= 3, 'a long guidance summary must span pages');
  assert.equal(longPdf.getPages().at(-1).getWidth(), 421, 'the selected source page stays at the end');
  assert.deepEqual(errors, []);
  console.log(
    `AFP evidence smoke passed: inferred activity, page confirmation, custom item, private handoff preview, restart and ${pdf.getPageCount()}/${longPdf.getPageCount()}-page PDFs.`,
  );
} finally {
  if (app) await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  await rm(sourceRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
