import { getAvailableRoles, resolveRoleFiles, getAvailableTeams, resolveTeamFiles } from '../../modules/role-resolver.js';
import { getAdapter, isToolSupported, getSupportedTools } from '../../modules/adapters/index.js';
import { writeManifest, readManifest, inspectWorkspace } from '../../modules/manifest.js';
import { createSnapshot } from '../../modules/recovery.js';
import { header, success, info, warn, error, table } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';
import { PACKAGE_ROOT } from '../../modules/role-resolver.js';
import { saveUserConfig, getUserTeam } from '../../utils/user-config.js';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import readline from 'node:readline';

export async function runInit(args) {
  header('Initialize Approved Skills for Workspace');

  const rawRoleId = args.role || args.r;
  let roleId = rawRoleId ? rawRoleId.toLowerCase() : null;
  let teamCode = args.team || args.m;
  let tool = (args.tool || args.t || 'codex').toLowerCase();
  const dest = resolve(process.cwd(), args.dest || args.d || '.');
  const isDryRun = Boolean(args['dry-run']);

  const roles = await getAvailableRoles();
  const teams = await getAvailableTeams();

  const savedTeam = await getUserTeam();
  if (!roleId && !teamCode && savedTeam && (!process.stdin.isTTY || process.env.CI)) {
    teamCode = savedTeam;
  }

  // Interactive selection if invoked without arguments in a TTY terminal
  if (!roleId && !teamCode && process.stdin.isTTY && !process.env.CI) {
    info('ยินดีต้อนรับสู่ระบบติดตั้ง STeP AI Approved Skills สำหรับพนักงาน');
    console.log(colors.bold('\nกรุณาเลือกทีมของคุณจากรายชื่อ 22 ทีมด้านล่าง:\n'));

    teams.forEach((t, idx) => {
      const num = String(idx + 1).padStart(2, ' ');
      console.log(`  ${colors.cyan(num + '.')} [${colors.bold(t.id.padEnd(9))}] ${t.name} (${colors.dim(t.clusterName)})`);
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const teamAnswer = await new Promise((res) => {
      const prompt = savedTeam
        ? `\nพิมพ์หมายเลขทีมของคุณ (1-22) [default: ${savedTeam}]: `
        : '\nพิมพ์หมายเลขทีมของคุณ (1-22) หรือกด Enter สำหรับ Universal Access (All Skills): ';
      rl.question(colors.bold(colors.green(prompt)), (ans) => {
        res(ans.trim());
      });
    });

    let chosenTeamCode = null;
    if (!teamAnswer && savedTeam) {
      chosenTeamCode = savedTeam;
    } else if (teamAnswer) {
      const teamIdx = parseInt(teamAnswer, 10) - 1;
      if (teamIdx >= 0 && teamIdx < teams.length) {
        chosenTeamCode = teams[teamIdx].id;
      }
    }

    if (chosenTeamCode) {
      teamCode = chosenTeamCode;
      const tObj = teams.find((t) => t.id.toLowerCase() === teamCode.toLowerCase());
      success(`เลือกทีม: ${tObj ? tObj.name : teamCode} (${teamCode.toUpperCase()})`);

      console.log('\nเลือกเครื่องมือ AI ที่ต้องการใช้งาน:');
      console.log('  1. Claude (Claude Code / Claude Desktop)');
      console.log('  2. Cursor IDE (.cursorrules)');
      console.log('  3. OpenAI Codex (CODEX_INSTRUCTIONS.md)');
      console.log('  4. ทั้งหมด (All: Claude + Cursor + Codex + Generic)');

      const toolAnswer = await new Promise((res) => {
        rl.question(colors.bold(colors.green('พิมพ์หมายเลขเครื่องมือ (1-4) [default: 1]: ')), (ans) => {
          rl.close();
          res(ans.trim() || '1');
        });
      });

      const toolMap = { '1': 'claude', '2': 'cursor', '3': 'codex', '4': 'all' };
      tool = toolMap[toolAnswer] || 'claude';
    } else {
      rl.close();
    }
  }

  // Fallback to Universal Access ('all') if still unassigned
  if (!roleId && !teamCode) {
    roleId = 'all';
    info(`โหมดการใช้งาน: ${colors.bold('Universal Access')} (ติดตั้งทุก Skill ให้ทุกคนเข้าถึงได้ ค่าเริ่มต้น role: 'all')`);
  }

  if (!isToolSupported(tool)) {
    error(`เครื่องมือ '${tool}' ไม่ถูกต้อง (เครื่องมือที่รองรับ: ${getSupportedTools().join(', ')})`);
    process.exit(1);
  }

  const adapter = getAdapter(tool);

  let resolved;
  let targetType = 'role';
  let targetEntity;
  try {
    if (teamCode) {
      targetType = 'team';
      const teamResolved = await resolveTeamFiles(teamCode);
      const t = teamResolved.team;
      targetEntity = {
        id: t.id,
        description: `${t.name} (${t.nameEn}) [${t.clusterName}]`,
        skills: t.skills,
        isTeam: true,
        clusterName: t.clusterName,
        clusterRouter: t.clusterRouter,
      };
      resolved = { role: targetEntity, files: teamResolved.files };
    } else {
      resolved = await resolveRoleFiles(roleId);
      targetEntity = resolved.role;
    }
  } catch (err) {
    error(err.message);
    process.exit(1);
  }

  const { role, files } = resolved;
  const pkgJson = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf-8'));

  const label = targetType === 'team' ? 'ทีม (Team):         ' : 'บทบาท (Role):       ';
  info(`${label}${colors.bold(role.id)} (${role.description})`);
  info(`เครื่องมือ (Tool):    ${colors.bold(tool)}`);
  info(`ไดเรกทอรีปลายทาง:   ${colors.bold(dest)}`);
  info(`เวอร์ชันแพ็กเกจ:    ${colors.bold(pkgJson.version)}`);
  console.log();

  // Preview table
  const previewRows = files.map((f) => [
    f.relativePath,
    f.type.toUpperCase(),
    'Ready',
  ]);

  const instructions = adapter.getInstructionFiles(role, files);
  for (const inst of instructions) {
    previewRows.push([inst.filename, 'SYSTEM', 'Generate']);
  }

  table(['ไฟล์ที่จะติดตั้ง', 'ประเภท', 'สถานะ'], previewRows);
  console.log(`\nรวมทั้งหมด ${colors.bold(previewRows.length)} ไฟล์`);

  if (isDryRun) {
    console.log();
    info(colors.yellow('โหมด Dry-run: แสดงรายการไฟล์เท่านั้น ยังไม่มีการเขียนไฟล์ลงในเครื่อง'));
    return;
  }

  // Check existing workspace
  const existingManifest = await readManifest(dest);
  if (existingManifest) {
    warn(`พบการติดตั้งเดิม (Role: ${existingManifest.role}, Tool: ${existingManifest.tool || 'codex'}, Version: ${existingManifest.version})`);
    const inspection = await inspectWorkspace(dest);
    if (inspection.modified.length > 0) {
      info(`พบไฟล์ที่มีการแก้ไข ${inspection.modified.length} ไฟล์ กำลังสร้าง Backup Snapshot อัตโนมัติ...`);
      const snapId = await createSnapshot(dest, 'pre-init-overwrite');
      if (snapId) {
        success(`สำรองข้อมูลไว้ที่ .step-ai/backups/${snapId}/`);
      }
    }
  }

  // Execute installation
  const result = await adapter.install({
    workspaceDir: dest,
    role,
    files,
    dryRun: false,
  });

  // Build manifest files map
  const manifestFiles = {};
  for (const item of result.installedFiles) {
    manifestFiles[item.relativePath] = {
      sha256: item.sha256,
      size: item.size,
    };
  }

  // Save manifest
  const manifestData = {
    package: pkgJson.name,
    version: pkgJson.version,
    installedAt: new Date().toISOString(),
    role: role.id,
    targetType,
    team: teamCode ? role.id : null,
    tool,
    files: manifestFiles,
  };

  await writeManifest(dest, manifestData);
  if (targetType === 'team' || teamCode) {
    await saveUserConfig({ team: teamCode || role.id, tool });
  }

  console.log();
  const entityLabel = targetType === 'team' ? 'ทีม' : 'Role';
  success(`ติดตั้ง Approved Skills สำหรับ ${entityLabel} ${colors.bold(role.id)} เข้า ${colors.bold(tool)} สำเร็จเรียบร้อย!`);
  info(`บันทึก Checksum ใน ${colors.dim('.step-ai/manifest.json')} สำหรับตรวจสอบและ Rollback`);
  const toolNameDisplay = tool === 'all' ? 'Claude / Cursor / Codex' : tool;
  console.log(`\nขั้นตอนถัดไป:\n  1. เปิดไดเรกทอรีนี้ใน ${toolNameDisplay}\n  2. รัน ${colors.cyan('step-ai status')} เพื่อตรวจสอบสถานะไฟล์ได้ตลอดเวลา\n`);
}
