// Real Electron renderer with synthetic IPC; only credential recovery and reviewed-data presentation.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-workspace-reliability-'));
const seed = new DatabaseSync(join(home, 'workspace.sqlite'));
seed.exec('CREATE TABLE records (kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
seed.prepare('INSERT INTO records VALUES (?,?,?)').run(
  'settings',
  'main',
  JSON.stringify({
    team: '',
    assistant: 'STeP Mate',
    workspace: home,
    theme: 'light',
    onboarding: true,
    tourDone: true,
    whatsNewSeen: '999.0.0',
    termsVersion: '2026-10-02',
    consentedAt: new Date().toISOString(),
  }),
);
seed.close();
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1' };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const deadline = setTimeout(() => {
  console.error('Workspace recovery UI deadline exceeded');
  app?.process().kill('SIGKILL');
  process.exitCode = 1;
}, 180000);
deadline.unref();
try {
  app = await electron.launch({
    args: ['--force-prefers-reduced-motion', ...(process.platform === 'linux' ? ['--disable-gpu'] : []), '.'],
    env,
    timeout: 45000,
  });
  await expect.poll(() => app.windows().some(w => w.url().includes('renderer/index.html')), { timeout: 45000 }).toBe(true);
  const page = app.windows().find(w => w.url().includes('renderer/index.html'));
  await expect
    .poll(
      () =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some(w => w.isVisible() && w.webContents.getURL().includes('renderer/index.html')),
        ),
      { timeout: 45000 },
    )
    .toBe(true);
  await page.bringToFront();
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ ipcMain }) => {
    const original = ipcMain._invokeHandlers.get('step:call');
    globalThis.googleFixture = {
      enabled: true,
      configured: true,
      connecting: false,
      clientPreconfigured: true,
      clientSecretConfigured: true,
      vaultSuspended: true,
      services: ['calendar-read'],
      accounts: [
        { id: 'fixture', label: 'fi••••@example.test', domain: 'example.test', services: ['calendar-read'], paused: false, reauth: false },
      ],
    };
    ipcMain.removeHandler('step:call');
    ipcMain.handle('step:call', async (event, method, input) => {
      if (method === 'googleState') return globalThis.googleFixture;
      if (method === 'vaultState')
        return { enabled: true, protected: true, suspended: globalThis.googleFixture.vaultSuspended, entries: [], browsers: [] };
      if (method === 'vaultSuspend') {
        globalThis.googleFixture.vaultSuspended = input.enabled;
        return true;
      }
      if (method === 'vaultPromptRespond') {
        globalThis.vaultReply = input;
        event.sender.send('step:event', { type: 'vault-prompt-close', sessionId: '', vaultPrompt: globalThis.promptFixture });
        return true;
      }
      if (method === 'approvalRespond') {
        event.sender.send('step:event', { type: 'approval-close', approvalId: input.id });
        return true;
      }
      return original(event, method, input);
    });
  });
  console.log('Workspace UI: paused account and explicit resume');
  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'รหัสผ่านและการเชื่อมต่อ', exact: true }).click();
  const settings = page.locator('.credential-settings');
  await expect(settings.locator('.google-account .connection-state')).toHaveText('พักอยู่');
  await expect(settings.getByRole('button', { name: 'กลับมาใช้งาน', exact: true })).toHaveCount(1);
  const resume = settings.getByRole('button', { name: 'กลับมาใช้ข้อมูลบัญชี', exact: true });
  await resume.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await resume.click();
  await expect(settings.locator('.google-account .connection-state')).toHaveText('เชื่อมแล้ว');
  assert.equal(await app.evaluate(() => globalThis.googleFixture.vaultSuspended), false);
  console.log('Google UI: trusted credential prompts');
  // Trusted Vault UI explains the exact input and can be cancelled without providing a secret.
  for (const kind of ['unlock', 'login', 'code']) {
    await app.evaluate(({ BrowserWindow }, kind) => {
      globalThis.promptFixture = {
        id: 'synthetic-prompt',
        sessionId: '',
        kind,
        origin: 'https://accounts.example.test',
        provider: kind === 'unlock' ? 'bitwarden' : undefined,
      };
      BrowserWindow.getAllWindows()[0].webContents.send('step:event', {
        type: 'vault-prompt',
        sessionId: '',
        vaultPrompt: globalThis.promptFixture,
      });
    }, kind);
    const dialog = page.getByRole('alertdialog');
    if (kind === 'unlock') {
      await expect(dialog.getByText('Bitwarden', { exact: true })).toBeVisible();
      await expect(dialog.getByLabel('รหัสผ่านหลักของตัวจัดการรหัสผ่าน', { exact: true })).toBeVisible();
      await expect(dialog).toContainText('ไม่ต้องกรอกรหัสผ่าน Google ในกล่องนี้');
    } else if (kind === 'login') {
      await expect(dialog.getByLabel('รหัสผ่านของเว็บไซต์นี้', { exact: true })).toBeVisible();
      await expect(dialog).toContainText('https://accounts.example.test');
    } else {
      await expect(dialog).toContainText('แอปยืนยันตัวตน อีเมล หรือ SMS');
    }
    await dialog.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    assert.equal(await app.evaluate(() => globalThis.vaultReply.value), undefined);
  }
  console.log('Google UI: Calendar result consent preview');
  // Use the actual host preview builder with the real renderer; raw JSON is folded by default.
  const consentPath = join(home, 'google-consent.cjs');
  await build({ entryPoints: ['electron/google-consent.ts'], outfile: consentPath, bundle: true, platform: 'node', format: 'cjs' });
  const { googleResultConsent } = createRequire(import.meta.url)(consentPath);
  const reviewed = JSON.stringify({
    data: { items: [{ summary: 'Synthetic meeting', start: { dateTime: '2026-10-21T10:00:00+07:00' } }], nextSyncToken: 'synthetic-sync' },
  });
  const approval = {
    id: 'synthetic-approval',
    tool: 'google-result',
    title: 'ส่งข้อมูลจาก Google ชุดนี้ให้ AI ที่เลือก?',
    privacyClass: 'internal',
    allowRemember: false,
    ...googleResultConsent('calendar.events', reviewed, 'antigravity / gemini-test', 'fi••••@example.test'),
  };
  await app.evaluate(
    ({ BrowserWindow }, approval) => BrowserWindow.getAllWindows()[0].webContents.send('step:event', { type: 'approval', approval }),
    approval,
  );
  const consentDialog = page.getByRole('alertdialog');
  await expect(consentDialog.locator('.approval-preview')).toContainText('Synthetic meeting');
  await expect(consentDialog.locator('.approval-preview')).not.toContainText('nextSyncToken');
  await expect(consentDialog.locator('.approval-technical pre')).not.toBeVisible();
  if (process.env.STEP_UI_SCREENSHOT) await page.screenshot({ path: process.env.STEP_UI_SCREENSHOT });
  await consentDialog.locator('.approval-technical summary').click();
  await expect(consentDialog.locator('.approval-technical pre')).toContainText('synthetic-sync');
  await consentDialog.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await expect(consentDialog).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    'Workspace UI smoke passed: paused account/resume, three trusted credential prompts and readable Calendar consent with folded JSON. Synthetic IPC only.',
  );
} finally {
  clearTimeout(deadline);
  if (app) await app.close();
  await rm(home, { recursive: true, force: true });
}
