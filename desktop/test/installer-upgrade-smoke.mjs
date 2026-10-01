// Exercises the real electron-builder legacy uninstall function and our upgrade seam.
// Uses only a unique HKCU test key and a temporary installation containing dummy files.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

if (process.platform !== 'win32') throw new Error('Windows NSIS test required');
const require = createRequire(import.meta.url);
const { getMakeNsisPath, getNsisPluginsPath } = require('app-builder-lib/out/toolsets/windows');
const nsis = await getMakeNsisPath();
const plugins = await getNsisPluginsPath();
const folder = await mkdtemp(join(tmpdir(), 'step-upgrade-test-'));
const key = `Software\\STePInstallerTest-${randomUUID()}`;
const templates = resolve('node_modules/app-builder-lib/templates/nsis/include');
const path = p => p;
const compile = async (name, source) => {
  const file = join(folder, name + '.nsi');
  await writeFile(file, source);
  execFileSync(nsis.path, ['/V2', file], { env: { ...process.env, ...nsis.env }, timeout: 30000, windowsHide: true });
  return join(folder, name + '.exe');
};
try {
  const broken = await compile('broken-uninstaller', `Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "${path(join(folder, 'broken-uninstaller.exe'))}"
Section
SetErrorLevel 7
SectionEnd`);
  for (const [name, version, migration, sameFolder, expected] of [
    ['original', '0.3.2', false, true, 2],
    ['fixed', '0.3.2', true, true, 0],
    ['unknown-version', '0.4.0', true, true, 2],
    ['changed-folder', '0.3.2', true, false, 2],
  ]) {
    const install = join(folder, name);
    await mkdir(install);
    await writeFile(join(install, 'STeP Desktop.exe'), 'Old binary');
    await writeFile(join(install, 'Uninstall STeP Desktop.exe'), await readFile(broken));
    const data = join(folder, name + '-userdata.txt');
    await writeFile(data, 'Preserve conversations and account settings');
    const file = await compile(name, `Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "${path(join(folder, name + '.exe'))}"
!include LogicLib.nsh
!include "${path(join(templates, 'StdUtils.nsh'))}"
!addplugindir "${path(join(plugins, 'x86-unicode'))}"
!define INSTALL_REGISTRY_KEY "${key}"
!define UNINSTALL_REGISTRY_KEY "${key}\\Uninstall"
!define APP_EXECUTABLE_FILENAME "STeP Desktop.exe"
!define UNINSTALL_FILENAME "Uninstall STeP Desktop.exe"
!define isUpdated "0 == 1"
!define isDeleteAppData "0 == 1"
; Assert the failure code unattended instead of leaving the default final OK dialog open.
!macro customUnInstallCheck
  ${'${If}'} $R0 != 0
    SetErrorLevel 2
    Quit
  ${'${EndIf}'}
!macroend
LangString appCannotBeClosed 1033 "STeP Desktop cannot be closed. Please close it manually and click Retry to continue."
LangString uninstallFailed 1033 "Uninstall failed"
Var appExe
Var installMode
!include "${path(join(templates, 'installUtil.nsh'))}"
!include "${path(resolve('build/legacy-upgrade.nsh'))}"
Section
SetShellVarContext current
InitPluginsDir
StrCpy $INSTDIR "${path(sameFolder ? install : join(install, 'different'))}"
StrCpy $appExe "$INSTDIR\\STeP Desktop.exe"
StrCpy $installMode "CurrentUser"
WriteRegStr HKCU "${key}" InstallLocation "${path(install)}"
WriteRegStr HKCU "${key}\\Uninstall" DisplayVersion "${version}"
WriteRegStr HKCU "${key}\\Uninstall" UninstallString '"${path(join(install, 'Uninstall STeP Desktop.exe'))}" /currentuser'
${migration ? '!insertmacro stepUninstallOldVersion SHELL_CONTEXT' : '!insertmacro uninstallOldVersion SHELL_CONTEXT'}
FileOpen $1 "$EXEDIR\\${name}-result.txt" w
FileWrite $1 "$R0"
FileClose $1
DeleteRegKey HKCU "${key}"
${migration ? '' : '!insertmacro handleUninstallResult SHELL_CONTEXT'}
${expected === 0 ? 'FileOpen $1 "$INSTDIR\\STeP Desktop.exe" w\nFileWrite $1 "New binary"\nFileClose $1' : ''}
SectionEnd`);
    const result = spawnSync(file, [], { timeout: 40000, windowsHide: true });
    assert.equal(result.status, expected, `${name}: ${result.error || result.stderr || ''}`);
    assert.equal(await readFile(data, 'utf8'), 'Preserve conversations and account settings');
    if (expected === 0) {
      assert.equal(await readFile(join(install, 'STeP Desktop.exe'), 'utf8'), 'New binary');
      assert.equal(await readFile(join(folder, name + '-result.txt'), 'utf8'), '0');
    }
    console.log(`${name}: exit ${result.status}; user data retained`);
  }
  console.log('Legacy 0.3.2 upgrade regression passed: original uninstall fails, same-folder recovery succeeds, other versions/folders remain blocked.');
} finally {
  spawnSync('reg.exe', ['delete', `HKCU\\${key}`, '/f'], { stdio: 'ignore', windowsHide: true });
  await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
