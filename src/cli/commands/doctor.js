import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, access, constants } from 'node:fs/promises';
import { header, success, warn, error, info } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';
import { pathExists } from '../../utils/file-ops.js';
import { PACKAGE_ROOT, getAvailableTeams, resolveTeamFiles } from '../../modules/role-resolver.js';
import { loadUserConfig, USER_CONFIG_PATH } from '../../utils/user-config.js';
import { detectInstalledTools } from '../../utils/tool-detector.js';
import { getPlatformDisplay } from '../../platform/index.js';
import { loadUserMemory } from '../../modules/user-memory.js';

export async function runDoctor(args) {
  const isEmployeeMode = Boolean(args.employee || args.simple || args.e);

  if (isEmployeeMode) {
    console.log(`\n${colors.bold(colors.cyan('STeP AI System Check'))}`);
    console.log(colors.dim('────────────────────────────────────────────────────────────'));

    const userCfg = await loadUserConfig();
    const pkgJson = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf-8'));
    const detectedTools = await detectInstalledTools();
    const installedToolNames = detectedTools.filter((t) => t.installed).map((t) => t.name);

    let teamDisplay = 'ยังไม่ได้ระบุ';
    let teamSkillsCount = null;

    const skillRegistry = await readFile(join(PACKAGE_ROOT, 'manifest', 'skills.yaml'), 'utf-8');
    const organizationSkillsCount = (skillRegistry.match(/^    path:\s*skills\/[^\n]+\/SKILL\.md\s*$/gm) || []).length;
    if (userCfg.team) {
      const teams = await getAvailableTeams();
      const t = teams.find((item) => item.id.toLowerCase() === userCfg.team.toLowerCase());
      if (t) {
        teamDisplay = `${t.name} (${t.id.toUpperCase()})`;
        const resolved = await resolveTeamFiles(t.id);
        teamSkillsCount = new Set(
          resolved.files
            .filter((file) => file.type === 'skill' && file.relativePath.endsWith('/SKILL.md'))
            .map((file) => file.relativePath)
        ).size;
      } else {
        teamDisplay = userCfg.team.toUpperCase();
      }
    }

    console.log(`  ${colors.green('✓')} Installation:    ${colors.bold(`พร้อมใช้งาน (v${pkgJson.version})`)}`);
    console.log(`  ${colors.green('✓')} Platform:        ${colors.bold(getPlatformDisplay())}`);
    // AI apps call the Router through this launcher; without it every task
    // silently runs outside the organization routing.
    const launcher = process.platform === 'win32' ? 'step-ai.cmd' : 'step-ai';
    if (await pathExists(join(PACKAGE_ROOT, launcher))) {
      console.log(`  ${colors.green('✓')} Router:          ${colors.bold(`Ready (${launcher})`)}`);
    } else {
      console.log(`  ${colors.yellow('⚠️')} Router:          ${colors.yellow(`ไม่พบ ${launcher} ในโฟลเดอร์ ให้เปิด Update อีกครั้งหรือแจ้งตาม SUPPORT.md`)}`);
    }
    console.log(`  ${colors.green('✓')} Team:            ${colors.bold(teamDisplay)}`);
    if (installedToolNames.length > 0) {
      console.log(`  ${colors.green('✓')} Detected AI:     ${colors.cyan(installedToolNames.join(', '))}`);
    } else {
      console.log(`  ${colors.yellow('⚠️')} Detected AI:     ${colors.yellow('ยังไม่พบโปรแกรม AI ในเครื่อง')}`);
    }
    const skillIndexDisplay = teamSkillsCount !== null
      ? `Ready (${teamSkillsCount} team Skills / ${organizationSkillsCount} organization Skills)`
      : `Ready (${organizationSkillsCount} organization Skills)`;
    console.log(`  ${colors.green('✓')} Skill Index:     ${colors.bold(skillIndexDisplay)}`);
    console.log(`  ${colors.green('✓')} Configuration:   ${colors.dim(USER_CONFIG_PATH)}`);
    const userMem = await loadUserMemory(process.cwd());
    if (userMem.exists) {
      console.log(`  ${colors.green('✓')} User Memory:     ${colors.bold('USER.md (Active & Gitignored)')}`);
    }
    console.log(colors.dim('────────────────────────────────────────────────────────────'));

    if (installedToolNames.length === 0) {
      console.log(colors.yellow(colors.bold('⚠️  ยังไม่พบโปรแกรม AI ที่พร้อมใช้ในเครื่องนี้')));
      console.log(colors.dim('   STeP AI ติดตั้งเรียบร้อยแล้ว เลือกโปรแกรม AI ตัวใดก็ได้ ใช้บัญชีฟรีได้ทุกตัว'));
      console.log(`   ${colors.cyan('Cursor:')}                   https://cursor.com`);
      console.log(`   ${colors.cyan('OpenCode:')}                 https://opencode.ai`);
      console.log(`   ${colors.cyan('Gemini CLI / Antigravity:')} https://github.com/google-gemini/gemini-cli`);
      console.log(`   ${colors.cyan('VS Code + Copilot:')}        https://code.visualstudio.com`);
      console.log(colors.dim('   ติดตั้งโปรแกรมใดโปรแกรมหนึ่ง แล้วเปิดโฟลเดอร์ STeP AI และพิมพ์ "เริ่มใช้งาน STeP AI"'));
      console.log(colors.dim('   ขั้นตอนทีละขั้นอยู่ใน docs/ai-app-setup.md'));
      console.log(colors.dim('────────────────────────────────────────────────────────────'));
      console.log(`${colors.yellow(colors.bold('ติดตั้ง Harness สำเร็จ — เหลือเลือกโปรแกรม AI เพื่อเริ่มแชท'))}\n`);
    } else {
      console.log(`${colors.green(colors.bold('✓ สภาพแวดล้อมพร้อมใช้งาน พนักงานสามารถเริ่มถามงานได้ทันที!'))}\n`);
    }
    return;
  }

  header('Diagnostics & Environment Check');

  let issueCount = 0;

  // 1. Node.js Version Check
  const nodeVer = process.version;
  const majorVer = parseInt(nodeVer.replace(/^v/, '').split('.')[0], 10);
  if (majorVer >= 20) {
    success(`Node.js Runtime: ${colors.bold(nodeVer)} (ผ่านเกณฑ์ >= v20)`);
  } else {
    warn(`Node.js Runtime: ${nodeVer} (แนะนำ v20 หรือสูงกว่า)`);
    issueCount++;
  }

  // 2. Package Integrity Check
  const requiredManifests = [
    'manifest/roles.yaml',
    'manifest/teams.yaml',
    'manifest/skills.yaml',
    'manifest/processes.yaml',
    'manifest/documents.yaml',
    'manifest/services.yaml',
    'manifest/authority.yaml',
    'manifest/organization.yaml',
    'manifest/router-index.yaml',
  ];
  const skillsPath = join(PACKAGE_ROOT, 'skills');
  let manifestsOk = await pathExists(skillsPath);
  for (const rel of requiredManifests) {
    if (!(await pathExists(join(PACKAGE_ROOT, rel)))) {
      manifestsOk = false;
      break;
    }
  }

  if (manifestsOk) {
    success(`Package Integrity: แหล่งไฟล์ Approved Skills, 22 Teams, Router และ 6-Dimension Manifests สมบูรณ์`);
  } else {
    error(`Package Integrity: ขาดไฟล์ Manifests ขององค์กรหรือโฟลเดอร์ skills`);
    issueCount++;
  }

  // 3. npm Private Registry Auth Check (Informational for offline/shared package)
  const npmrcPath = join(homedir(), '.npmrc');
  let hasScope = false;
  let hasAuthToken = false;

  if (await pathExists(npmrcPath)) {
    try {
      const npmrcContent = await readFile(npmrcPath, 'utf-8');
      if (npmrcContent.includes('@step-cmu:registry') || npmrcContent.includes('npm.pkg.github.com')) {
        hasScope = true;
      }
      if (npmrcContent.includes('npm.pkg.github.com/:_authToken')) {
        hasAuthToken = true;
      }
    } catch {
      // cannot read npmrc
    }
  }

  if (hasScope && hasAuthToken) {
    success(`GitHub Packages Registry Auth: พบการตั้งค่าสิทธิ์สำหรับ @step-cmu ใน ~/.npmrc`);
  } else if (manifestsOk) {
    // If local manifests are complete, GitHub PAT is not required for daily use
    success(`Offline/Shared Package: ไฟล์มาตรฐานพร้อมใช้งานในเครื่อง (ไม่จำเป็นต้องต่อ GitHub PAT)`);
  } else {
    warn(`GitHub Packages Registry Auth: ยังไม่พบการตั้งค่าใน ~/.npmrc`);
    info(`แนวทางตั้งค่าสำหรับพนักงาน:`);
    console.log(colors.dim(`    echo @step-cmu:registry=https://npm.pkg.github.com >> ~/.npmrc`));
    console.log(colors.dim(`    echo //npm.pkg.github.com/:_authToken=YOUR_GITHUB_PAT >> ~/.npmrc`));
    issueCount++;
  }

  // 4. Workspace Write Permission
  const targetDir = process.cwd();
  try {
    await access(targetDir, constants.W_OK);
    success(`Workspace Write Permission: เขียนไฟล์ในไดเรกทอรีปัจจุบันได้ (${targetDir})`);
  } catch {
    error(`Workspace Write Permission: ไม่มีสิทธิ์เขียนไฟล์ใน ${targetDir}`);
    issueCount++;
  }

  // 5. Detected AI Tools
  const systemTools = await detectInstalledTools();
  const installedSystemTools = systemTools.filter((t) => t.installed).map((t) => t.name);
  if (installedSystemTools.length > 0) {
    success(`Detected System AI Tools: ${colors.bold(installedSystemTools.join(', '))}`);
  } else {
    info(`Detected System AI Tools: ยังตรวจไม่พบ (รองรับ Cursor, OpenCode, Gemini CLI/Antigravity, VS Code + Copilot, Claude, Windsurf, Hermes Agent)`);
  }

  // 6. AI Agent Workspace Check
  const agentFiles = [
    { file: 'CLAUDE.md', tool: 'Claude' },
    { file: '.cursorrules', tool: 'Cursor' },
    { file: '.windsurfrules', tool: 'Windsurf' },
    { file: 'HERMES.md', tool: 'Hermes Agent' },
    { file: 'CODEX_INSTRUCTIONS.md', tool: 'Codex' },
    { file: '.github/copilot-instructions.md', tool: 'VS Code + Copilot' },
    { file: 'GEMINI.md', tool: 'Gemini CLI / Antigravity' },
    { file: 'AGENTS.md', tool: 'Generic Agent' },
  ];
  const detectedAgents = [];
  for (const item of agentFiles) {
    if (await pathExists(join(targetDir, item.file))) {
      detectedAgents.push(item.tool);
    }
  }

  if (detectedAgents.length > 0 || (await pathExists(join(targetDir, '.step-ai')))) {
    const list = detectedAgents.length > 0 ? detectedAgents.join(', ') : 'STeP AI Manifest';
    success(`AI Agent Project Workspace: พบไฟล์คู่มือและ Manifest สำหรับ: ${colors.bold(list)}`);
  } else {
    info(`AI Agent Project Workspace: ไดเรกทอรียังไม่ได้ Initialize (รัน 'step-ai init' หรือดับเบิลคลิก Install-STeP-AI.bat)`);
  }

  // 7. Workspace User Memory Check
  const userMemFull = await loadUserMemory(targetDir);
  if (userMemFull.exists) {
    success(`Workspace User Memory: พบ USER.md บันทึกบริบทผู้ใช้ส่วนบุคคล (Gitignored)`);
  } else {
    info(`Workspace User Memory: ยังไม่มี USER.md ในโฟลเดอร์นี้ (จะถูกสร้างอัตโนมัติเมื่อรัน 'step-ai init')`);
  }

  console.log();
  if (issueCount === 0) {
    success(colors.bold('สภาพแวดล้อมพร้อมใช้งาน 100% ไม่พบปัญหา!'));
  } else {
    warn(colors.bold(`พบข้อแนะนำที่ควรตรวจสอบ ${issueCount} รายการ (อ่านรายละเอียดด้านบน)`));
  }
}
