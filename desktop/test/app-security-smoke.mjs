// Real preload/IPC and renderer isolation, with a temporary profile and no provider calls.
import { _electron as electron } from '@playwright/test';
import { mkdtemp, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const home = await mkdtemp(join(tmpdir(), 'step-app-security-'));
const profile = join(home, 'profile');
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: profile };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await app.firstWindow();
  const snapshot = await page.evaluate(() => window.step.call('snapshot'));
  assert.ok(snapshot.settings, 'the trusted main frame can call its own bridge');
  assert.deepEqual(await page.evaluate(() => ({ node: typeof process, require: typeof require })), {
    node: 'undefined',
    require: 'undefined',
  });
  const preferences = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);
  const injected = await page.evaluate(() => {
    globalThis.__securityScriptRan = false;
    const script = document.createElement('script');
    script.textContent = 'globalThis.__securityScriptRan=true';
    document.body.append(script);
    return globalThis.__securityScriptRan;
  });
  assert.equal(injected, false, 'CSP blocks inline script even if markup reaches the DOM');
  const spoofed = await app.evaluate(async ({ BrowserWindow }, preload) => {
    // Even if a future integration accidentally gives an external window the bridge, the host must reject it.
    const hostile = new BrowserWindow({
      show: false,
      webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    try {
      await hostile.loadURL('data:text/html,<p>synthetic external window</p>');
      return await hostile.webContents.executeJavaScript('window.step.call("snapshot").then(()=>"UNEXPECTED_ACCESS",e=>String(e))');
    } finally {
      hostile.destroy();
    }
  }, resolve('dist/preload.cjs'));
  assert.match(spoofed, /UNTRUSTED_SENDER/);
  if (process.platform === 'linux') {
    await app.evaluate(({ safeStorage }) => {
      safeStorage.isEncryptionAvailable = () => true;
      safeStorage.getSelectedStorageBackend = () => 'basic_text';
      safeStorage.encryptString = () => {
        throw new Error('UNEXPECTED_WEAK_ENCRYPTION');
      };
    });
    const failed = await page.evaluate(() =>
      window.step.call('connection', { provider: 'openai', mode: 'api', apiKey: 'synthetic-key' }).then(
        () => 'UNEXPECTED_SECRET_WRITE',
        e => String(e),
      ),
    );
    assert.match(failed, /SECURE_STORAGE_UNAVAILABLE/);
    assert.equal(
      (await page.evaluate(() => window.step.call('snapshot'))).connections.length,
      snapshot.connections.length,
      'a rejected key must not create a connection',
    );
  }
  if (process.platform !== 'win32') assert.equal((await lstat(profile)).mode & 0o777, 0o700);
  console.log('App security smoke passed: sandbox, CSP, trusted IPC sender and private local profile.');
} finally {
  if (app) await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
