// Offline renderer/preload/host acceptance recovery with synthetic drafts only.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'step-draft-accept-')),
  workspace = join(home, 'work');
await mkdir(workspace);
await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ pilot: false, features: { toolLoop: false, autoRouting: false } }));
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT,id TEXT,value TEXT,PRIMARY KEY(kind,id))');
const put = (kind, id, value) => db.prepare('INSERT INTO records VALUES(?,?,?)').run(kind, id, JSON.stringify(value));
put('settings', 'main', {
  team: 'cc',
  assistant: 'Synthetic',
  workspace,
  theme: 'light',
  onboarding: true,
  whatsNewSeen: '999.0.0',
  tourDone: true,
  termsVersion: '2026-10-02',
});
put('connection', 'offline', { id: 'offline', provider: 'openai', mode: 'api', name: 'Synthetic offline connection', model: 'm' });
put('session', 'document', {
  id: 'document',
  title: 'Synthetic draft acceptance',
  team: 'cc',
  connectionId: 'offline',
  messages: [{ role: 'assistant', text: '# Synthetic AI proposal\n\nAI replacement', at: '' }],
  draft: 'Original manual draft',
  revision: 0,
  versions: [],
  proposals: [{ id: 'p', text: '# Synthetic AI proposal\n\nAI replacement', baseRevision: 0, sources: [], at: '' }],
  originalQuery: '',
  answers: [],
  clarification: false,
  status: 'review',
  updatedAt: new Date().toISOString(),
  sources: [],
  mode: 'draft',
  documentTool: 'memo',
});
db.close();
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1' };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 950 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const current = async () => (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.id === 'document');
  const accept = page.getByRole('button', { name: 'ใช้ร่างนี้', exact: true });
  const editor = page.locator('.tiptap');
  const dialog = page.getByRole('alertdialog', { name: 'ใช้ข้อเสนอ AI แทนร่างปัจจุบัน?' });
  await expect(editor).toContainText('Original manual draft');
  await expect(accept).toBeEnabled();

  // Previously any local edit permanently disabled acceptance; save it and offer a cancellable review instead.
  await editor.fill('Unsaved human correction');
  await expect(accept).toBeEnabled();
  // Failed persistence must keep both the editor's unsaved text and the original proposal available for retry.
  await app.evaluate(({ ipcMain }) => {
    const original = ipcMain._invokeHandlers.get('step:call');
    let failEdit = true;
    ipcMain.removeHandler('step:call');
    ipcMain.handle('step:call', (event, method, input) => {
      if (method === 'edit' && failEdit) {
        failEdit = false;
        throw new Error('DRAFT_CONFLICT');
      }
      return original(event, method, input);
    });
  });
  await accept.click();
  await expect(page.getByRole('alert')).toContainText('กรุณาตรวจฉบับล่าสุดแล้วลองอีกครั้ง');
  await expect(accept).toBeEnabled();
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await expect(editor).toContainText('Unsaved human correction');
  assert.equal((await current()).draft, 'Original manual draft');
  assert.equal((await current()).proposals.length, 1);
  await expect(dialog).toHaveCount(0);
  await accept.click();
  await expect(dialog).toBeVisible();
  assert.equal((await current()).draft, 'Unsaved human correction');
  assert.equal((await current()).proposals.length, 1);
  await dialog.getByText('อ่านร่างปัจจุบัน', { exact: true }).click();
  await expect(dialog).toContainText('Unsaved human correction');
  await dialog.getByText('อ่านข้อเสนอจาก AI', { exact: true }).click();
  await expect(dialog).toContainText('AI replacement');
  await dialog.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await expect(editor).toContainText('Unsaved human correction');
  assert.equal((await current()).proposals.length, 1);

  // Saved changes also recover through the same button, and the replaced version can be restored.
  await accept.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'ยืนยันใช้ร่างนี้', exact: true }).click();
  await expect(accept).toHaveCount(0);
  await expect(editor).toContainText('AI replacement');
  const accepted = await current();
  const previous = accepted.versions.find(v => v.text === 'Unsaved human correction');
  assert.ok(previous);
  await page.evaluate(revision => window.step.call('restore', { id: 'document', revision }), previous.revision);
  await page.reload();
  await expect(editor).toContainText('Unsaved human correction');

  // A draft changed while the review is open must never be replaced by consent for the earlier revision.
  await page.evaluate(() => window.step.call('stageMessage', { id: 'document', index: 0 }));
  let saved = await current();
  await page.evaluate(revision => window.step.call('edit', { id: 'document', revision, text: 'Saved after proposal' }), saved.revision);
  await page.reload();
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect(dialog).toBeVisible();
  saved = await current();
  await page.evaluate(
    revision => window.step.call('edit', { id: 'document', revision, text: 'Newer concurrent correction' }),
    saved.revision,
  );
  await dialog.getByRole('button', { name: 'ยืนยันใช้ร่างนี้', exact: true }).click();
  await expect(dialog).toContainText('กรุณาตรวจฉบับล่าสุดแล้วลองอีกครั้ง');
  assert.equal((await current()).draft, 'Newer concurrent correction');
  assert.equal((await current()).proposals.length, 1);
  await dialog.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await page.reload();
  await expect(editor).toContainText('Newer concurrent correction');
  await accept.click();
  await dialog.getByRole('button', { name: 'ยืนยันใช้ร่างนี้', exact: true }).click();
  await expect(accept).toHaveCount(0);

  // Unchanged proposals retain the direct, single-click path.
  await page.evaluate(() => window.step.call('stageMessage', { id: 'document', index: 0 }));
  await page.reload();
  await accept.click();
  await expect(accept).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log('PASS: unsaved/stale draft acceptance, failed-save retry, cancellation, version restore and concurrent-revision protection');
} finally {
  if (app) {
    await app
      .evaluate(({ BrowserWindow }) => {
        for (const window of BrowserWindow.getAllWindows()) window.destroy();
      })
      .catch(() => {});
    await app.close();
  }
  await rm(home, { recursive: true, force: true });
}
