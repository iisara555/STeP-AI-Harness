// Development notifications must not register Electron's shortcut under the installed app's Windows identity.
import { _electron as electron } from '@playwright/test';
import { mainWindow } from './main-window.mjs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import assert from 'node:assert/strict';

if (process.platform !== 'win32') {
  console.log('app identity smoke skipped: Windows taskbar identity only');
  process.exit(0);
}
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const home = await mkdtemp(join(tmpdir(), 'step-app-identity-'));
assert.ok(home.startsWith(resolve(tmpdir()) + sep + 'step-app-identity-'));
const entry = join(home, 'entry.cjs');
await writeFile(
  entry,
  `const { app, BrowserWindow } = require('electron');
globalThis.stepIdentityEvents = [];
const setIdentity = app.setAppUserModelId.bind(app);
app.setAppUserModelId = id => {
  globalThis.stepIdentityEvents.push({ kind: 'identity', id, windows: BrowserWindow.getAllWindows().length });
  setIdentity(id);
};
app.on('browser-window-created', () => globalThis.stepIdentityEvents.push({ kind: 'window' }));
require(${JSON.stringify(resolve('dist/main.cjs'))});
`,
);
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: [entry], env, timeout: 45000 });
  const page = await mainWindow(app);
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor();
  const events = await app.evaluate(() => globalThis.stepIdentityEvents);
  assert.deepEqual(
    events.filter(event => event.kind === 'identity'),
    [{ kind: 'identity', id: `${pkg.build.appId}.development`, windows: 0 }],
  );
  assert.equal(events[0].kind, 'identity', 'Windows identity must be set before any window opens');
  console.log('app identity smoke passed: development uses a separate taskbar/notification identity before the first window');
} finally {
  await app?.close();
  await rm(home, { recursive: true, force: true });
}
