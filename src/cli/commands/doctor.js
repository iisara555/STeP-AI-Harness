import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, access, constants } from 'node:fs/promises';
import { header, success, warn, error, info } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';
import { pathExists } from '../../utils/file-ops.js';
import { PACKAGE_ROOT } from '../../modules/role-resolver.js';

export async function runDoctor(args) {
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

  // 2. npm Private Registry Auth Check
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
  } else {
    warn(`GitHub Packages Registry Auth: ยังไม่พบการตั้งค่าใน ~/.npmrc`);
    info(`แนวทางตั้งค่าสำหรับพนักงาน:`);
    console.log(colors.dim(`    echo @step-cmu:registry=https://npm.pkg.github.com >> ~/.npmrc`));
    console.log(colors.dim(`    echo //npm.pkg.github.com/:_authToken=YOUR_GITHUB_PAT >> ~/.npmrc`));
    console.log(colors.dim(`    (Token ต้องมีสิทธิ์ read:packages ใน GitHub ขององค์กร)\n`));
    issueCount++;
  }

  // 3. Workspace Write Permission
  const targetDir = process.cwd();
  try {
    await access(targetDir, constants.W_OK);
    success(`Workspace Write Permission: เขียนไฟล์ในไดเรกทอรีปัจจุบันได้ (${targetDir})`);
  } catch {
    error(`Workspace Write Permission: ไม่มีสิทธิ์เขียนไฟล์ใน ${targetDir}`);
    issueCount++;
  }

  // 4. Package Integrity Check
  const rolesPath = join(PACKAGE_ROOT, 'manifest', 'roles.yaml');
  const skillsPath = join(PACKAGE_ROOT, 'skills');
  if ((await pathExists(rolesPath)) && (await pathExists(skillsPath))) {
    success(`Package Integrity: แหล่งไฟล์ Approved Skills และ Role Manifest สมบูรณ์`);
  } else {
    error(`Package Integrity: ไม่พบโฟลเดอร์ skills หรือ roles.yaml ในตัวแพ็กเกจ`);
    issueCount++;
  }

  // 5. AI Agent Workspace Check
  const agentFiles = [
    { file: 'CLAUDE.md', tool: 'Claude' },
    { file: '.cursorrules', tool: 'Cursor' },
    { file: 'CODEX_INSTRUCTIONS.md', tool: 'Codex' },
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
    info(`AI Agent Project Workspace: ไดเรกทอรียังไม่ได้ Initialize (รัน 'step-ai init --role <role> --tool <claude|cursor|codex|all>')`);
  }

  console.log();
  if (issueCount === 0) {
    success(colors.bold('สภาพแวดล้อมพร้อมใช้งาน 100% ไม่พบปัญหา!'));
  } else {
    warn(colors.bold(`พบข้อแนะนำที่ควรตรวจสอบ ${issueCount} รายการ (อ่านรายละเอียดด้านบน)`));
  }
}
