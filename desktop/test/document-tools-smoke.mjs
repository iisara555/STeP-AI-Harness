// Synthetic UI/IPC checks with a local fake provider; no real documents or remote model calls.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const requests = [];
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (req.method === 'GET') return res.writeHead(404).end();
  const messages = JSON.parse(body).messages || [];
  const system = messages
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n');
  const prompt = messages.at(-1)?.content || '';
  if (system.includes('<document_tool_contract>')) requests.push({ system, prompt });
  const text =
    '# ร่างเพื่อพิจารณา\n\nเรื่อง ทดลองสังเคราะห์\n\n[รอยืนยัน: เลขหนังสือ]\n\n[รอยืนยัน: งบประมาณ]\n\n## ตรวจข้อมูล\n\nตรวจข้อมูลและแหล่งที่ขาดก่อนเสนอ';
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n');
  res.end('data: [DONE]\n\n');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const home = await mkdtemp(join(tmpdir(), 'step-document-tools-')),
  workspace = join(home, 'work');
await mkdir(workspace);
const source = join(home, 'synthetic-source.txt');
await writeFile(source, 'SYNTHETIC ATTACHED SOURCE. Proposal only; no approved budget or document number.');
await writeFile(
  join(home, 'desktop-policy.json'),
  JSON.stringify({
    pilot: false,
    checks: { authority: true, privacy: true },
    features: { toolLoop: false, autoRouting: false },
  }),
);
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
db.prepare('INSERT INTO records VALUES(?,?,?)').run(
  'settings',
  'main',
  JSON.stringify({
    team: 'ga',
    assistant: 'STeP Mate',
    workspace,
    theme: 'light',
    onboarding: true,
    whatsNewSeen: '999.0.0',
    tourDone: true,
    consentedAt: new Date().toISOString(),
    termsVersion: '2026-10-02',
  }),
);
db.close();
const env = {
  ...process.env,
  STEP_DESKTOP_TEST_HOME: home,
  STEP_DISABLE_UPDATES: '1',
  STEP_TEST_PRESET_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`,
};
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', dialog => {
    void dialog.accept().catch(() => {});
  });
  await app.evaluate(({ safeStorage, dialog }, file) => {
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptString = s => Buffer.from('k' + s);
    safeStorage.decryptString = b => b.toString().slice(1);
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, source);
  const connection = await page.evaluate(async () => {
    const c = await window.step.call('connection', {
      provider: 'compatible',
      mode: 'api',
      preset: 'groq',
      apiKey: 'synthetic',
      model: 'm',
    });
    await window.step.call('connect', { id: c.id });
    return c.id;
  });
  await page.reload();
  // Force a reproducible missing-face result independent of fonts installed on the CI machine.
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      const context = original.apply(this, args);
      if (args[0] === '2d' && context) context.measureText = () => ({ width: 100 });
      return context;
    };
  });
  const open = () => page.locator('aside.sidebar').getByRole('button', { name: 'เครื่องมือร่างเอกสาร', exact: true }).click();
  const snapshot = () => page.evaluate(() => window.step.call('snapshot'));
  await open();
  const form = page.locator('.document-form');
  await expect(page.locator('.document-tool-picker button')).toHaveCount(5);
  await expect(form.getByRole('button', { name: 'ให้ AI ร่างเอกสาร' })).toBeDisabled();
  const profiles = [
    ['tor', 'ร่าง TOR', 'วัตถุประสงค์', 'tor-government-writing', 'tor-16-sections-template.md'],
    ['memo', 'ร่างบันทึกข้อความ', 'เรื่อง', 'thai-official-documents', 'memo-draft.md'],
    ['letter', 'ร่างหนังสือราชการ', 'สาระ / สิ่งที่ขอประสาน', 'thai-official-documents', 'letter-draft.md'],
    ['project', 'ร่างโครงการ', 'หลักการและเหตุผล', 'project-plan', 'project-proposal-template.md'],
    ['minutes', 'ร่างรายงานการประชุม', 'บันทึก / สาระสำคัญที่ประชุม', 'meeting-summary', 'minutes-draft.md'],
  ];
  let last;
  for (const [id, title, field, skill, template] of profiles) {
    console.log('Checking form:', id);
    await open();
    await page
      .locator('.document-tool-picker')
      .getByRole('button', { name: new RegExp(`^${title}`) })
      .click();
    await form.getByLabel(field, { exact: true }).fill('Synthetic form fact');
    // The form survives switching to another tool page.
    await page.locator('aside.sidebar').getByRole('button', { name: 'ศูนย์รวม Skill' }).click();
    await open();
    await expect(form.getByLabel(field, { exact: true })).toHaveValue('Synthetic form fact');
    if (id === 'tor') await page.screenshot({ path: '/tmp/step-document-tools.png', fullPage: true });
    if (id === 'letter') {
      await form.getByLabel(field, { exact: true }).fill('');
      await expect(form.getByRole('button', { name: 'ให้ AI ร่างเอกสาร' })).toBeDisabled();
      await form.getByRole('button', { name: 'แนบต้นเรื่อง / แบบฟอร์มหน่วยงาน' }).click();
      await expect(form.getByRole('button', { name: 'ให้ AI ร่างเอกสาร' })).toBeEnabled();
    }
    if (id === 'memo') {
      await form.getByRole('button', { name: 'แนบต้นเรื่อง / แบบฟอร์มหน่วยงาน' }).click();
      await expect(form.getByText('synthetic-source.txt', { exact: true })).toBeVisible();
      await form.getByLabel('เลขหนังสือ', { exact: true }).fill('0007/๖๙');
      await form.getByLabel('วันที่', { exact: true }).fill('1 ม.ค. 70');
      await form.getByLabel('ข้อพิจารณา / เหตุผลและแหล่งเกณฑ์', { exact: true }).fill('Synthetic considerations');
      await form.getByRole('button', { name: 'ให้ AI ร่างเอกสาร' }).click();
      await expect(page.getByRole('button', { name: 'มีสิทธิ์ส่งข้อมูลนี้', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
      await open();
      await expect(form.getByText('synthetic-source.txt', { exact: true })).toBeVisible();
      await expect(form.getByLabel('เลขหนังสือ', { exact: true })).toHaveValue('0007/๖๙');
    }
    await form.getByRole('button', { name: 'ให้ AI ร่างเอกสาร' }).click();
    await expect(page.getByRole('button', { name: 'มีสิทธิ์ส่งข้อมูลนี้', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'มีสิทธิ์ส่งข้อมูลนี้', exact: true }).click();
    await expect.poll(async () => (await snapshot()).sessions.find(s => s.documentTool === id)?.status, { timeout: 30000 }).toBe('review');
    last = (await snapshot()).sessions.find(s => s.documentTool === id);
    assert.equal(last.skill, skill);
    assert.ok(last.proposals[0].sources.some(p => p.endsWith(template)));
    assert.ok(last.proposals[0].sources.includes('docs/thai-data-formatting.md'));
    if (id !== 'project') assert.ok(last.proposals[0].sources.some(p => p.endsWith('drafting-checks.md')));
    const call = requests.at(-1);
    assert.ok(call.system.includes(`Primary Skill: ${skill}`));
    assert.ok(call.system.includes('## Workflow'));
    assert.ok(call.system.includes('working template'));
    if (id === 'letter') assert.ok(call.prompt.includes('SYNTHETIC ATTACHED SOURCE'));
    else {
      assert.ok(call.prompt.includes('USER_INPUT'));
      assert.ok(call.prompt.includes('Synthetic form fact'));
    }
    if (id === 'memo') {
      assert.ok(call.prompt.includes('SYNTHETIC ATTACHED SOURCE'));
      assert.ok(call.prompt.includes('0007/๖๙'));
      await open();
      await expect(form.getByText('synthetic-source.txt', { exact: true })).toHaveCount(0);
      await page.locator('aside.sidebar .session-open').filter({ hasText: last.title }).first().click();
    }
    await page.getByRole('button', { name: 'ใช้ร่างนี้', exact: true }).click();
    await expect(page.getByLabel('ฟอนต์ DOCX', { exact: true })).toHaveValue('auto');
    const exported = await page.evaluate(id => window.step.call('export', { id, format: 'docx' }), last.id);
    assert.equal(exported.layout.documentTool, id);
    assert.equal(exported.layout.font, 'TH Sarabun PSK');
    assert.equal(exported.layout.fontStatus, 'missing');
    const JSZip = createRequire(import.meta.url)('jszip');
    const zip = await JSZip.loadAsync(await readFile(exported.path), { checkCRC32: true });
    const document = await zip.file('word/document.xml').async('string');
    assert.match(document, /w:cs="TH Sarabun PSK"/);
    assert.match(document, /<w:keepNext\/>/);
    assert.match(await zip.file('word/footer1.xml').async('string'), /PAGE/);
  }
  assert.equal(requests.length, 5);
  const editor = page.locator('.tiptap[contenteditable="true"]');
  await expect(editor).toContainText('[รอยืนยัน: งบประมาณ]');
  await editor.fill('ร่างเพื่อพิจารณา\nแก้ไขสังเคราะห์โดยเจ้าของเรื่อง\n[รอยืนยัน: งบประมาณ]');
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect
    .poll(async () => (await snapshot()).sessions.find(s => s.id === last.id)?.draft, { timeout: 10000 })
    .toContain('แก้ไขสังเคราะห์');
  const output = await page.evaluate(id => window.step.call('export', { id, format: 'docx' }), last.id);
  const bytes = await readFile(output.path);
  assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  const JSZip = createRequire(import.meta.url)('jszip');
  const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml').async('string');
  assert.ok(xml.includes('แก้ไขสังเคราะห์โดยเจ้าของเรื่อง'));
  assert.ok(xml.includes('[รอยืนยัน: งบประมาณ]'));
  assert.ok(output.path.startsWith(workspace));
  await page.getByLabel('ฟอนต์ DOCX', { exact: true }).selectOption('TH Sarabun New');
  await page.getByRole('button', { name: 'ส่งออก', exact: true }).click();
  await expect(page.locator('.document-export-info')).toContainText('TH Sarabun New');
  await expect(page.locator('.document-export-info')).toContainText('ตรวจไม่พบฟอนต์นี้');
  const invalidFont = await page.evaluate(
    async id =>
      window.step.call('export', { id, format: 'docx', font: 'Unknown Font' }).then(
        () => '',
        e => String(e),
      ),
    last.id,
  );
  assert.ok(invalidFont.includes('INVALID_EXPORT_FONT'));
  const invalid = await page.evaluate(async connectionId => {
    const s = await window.step.call('create', { connectionId });
    const cases = [
      { documentTool: '../../private' },
      { documentTool: 'tor', mode: 'chat' },
      { documentTool: 'tor', skill: 'step-writing' },
    ];
    return Promise.all(
      cases.map(extra =>
        window.step.call('send', { id: s.id, text: 'Synthetic draft', mode: 'draft', ...extra }).then(
          () => '',
          e => String(e),
        ),
      ),
    );
  }, connection);
  assert.ok(invalid.every(e => e.includes('INVALID_DOCUMENT_TOOL')));
  const boundConsent = await page.evaluate(async connectionId => {
    const s = await window.step.call('create', { connectionId });
    const data = { id: s.id, text: 'ร่างหนังสือราชการจากข้อมูลสังเคราะห์', sourceText: 'Synthetic consent source', mode: 'draft' };
    const first = await window.step.call('send', { ...data, documentTool: 'memo' });
    const changed = await window.step.call('send', { ...data, documentTool: 'letter', consent: first.consent.token });
    return { reissued: Boolean(changed.consent && changed.consent.token !== first.consent.token), started: changed.started };
  }, connection);
  assert.equal(boundConsent.reissued, true, 'consent is bound to the tool even when both tools use the same Skill');
  assert.equal(boundConsent.started, undefined);
  await page.evaluate(async () => {
    const settings = (await window.step.call('snapshot')).settings;
    await window.step.call('settings', { assistant: settings.assistant, team: settings.team, theme: settings.theme, language: 'en' });
  });
  await page.reload();
  await page.locator('aside.sidebar .session-open').filter({ hasText: last.title }).first().click();
  await expect(page.getByLabel('DOCX font', { exact: true })).toHaveValue('auto');
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      const context = original.apply(this, args);
      if (args[0] === '2d' && context) context.measureText = () => ({ width: context.font.includes('TH Sarabun PSK') ? 99 : 100 });
      return context;
    };
  });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('.document-export-info')).toContainText('This file uses TH Sarabun PSK');
  await expect(page.locator('.document-export-info')).toContainText('Uses a working layout');
  await expect(page.locator('.document-export-info')).not.toContainText('not detected');
  assert.doesNotMatch(await page.locator('.document-export-info').innerText(), /[ก-๙]/);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: five Skill-backed document forms, page state, attachment/consent cancellation, real IPC, editor and DOCX export (synthetic fake AI).',
  );
} catch (error) {
  console.error('Document tools smoke failed:', error);
  await app
    ?.firstWindow()
    .then(page => page.screenshot({ path: '/tmp/step-document-tools-failure.png' }))
    .catch(() => {});
  throw error;
} finally {
  await app?.close().catch(() => {});
  await new Promise(r => server.close(r));
}
