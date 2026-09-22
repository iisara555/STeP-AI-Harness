import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile, rm, mkdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { PACKAGE_ROOT, getAvailableTeams, resolveTeamFiles } from '../src/modules/role-resolver.js';
import { pathExists } from '../src/utils/file-ops.js';
import {
  loadUserConfig,
  saveUserConfig,
  getUserTeam,
  getUserCluster,
  getUserTools,
  USER_CONFIG_PATH,
} from '../src/utils/user-config.js';
import { detectInstalledTools } from '../src/utils/tool-detector.js';
import { getPlatformDisplay, getMacCpuArch, getToolRecommendations, getTieredRecommendations } from '../src/platform/index.js';
import { getAdapter, getSupportedTools } from '../src/modules/adapters/index.js';
import { resolveTeamChoice } from '../src/cli/team-selection.js';

const execFileAsync = promisify(execFile);
const STEP_AI_BIN = join(PACKAGE_ROOT, 'bin', 'step-ai.js');
const PACKAGE_VERSION = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf-8')).version;
const PYTHON = process.platform === 'win32'
  ? { command: 'py', prefixArgs: ['-3'] }
  : { command: 'python3', prefixArgs: [] };

test(`STeP AI Pilot v${PACKAGE_VERSION} Installer & User Configuration Suite`, async (t) => {
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
    assert.equal(detected.length, 8);

    const ids = detected.map((t) => t.id);
    assert.ok(ids.includes('cursor'));
    assert.ok(ids.includes('opencode'));
    assert.ok(ids.includes('claude'));
    assert.ok(ids.includes('chatgpt'));
    assert.ok(ids.includes('antigravity'));
    assert.ok(ids.includes('hermes'));
    assert.ok(ids.includes('windsurf'));
    assert.ok(ids.includes('codex'));

    for (const tool of detected) {
      assert.equal(typeof tool.name, 'string');
      assert.equal(typeof tool.installed, 'boolean');
      assert.ok(tool.url.startsWith('https://'));
      assert.equal(typeof tool.description, 'string');
      assert.ok(['free_quota', 'paid_commercial', 'local_privacy'].includes(tool.tier));
      assert.equal(typeof tool.tierDisplay, 'string');
    }
  });

  await t.test('Case 3: CLI step-ai config modifies and persists settings', async () => {
    const { stdout } = await execFileAsync(process.execPath, [STEP_AI_BIN, 'config', '--team', 'afp']);
    assert.ok(stdout.includes('AFP'));

    const team = await getUserTeam();
    assert.equal(team, 'afp');
  });

  await t.test('Case 3b: Direct 22-team selection has a visible skip default and derives cluster internally', async () => {
    const teams = await getAvailableTeams();
    assert.equal(teams.length, 22);

    assert.equal(resolveTeamChoice(teams, ''), null, 'Enter should use default skip');
    assert.equal(resolveTeamChoice(teams, '0'), null, '0 should skip team selection');
    assert.equal(resolveTeamChoice(teams, '16').id, 'cc');
    assert.equal(resolveTeamChoice(teams, 'cc').id, 'cc');

    await execFileAsync(process.execPath, [STEP_AI_BIN, 'config', '--team', 'cc']);
    assert.equal(await getUserTeam(), 'cc');
    assert.equal(await getUserCluster(), 'market-creative', 'routing cluster should derive from selected team');
  });

  await t.test('Case 4: CLI step-ai doctor reports resolved team Skills and organization library correctly', async () => {
    const { stdout } = await execFileAsync(process.execPath, [STEP_AI_BIN, 'doctor', '--employee']);
    assert.ok(stdout.includes('STeP AI System Check'));
    assert.ok(stdout.includes('Installation:'));
    assert.ok(stdout.includes('Platform:'));
    assert.ok(stdout.includes('Router:'));
    assert.ok(stdout.includes('พร้อมใช้งาน'));
    assert.ok(!stdout.includes('stack trace'));
    assert.ok(!stdout.includes('npmrc'));

    const configuredTeam = await getUserTeam();
    assert.equal(configuredTeam, 'cc');

    const resolved = await resolveTeamFiles(configuredTeam);
    const expectedTeamSkills = new Set(
      resolved.files
        .filter((file) => file.type === 'skill' && file.relativePath.endsWith('/SKILL.md'))
        .map((file) => file.relativePath)
    ).size;
    const skillRegistry = await readFile(join(PACKAGE_ROOT, 'manifest', 'skills.yaml'), 'utf-8');
    const expectedOrganizationSkills = (skillRegistry.match(/^    path:\s*skills\/[^\n]+\/SKILL\.md\s*$/gm) || []).length;

    assert.ok(
      stdout.includes(`Ready (${expectedTeamSkills} team Skills / ${expectedOrganizationSkills} organization Skills)`),
      `doctor should report resolved Skill counts, got:\n${stdout}`
    );

    const doctorSource = await readFile(join(PACKAGE_ROOT, 'src', 'cli', 'commands', 'doctor.js'), 'utf-8');
    assert.ok(doctorSource.includes('resolveTeamFiles'));
    assert.ok(!doctorSource.includes('t.skills ? t.skills.length : 0'));
    assert.ok(doctorSource.includes('ถ้ายังไม่มีโปรแกรม AI ให้เลือกเริ่มด้วย Cursor หรือ OpenCode ได้'));
    assert.ok(doctorSource.includes('https://cursor.com'));
    assert.ok(doctorSource.includes('https://opencode.ai'));
  });

  await t.test('Case 5: Verification of Windows Explorer batch and powershell files', async () => {
    const batInstall = join(PACKAGE_ROOT, 'Install-STeP-AI.bat');
    const psInstall = join(PACKAGE_ROOT, 'install', 'install-windows.ps1');
    const psRuntime = join(PACKAGE_ROOT, 'install', 'windows-runtime.ps1');
    const batUpdate = join(PACKAGE_ROOT, 'Update-STeP-AI.bat');
    const psUpdate = join(PACKAGE_ROOT, 'install', 'update-windows.ps1');
    const batFeedback = join(PACKAGE_ROOT, 'Feedback-STeP-AI.bat');
    const psFeedback = join(PACKAGE_ROOT, 'install', 'feedback-windows.ps1');

    assert.ok(await pathExists(batInstall), 'Install-STeP-AI.bat must exist at repo root');
    assert.ok(await pathExists(psInstall), 'install/install-windows.ps1 must exist');
    assert.ok(await pathExists(psRuntime), 'install/windows-runtime.ps1 must exist');
    assert.ok(await pathExists(batUpdate), 'Update-STeP-AI.bat must exist at repo root');
    assert.ok(await pathExists(psUpdate), 'install/update-windows.ps1 must exist');
    assert.ok(await pathExists(batFeedback), 'Feedback-STeP-AI.bat must exist at repo root');
    assert.ok(await pathExists(psFeedback), 'install/feedback-windows.ps1 must exist');

    const batInstallContent = await readFile(batInstall, 'utf-8');
    assert.ok(batInstallContent.includes('install-windows.ps1'));
    assert.ok(batInstallContent.includes('chcp 65001'));

    const psInstallContent = await readFile(psInstall, 'utf-8');
    const psRuntimeContent = await readFile(psRuntime, 'utf-8');
    assert.ok(psInstallContent.includes('STeP AI Setup'));
    assert.ok(psInstallContent.includes('package.json'));
    assert.ok(psInstallContent.includes('$pilotVersion'));
    assert.ok(psInstallContent.includes('Resolve-StepNode'));
    assert.ok(psRuntimeContent.includes('$StepNodeVersion = "22.23.2"'));
    assert.ok(psRuntimeContent.includes('1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97'));
    assert.ok(psRuntimeContent.includes('fec025a6da31757e3b6af84c5a1628e9d38442ca99a2161091d78f2fcfa35ef3'));
    assert.ok(!psRuntimeContent.includes('latest-v'));
    // Installer delegates employee choices to one shared CLI flow.
    assert.ok(psInstallContent.includes('init --tool all'));
    assert.ok(psInstallContent.includes('เลือกทีมหลัก (ข้ามได้)'));
    assert.ok(psInstallContent.includes('step-ai config'));
    assert.ok(psInstallContent.includes('ใช้คำแนะนำเริ่มงานที่แสดงจาก STeP AI ด้านบน'));
    assert.ok(!psInstallContent.includes('เลือกเครื่องมือ AI ที่คุณต้องการติดตั้งคำสั่ง'));
    assert.ok(!psInstallContent.includes('พิมพ์หมายเลขทีม (1-22)'));
    assert.ok(!psInstallContent.includes('Start-Process "https://cursor.com"'));
    assert.ok(!psInstallContent.includes('Start-Process "https://opencode.ai"'));

    const batUpdateContent = await readFile(batUpdate, 'utf-8');
    assert.ok(batUpdateContent.includes('update-windows.ps1'));

    const psUpdateContent = await readFile(psUpdate, 'utf-8');
    assert.ok(psUpdateContent.includes('releases/latest'));
    assert.ok(psUpdateContent.includes('SHA-256'));
    assert.ok(psUpdateContent.includes('upgrade-apply'));
    assert.ok(psUpdateContent.includes('USER.md'));
    assert.ok(psUpdateContent.includes('output/'));

    const batFeedbackContent = await readFile(batFeedback, 'utf-8');
    assert.ok(batFeedbackContent.includes('feedback-windows.ps1'));

    // Verify CRLF line endings to prevent Windows cmd.exe parser desync
    assert.ok(batInstallContent.includes('\r\n'), 'Install-STeP-AI.bat must use CRLF line endings');
    assert.ok(batUpdateContent.includes('\r\n'), 'Update-STeP-AI.bat must use CRLF line endings');
    assert.ok(batFeedbackContent.includes('\r\n'), 'Feedback-STeP-AI.bat must use CRLF line endings');
  });

  await t.test('Case 5b: Runtime support policy and Node release keyring source are explicit', async () => {
    const pkg = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf-8'));
    const validateWorkflow = await readFile(join(PACKAGE_ROOT, '.github', 'workflows', 'validate.yml'), 'utf-8');
    const releaseWorkflow = await readFile(join(PACKAGE_ROOT, '.github', 'workflows', 'release.yml'), 'utf-8');
    const verifyPins = await readFile(join(PACKAGE_ROOT, 'scripts', 'verify_node_runtime_pins.sh'), 'utf-8');

    assert.equal(pkg.engines.node, '>=20.0.0');
    assert.ok(validateWorkflow.includes("node-version: '20'"), 'validate CI must exercise the supported Node 20 floor');
    assert.ok(releaseWorkflow.includes("node-version: '20'"), 'release CI must exercise the supported Node 20 floor');

    assert.ok(verifyPins.includes('RELEASE_KEYS_COMMIT="7b6eb2d6ab524bb30487f31612cdbeb35ae37533"'));
    assert.ok(verifyPins.includes('raw.githubusercontent.com/nodejs/release-keys/${RELEASE_KEYS_COMMIT}/gpg/pubring.kbx'));
    assert.ok(!verifyPins.includes('/HEAD/'), 'release keyring source must not float on HEAD');
  });

  await t.test('Case 5c: step-ai init owns the shared employee finish handoff', async () => {
    const initSource = await readFile(join(PACKAGE_ROOT, 'src', 'cli', 'commands', 'init.js'), 'utf-8');

    assert.ok(initSource.includes('✓ STeP AI พร้อมเริ่มงาน'));
    assert.ok(initSource.includes('เตรียม instruction ให้ 8 โปรแกรมแล้ว'));
    assert.ok(initSource.includes('เริ่มใช้งาน STeP AI'));
    assert.ok(initSource.includes('ลองเริ่มจากงานของทีม'));
    assert.ok(initSource.includes('ถ้ายังไม่ได้เลือกทีม ให้เริ่มจากงานจริงได้เลย'));
    assert.ok(initSource.includes('step-ai config'));
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
      assert.ok(await pathExists(join(tmpDir, 'output', 'QS')), 'Init should create team output workspace');

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

  await t.test(`Case 7: Distribution Packager builds valid v${PACKAGE_VERSION} ZIP`, async () => {
    const zipPath = join(PACKAGE_ROOT, 'dist', `STeP-AI-Pilot-v${PACKAGE_VERSION}.zip`);

    // Always rebuild from the current source tree. A stale ZIP in dist/ must never
    // make this test validate an older package than the code under test.
    await execFileAsync(PYTHON.command, [...PYTHON.prefixArgs, join(PACKAGE_ROOT, 'scripts', 'build_pilot_bundle.py')], {
      cwd: PACKAGE_ROOT,
    });

    assert.ok(await pathExists(zipPath), `Pilot bundle v${PACKAGE_VERSION} zip must exist after packager runs`);
    const zipCheck = [
      'import sys, zipfile',
      'z=zipfile.ZipFile(sys.argv[1])',
      'print("SUPPORT.md" in z.namelist())'
    ].join('; ');
    const { stdout: supportIncluded } = await execFileAsync(PYTHON.command, [...PYTHON.prefixArgs, '-c', zipCheck, zipPath]);
    assert.equal(supportIncluded.trim(), 'True', 'SUPPORT.md must be included in Pilot bundle');

    const checksum = (await readFile(zipPath + '.sha256', 'utf-8')).trim().split(/\s+/);
    assert.equal(checksum[0], createHash('sha256').update(await readFile(zipPath)).digest('hex'));
    assert.equal(checksum[1], `STeP-AI-Pilot-v${PACKAGE_VERSION}.zip`);

    const s = await stat(zipPath);
    assert.ok(s.size > 50000, `Bundle size should be substantial (actual: ${s.size} bytes)`);
  });

  await t.test('Case 8: Verification of macOS Finder command and shell scripts', async () => {
    const cmdInstall = join(PACKAGE_ROOT, 'Install-STeP-AI.command');
    const shInstall = join(PACKAGE_ROOT, 'install', 'install-macos.sh');
    const cmdUpdate = join(PACKAGE_ROOT, 'Update-STeP-AI.command');
    const shUpdate = join(PACKAGE_ROOT, 'install', 'update-macos.sh');
    const cmdFeedback = join(PACKAGE_ROOT, 'Feedback-STeP-AI.command');
    const shFeedback = join(PACKAGE_ROOT, 'install', 'feedback-macos.sh');

    assert.ok(await pathExists(cmdInstall), 'Install-STeP-AI.command must exist at repo root');
    assert.ok(await pathExists(shInstall), 'install/install-macos.sh must exist');
    assert.ok(await pathExists(cmdUpdate), 'Update-STeP-AI.command must exist at repo root');
    assert.ok(await pathExists(shUpdate), 'install/update-macos.sh must exist');
    assert.ok(await pathExists(cmdFeedback), 'Feedback-STeP-AI.command must exist at repo root');
    assert.ok(await pathExists(shFeedback), 'install/feedback-macos.sh must exist');

    const cmdInstallContent = await readFile(cmdInstall, 'utf-8');
    assert.ok(cmdInstallContent.includes('install-macos.sh'));

    const runtimeHelper = join(PACKAGE_ROOT, 'install', 'macos-runtime.sh');
    const macHelp = join(PACKAGE_ROOT, 'MAC-START-HERE.txt');
    assert.ok(await pathExists(runtimeHelper), 'install/macos-runtime.sh must exist');
    assert.ok(await pathExists(macHelp), 'MAC-START-HERE.txt must exist');
    // Apple removed the Control-click > Open bypass in macOS 15, so guidance that leads
    // with it sends Mac staff to a dead end on every current machine. The unsigned
    // .command cannot de-quarantine itself: it has to be allowed before it can run.
    const macHelpContent = await readFile(macHelp, 'utf-8');
    assert.ok(macHelpContent.includes('System Settings'), 'mac guide must name the System Settings path');
    assert.ok(macHelpContent.includes('Privacy & Security'), 'mac guide must name the Privacy pane');
    assert.ok(macHelpContent.includes('Open Anyway'), 'mac guide must name the Open Anyway button');
    assert.ok(macHelpContent.includes('xattr -dr com.apple.quarantine'), 'mac guide must offer the one-line fallback');
    if (macHelpContent.includes('คลิกขวา')) {
      assert.ok(
        macHelpContent.includes('macOS 15') || macHelpContent.includes('Sequoia'),
        'right-click guidance must state which macOS versions it still applies to',
      );
    }

    const supportContent = await readFile(join(PACKAGE_ROOT, 'SUPPORT.md'), 'utf-8');
    assert.ok(supportContent.includes('Open Anyway'), 'SUPPORT.md must cover the macOS Gatekeeper block');
    assert.ok(supportContent.includes('xattr -dr com.apple.quarantine'), 'SUPPORT.md must carry the same fallback command');

    const runtimeContent = await readFile(runtimeHelper, 'utf-8');
    assert.ok(runtimeContent.includes('STEP_NODE_VERSION="22.23.2"'));
    assert.ok(runtimeContent.includes('61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6'));
    assert.ok(runtimeContent.includes('58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026'));
    assert.ok(runtimeContent.includes('shasum -a 256'));
    assert.ok(!runtimeContent.includes('latest-v'));
    assert.ok(runtimeContent.includes('.step-ai/runtime/node'));
    assert.ok(runtimeContent.includes('node_arch="arm64"'));
    assert.ok(runtimeContent.includes('node_arch="x64"'));
    assert.ok(!runtimeContent.includes('sudo '));
    assert.ok(!runtimeContent.includes('brew install'));

        const shInstallContent = await readFile(shInstall, 'utf-8');
    assert.ok(shInstallContent.includes('STeP AI Setup'));
    assert.ok(shInstallContent.includes('PILOT_VERSION'));
    assert.ok(shInstallContent.includes('Darwin'));
    assert.ok(shInstallContent.includes('uname -m'));
    assert.ok(shInstallContent.includes('resolve_step_node'));
    assert.ok(shInstallContent.includes('NODE_BIN="$STEP_NODE_BIN"'));
    assert.ok(!shInstallContent.includes('Applications/Visual Studio Code.app'));
    assert.ok(!shInstallContent.includes('Applications/Cursor.app'));
    assert.ok(!shInstallContent.includes('Applications/Claude.app'));
    // macOS uses the same shared CLI selection flow as Windows.
    assert.ok(shInstallContent.includes('init --tool all'));
    assert.ok(shInstallContent.includes('เลือกทีมหลัก (ข้ามได้)'));
    assert.ok(shInstallContent.includes('step-ai config'));
    assert.ok(shInstallContent.includes('ใช้คำแนะนำเริ่มงานที่แสดงจาก STeP AI ด้านบน'));
    assert.ok(!shInstallContent.includes('เลือกเครื่องมือ AI ที่ต้องการติดตั้งคำสั่ง'));
    assert.ok(!shInstallContent.includes('พิมพ์หมายเลขทีม (1-22)'));
    assert.ok(!shInstallContent.includes('open "https://cursor.com"'));
    assert.ok(!shInstallContent.includes('open "https://opencode.ai"'));

    const cmdUpdateContent = await readFile(cmdUpdate, 'utf-8');
    assert.ok(cmdUpdateContent.includes('update-macos.sh'));

    const shUpdateContent = await readFile(shUpdate, 'utf-8');
    assert.ok(shUpdateContent.includes('releases/latest'));
    assert.ok(shUpdateContent.includes('sha256'));
    assert.ok(shUpdateContent.includes('upgrade-apply'));
    assert.ok(shUpdateContent.includes('step-ai.js" update'));
    assert.ok(shUpdateContent.includes('resolve_step_node'));
    assert.ok(shUpdateContent.includes('NODE_BIN="$STEP_NODE_BIN"'));

    const cmdFeedbackContent = await readFile(cmdFeedback, 'utf-8');
    assert.ok(cmdFeedbackContent.includes('feedback-macos.sh'));
    assert.ok(cmdInstallContent.includes('com.apple.quarantine'));
    assert.ok(cmdUpdateContent.includes('com.apple.quarantine'));
    assert.ok(cmdFeedbackContent.includes('com.apple.quarantine'));

    const shFeedbackContent = await readFile(shFeedback, 'utf-8');
    assert.ok(shFeedbackContent.includes('resolve_step_node'));
    assert.ok(shFeedbackContent.includes('NODE_BIN="$STEP_NODE_BIN"'));

    const zipPath = join(PACKAGE_ROOT, 'dist', `STeP-AI-Pilot-v${PACKAGE_VERSION}.zip`);
    if (await pathExists(zipPath)) {
      const py = [
        'import sys, zipfile',
        'z=zipfile.ZipFile(sys.argv[1])',
        'names=["Install-STeP-AI.command","Update-STeP-AI.command","Feedback-STeP-AI.command","install/install-macos.sh","install/macos-runtime.sh"]',
        'print(" ".join(oct((z.getinfo(n).external_attr >> 16) & 0o777) for n in names))'
      ].join('; ');
      const { stdout } = await execFileAsync(PYTHON.command, [...PYTHON.prefixArgs, '-c', py, zipPath]);
      assert.equal(stdout.trim(), '0o755 0o755 0o755 0o755 0o755', 'macOS executable permissions must survive Pilot ZIP packaging');
    }
  });

  await t.test('Case 9: macOS Platform Tool Detector detects Mac applications and profiles', async () => {
    const tmpHome = join(PACKAGE_ROOT, 'tmp', 'fake-mac-home');
    await rm(tmpHome, { recursive: true, force: true });
    await mkdir(join(tmpHome, 'Library', 'Application Support', 'Code'), { recursive: true });
    await mkdir(join(tmpHome, '.cursor'), { recursive: true });
    await mkdir(join(tmpHome, '.opencode'), { recursive: true });

    try {
      const macTools = await detectInstalledTools({ platform: 'darwin', home: tmpHome });
      assert.ok(Array.isArray(macTools));
      assert.equal(macTools.length, 8);

      const codex = macTools.find((t) => t.id === 'codex');
      const cursor = macTools.find((t) => t.id === 'cursor');
      const opencode = macTools.find((t) => t.id === 'opencode');
      const claude = macTools.find((t) => t.id === 'claude');
      const hermes = macTools.find((t) => t.id === 'hermes');
      const windsurf = macTools.find((t) => t.id === 'windsurf');
      const chatgpt = macTools.find((t) => t.id === 'chatgpt');
      const antigravity = macTools.find((t) => t.id === 'antigravity');

      assert.ok(codex && codex.installed === true, 'Codex should be detected via Library/Application Support/Code');
      assert.ok(cursor && cursor.installed === true, 'Cursor should be detected via .cursor');
      assert.ok(opencode && opencode.installed === true, 'OpenCode should be detected via .opencode');
      assert.ok(claude && claude.installed === false, 'Claude should not be detected if path does not exist');
      assert.ok(hermes && typeof hermes.url === 'string', 'Hermes should have url');
      assert.ok(windsurf && typeof windsurf.url === 'string', 'Windsurf should have url');
      assert.ok(chatgpt && chatgpt.tier === 'paid_commercial', 'ChatGPT should have paid_commercial tier');
      assert.ok(antigravity && antigravity.tier === 'paid_commercial', 'Antigravity should have paid_commercial tier');
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
    const feedbackPs1Path = join(PACKAGE_ROOT, 'install', 'feedback-windows.ps1');
    const runtimePs1Path = join(PACKAGE_ROOT, 'install', 'windows-runtime.ps1');

    const installBuf = await readFile(installPs1Path);
    const updateBuf = await readFile(updatePs1Path);
    const feedbackBuf = await readFile(feedbackPs1Path);
    const runtimeBuf = await readFile(runtimePs1Path);

    // Verify UTF-8 BOM
    assert.equal(installBuf[0], 0xef, 'install-windows.ps1 must start with UTF-8 BOM byte 0');
    assert.equal(installBuf[1], 0xbb, 'install-windows.ps1 must start with UTF-8 BOM byte 1');
    assert.equal(installBuf[2], 0xbf, 'install-windows.ps1 must start with UTF-8 BOM byte 2');

    assert.equal(updateBuf[0], 0xef, 'update-windows.ps1 must start with UTF-8 BOM byte 0');
    assert.equal(updateBuf[1], 0xbb, 'update-windows.ps1 must start with UTF-8 BOM byte 1');
    assert.equal(updateBuf[2], 0xbf, 'update-windows.ps1 must start with UTF-8 BOM byte 2');

    assert.equal(feedbackBuf[0], 0xef, 'feedback-windows.ps1 must start with UTF-8 BOM byte 0');
    assert.equal(feedbackBuf[1], 0xbb, 'feedback-windows.ps1 must start with UTF-8 BOM byte 1');
    assert.equal(feedbackBuf[2], 0xbf, 'feedback-windows.ps1 must start with UTF-8 BOM byte 2');

    assert.equal(runtimeBuf[0], 0xef, 'windows-runtime.ps1 must start with UTF-8 BOM byte 0');
    assert.equal(runtimeBuf[1], 0xbb, 'windows-runtime.ps1 must start with UTF-8 BOM byte 1');
    assert.equal(runtimeBuf[2], 0xbf, 'windows-runtime.ps1 must start with UTF-8 BOM byte 2');

    // On Windows, verify parser validation via powershell.exe
    if (process.platform === 'win32') {
      for (const psFile of [installPs1Path, updatePs1Path, feedbackPs1Path]) {
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

  await t.test('Case 12: Hermes Agent Adapter generates HERMES.md instructions', async () => {
    const hermesAdapter = getAdapter('hermes');
    assert.ok(hermesAdapter);

    const mockRole = { id: 'qs', name: 'Quality System', description: 'ISO 9001 and audit' };
    const mockFiles = [
      { relativePath: 'skills/common/receipt-audit/SKILL.md', type: 'skill' },
      { relativePath: 'rules/human-approval.md', type: 'rule' },
    ];

    const instructions = hermesAdapter.getInstructionFiles(mockRole, mockFiles);
    assert.equal(instructions.length, 2);

    const hermesFile = instructions.find((f) => f.filename === 'HERMES.md');
    assert.ok(hermesFile);
    assert.ok(hermesFile.content.includes('Hermes Agent System Prompt'));
    assert.ok(hermesFile.content.includes('Human-in-the-loop Mandate'));
    assert.ok(hermesFile.content.includes('Installed ≠ Loaded'));
    assert.ok(!hermesFile.content.includes('receipt-audit'));
  });

  await t.test('Case 13: Windsurf Adapter generates .windsurfrules', async () => {
    const windsurfAdapter = getAdapter('windsurf');
    assert.ok(windsurfAdapter);

    const mockRole = { id: 'cc', name: 'Creative & Communication', description: 'Design brief and CI' };
    const mockFiles = [
      { relativePath: 'skills/common/brand-tone-of-voice/SKILL.md', type: 'skill' },
      { relativePath: 'rules/naming.md', type: 'rule' },
    ];

    const instructions = windsurfAdapter.getInstructionFiles(mockRole, mockFiles);
    const windsurfRules = instructions.find((f) => f.filename === '.windsurfrules');
    assert.ok(windsurfRules);
    assert.ok(windsurfRules.content.includes('Windsurf AI Rules'));
    assert.ok(windsurfRules.content.includes('Installed ≠ Loaded'));
    assert.ok(!windsurfRules.content.includes('brand-tone-of-voice'));
  });

  await t.test('Case 14: Multi Adapter generates complete agent suite across all 8 tools', async () => {
    const multiAdapter = getAdapter('all');
    assert.ok(multiAdapter);

    const mockRole = { id: 'afp', name: 'Accounting & Procurement', description: 'Finance & TOR' };
    const mockFiles = [
      { relativePath: 'skills/pm/tor-review/SKILL.md', type: 'skill' },
    ];

    const instructions = multiAdapter.getInstructionFiles(mockRole, mockFiles);
    const filenames = instructions.map((i) => i.filename);

    assert.ok(filenames.includes('CODEX_INSTRUCTIONS.md'));
    assert.ok(filenames.includes('CLAUDE.md'));
    assert.ok(filenames.includes('.cursorrules'));
    assert.ok(filenames.includes('.windsurfrules'));
    assert.ok(filenames.includes('HERMES.md'));
    assert.ok(filenames.includes('OPENCODE.md'));
    assert.ok(filenames.includes('GEMINI.md'));
    assert.ok(filenames.includes('CHATGPT.md'));
    assert.ok(filenames.includes('AGENTS.md'));
  });

  await t.test('Case 15: Tool Recommendations return valid URLs and descriptions across 8 tools', async () => {
    const recs = await getToolRecommendations();
    assert.ok(Array.isArray(recs));
    assert.equal(recs.length, 8);

    const cursorRec = recs.find((r) => r.id === 'cursor');
    const opencodeRec = recs.find((r) => r.id === 'opencode');
    const hermesRec = recs.find((r) => r.id === 'hermes');
    const chatgptRec = recs.find((r) => r.id === 'chatgpt');
    const geminiRec = recs.find((r) => r.id === 'antigravity');

    assert.ok(cursorRec && cursorRec.url === 'https://cursor.com');
    assert.ok(opencodeRec && opencodeRec.url === 'https://opencode.ai');
    assert.ok(hermesRec && hermesRec.url.includes('Hermes-Agent'));
    assert.ok(chatgptRec && chatgptRec.tier === 'paid_commercial');
    assert.ok(geminiRec && geminiRec.tier === 'paid_commercial');
  });

  await t.test('Case 16: Zero-tools installed scenario provides helpful recommendations for 8 tools', async () => {
    const fakeHome = join(PACKAGE_ROOT, 'tmp', 'fake-empty-home');
    await rm(fakeHome, { recursive: true, force: true });
    await mkdir(fakeHome, { recursive: true });

    try {
      const winTools = await detectInstalledTools({ platform: 'win32', home: fakeHome });
      assert.equal(winTools.length, 8);
      const winInstalled = winTools.filter((t) => t.installed);
      assert.equal(winInstalled.length, 0);

      const macTools = await detectInstalledTools({ platform: 'darwin', home: fakeHome });
      assert.equal(macTools.length, 8);
      const macInstalled = macTools.filter((t) => t.installed);
      assert.equal(macInstalled.length, 0);

      for (const t of winTools) {
        assert.ok(t.url.startsWith('https://'));
        assert.ok(t.recommendation.length > 0);
        assert.ok(['free_quota', 'paid_commercial', 'local_privacy'].includes(t.tier));
      }
    } finally {
      await rm(fakeHome, { recursive: true, force: true });
    }
  });

  await t.test('Case 17: OpenCode Adapter generates OPENCODE.md instructions', async () => {
    const opencodeAdapter = getAdapter('opencode');
    assert.ok(opencodeAdapter);

    const mockRole = { id: 'piti', name: 'Platform & Incubation', description: 'Tech incubation' };
    const mockFiles = [
      { relativePath: 'skills/common/receipt-audit/SKILL.md', type: 'skill' },
      { relativePath: 'rules/naming.md', type: 'rule' },
    ];

    const instructions = opencodeAdapter.getInstructionFiles(mockRole, mockFiles);
    const opencodeFile = instructions.find((f) => f.filename === 'OPENCODE.md');
    assert.ok(opencodeFile);
    assert.ok(opencodeFile.content.includes('OpenCode AI Assistant'));
    assert.ok(opencodeFile.content.includes('Free Quota AI Assistant'));
    assert.ok(opencodeFile.content.includes('Installed ≠ Loaded'));
    assert.ok(!opencodeFile.content.includes('receipt-audit'));
  });

  await t.test('Case 18: Gemini and Google Antigravity Adapter generates GEMINI.md', async () => {
    const geminiAdapter = getAdapter('gemini');
    const antigravityAdapter = getAdapter('antigravity');
    assert.equal(geminiAdapter, antigravityAdapter);

    const mockRole = { id: 'tech-spin', name: 'Tech Transfer & Spin-off', description: 'Commercial spin-off' };
    const mockFiles = [
      { relativePath: 'skills/pm/tor-review/SKILL.md', type: 'skill' },
      { relativePath: 'rules/human-approval.md', type: 'rule' },
    ];

    const instructions = geminiAdapter.getInstructionFiles(mockRole, mockFiles);
    const geminiFile = instructions.find((f) => f.filename === 'GEMINI.md');
    assert.ok(geminiFile);
    assert.ok(geminiFile.content.includes('Google Antigravity & Spark'));
    assert.ok(geminiFile.content.includes('Installed ≠ Loaded'));
    assert.ok(!geminiFile.content.includes('tor-review'));
  });

  await t.test('Case 19: ChatGPT Desktop Adapter generates CHATGPT.md', async () => {
    const chatgptAdapter = getAdapter('chatgpt');
    assert.ok(chatgptAdapter);

    const mockRole = { id: 'ga', name: 'General Administration', description: 'General affairs & memos' };
    const mockFiles = [
      { relativePath: 'skills/common/meeting-summary/SKILL.md', type: 'skill' },
      { relativePath: 'rules/thai-official-style.md', type: 'rule' },
    ];

    const instructions = chatgptAdapter.getInstructionFiles(mockRole, mockFiles);
    const chatgptFile = instructions.find((f) => f.filename === 'CHATGPT.md');
    assert.ok(chatgptFile);
    assert.ok(chatgptFile.content.includes('ChatGPT Desktop'));
    assert.ok(chatgptFile.content.includes('Installed ≠ Loaded'));
    assert.ok(!chatgptFile.content.includes('meeting-summary'));
  });

  await t.test('Case 20: 3-Tier Categorized Recommendations structure', async () => {
    const tiered = await getTieredRecommendations();
    assert.ok(tiered.freeQuota);
    assert.ok(tiered.paidCommercial);
    assert.ok(tiered.localPrivacy);

    assert.equal(tiered.freeQuota.id, 'free_quota');
    assert.equal(tiered.paidCommercial.id, 'paid_commercial');
    assert.equal(tiered.localPrivacy.id, 'local_privacy');

    assert.ok(tiered.freeQuota.tools.some((t) => t.id === 'cursor'));
    assert.ok(tiered.freeQuota.tools.some((t) => t.id === 'opencode'));
    assert.ok(tiered.paidCommercial.tools.some((t) => t.id === 'claude'));
    assert.ok(tiered.paidCommercial.tools.some((t) => t.id === 'chatgpt'));
    assert.ok(tiered.paidCommercial.tools.some((t) => t.id === 'antigravity'));
    assert.ok(tiered.localPrivacy.tools.some((t) => t.id === 'hermes'));
  });

  await t.test('Case 21: Feedback and Skill Contribution commands create templates', async () => {
    const testDir = join(PACKAGE_ROOT, 'tmp', 'test-feedback-workspace');
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });

    // Test feedback --issue
    await execFileAsync('node', [STEP_AI_BIN, 'feedback', '--issue', '-d', testDir]);
    const feedbackPath = join(testDir, 'FEEDBACK.md');
    assert.ok(await pathExists(feedbackPath));
    const feedbackContent = await readFile(feedbackPath, 'utf-8');
    assert.ok(feedbackContent.includes('STeP AI Feedback'));
    assert.ok(feedbackContent.includes('คำถาม'));
    assert.ok(feedbackContent.includes('สิ่งที่ AI ตอบผิด'));
    assert.ok(feedbackContent.includes('สิ่งที่ถูกต้อง'));

    // Test feedback --request
    await execFileAsync('node', [STEP_AI_BIN, 'feedback', '--request', '-d', testDir]);
    const requestPath = join(testDir, 'REQUEST_NEW_TASK.md');
    assert.ok(await pathExists(requestPath));
    const requestContent = await readFile(requestPath, 'utf-8');
    assert.ok(requestContent.includes('อยากให้ STeP AI ช่วยงานอะไรเพิ่ม'));
    assert.ok(requestContent.includes('งานที่อยากให้ AI ช่วยคืออะไร'));
    assert.ok(requestContent.includes('ปกติงานนี้มีขั้นตอนอย่างไร'));

    // Test feedback --admin
    const { stdout: adminOut } = await execFileAsync('node', [STEP_AI_BIN, 'feedback', '--admin']);
    assert.ok(adminOut.includes('ADMIN MODE'));
    assert.ok(adminOut.includes('skills/'));
    assert.ok(!adminOut.includes('CHAMPION & ADMIN MODE'));

    await rm(testDir, { recursive: true, force: true });
  });
});


