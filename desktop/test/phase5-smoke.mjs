// Real Electron renderer/preload/host/HTTP path; every endpoint and profile is synthetic.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { installPack, enablePack } from '../../src/modules/packs/index.js';

const home = await mkdtemp(join(tmpdir(), 'step-phase5-ui-')),
  workspace = join(home, 'work'),
  source = join(home, 'source');
await mkdir(workspace);
await mkdir(source);
await writeFile(join(source, 'SKILL.md'), '---\nname: public-draft\ndescription: Public writing draft.\n---\nUse supplied facts only.\n');
const pack = installPack(workspace, source, { name: 'public-writing' });
let calls = 0;
const server = createServer(async (req, res) => {
  let body = '';
  for await (const b of req) body += b;
  // No model catalog here: the connection keeps the model it was given.
  if (req.method === 'GET') return res.writeHead(404).end();
  const value = JSON.parse(body);
  assert.equal(value.tools, undefined);
  calls++;
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.end(
    'data: ' +
      JSON.stringify({ choices: [{ delta: { content: 'Phase 5 synthetic public draft' } }] }) +
      '\n\n' +
      'data: ' +
      JSON.stringify({ choices: [], usage: { prompt_tokens: 40, completion_tokens: 10 } }) +
      '\n\ndata: [DONE]\n\n',
  );
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
// Strict consent: this smoke checks the source dialog.
const policy = {
  pilot: false,
  checks: { authority: true, privacy: true },
  features: { compatibleProviders: true, voice: true, skillPacks: true, toolLoop: false },
  providers: { compatible: [{ name: 'Fixture', baseUrl, protocol: 'openai' }] },
  skillPacks: { approvedDigests: [pack.digest] },
  prices: { fixture: { input: 1, output: 2 } },
};
enablePack(workspace, pack.id, policy, { approve: true });
await writeFile(join(home, 'desktop-policy.json'), JSON.stringify(policy));
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
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
let page;
try {
  page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await expect(page.getByRole('button', { name: 'เริ่มงานใหม่', exact: true }).first()).toBeVisible();
  await page.evaluate(async baseUrl => {
    const c = await window.step.call('connection', { provider: 'compatible', mode: 'api', baseUrl, protocol: 'openai', model: 'fixture' });
    await window.step.call('connect', { id: c.id });
  }, baseUrl);
  await page.reload();
  await expect(page.getByRole('button', { name: 'เริ่มงานใหม่', exact: true }).first()).toBeVisible();
  const composer = page.getByRole('textbox', { name: 'พิมพ์คำขอ' });
  await composer.fill('Prepare a public community draft');
  await expect(page.getByLabel('ตรวจความพร้อมก่อนส่ง')).toContainText('tokens');
  await expect(page.getByRole('button', { name: 'พิมพ์ด้วยเสียง' })).toBeVisible();
  assert.equal(
    await page.evaluate(() =>
      window.step.call('voiceTranscribe', { wav: new Uint8Array(50) }).then(
        () => false,
        e => e.message.includes('VOICE_APPROVAL_REQUIRED'),
      ),
    ),
    true,
  );
  // ControlOrMeta matches the app's Mod key: Ctrl on Windows and Linux, ⌘ on macOS (where ⌘Q quits the app).
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'คำสั่ง' });
  await expect(palette).toBeVisible();
  await palette.getByRole('option', { name: /คีย์ลัดและ Vim/ }).click();
  const keyboard = page.getByRole('alertdialog', { name: 'คีย์ลัดและ Vim' });
  await keyboard.getByRole('textbox', { name: 'คีย์ลัด palette', exact: true }).fill('Mod+j');
  await keyboard.getByRole('checkbox', { name: 'เปิด Vim ในช่องพิมพ์คำขอ' }).check();
  await keyboard.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(keyboard).not.toBeVisible();
  await page.keyboard.press('ControlOrMeta+j');
  await expect(palette).toBeVisible();
  await page.keyboard.press('Escape');
  await composer.fill('abc');
  await composer.press('Escape');
  await composer.press('i');
  await composer.fill('Prepare a public community draft');
  await page.keyboard.press('ControlOrMeta+j');
  await palette.getByRole('option', { name: 'Skill Packs', exact: true }).click();
  const packs = page.getByRole('alertdialog', { name: 'Skill Packs' });
  await expect(packs).toContainText('public-writing');
  await packs.getByRole('button', { name: 'ใช้ skill: public-draft', exact: true }).click();
  await expect(packs).not.toBeVisible();
  await composer.press('Enter');
  const consent = page.getByRole('alertdialog').filter({ hasText: 'ข้อมูลต้นทาง' });
  await expect(consent).toBeVisible();
  await consent.getByRole('button', { name: 'มีสิทธิ์ส่งข้อมูลนี้', exact: true }).click();
  await expect(page.getByText('Phase 5 synthetic public draft', { exact: true }).first()).toBeVisible({ timeout: 25000 });
  assert.ok(calls >= 2);
  assert.deepEqual(errors, []);
  await mkdir('release/qa', { recursive: true });
  await page.screenshot({ path: 'release/qa/phase5-smoke.png' });
  await writeFile(
    'release/qa/phase5-smoke.json',
    JSON.stringify(
      {
        passed: true,
        synthetic: true,
        compatibleHttpCalls: calls,
        readiness: true,
        customKeybindings: true,
        vimComposer: true,
        packSourceConsent: true,
        voiceApprovalDenial: true,
      },
      null,
      2,
    ),
  );
  console.log('Phase 5 Electron provider/readiness/keyboard/Vim/pack consent smoke passed');
} catch (e) {
  if (page) await page.screenshot({ path: 'release/qa/phase5-failed.png' });
  throw e;
} finally {
  await app.close();
  server.closeAllConnections();
  await new Promise(r => server.close(r));
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
