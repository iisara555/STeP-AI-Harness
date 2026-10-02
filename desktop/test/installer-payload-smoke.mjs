// A full NSIS payload install/legacy upgrade using a separate application identity.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { UUID } = require('builder-util-runtime');
const { getMakeNsisPath } = require('app-builder-lib/out/toolsets/windows');
const guid = UUID.v5('th.ac.cmu.step.installer-test.fix2', UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3'));
const key = `HKCU\\Software\\${guid}`;
const uninstallKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${guid}`;
const root = await mkdtemp(join(tmpdir(), 'step-installer-payload-'));
const destination = join(root, 'application');
const profile = join(root, 'profile');
const data = join(root, 'user-conversations.txt');
const installer = resolve('release/STeP-Installer-Test.exe');
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const nsis = await getMakeNsisPath();
const reg = args => execFileSync('reg.exe', args, { encoding: 'utf8', windowsHide: true });
const set = (key, name, value) => reg(['add', key, '/v', name, '/t', 'REG_SZ', '/d', value, '/f']);
const install = () => {
  const result = spawnSync(installer, ['/S', '/currentuser', '/D=' + destination], { timeout: 180000, windowsHide: true });
  assert.equal(result.status, 0, `Installer failed: ${result.error || result.stderr || result.status}`);
};
let app;
try {
  await writeFile(data, 'Synthetic conversation retained');
  install();
  assert.ok(reg(['query', uninstallKey, '/v', 'DisplayVersion']).includes(version));
  // The failing legacy uninstaller is never allowed to remove user files.
  const brokenSource = join(root, 'broken.nsi');
  await writeFile(
    brokenSource,
    `Unicode true\nRequestExecutionLevel user\nSilentInstall silent\nOutFile "${join(destination, 'Uninstall STeP Desktop.exe')}"\nSection\nSetErrorLevel 7\nSectionEnd`,
  );
  execFileSync(nsis.path, ['/V2', brokenSource], { env: { ...process.env, ...nsis.env }, windowsHide: true });
  set(uninstallKey, 'DisplayVersion', '0.3.2');
  set(key, 'ShortcutName', 'STeP Installer Test');
  install();
  assert.ok(reg(['query', uninstallKey, '/v', 'DisplayVersion']).includes(version));
  assert.equal(await readFile(data, 'utf8'), 'Synthetic conversation retained');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: join(destination, 'STeP Desktop.exe'),
    args: ['--user-data-dir=' + profile],
    env,
    timeout: 45000,
  });
  const page = await app.firstWindow();
  await expect(page.getByRole('button', { name: 'เริ่มตั้งค่า', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'เริ่มตั้งค่า', exact: true }).click();
  await expect(page.getByRole('button', { name: 'เชื่อมต่อ ChatGPT', exact: true })).toBeVisible();
  await app.close();
  app = null;
  // Keep the test uninstaller from resolving any product shortcut with the same display name.
  set(key, 'ShortcutName', 'STeP Installer Test');
  const removed = spawnSync(join(destination, 'Uninstall STeP Desktop.exe'), ['/S', '/currentuser', '_?=' + destination], {
    timeout: 60000,
    windowsHide: true,
  });
  assert.equal(removed.status, 0, `New uninstaller failed: ${removed.error || removed.status}`);
  assert.equal(await readFile(data, 'utf8'), 'Synthetic conversation retained');
  console.log(
    'Full NSIS payload passed: fresh install, upgrade past failing 0.3.2 uninstaller, launch current onboarding, uninstall and preserve user data. Test identity only.',
  );
} finally {
  await app?.close();
  spawnSync('reg.exe', ['delete', key, '/f'], { stdio: 'ignore', windowsHide: true });
  spawnSync('reg.exe', ['delete', uninstallKey, '/f'], { stdio: 'ignore', windowsHide: true });
  const installerBackup = join(tmpdir(), 'old-install');
  // Remove only our mkdtemp tree; never derive a deletion from registry metadata.
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
