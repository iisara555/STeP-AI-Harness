import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import JSZip from 'jszip';
import { open } from 'node:fs/promises';
import { createTemplate, templateDrafts } from './fixtures/document-template-files.mjs';

const calls = [];
let holdHooks = false,
  holdProvider = false;
const pendingHooks = [],
  pendingProviders = [];
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (req.method === 'GET') return res.writeHead(404).end();
  if (req.url === '/hook') {
    if (holdHooks) pendingHooks.push({ payload: JSON.parse(body), res });
    else res.writeHead(200, { 'content-type': 'application/json' }).end('{"decision":"allow"}');
    return;
  }
  const messages = JSON.parse(body).messages || [],
    system = messages
      .filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n');
  const selected = system.match(/Selected document: (.*?). Primary Skill:/)?.[1];
  const id = { ร่างบันทึกข้อความ: 'memo', ร่างหนังสือราชการ: 'letter', ร่างโครงการ: 'project', ร่างรายงานการประชุม: 'minutes' }[selected];
  if (id) calls.push({ system, prompt: messages.at(-1).content });
  const text = id
    ? `<document_draft>\n${templateDrafts[id]}\n</document_draft>\n<document_review>ตรวจข้อมูลสังเคราะห์ รอผู้มีอำนาจตรวจไฟล์จริง</document_review>`
    : 'Synthetic connection check';
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const answer = 'data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\ndata: [DONE]\n\n';
  if (holdProvider) pendingProviders.push(() => res.end(answer));
  else res.end(answer);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const home = await mkdtemp(join(tmpdir(), 'step-native-template-')),
  workspace = join(home, 'work');
await mkdir(workspace);
await writeFile(
  join(home, 'desktop-policy.json'),
  JSON.stringify({
    checks: { authority: true, privacy: true },
    features: { toolLoop: false, autoRouting: false },
    hooks: ['user_prompt_submit', 'session_end'].map(event => ({
      event,
      type: 'http',
      url: `http://127.0.0.1:${server.address().port}/hook`,
      timeoutSeconds: 30,
      blockOnFailure: true,
    })),
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
  await app.evaluate(({ safeStorage }) => {
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptString = s => Buffer.from('k' + s);
    safeStorage.decryptString = b => b.toString().slice(1);
  });
  await page.evaluate(async () => {
    const c = await window.step.call('connection', {
      provider: 'compatible',
      mode: 'api',
      preset: 'groq',
      apiKey: 'synthetic',
      model: 'm',
    });
    await window.step.call('connect', { id: c.id });
  });
  await page.reload();
  const snapshot = () => page.evaluate(() => window.step.call('snapshot'));
  // General source intake must retain its own limits and privacy reason, even above the native-template ceiling.
  const largeSource = join(home, 'oversize-source.docx');
  const sourceFile = await open(largeSource, 'w');
  await sourceFile.truncate(8_000_001);
  await sourceFile.close();
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, largeSource);
  const ordinary = await page.evaluate(async () => {
    const connection = (await window.step.call('snapshot')).connections[0];
    const session = await window.step.call('create', { connectionId: connection.id });
    return window.step.call('attach', { id: session.id });
  });
  assert.equal(ordinary.usable, false);
  assert.ok(ordinary.reason && !ordinary.templateReady);
  for (const [id, label] of [
    ['memo', 'ร่างบันทึกข้อความ'],
    ['letter', 'ร่างหนังสือราชการ'],
    ['project', 'ร่างโครงการ'],
    ['minutes', 'ร่างรายงานการประชุม'],
  ]) {
    const file = join(home, `synthetic-${id}.docx`);
    await writeFile(file, await createTemplate(id));
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
    await page.locator('aside.sidebar').getByRole('button', { name: 'เครื่องมือร่างเอกสาร', exact: true }).click();
    await page.getByRole('button', { name: new RegExp('^' + label) }).click();
    const form = page.locator('.document-form');
    await form.getByRole('button', { name: 'แนบต้นเรื่อง / แบบฟอร์มหน่วยงาน' }).click();
    await expect(form.getByLabel('ใช้ไฟล์แนบเป็น', { exact: true })).toHaveValue('template');
    // The selected bytes belong to this task; a later change to the source path cannot alter its export.
    await writeFile(file, 'source path replaced after native selection');
    await form.getByRole('button', { name: 'ให้ AI ร่างเอกสาร' }).click();
    await page.getByRole('button', { name: 'มีสิทธิ์ส่งข้อมูลนี้', exact: true }).click();
    await expect.poll(async () => (await snapshot()).sessions.find(s => s.documentTool === id)?.status, { timeout: 30000 }).toBe('review');
    const session = (await snapshot()).sessions.find(s => s.documentTool === id);
    assert.ok(session.documentTemplate);
    await page.getByRole('button', { name: 'ใช้ร่างนี้', exact: true }).click();
    assert.ok(calls.at(-1).system.includes('private native DOCX template'));
    assert.ok(calls.at(-1).prompt.includes('Filled examples have been withheld'));
    assert.ok(!calls.at(-1).prompt.includes('TEMPLATE EXAMPLE MUST NOT LEAK') && !calls.at(-1).prompt.includes('TEMPLATE-0007'));
    await expect(page.getByLabel('ตราครุฑ', { exact: true })).toHaveCount(0);
    const output = await page.evaluate(id => window.step.call('export', { id, format: 'docx' }), session.id);
    assert.equal(output.layout.templateName, `synthetic-${id}.docx`);
    const zip = await JSZip.loadAsync(await readFile(output.path)),
      xml = await zip.file('word/document.xml').async('string');
    assert.ok(
      xml.includes('เนื้อหาสังเคราะห์สำหรับงานใหม่') && !xml.includes('TEMPLATE EXAMPLE MUST NOT LEAK') && !xml.includes('TEMPLATE-0007'),
    );
    assert.ok(xml.includes('w:left="1701"'));
    assert.match(await zip.file('word/footer1.xml').async('string'), /SYNTHETIC FORM V.90/);
    assert.equal(zip.file('docProps/core.xml'), null);
    const pdfError = await page.evaluate(async id => {
      try {
        await window.step.call('export', { id, format: 'pdf' });
        return null;
      } catch (e) {
        return e.message;
      }
    }, session.id);
    assert.match(pdfError, /DOCUMENT_TEMPLATE_DOCX_ONLY/);
    // A save and reload must export the latest editor content against the same private snapshot.
    const edited = await page.evaluate(async id => {
      const s = (await window.step.call('snapshot')).sessions.find(s => s.id === id);
      const node = structuredClone(s.document);
      const visit = n => {
        if (n.text) n.text = n.text.replace('เนื้อหาสังเคราะห์สำหรับงานใหม่', 'ข้อความที่เจ้าของแก้ไขแล้ว');
        (n.content || []).forEach(visit);
      };
      visit(node);
      return window.step.call('edit', { id, text: '', revision: s.revision, document: node });
    }, session.id);
    await page.reload();
    const updated = await page.evaluate(id => window.step.call('export', { id, format: 'docx' }), edited.id);
    const latest = await (await JSZip.loadAsync(await readFile(updated.path))).file('word/document.xml').async('string');
    assert.ok(latest.includes('ข้อความที่เจ้าของแก้ไขแล้ว'));
  }
  assert.equal(calls.length, 4);
  // Recheck ownership after awaited hooks before changing the session or its private template.
  const racing = (await snapshot()).sessions.find(s => s.documentTool === 'minutes');
  holdHooks = true;
  holdProvider = true;
  await page.evaluate(id => {
    const send = text =>
      window.step.call('send', { id, text, mode: 'draft' }).then(
        v => ({ value: v }),
        e => ({ error: e.message }),
      );
    globalThis.firstTemplateSend = send('ปรับถ้อยคำให้อ่านง่าย');
    globalThis.secondTemplateSend = send('ปรับถ้อยคำให้อ่านง่ายขึ้น');
    globalThis.pendingTemplateRemove = window.step.call('remove', { id }).then(
      v => ({ value: v }),
      e => ({ error: e.message }),
    );
  }, racing.id);
  await expect.poll(() => pendingHooks.length).toBe(3);
  const sends = pendingHooks.filter(h => h.payload.event === 'user_prompt_submit');
  const firstSend = sends.find(h => h.payload.promptChars === 'ปรับถ้อยคำให้อ่านง่าย'.length);
  const secondSend = sends.find(h => h.payload.promptChars === 'ปรับถ้อยคำให้อ่านง่ายขึ้น'.length);
  const removal = pendingHooks.find(h => h.payload.event === 'session_end');
  assert.equal(sends.length, 2);
  firstSend.res.writeHead(200, { 'content-type': 'application/json' }).end('{"decision":"allow"}');
  await expect.poll(() => pendingProviders.length).toBe(1);
  secondSend.res.writeHead(200, { 'content-type': 'application/json' }).end('{"decision":"allow"}');
  const duplicate = await page.evaluate(() => globalThis.secondTemplateSend);
  assert.match(duplicate.error || '', /RUN_ALREADY_ACTIVE/);
  removal.res.writeHead(200, { 'content-type': 'application/json' }).end('{"decision":"allow"}');
  const removed = await page.evaluate(() => globalThis.pendingTemplateRemove);
  assert.match(removed.error || '', /RUN_ALREADY_ACTIVE/);
  assert.equal((await snapshot()).sessions.find(s => s.id === racing.id).status, 'running');
  assert.ok((await snapshot()).sessions.find(s => s.id === racing.id).documentTemplate);
  pendingProviders.shift()();
  await expect.poll(async () => (await snapshot()).sessions.find(s => s.id === racing.id)?.status).toBe('review');
  assert.equal((await page.evaluate(() => globalThis.firstTemplateSend)).value.started, true);
  holdHooks = false;
  holdProvider = false;
  console.log(JSON.stringify({ ok: true, nativeProfiles: 4, sampleFactsWithheld: true, latestEdits: true, privateSnapshots: true }));
} finally {
  if (app) await app.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
