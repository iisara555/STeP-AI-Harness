import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile, rm, mkdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PACKAGE_ROOT } from '../src/modules/role-resolver.js';
import { pathExists } from '../src/utils/file-ops.js';
import {
  loadUserConfig,
  saveUserConfig,
  getUserTeam,
  getUserTools,
  USER_CONFIG_PATH,
} from '../src/utils/user-config.js';
import { detectInstalledTools } from '../src/utils/tool-detector.js';
import { getPlatformDisplay, getMacCpuArch } from '../src/platform/index.js';

const execFileAsync = promisify(execFile);
const STEP_AI_BIN = join(PACKAGE_ROOT, 'bin', 'step-ai.js');

test('STeP AI Pilot v0.2 Installer & User Configuration Suite', async (t) => {
  const backupConfigPath = USER_CONFIG_PATH + '.bak';

  t.before(async () => {
    // Backup existing user config if exists
    if (await pathExists(USER_CONFIG_PATH)) {
      const orig = await readFile(USER_CONFIG_PATH, 'utf-8');
      await (await import('node:fs/promises')).writeFile(backupConfigPath, orig, 'utf-8');
    }
  });

  t.after(async () => {
    // Restore original user config
    if (await pathExists(backupConfigPath)) {
      const orig = await readFile(backupConfigPath, 'utf-8');
      await (await import('node:fs/promises')).writeFile(USER_CONFIG_PATH, orig, 'utf-8');
      await rm(backupConfigPath, { force: true });
    }
  });

  await t.test('Case 1: User Config persistence save and load', async () => {
    await saveUserConfig({ team: 'qs', tool: 'codex' });
    const cfg = await loadUserConfig();
    assert.equal(cfg.team, 'qs');
    assert.equal(cfg.tool, 'codex');

    const team = await getUserTeam();
    assert.equal(team, 'qs');

    const tools = await getUserTools();
    assert.ok(tools.includes('codex'));
  });

  await t.test('Case 2: Tool Detector detects system tools structure', async () => {
    const detected = await detectInstalledTools();
    assert.ok(Array.isArray(detected));
    assert.ok(detected.length >= 3);

    const ids = detected.map((t) => t.id);
    assert.ok(ids.includes('codex'));
    assert.ok(ids.includes('cursor'));
    assert.ok(ids.includes('claude'));

    for (const tool of detected) {
      assert.equal(typeof tool.name, 'string');
      assert.equal(typeof tool.installed, 'boolean');
    }
  });

  await t.test('Case 3: CLI step-ai config modifies and persists settings', async () => {
    const { stdout } = await execFileAsync(process.execPath, [STEP_AI_BIN, 'config', '--team', 'afp']);
    assert.ok(stdout.includes('AFP'));

    const team = await getUserTeam();
    assert.equal(team, 'afp');
  });

  await t.test('Case 4: CLI step-ai doctor in employee mode displays clean checklist with Platform', async () => {
    const { stdout } = await execFileAsync(process.execPath, [STEP_AI_BIN, 'doctor', '--employee']);
    assert.ok(stdout.includes('STeP AI System Check'));
    assert.ok(stdout.includes('Installation:'));
    assert.ok(stdout.includes('Platform:'));
    assert.ok(stdout.includes('Router:'));
    assert.ok(stdout.includes('พร้อมใช้งาน'));
    assert.ok(!stdout.includes('stack trace'));
    assert.ok(!stdout.includes('npmrc'));
  });

  await t.test('Case 5: Verification of Windows Explorer batch and powershell files', async () => {
    const batInstall = join(PACKAGE_ROOT, 'Install-STeP-AI.bat');
    const psInstall = join(PACKAGE_ROOT, 'install', 'install-windows.ps1');
    const batUpdate = join(PACKAGE_ROOT, 'Update-STeP-AI.bat');
    const psUpdate = join(PACKAGE_ROOT, 'install', 'update-windows.ps1');

    assert.ok(await pathExists(batInstall), 'Install-STeP-AI.bat must exist at repo root');
    assert.ok(await pathExists(psInstall), 'install/install-windows.ps1 must exist');
    assert.ok(await pathExists(batUpdate), 'Update-STeP-AI.bat must exist at repo root');
    assert.ok(await pathExists(psUpdate), 'install/update-windows.ps1 must exist');

    const batInstallContent = await readFile(batInstall, 'utf-8');
    assert.ok(batInstallContent.includes('install-windows.ps1'));
    assert.ok(batInstallContent.includes('chcp 65001'));

    const psInstallContent = await readFile(psInstall, 'utf-8');
    assert.ok(psInstallContent.includes('STeP AI Setup'));
    // Verify all 22 teams are displayed in installer
    assert.ok(psInstallContent.includes('QS'));
    assert.ok(psInstallContent.includes('AFP'));
    assert.ok(psInstallContent.includes('CC'));
    assert.ok(psInstallContent.includes('MI'));
    assert.ok(psInstallContent.includes('PITI'));
    assert.ok(psInstallContent.includes('GA'));
    assert.ok(psInstallContent.includes('FOODFABR'));
    assert.ok(psInstallContent.includes('TECH-SPIN'));
    assert.ok(psInstallContent.includes('22 ทีม'));

    const batUpdateContent = await readFile(batUpdate, 'utf-8');
    assert.ok(batUpdateContent.includes('update-windows.ps1'));
  });

  await t.test('Case 6: Workspace init and step-ai update preserves settings', async () => {
    const tmpDir = join(PACKAGE_ROOT, 'tmp', 'test-installer-workspace');
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    try {
      // 1. Init workspace with team 'qs' and tool 'codex'
      await execFileAsync(process.execPath, [
        STEP_AI_BIN,
        'init',
        '--team',
        'qs',
        '--tool',
        'codex',
        '--dest',
        tmpDir,
      ]);

      assert.ok(await pathExists(join(tmpDir, '.step-ai', 'manifest.json')));
      assert.ok(await pathExists(join(tmpDir, 'CODEX_INSTRUCTIONS.md')));

      // 2. Run step-ai update on this workspace
      const { stdout } = await execFileAsync(process.execPath, [
        STEP_AI_BIN,
        'update',
        '--dest',
        tmpDir,
      ]);

      assert.ok(stdout.includes('อัปเดตไฟล์ทักษะและ Router สำเร็จ'));
      assert.ok(stdout.includes('STeP AI System Check'));
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test('Case 7: Distribution Packager (build_pilot_bundle.py) builds valid v0.2.0 ZIP', async () => {
    const zipPath = join(PACKAGE_ROOT, 'dist', 'STeP-AI-Pilot-v0.2.0.zip');
    assert.ok(await pathExists(zipPath), 'Pilot bundle v0.2.0 zip must exist');

    const s = await stat(zipPath);
    assert.ok(s.size > 50000, `Bundle size should be substantial (actual: ${s.size} bytes)`);
  });

  await t.test('Case 8: Verification of macOS Finder command and shell scripts', async () => {
    const cmdInstall = join(PACKAGE_ROOT, 'Install-STeP-AI.command');
    const shInstall = join(PACKAGE_ROOT, 'install', 'install-macos.sh');
    const cmdUpdate = join(PACKAGE_ROOT, 'Update-STeP-AI.command');
    const shUpdate = join(PACKAGE_ROOT, 'install', 'update-macos.sh');

    assert.ok(await pathExists(cmdInstall), 'Install-STeP-AI.command must exist at repo root');
    assert.ok(await pathExists(shInstall), 'install/install-macos.sh must exist');
    assert.ok(await pathExists(cmdUpdate), 'Update-STeP-AI.command must exist at repo root');
    assert.ok(await pathExists(shUpdate), 'install/update-macos.sh must exist');

    const cmdInstallContent = await readFile(cmdInstall, 'utf-8');
    assert.ok(cmdInstallContent.includes('install-macos.sh'));

    const shInstallContent = await readFile(shInstall, 'utf-8');
    assert.ok(shInstallContent.includes('STeP AI Setup'));
    assert.ok(shInstallContent.includes('Darwin'));
    assert.ok(shInstallContent.includes('uname -m'));
    assert.ok(shInstallContent.includes('command -v node'));
    assert.ok(shInstallContent.includes('Applications/Visual Studio Code.app'));
    assert.ok(shInstallContent.includes('Applications/Cursor.app'));
    assert.ok(shInstallContent.includes('Applications/Claude.app'));
    // Verify all 22 teams are displayed in macOS installer
    assert.ok(shInstallContent.includes('QS'));
    assert.ok(shInstallContent.includes('AFP'));
    assert.ok(shInstallContent.includes('CC'));
    assert.ok(shInstallContent.includes('MI'));
    assert.ok(shInstallContent.includes('PITI'));
    assert.ok(shInstallContent.includes('GA'));
    assert.ok(shInstallContent.includes('FOODFABR'));
    assert.ok(shInstallContent.includes('TECH-SPIN'));
    assert.ok(shInstallContent.includes('22 ทีม'));

    const cmdUpdateContent = await readFile(cmdUpdate, 'utf-8');
    assert.ok(cmdUpdateContent.includes('update-macos.sh'));

    const shUpdateContent = await readFile(shUpdate, 'utf-8');
    assert.ok(shUpdateContent.includes('step-ai.js" update'));
  });

  await t.test('Case 9: macOS Platform Tool Detector detects Mac applications and profiles', async () => {
    const tmpHome = join(PACKAGE_ROOT, 'tmp', 'fake-mac-home');
    await rm(tmpHome, { recursive: true, force: true });
    await mkdir(join(tmpHome, 'Library', 'Application Support', 'Code'), { recursive: true });
    await mkdir(join(tmpHome, '.cursor'), { recursive: true });

    try {
      const macTools = await detectInstalledTools({ platform: 'darwin', home: tmpHome });
      assert.ok(Array.isArray(macTools));
      assert.equal(macTools.length, 3);

      const codex = macTools.find((t) => t.id === 'codex');
      const cursor = macTools.find((t) => t.id === 'cursor');
      const claude = macTools.find((t) => t.id === 'claude');

      assert.ok(codex && codex.installed === true, 'Codex should be detected via Library/Application Support/Code');
      assert.ok(cursor && cursor.installed === true, 'Cursor should be detected via .cursor');
      assert.ok(claude && claude.installed === false, 'Claude should not be detected if path does not exist');
    } finally {
      await rm(tmpHome, { recursive: true, force: true });
    }
  });

  await t.test('Case 10: Platform Layer CPU Architecture & Display Formatting', async () => {
    assert.equal(getMacCpuArch('arm64'), 'Apple Silicon (arm64)');
    assert.equal(getMacCpuArch('x64'), 'Intel Mac (x86_64)');
    assert.equal(getMacCpuArch('x86_64'), 'Intel Mac (x86_64)');

    const macArm = getPlatformDisplay({ platform: 'darwin', arch: 'arm64' });
    assert.equal(macArm, 'macOS (Apple Silicon (arm64))');

    const macIntel = getPlatformDisplay({ platform: 'darwin', arch: 'x64' });
    assert.equal(macIntel, 'macOS (Intel Mac (x86_64))');

    const winDisplay = getPlatformDisplay({ platform: 'win32', arch: 'x64' });
    assert.equal(winDisplay, 'Windows (x64)');

    const linuxDisplay = getPlatformDisplay({ platform: 'linux', arch: 'x64' });
    assert.equal(linuxDisplay, 'Linux (x64)');
  });

  await t.test('Case 11: Windows Installer and Updater PowerShell script encoding & syntax', async () => {
    const installPs1Path = join(PACKAGE_ROOT, 'install', 'install-windows.ps1');
    const updatePs1Path = join(PACKAGE_ROOT, 'install', 'update-windows.ps1');

    const installBuf = await readFile(installPs1Path);
    const updateBuf = await readFile(updatePs1Path);

    // Verify UTF-8 BOM
    assert.equal(installBuf[0], 0xef, 'install-windows.ps1 must start with UTF-8 BOM byte 0');
    assert.equal(installBuf[1], 0xbb, 'install-windows.ps1 must start with UTF-8 BOM byte 1');
    assert.equal(installBuf[2], 0xbf, 'install-windows.ps1 must start with UTF-8 BOM byte 2');

    assert.equal(updateBuf[0], 0xef, 'update-windows.ps1 must start with UTF-8 BOM byte 0');
    assert.equal(updateBuf[1], 0xbb, 'update-windows.ps1 must start with UTF-8 BOM byte 1');
    assert.equal(updateBuf[2], 0xbf, 'update-windows.ps1 must start with UTF-8 BOM byte 2');

    // On Windows, verify parser validation via powershell.exe
    if (process.platform === 'win32') {
      for (const psFile of [installPs1Path, updatePs1Path]) {
        const psScript = `
          $err = $null
          $tok = $null
          $null = [System.Management.Automation.Language.Parser]::ParseFile('${psFile.replace(/\\\\/g, '\\\\\\\\')}', [ref]$tok, [ref]$err)
          if ($err -and $err.Count -gt 0) {
            $err | ForEach-Object { Write-Error $_.Message }
            exit 1
          }
        `;
        const res = await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript]);
        assert.equal(res.stderr, '');
      }
    }
  });
});

