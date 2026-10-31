// Artifacts the AI saved, opened from the answer the way an employee would: a Markdown document in the viewer (rendered,
// raw HTML dropped) and an HTML page in the Web tab's isolated preview. Synthetic data only; no account or AI calls.
import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-artifacts-')),
  workspace = join(home, 'work'),
  out = join('release', 'qa', 'artifacts');
await mkdir(workspace);
await mkdir(out, { recursive: true });
const at = new Date(Date.now() - 10 * 60_000).toISOString();
const artifact = (id, title, kind, content, version = 1) => ({
  id,
  sessionId: 's-art',
  title,
  kind,
  content,
  version,
  createdAt: at,
  updatedAt: at,
});
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
const put = db.prepare('INSERT INTO records VALUES(?,?,?)');
put.run(
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
    consentedAt: at,
    termsVersion: '2026-10-02',
  }),
);
const notes = artifact(
  'seminar-notes',
  'สรุปสัมมนา AI Harness',
  'markdown',
  '# หัวข้อหลัก\n\n- จองห้อง D203\n- งบ 15,000 บาท\n\n<img src="x" onerror="window.__artifactXss=1">',
  2,
);
const page1 = artifact(
  'seminar-page',
  'หน้าประกาศสัมมนา',
  'html',
  '<!doctype html><html><body><h1 id="banner">ประกาศสัมมนา</h1></body></html>',
);
put.run('artifact', 's-art:seminar-notes', JSON.stringify(notes));
put.run('artifact', 's-art:seminar-page', JSON.stringify(page1));
const ref = a => ({ id: a.id, title: a.title, kind: a.kind, version: a.version });
put.run(
  'session',
  's-art',
  JSON.stringify({
    id: 's-art',
    title: 'สรุปสัมมนา',
    project: '',
    team: 'cc',
    connectionId: '',
    messages: [
      { role: 'user', text: 'สรุปสัมมนาให้หน่อย', at },
      { role: 'assistant', text: 'บันทึกสรุปและหน้าประกาศไว้แล้ว', at, artifacts: [ref(notes), ref(page1)] },
    ],
    draft: '',
    revision: 0,
    versions: [],
    proposals: [],
    originalQuery: 'สรุปสัมมนาให้หน่อย',
    answers: [],
    status: 'review',
    updatedAt: at,
    sources: [],
  }),
);
db.close();

const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 860 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.locator('aside.sidebar').getByText('สรุปสัมมนา', { exact: true }).click();
  const list = page.getByRole('group', { name: 'เอกสารทำงานของผู้ช่วย' });
  await expect(list).toContainText('2 ชิ้น');
  await expect(list).toContainText('สรุปสัมมนา AI Harness');
  await expect(list).toContainText('ฉบับที่ 2');

  // Markdown opens in the viewer, rendered, with the embedded HTML dropped.
  await list
    .getByRole('listitem')
    .filter({ hasText: 'สรุปสัมมนา AI Harness' })
    .getByRole('button', { name: /เปิดดู/ })
    .click();
  const viewer = page.getByRole('dialog', { name: 'สรุปสัมมนา AI Harness' });
  await expect(viewer.getByRole('heading', { name: 'หัวข้อหลัก' })).toBeVisible();
  await expect(viewer.getByRole('listitem')).toHaveCount(2);
  assert.equal(await viewer.locator('img').count(), 0, 'raw HTML in Markdown is not rendered');
  assert.equal(await page.evaluate(() => window.__artifactXss), undefined);
  await page.screenshot({ path: join(out, 'viewer.png') });
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);

  // HTML opens in the Web tab's isolated preview, not in the app window.
  await list
    .getByRole('listitem')
    .filter({ hasText: 'หน้าประกาศสัมมนา' })
    .getByRole('button', { name: /เปิดดู/ })
    .click();
  await expect(page.locator('.browser-tab.active')).toBeVisible();
  const banner = async () =>
    app.evaluate(async ({ BrowserWindow }) => {
      const view = BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents?.getURL().includes('step-preview-'));
      return view
        ? view.webContents.executeJavaScriptInIsolatedWorld(1041, [{ code: 'document.getElementById("banner")?.textContent' }])
        : null;
    });
  await expect.poll(banner, { timeout: 15000 }).toBe('ประกาศสัมมนา');
  await page.screenshot({ path: join(out, 'html.png') });

  // A request for an artifact of another task finds nothing.
  const other = await page.evaluate(() =>
    window.step.call('artifactOpen', { sessionId: 'another-task', id: 'seminar-notes' }).then(
      () => 'opened',
      e => e.message,
    ),
  );
  assert.match(other, /ARTIFACT_NOT_FOUND/);
  assert.deepEqual(errors, []);
  console.log(
    'Artifacts smoke passed: list under the answer, Markdown viewer without raw HTML, HTML in the isolated preview, other tasks refused.',
  );
} finally {
  await app.close();
}
