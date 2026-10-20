// Trusted renderer controls only; storage failures and secret prompts are synthetic, with no real accounts.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const home = await mkdtemp(join(tmpdir(), 'step-credential-ui-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1' };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const deadline = setTimeout(() => {
  app?.process().kill('SIGKILL');
  process.exitCode = 1;
}, 90000);
deadline.unref();
try {
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1100, height: 850 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง', exact: true }).click();
  await app.evaluate(({ ipcMain }) => {
    const original = ipcMain._invokeHandlers.get('step:call');
    globalThis.credentialUiSaves = 0;
    globalThis.credentialUiResponses = [];
    ipcMain.removeHandler('step:call');
    ipcMain.handle('step:call', async (event, method, input) => {
      if (method === 'vaultState') return { enabled: true, suspended: false, protected: false, entries: [], sources: [], browsers: [] };
      if (method === 'vaultSave') {
        if (++globalThis.credentialUiSaves === 1) throw Error('INVALID_INPUT');
        return true;
      }
      if (method === 'vaultPromptRespond') {
        globalThis.credentialUiResponses.push(input.value);
        event.sender.send('step:event', { type: 'vault-prompt-close', sessionId: '', vaultPrompt: globalThis.credentialUiPrompt });
        return true;
      }
      return original(event, method, input);
    });
  });
  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'รหัสผ่านและการเชื่อมต่อ', exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่มที่อยู่', exact: true }).click();
  const form = page.locator('.vault-items form');
  for (const [label, value] of [
    ['ชื่อเรียกบัญชี', 'Synthetic office'],
    ['เว็บไซต์ที่ใช้ได้', 'https://example.test'],
    ['ที่อยู่บรรทัดแรก', '123 Synthetic street'],
    ['เมือง / อำเภอ', 'Test city'],
    ['รหัสไปรษณีย์', '00000'],
    ['ประเทศ', 'TH'],
  ])
    await form.getByLabel(label, { exact: true }).fill(value);
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect.poll(() => app.evaluate(() => globalThis.credentialUiSaves)).toBe(1);
  await expect(form).toBeVisible();
  await expect(form.getByLabel('ที่อยู่บรรทัดแรก', { exact: true })).toHaveValue('123 Synthetic street');
  await expect(form.getByRole('button', { name: 'ยกเลิก', exact: true })).toHaveClass(/quiet/);
  await form.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect.poll(() => app.evaluate(() => globalThis.credentialUiSaves)).toBe(2);
  await mkdir('release/qa/credential-ui', { recursive: true });
  for (const kind of ['login', 'unlock', 'code']) {
    await app.evaluate(({ BrowserWindow }, kind) => {
      const prompt = {
        id: 'synthetic-' + kind,
        sessionId: '',
        kind,
        origin: 'https://example.test',
        ...(kind === 'unlock' ? { provider: 'bitwarden' } : {}),
      };
      globalThis.credentialUiPrompt = prompt;
      BrowserWindow.getAllWindows()
        .find(w => w.webContents.getURL().startsWith('file:'))
        .webContents.send('step:event', { type: 'vault-prompt', sessionId: '', vaultPrompt: prompt });
    }, kind);
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    if (kind === 'login') {
      await dialog.getByLabel('Username / อีเมล', { exact: true }).fill('synthetic-user');
      await dialog.getByRole('checkbox').check();
    }
    const field = dialog.getByLabel(kind === 'code' ? 'รหัสยืนยัน' : 'รหัสผ่าน', { exact: true });
    await field.fill(kind === 'code' ? '123456' : 'synthetic-secret');
    assert.equal(await field.getAttribute('type'), 'password');
    const fieldBox = await field.boundingBox(),
      dialogBox = await dialog.boundingBox();
    assert.ok(fieldBox.width > dialogBox.width * 0.75, 'one-column credential entry');
    await dialog.screenshot({ path: `release/qa/credential-ui/${kind}.png` });
    await field.press('Enter');
    await expect(dialog).toHaveCount(0);
  }
  assert.equal(await app.evaluate(() => globalThis.credentialUiResponses.length), 3);
  assert.deepEqual(errors, []);
  console.log(
    'Credential UI smoke passed: failed saves retain input, retry succeeds, secondary Cancel, masked full-width login/unlock/OTP and Enter submission. Synthetic storage only.',
  );
} finally {
  clearTimeout(deadline);
  await app?.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
