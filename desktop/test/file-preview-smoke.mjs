// Files tab: Word, Excel and PowerPoint files and pictures open read-only inside the app, a PDF offers the computer's
// own app, and a program never does. Synthetic files only; opening in the computer's app is recorded, not performed.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { Document, Packer, Paragraph, HeadingLevel } from 'docx';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';

const home = await mkdtemp(join(tmpdir(), 'step-file-preview-'));
const folder = join(home, 'work');
await mkdir(folder, { recursive: true });
await writeFile(
  join(folder, 'tor-draft.docx'),
  await Packer.toBuffer(
    new Document({
      sections: [
        {
          children: [new Paragraph({ text: 'ขอบเขตของงานสังเคราะห์', heading: HeadingLevel.HEADING_1 }), new Paragraph('ข้อความในเอกสาร')],
        },
      ],
    }),
  ),
);
const workbook = new ExcelJS.Workbook();
workbook.addWorksheet('ต้นทุน').addRows([
  ['รายการ', 'ราคา'],
  ['กล้องสังเคราะห์', 1200],
]);
await writeFile(join(folder, 'cost.xlsx'), Buffer.from(await workbook.xlsx.writeBuffer()));
const pptx = new PptxGenJS();
pptx.addSlide().addText('สไลด์สังเคราะห์', { x: 1, y: 1, w: 6, h: 1 });
await writeFile(join(folder, 'deck.pptx'), Buffer.from(await pptx.write({ outputType: 'nodebuffer' })));
await writeFile(join(folder, 'scan.pdf'), Buffer.from('%PDF-1.4\n\0synthetic\n%%EOF\n'));
await writeFile(join(folder, 'tool.exe'), Buffer.from([0x4d, 0x5a, 0, 0]));

const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor();
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await app.evaluate(({ dialog, shell }, f) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] });
    globalThis.__opened = [];
    shell.openPath = async path => {
      globalThis.__opened.push(path);
      return '';
    };
  }, folder);
  await page.evaluate(async () => {
    await window.step.call('workspace');
    const connection = await window.step.call('connection', { provider: 'openai', mode: 'subscription', model: '' });
    const session = await window.step.call('create', { connectionId: connection.id, project: 'Preview' });
    await window.step.call('edit', { id: session.id, text: 'ร่างสังเคราะห์', revision: 0 });
  });
  await page.reload();
  await page.locator('.draft-editor').waitFor();
  await page.getByRole('button', { name: 'ไฟล์งาน', exact: true }).click();
  const preview = page.locator('.file-preview');

  await page.getByRole('button', { name: 'tor-draft.docx' }).click();
  await expect(preview.locator('h5')).toHaveText('ขอบเขตของงานสังเคราะห์');
  await expect(preview).toContainText('ข้อความในเอกสาร');
  await expect(page.getByRole('textbox', { name: 'File content' })).toHaveCount(0);

  await page.getByRole('button', { name: 'cost.xlsx' }).click();
  await expect(preview.locator('h4')).toHaveText('ชีต ต้นทุน');
  await expect(preview.locator('td').filter({ hasText: 'กล้องสังเคราะห์' })).toBeVisible();
  await expect(preview.locator('td').filter({ hasText: '1200' })).toBeVisible();

  await page.getByRole('button', { name: 'deck.pptx' }).click();
  await expect(preview.locator('h4')).toHaveText('สไลด์ที่ 1');
  await expect(preview).toContainText('สไลด์สังเคราะห์');
  await preview.getByRole('button', { name: 'เปิดด้วยโปรแกรมในเครื่อง' }).click();
  await expect.poll(() => app.evaluate(() => globalThis.__opened.length)).toBe(1);
  assert.match((await app.evaluate(() => globalThis.__opened))[0], /deck\.pptx$/);

  // A PDF is not shown in the app yet, but opens in the computer's app; a program never gets that button.
  await page.getByRole('button', { name: 'scan.pdf' }).click();
  await expect(preview).toContainText('ไฟล์ชนิดนี้ยังแสดงในแอปไม่ได้');
  await expect(preview.getByRole('button', { name: 'เปิดด้วยโปรแกรมในเครื่อง' })).toBeVisible();
  await page.getByRole('button', { name: 'tool.exe' }).click();
  await expect(preview).toContainText('ไฟล์ชนิดนี้เปิดในแอปไม่ได้');
  await expect(preview.getByRole('button', { name: 'เปิดด้วยโปรแกรมในเครื่อง' })).toHaveCount(0);
  await assert.rejects(
    page.evaluate(() => window.step.call('toolOpenFile', { path: 'tool.exe' })),
    /OPEN_FILE_TYPE/,
  );
  assert.equal((await app.evaluate(() => globalThis.__opened)).length, 1);
  console.log('File preview smoke passed: Word, Excel and PowerPoint read-only in the app; PDF opens in its app; programs never.');
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
