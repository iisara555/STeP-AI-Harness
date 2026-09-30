import { _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const home = await mkdtemp(join(tmpdir(), 'step-desktop-smoke-'));
await mkdir('release/qa', { recursive: true });
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const child = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await child.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor();
  const state = await page.evaluate(() => window.step.call('snapshot'));
  assert.equal(state.teams.length, 22);
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  // Exercise provider selection through the real preload bridge before any login.
  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'การเชื่อมต่อ AI' }).click();
  const providerField = page.getByRole('combobox', { name: /ผู้ให้บริการ/ });
  const methodField = page.getByRole('combobox', { name: /วิธีเชื่อมต่อ/ });
  await providerField.selectOption('gemini');
  assert.equal(await methodField.inputValue(), 'subscription');
  assert.ok((await methodField.locator('option').allTextContents()).includes('Google OAuth'));
  assert.equal(await page.getByLabel('API key', { exact: true }).count(), 0);
  await methodField.selectOption('api');
  await page.getByLabel('API key', { exact: true }).waitFor();
  await methodField.selectOption('subscription');
  await page.getByRole('button', { name: 'เพิ่มการเชื่อมต่อ', exact: true }).click();
  const withGoogle = await page.evaluate(() => window.step.call('snapshot'));
  assert.ok(withGoogle.connections.some(c => c.provider === 'gemini' && c.mode === 'subscription' && !c.ready));
  await providerField.selectOption('claude');
  assert.equal(await methodField.inputValue(), 'oauth');
  const availability = await page.evaluate(() => window.step.call('anthropicCli'));
  assert.equal(typeof availability.installed, 'boolean');
  await page.getByRole('button', { name: 'ตรวจอีกครั้ง', exact: true }).click();
  await page
    .locator('.claude-code-note')
    .getByText(/พร้อมเปิด OAuth|ยังไม่พบ Anthropic/)
    .waitFor();
  assert.deepEqual(errors, [], 'selecting Claude must not crash the renderer');
  await page.getByRole('button', { name: 'กลับไปที่งาน', exact: true }).click();
  await page.getByRole('heading', { name: 'คุย วางแผน', exact: false }).waitFor();
  await page.screenshot({ path: 'release/qa/workspace-light.png', fullPage: true });
  // Claude Pro/Max hands the request to Claude Code; stop at the confirmation so no terminal opens.
  await page.getByRole('combobox', { name: 'เลือกการเชื่อมต่อ AI' }).selectOption('claude-code');
  await page.locator('.composer textarea').fill('ทดสอบส่งต่อ');
  await page.keyboard.press('Enter');
  const handoff = page.getByRole('alertdialog', { name: /ส่งต่อไปทำใน Claude Code|ยังไม่พบ Claude Code/ });
  await handoff.waitFor();
  await handoff.getByRole('button', { name: /^(ยกเลิก|ปิด)$/ }).click();
  await page.locator('.composer textarea').fill('');
  // In-app Claude subscription is behind STEP_CLAUDE_SUBSCRIPTION=1. Off: the host refuses it.
  // On: a connection can be created and removed before installing or logging in to Claude.
  // Either way this exercises the real host validation without launching a browser.
  const claudeFlag = (await page.evaluate(() => window.step.call('snapshot'))).features?.claudeSubscription === true;
  assert.equal(claudeFlag, process.env.STEP_CLAUDE_SUBSCRIPTION === '1');
  const claudeId = await page.evaluate(async () => {
    try {
      return (await window.step.call('connection', { provider: 'claude', mode: 'subscription' })).id;
    } catch {
      return null;
    }
  });
  if (!claudeFlag) assert.equal(claudeId, null);
  else {
    const withClaude = await page.evaluate(() => window.step.call('snapshot'));
    assert.ok(withClaude.connections.some(c => c.id === claudeId && c.mode === 'subscription' && !c.ready));
    await page.evaluate(id => window.step.call('removeConnection', { id }), claudeId);
  }
  await page.evaluate(async () => {
    const connection = await window.step.call('connection', { provider: 'openai', mode: 'subscription', model: '' });
    const session = await window.step.call('create', { connectionId: connection.id, project: 'Desktop verification' });
    await window.step.call('edit', { id: session.id, text: 'ร่างทดสอบภาษาไทย\nตรวจการแก้ไขและบันทึกเวอร์ชัน', revision: 0 });
  });
  await page.reload();
  await page.getByRole('textbox', { name: 'ร่างที่แก้ไขได้' }).count();
  await page.locator('.draft-editor').waitFor();
  await page.locator('.draft-editor').fill('ร่างทดสอบภาษาไทย\nแก้ไขโดยผู้ใช้');
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await page.waitForTimeout(250);
  const edited = await page.evaluate(() => window.step.call('snapshot'));
  assert.equal(edited.sessions[0].revision, 2);
  assert.match(edited.sessions[0].draft, /แก้ไขโดยผู้ใช้/);
  await page.getByRole('button', { name: 'ประวัติเวอร์ชัน' }).click();
  await page.getByRole('button', { name: 'คืนค่าเวอร์ชัน 1', exact: false }).click();
  await page.waitForTimeout(150);
  const restored = await page.evaluate(() => window.step.call('snapshot'));
  assert.match(restored.sessions[0].draft, /ตรวจการแก้ไข/);
  await page.locator('.draft-editor').click();
  await page.getByRole('button', { name: 'หัวข้อ', exact: true }).click();
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await page.waitForTimeout(200);
  const formatted = await page.evaluate(() => window.step.call('snapshot'));
  assert.ok(formatted.sessions[0].document.content.some(node => node.type === 'heading'));
  await page.reload();
  await page.locator('.draft-editor h2').waitFor();
  const outputFolder = resolve('release/qa/exports');
  await mkdir(outputFolder, { recursive: true });
  await child.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, outputFolder);
  await page.evaluate(() => window.step.call('workspace'));
  const exported = [];
  for (const format of ['md', 'docx', 'pdf', 'xlsx', 'pptx']) {
    const result = await page.evaluate(({ id, format }) => window.step.call('export', { id, format }), {
      id: restored.sessions[0].id,
      format,
    });
    const bytes = await readFile(result.path);
    assert.ok(bytes.length > 50);
    if (format === 'pdf') assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    exported.push({ format, path: result.path, bytes: bytes.length });
  }
  await writeFile('release/qa/exports.json', JSON.stringify(exported, null, 2));
  await page.evaluate(async () => {
    const s = await window.step.call('snapshot');
    await window.step.call('settings', { ...s.settings, theme: 'dark' });
  });
  await page.reload();
  await page.locator('.draft-editor').waitFor();
  await page.screenshot({ path: 'release/qa/workspace-dark.png', fullPage: true });
  await page.setViewportSize({ width: 850, height: 720 });
  await page.screenshot({ path: 'release/qa/workspace-narrow.png', fullPage: true });
  // Connections: an unrelated program is refused as a runtime; removing a connection deletes its
  // sign-in folder and leaves its work ready to move to another AI.
  const picked = await page.evaluate(async () => {
    const a = await window.step.call('connection', { provider: 'openai', mode: 'subscription' });
    const b = await window.step.call('connection', { provider: 'gemini', mode: 'subscription' });
    const task = await window.step.call('create', { connectionId: b.id });
    return { a: a.id, b: b.id, task: task.id };
  });
  await child.evaluate(({ dialog }, exe) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [exe] });
  }, process.execPath);
  await assert.rejects(
    page.evaluate(id => window.step.call('runtime', { id }), picked.b),
    /RUNTIME_INVALID/,
  );
  const signInFolder = join(home, 'runtimes', picked.b);
  await mkdir(join(signInFolder, '.gemini'), { recursive: true });
  await writeFile(join(signInFolder, '.gemini', 'oauth_creds.json'), '{}');
  await page.evaluate(id => window.step.call('removeConnection', { id }), picked.b);
  const afterRemove = await page.evaluate(() => window.step.call('snapshot'));
  assert.ok(!afterRemove.connections.some(c => c.id === picked.b), 'removed connection is gone');
  assert.equal(afterRemove.sessions.find(x => x.id === picked.task).connectionId, '');
  assert.equal(existsSync(signInFolder), false, 'sign-in folder is deleted');
  const moved = await page.evaluate(p => window.step.call('sessionConnection', { id: p.task, connectionId: p.a }), picked);
  assert.equal(moved.connectionId, picked.a);
  assert.deepEqual(errors, []);
  await writeFile(
    'release/qa/electron-smoke.json',
    JSON.stringify(
      {
        platform: process.platform,
        passed: true,
        assertions: [
          '22 teams',
          'onboarding',
          'Google OAuth and API selection',
          'Claude OAuth availability through preload',
          'create session',
          'edit',
          'save',
          'restore',
          'theme',
          'narrow layout',
          'runtime check',
          'remove connection',
          'switch task AI',
        ],
        liveProviderTest: false,
        home,
      },
      null,
      2,
    ),
  );
  console.log('Electron smoke passed: real IPC, SQLite, editor, restore, themes, five export formats. No live provider calls.');
} finally {
  await child.close();
}
