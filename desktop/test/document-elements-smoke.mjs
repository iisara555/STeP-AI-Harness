// Offline editor/image/persistence acceptance. No provider or organization credentials.
import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

const home = await mkdtemp(join(tmpdir(), 'step-document-elements-')),
  workspace = join(home, 'work'),
  picture = join(home, 'image.png');
await mkdir(workspace);
await writeFile(
  picture,
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMw7Vz8HwAEuQJhv9Bd3QAAAABJRU5ErkJggg==', 'base64'),
);
await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ pilot: false, features: { toolLoop: false, autoRouting: false } }));
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT,id TEXT,value TEXT,PRIMARY KEY(kind,id))');
const put = (kind, id, value) => db.prepare('INSERT INTO records VALUES(?,?,?)').run(kind, id, JSON.stringify(value));
put('settings', 'main', {
  team: 'ga',
  assistant: 'Synthetic',
  workspace,
  theme: 'light',
  onboarding: true,
  whatsNewSeen: '999.0.0',
  tourDone: true,
  consentedAt: new Date().toISOString(),
  termsVersion: '2026-10-02',
});
put('connection', 'offline', { id: 'offline', provider: 'openai', mode: 'api', name: 'Synthetic offline connection', model: 'm' });
put('session', 'document', {
  id: 'document',
  title: 'เอกสารสังเคราะห์',
  team: 'ga',
  connectionId: 'offline',
  messages: [],
  draft: 'ชื่อเรื่องสังเคราะห์\nเนื้อหาสำหรับตรวจองค์ประกอบ',
  document: {
    type: 'doc',
    content: [
      { type: 'title', content: [{ type: 'text', text: 'ชื่อเรื่องสังเคราะห์' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'เนื้อหาสำหรับตรวจองค์ประกอบ' }] },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Synthetic table cell' }] }] }],
          },
        ],
      },
      {
        type: 'orderedList',
        attrs: { start: 3 },
        content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Synthetic list item' }] }] }],
      },
    ],
  },
  revision: 0,
  versions: [],
  proposals: [],
  originalQuery: '',
  answers: [],
  clarification: false,
  status: 'idle',
  updatedAt: new Date().toISOString(),
  sources: [],
  mode: 'draft',
});
db.close();
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1' };
delete env.ELECTRON_RUN_AS_NODE;
let app;
let phase = 'launch';
const watchdog = setTimeout(() => {
  console.error('Document elements smoke exceeded 120 seconds');
  process.exit(1);
}, 120000);
try {
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await app.firstWindow();
  page.on('dialog', dialog => {
    if (dialog.type() === 'beforeunload') void dialog.accept().catch(() => {});
    else void dialog.dismiss().catch(() => {});
  });
  await page.setViewportSize({ width: 1500, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await expect(page.locator('.tiptap')).toContainText('เนื้อหาสำหรับตรวจองค์ประกอบ');
  phase = 'bounded containers';
  for (const selector of ['.tiptap td p', '.tiptap li p']) {
    await page.locator(selector).click();
    await expect(page.getByLabel('รูปแบบข้อความ', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'แทรกรูปภาพ', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'ขึ้นหน้าใหม่', exact: true })).toBeDisabled();
  }
  await page.locator('.tiptap p').filter({ hasText: 'เนื้อหาสำหรับตรวจองค์ประกอบ' }).click();
  phase = 'presentation controls';
  await page.getByLabel('การจัดหน้า', { exact: true }).selectOption('book');
  await page.getByLabel('สารบัญจากหัวข้อระดับ 1–3', { exact: true }).check();
  await page.getByLabel('ข้อความหัวกระดาษ', { exact: true }).fill('Synthetic header');
  await page.getByLabel('ข้อความท้ายกระดาษ', { exact: true }).fill('Synthetic footer');
  await page.getByLabel('รูปแบบเลขหน้า', { exact: true }).selectOption('arabic-total');
  await page.getByLabel('ตำแหน่งเลขหน้า', { exact: true }).selectOption('footer-right');
  phase = 'image import';
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, picture);
  await page.locator('.tiptap p').filter({ hasText: 'เนื้อหาสำหรับตรวจองค์ประกอบ' }).click();
  await page.keyboard.press('End');
  await page.getByRole('button', { name: 'แทรกรูปภาพ', exact: true }).click();
  await expect(page.locator('.document-image img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await page.locator('[data-document-caption]').click();
  await page.keyboard.type('ภาพที่ 1 ตัวอย่างสังเคราะห์');
  await page.locator('.document-image img').click();
  await expect(page.locator('.document-image')).toHaveClass(/ProseMirror-selectednode/);
  await page.getByLabel('ความกว้างรูป (ซม.)', { exact: true }).fill('8');
  await page.getByLabel('คำอธิบายรูป', { exact: true }).fill('ภาพทดสอบที่แก้ไขได้');
  await expect(page.getByLabel('คำอธิบายรูป', { exact: true })).toHaveValue('ภาพทดสอบที่แก้ไขได้');
  phase = 'save and reload';
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(page.getByRole('button', { name: 'บันทึก', exact: true })).toBeDisabled();
  const snapshot = () => page.evaluate(() => window.step.call('snapshot'));
  let saved = (await snapshot()).sessions.find(s => s.id === 'document');
  const image = saved.document.content.find(n => n.type === 'image');
  assert.equal(image.attrs.widthCm, 8);
  assert.equal(image.attrs.alt, 'ภาพทดสอบที่แก้ไขได้');
  assert.equal(saved.presentation.preset, 'book');
  assert.equal(saved.presentation.toc, true);
  assert.equal(saved.presentation.headerText, 'Synthetic header');
  await page.reload();
  await expect(page.locator('.document-image img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(page.locator('[data-document-caption]')).toContainText('ภาพที่ 1');
  await expect(page.getByLabel('การจัดหน้า', { exact: true })).toHaveValue('book');
  await expect(page.getByLabel('ข้อความหัวกระดาษ', { exact: true })).toHaveValue('Synthetic header');
  await expect(page.getByLabel('รูปแบบเลขหน้า', { exact: true })).toHaveValue('arabic-total');
  phase = 'quote and page break';
  await page.locator('.tiptap p').filter({ hasText: 'เนื้อหาสำหรับตรวจองค์ประกอบ' }).click();
  await page.getByRole('button', { name: 'ข้อความอ้างอิง', exact: true }).click();
  await expect(page.locator('.tiptap blockquote')).toContainText('เนื้อหาสำหรับตรวจองค์ประกอบ');
  await page.locator('[data-document-caption]').click();
  await page.keyboard.press('End');
  await page.getByRole('button', { name: 'ขึ้นหน้าใหม่', exact: true }).click();
  await expect(page.locator('[data-document-page-break]')).toHaveCount(1);
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(page.getByRole('button', { name: 'บันทึก', exact: true })).toBeDisabled();
  phase = 'native export';
  const exported = await page.evaluate(() => window.step.call('export', { id: 'document', format: 'docx' }));
  const zip = await JSZip.loadAsync(await readFile(exported.path));
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /<w:drawing>/);
  assert.match(xml, /<w:pStyle w:val="Title"/);
  assert.match(xml, /<w:pStyle w:val="Caption"/);
  assert.match(xml, /<w:pageBreakBefore/);
  assert.match(xml, /TOC[^<]*\\o &quot;1-3&quot;/);
  assert.match(await zip.file('word/header1.xml').async('string'), /Synthetic header/);
  const footer = await zip.file('word/footer1.xml').async('string');
  assert.match(footer, />PAGE</);
  assert.match(footer, />NUMPAGES</);
  assert.equal(exported.layout.fieldsNeedUpdate, true);
  phase = 'owner isolation and restore';
  const result = await page.evaluate(async () => {
    const other = await window.step.call('create', { connectionId: 'offline' });
    const current = (await window.step.call('snapshot')).sessions.find(s => s.id === 'document');
    try {
      await window.step.call('edit', { id: other.id, text: '', revision: 0, document: current.document });
      return '';
    } catch (e) {
      return String(e);
    }
  });
  assert.match(result, /DOCUMENT_IMAGE_NOT_FOUND/);
  saved = (await snapshot()).sessions.find(s => s.id === 'document');
  const prior = saved.versions.find(v => v.document?.content?.some(n => n.type === 'image'));
  await page.evaluate(revision => window.step.call('restore', { id: 'document', revision }), prior.revision);
  await page.reload();
  await expect(page.locator('.document-image img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  assert.deepEqual(errors, []);
  console.log('PASS: bounded document elements, local images, editing, restart/restore and native DOCX export');
} catch (error) {
  console.error('Document elements smoke phase: ' + phase, error);
  throw error;
} finally {
  clearTimeout(watchdog);
  if (app) {
    await app
      .evaluate(({ BrowserWindow }) => {
        for (const window of BrowserWindow.getAllWindows()) window.destroy();
      })
      .catch(() => {});
    await app.close();
  }
}
