// Real renderer/preload/host/RPC path with a local synthetic provider and no staff data.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const fixtures = JSON.parse(await readFile(new URL('./fixtures/document-drafts.json', import.meta.url), 'utf8'));
const calls = [];
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (req.method === 'GET') return res.writeHead(404).end();
  const parsed = JSON.parse(body);
  const system = (parsed.messages || [])
    .filter(message => message.role === 'system')
    .map(message => message.content)
    .join('\n');
  const prompt = parsed.messages?.at(-1)?.content || '';
  const type = /Selected document: (.*?). Primary Skill:/.exec(system)?.[1];
  calls.push({ system, prompt, type });
  const id = { 'ร่าง TOR': 'tor', ร่างบันทึกข้อความ: 'memo' }[type];
  const answer = id
    ? `<document_draft>\n${fixtures.documents[id]}\n</document_draft><document_review>\n${fixtures.review}\n</document_review>`
    : 'SYNTHETIC-DISCUSSION-ANSWER';
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: answer } }] }) + '\n\n');
  res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\n');
  res.end('data: [DONE]\n\n');
});
await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
const home = await mkdtemp(join(tmpdir(), 'step-chat-document-'));
const workspace = join(home, 'work');
await mkdir(workspace);
await writeFile(
  join(home, 'desktop-policy.json'),
  JSON.stringify({ pilot: false, checks: { authority: true, privacy: true }, features: { toolLoop: true, autoRouting: false } }),
);
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
db.prepare('INSERT INTO records VALUES(?,?,?)').run(
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
  await app.evaluate(({ safeStorage }) => {
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptString = value => Buffer.from('k' + value);
    safeStorage.decryptString = value => value.toString().slice(1);
  });
  const connection = await page.evaluate(async () => {
    const connection = await window.step.call('connection', {
      provider: 'compatible',
      mode: 'api',
      preset: 'groq',
      apiKey: 'synthetic',
      model: 'm',
    });
    await window.step.call('connect', { id: connection.id });
    return connection.id;
  });
  await page.reload();
  const composer = page.locator('.composer textarea');
  await composer.fill('SYNTHETIC-DECISION: ต้องการอุปกรณ์สำหรับการทดลอง');
  await composer.press('Enter');
  await expect(page.getByText('SYNTHETIC-DISCUSSION-ANSWER', { exact: true })).toBeVisible({ timeout: 30000 });
  const snapshot = () => page.evaluate(() => window.step.call('snapshot'));
  const first = (await snapshot()).sessions[0];
  assert.equal(first.mode, 'chat');
  assert.equal(first.proposals.length, 0);
  await composer.fill('ช่วยร่าง TOR จากที่คุยกัน');
  await composer.press('Enter');
  await expect
    .poll(async () => (await snapshot()).sessions.find(session => session.id === first.id)?.proposals.length, { timeout: 30000 })
    .toBe(1);
  const drafted = (await snapshot()).sessions.find(session => session.id === first.id);
  assert.equal(drafted.documentTool, 'tor');
  assert.equal(drafted.mode, 'draft');
  assert.ok(drafted.proposals[0].sources.some(path => path.endsWith('tor-16-sections-template.md')));
  const torCall = calls.find(call => call.type === 'ร่าง TOR');
  assert.ok(torCall.system.includes('every numbered main heading 1–16'));
  assert.ok(torCall.prompt.includes('SYNTHETIC-DECISION'));
  assert.ok(torCall.prompt.includes('SYNTHETIC-DISCUSSION-ANSWER'));
  await expect(page.getByLabel('โหมดทำงาน', { exact: true })).toHaveValue('draft');
  await page.getByRole('button', { name: 'ใช้ร่างนี้', exact: true }).click();
  const exported = await page.evaluate(id => window.step.call('export', { id, format: 'docx' }), first.id);
  assert.equal(exported.layout.documentTool, 'tor');
  const zip = await createRequire(import.meta.url)('jszip').loadAsync(await readFile(exported.path));
  const document = (await zip.file('word/document.xml').async('string')).replaceAll('\u200b', '');
  assert.ok(document.includes('หลักการและเหตุผล'));
  assert.ok(!document.includes('Skill Verification'));
  const torPdf = await page.evaluate(id => window.step.call('export', { id, format: 'pdf' }), first.id);
  assert.equal(torPdf.layout.documentTool, 'tor');
  assert.equal((await readFile(torPdf.path)).subarray(0, 5).toString(), '%PDF-');

  // A different document stays in the same task (a conversation never splits); the TOR goes to version history and the
  // referenced draft is privacy-reviewed.
  const original = (await snapshot()).sessions.find(session => session.id === first.id);
  const tasksBefore = (await snapshot()).sessions.length;
  await composer.fill('ช่วยร่างบันทึกข้อความจาก TOR ฉบับนี้');
  await composer.press('Enter');
  const consent = page.getByRole('button', { name: 'มีสิทธิ์ส่งข้อมูลนี้', exact: true });
  await expect(consent).toBeVisible({ timeout: 30000 });
  await consent.click();
  await expect
    .poll(
      async () => {
        const current = (await snapshot()).sessions.find(session => session.id === first.id);
        return current?.documentTool === 'memo' ? current.proposals.length : 0;
      },
      { timeout: 30000 },
    )
    .toBe(1);
  const after = await snapshot();
  assert.equal(after.sessions.length, tasksBefore);
  assert.ok(!after.sessions.some(session => session.parentId === first.id));
  const same = after.sessions.find(session => session.id === first.id);
  assert.equal(same.mode, 'draft');
  assert.equal(same.draft, '');
  assert.ok(same.messages.some(message => message.text.includes('SYNTHETIC-DECISION')));
  const shelved = same.versions.find(version => version.text === original.draft);
  assert.equal(shelved?.documentTool, 'tor');
  assert.equal(shelved?.task?.skill, original.skill);
  const memoCall = calls.find(call => call.type === 'ร่างบันทึกข้อความ');
  assert.ok(memoCall.prompt.includes('SYNTHETIC-DECISION'));
  assert.ok(memoCall.prompt.includes('Prior document for this request'));
  assert.ok(memoCall.prompt.includes('หลักการและเหตุผล'));
  await page.getByRole('button', { name: 'ใช้ร่างนี้', exact: true }).click();
  await expect
    .poll(async () => (await snapshot()).sessions.find(session => session.id === first.id)?.draft.length, { timeout: 30000 })
    .toBeGreaterThan(0);
  const memo = await page.evaluate(id => window.step.call('export', { id, format: 'docx' }), first.id);
  assert.equal(memo.layout.documentTool, 'memo');
  const memoPdf = await page.evaluate(id => window.step.call('export', { id, format: 'pdf' }), first.id);
  assert.equal(memoPdf.layout.documentTool, 'memo');
  assert.equal((await readFile(memoPdf.path)).subarray(0, 5).toString(), '%PDF-');
  // Restoring the TOR brings back its own type and layout, and keeps the memo in the history.
  const memoDraft = (await snapshot()).sessions.find(session => session.id === first.id).draft;
  const restored = await page.evaluate(({ id, revision }) => window.step.call('restore', { id, revision }), {
    id: first.id,
    revision: shelved.revision,
  });
  assert.equal(restored.documentTool, 'tor');
  assert.equal(restored.draft, original.draft);
  assert.equal(restored.skill, original.skill);
  assert.ok(restored.versions.some(version => version.text === memoDraft && version.documentTool === 'memo'));
  const torAgain = await page.evaluate(id => window.step.call('export', { id, format: 'docx' }), first.id);
  assert.equal(torAgain.layout.documentTool, 'tor');

  // An unsent credential in the earlier draft must be blocked before the draft is set aside or the provider is contacted.
  const protectedSession = await page.evaluate(connectionId => window.step.call('create', { connectionId }), connection);
  await page.evaluate(
    ({ id, revision }) => window.step.call('edit', { id, revision, text: 'password=synthetic-test-secret' }),
    protectedSession,
  );
  const beforeBlocked = calls.length;
  const blocked = await page.evaluate(
    id =>
      window.step.call('send', { id, text: 'ช่วยร่าง TOR จากเอกสารเดิม', mode: 'chat' }).then(
        () => '',
        error => String(error),
      ),
    protectedSession.id,
  );
  assert.match(blocked, /PRIVACY_REVIEW_REQUIRED/);
  assert.equal(calls.length, beforeBlocked);
  assert.equal((await snapshot()).sessions.find(session => session.id === protectedSession.id).draft, 'password=synthetic-test-secret');

  // A consent for the old draft cannot authorize a different draft after the user edits it.
  const changedSource = await page.evaluate(connectionId => window.step.call('create', { connectionId }), connection);
  await page.evaluate(({ id, revision }) => window.step.call('edit', { id, revision, text: 'SYNTHETIC-OLD-DRAFT' }), changedSource);
  const firstConsent = await page.evaluate(
    id => window.step.call('send', { id, text: 'ช่วยร่าง TOR จากเอกสารเดิม', mode: 'chat' }),
    changedSource.id,
  );
  assert.ok(firstConsent.consent?.token);
  const changed = (await snapshot()).sessions.find(session => session.id === changedSource.id);
  await page.evaluate(({ id, revision }) => window.step.call('edit', { id, revision, text: 'SYNTHETIC-CHANGED-DRAFT' }), changed);
  const secondConsent = await page.evaluate(
    ({ id, token }) => window.step.call('send', { id, text: 'ช่วยร่าง TOR จากเอกสารเดิม', mode: 'chat', consent: token }),
    { id: changedSource.id, token: firstConsent.consent.token },
  );
  assert.ok(secondConsent.consent?.token && secondConsent.consent.token !== firstConsent.consent.token);
  assert.equal((await snapshot()).sessions.find(session => session.id === changedSource.id).draft, 'SYNTHETIC-CHANGED-DRAFT');
  const intervening = await page.evaluate(
    id => window.step.call('send', { id, text: 'SYNTHETIC-ADDITIONAL-CONTEXT', mode: 'chat' }),
    changedSource.id,
  );
  assert.equal(intervening.started, true);
  await expect
    .poll(async () => (await snapshot()).sessions.find(session => session.id === changedSource.id)?.status, { timeout: 30000 })
    .toBe('review');
  const thirdConsent = await page.evaluate(
    ({ id, token }) => window.step.call('send', { id, text: 'ช่วยร่าง TOR จากเอกสารเดิม', mode: 'chat', consent: token }),
    { id: changedSource.id, token: secondConsent.consent.token },
  );
  assert.ok(thirdConsent.consent?.token && thirdConsent.consent.token !== secondConsent.consent.token);

  // A request to explain the TOR remains a chat turn, even when no document is open.
  const other = await page.evaluate(connectionId => window.step.call('create', { connectionId }), connection);
  const result = await page.evaluate(id => window.step.call('send', { id, text: 'ช่วยอธิบายวิธีร่าง TOR', mode: 'chat' }), other.id);
  assert.equal(result.mode, 'chat');
  await expect
    .poll(async () => (await snapshot()).sessions.find(session => session.id === other.id)?.status, { timeout: 30000 })
    .toBe('review');
  assert.equal((await snapshot()).sessions.find(session => session.id === other.id).documentTool, undefined);

  const assistant = await page.evaluate(connectionId => window.step.call('create', { connectionId }), connection);
  const assistantResult = await page.evaluate(
    id => window.step.call('send', { id, text: 'ช่วยร่าง TOR จากข้อมูลสังเคราะห์', mode: 'chat', workflow: 'assistant' }),
    assistant.id,
  );
  assert.equal(assistantResult.mode, 'draft');
  await expect
    .poll(async () => (await snapshot()).sessions.find(session => session.id === assistant.id)?.status, { timeout: 30000 })
    .toBe('review');
  assert.equal((await snapshot()).sessions.find(session => session.id === assistant.id).documentTool, 'tor');

  // Plan mode remains read-only and must not become a drafting task automatically.
  await page.evaluate(() => window.step.call('permissionMode', { mode: 'plan' }));
  const plan = await page.evaluate(connectionId => window.step.call('create', { connectionId }), connection);
  const planResult = await page.evaluate(id => window.step.call('send', { id, text: 'ช่วยร่าง TOR', mode: 'chat' }), plan.id);
  assert.equal(planResult.mode, 'chat');
  await expect
    .poll(async () => (await snapshot()).sessions.find(session => session.id === plan.id)?.status, { timeout: 30000 })
    .toBe('review');
  assert.equal((await snapshot()).sessions.find(session => session.id === plan.id).documentTool, undefined);
  console.log('PASS: chat drafts TOR then a memo in the same task with their own layouts; the TOR stays restorable.');
} finally {
  await app?.close().catch(() => {});
  await new Promise(resolveServer => server.close(resolveServer));
  const insideTemp = relative(resolve(tmpdir()), resolve(home));
  if (!insideTemp || insideTemp.startsWith('..') || resolve(home) === resolve(tmpdir())) throw new Error('Unexpected test cleanup path');
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
