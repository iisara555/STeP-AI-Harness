// Actual Electron/renderer/IPC with synthetic local SSE and disposable profiles only.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const home = await mkdtemp(join(tmpdir(), 'step-phase6-ui-')),
  workspace = join(home, 'work');
await mkdir(workspace);
await Promise.all(['a', 'b', 'c'].map(name => writeFile(join(workspace, name + '.txt'), 'Synthetic public ' + name)));
let calls = 0;
const server = createServer(async (req, res) => {
  let body = '';
  for await (const part of req) body += part;
  const value = JSON.parse(body);
  assert.equal(value.tools, undefined);
  calls++;
  const prompt = value.messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n');
  const tool = (tool, input, content) => '```step-tool\n' + JSON.stringify({ tool, input, content }) + '\n```';
  let text = 'Connection ready';
  if (prompt.includes('EVAL_SCOPED') || prompt.includes('EVAL_REVOKE')) {
    if (!prompt.includes('<tool_results>')) text = ['a', 'b', 'c'].map(name => tool('files', name + '.txt')).join('\n');
    else if (prompt.includes('EVAL_REVOKE')) {
      await new Promise(r => setTimeout(r, 3000));
      text = 'Should be cancelled';
    } else if (!prompt.includes('"tool":"changes"')) text = tool('changes', 'draft.txt', 'Synthetic preview');
    else text = 'Scoped tool flow completed';
  }
  if (res.destroyed) return;
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\ndata: [DONE]\n\n');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
await writeFile(
  join(home, 'desktop-policy.json'),
  JSON.stringify({
    features: { compatibleProviders: true },
    providers: { compatible: [{ name: 'Fixture', baseUrl, protocol: 'openai' }] },
  }),
);
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
db.prepare('INSERT INTO records VALUES(?,?,?)').run(
  'settings',
  'main',
  JSON.stringify({
    workspace,
    team: 'cc',
    assistant: 'test',
    theme: 'light',
    onboarding: true,
    tourDone: true,
    consentedAt: new Date().toISOString(),
  }),
);
db.close();
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(async baseUrl => {
    const c = await window.step.call('connection', { provider: 'compatible', mode: 'api', baseUrl, protocol: 'openai', model: 'fixture' });
    await window.step.call('connect', { id: c.id });
  }, baseUrl);
  await page.reload();
  const composer = page.getByRole('textbox', { name: 'พิมพ์คำขอ' });
  const consent = page.getByRole('alertdialog', { name: 'ส่งผลเครื่องมือให้ AI?' });
  await composer.fill('Read the notes and prepare a preview EVAL_SCOPED');
  await composer.press('Enter');
  await expect(consent).toContainText('Synthetic public');
  const scopeChoice = consent.getByRole('checkbox', { name: /อนุญาตส่งข้อมูลในขอบเขตนี้/ });
  await expect(scopeChoice).not.toBeChecked();
  await scopeChoice.check();
  await consent.getByRole('button', { name: 'อนุญาตในขอบเขตนี้จนจบรอบ', exact: true }).click();
  await expect(page.locator('.transmission-scope')).toContainText('fixture');
  await expect(consent).toContainText('draft.txt');
  // Draft progress now offers its own opt-in run scope (UX audit F04); it must start unchecked.
  await expect(consent.getByRole('checkbox')).toHaveCount(1);
  await expect(consent).toContainText('สถานะการเตรียมร่าง');
  await expect(consent.getByRole('checkbox')).not.toBeChecked();
  await mkdir('release/qa', { recursive: true });
  await page.screenshot({ path: 'release/qa/phase6-scoped-consent.png' });
  await consent.getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true }).click();
  await expect(page.getByText('Scoped tool flow completed', { exact: true })).toBeVisible();
  await expect(page.locator('.transmission-scope')).toHaveCount(0);
  await assert.rejects(readFile(join(workspace, 'draft.txt')));
  assert.equal((await page.evaluate(() => window.step.call('snapshot'))).approvals.length, 0);
  await page.getByRole('button', { name: 'เริ่มงานใหม่', exact: true }).first().click();
  await composer.fill('Read the notes EVAL_REVOKE');
  await composer.press('Enter');
  await expect(consent).toBeVisible();
  await scopeChoice.check();
  await consent.getByRole('button', { name: 'อนุญาตในขอบเขตนี้จนจบรอบ', exact: true }).click();
  await page.getByRole('button', { name: 'ถอนสิทธิ์และหยุดงาน', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.originalQuery.includes('EVAL_REVOKE'))?.status,
    )
    .toBe('cancelled');
  await expect(page.locator('.transmission-scope')).toHaveCount(0);
  assert.deepEqual((await page.evaluate(() => window.step.call('snapshot'))).transmissionGrants, []);
  assert.deepEqual(errors, []);
  await writeFile(
    'release/qa/phase6-smoke.json',
    JSON.stringify(
      {
        passed: true,
        synthetic: true,
        calls,
        scopedReadPrompts: 1,
        writeResultPrompts: 1,
        revokedDuringGeneration: true,
        writesApplied: 0,
      },
      null,
      2,
    ),
  );
  console.log('Phase 6 Electron scoped consent, expiry and revocation smoke passed');
} finally {
  await app.close();
  await new Promise(r => server.close(r));
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
