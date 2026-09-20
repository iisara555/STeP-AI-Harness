import { getAvailableRoles, resolveRoleFiles, getAvailableTeams, resolveTeamFiles } from '../../modules/role-resolver.js';
import { getAdapter, isToolSupported, getSupportedTools } from '../../modules/adapters/index.js';
import { writeManifest, readManifest, inspectWorkspace } from '../../modules/manifest.js';
import { createSnapshot } from '../../modules/recovery.js';
import { header, success, info, warn, error, table } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';
import { PACKAGE_ROOT } from '../../modules/role-resolver.js';
import { saveUserConfig, getUserTeam, getUserCluster } from '../../utils/user-config.js';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import readline from 'node:readline';
import { initUserMemory, ensureGitignored, updateUserMemoryProfile } from '../../modules/user-memory.js';
import { initOutputWorkspace } from '../../modules/output-manager.js';
import { selectTeamProfile } from '../team-selection.js';

export async function runInit(args) {
  header('Initialize Approved Skills for Workspace');

  const rawRoleId = args.role || args.r;
  let roleId = rawRoleId ? rawRoleId.toLowerCase() : null;
  let teamCode = args.team || args.m;
  const explicitTool = args.tool || args.t;
  let tool = (explicitTool || 'codex').toLowerCase();
  let selectedClusterId = args.cluster || args.c || '';
  let interactiveProfileSelection = false;
  const dest = resolve(process.cwd(), args.dest || args.d || '.');
  const isDryRun = Boolean(args['dry-run']);

  const roles = await getAvailableRoles();
  const teams = await getAvailableTeams();

  const savedTeam = await getUserTeam();
  const savedCluster = await getUserCluster();
  if (!roleId && !teamCode && savedTeam && (!process.stdin.isTTY || process.env.CI)) {
    teamCode = savedTeam;
  }
  if (!selectedClusterId && savedCluster) selectedClusterId = savedCluster;

  // Installer/interactive selection asks only questions employees can answer.
  // AI tool instructions default to "all"; advanced users can still pass --tool explicitly.
  if (!roleId && !teamCode && process.stdin.isTTY && !process.env.CI) {
    interactiveProfileSelection = true;
    info('ตั้งค่า STeP AI แบบสั้น — ถ้ายังไม่แน่ใจสามารถข้ามและเปลี่ยนภายหลังได้');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const selection = await selectTeamProfile({ teams, rl });
    rl.close();

    if (selection.team) {
      teamCode = selection.team.id;
      selectedClusterId = selection.team.clusterId;
      success(`เลือกทีม: ${selection.team.name} (${selection.team.id.toUpperCase()})`);
    } else {
      info(`ข้ามการเลือกทีมก่อน — เปลี่ยนภายหลังได้ด้วย ${colors.cyan('step-ai config')}`);
    }

    if (!explicitTool) tool = 'all';
    info('เตรียม instruction ให้ AI adapters ที่รองรับทั้งหมดโดยอัตโนมัติ — ไม่ต้องเลือกค่ายตอนติดตั้ง');
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
        name: t.name,
        description: `${t.name} (${t.nameEn})`,
        skills: t.skills,
        isTeam: true,
        clusterId: t.clusterId,
        clusterName: t.clusterName,
        clusterRouter: t.clusterRouter,
        starterPrompts: t.starterPrompts || [],
      };
      selectedClusterId = t.clusterId;
      resolved = { role: targetEntity, files: teamResolved.files };
    } else {
      resolved = await resolveRoleFiles(roleId);
      targetEntity = {
        ...resolved.role,
        selectedCluster: selectedClusterId || '',
      };
      resolved = { ...resolved, role: targetEntity };
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
    cluster: selectedClusterId || null,
    teamDeferred: !teamCode,
    tool,
    files: manifestFiles,
  };

  await writeManifest(dest, manifestData);
  if (targetType === 'team' || teamCode) {
    await saveUserConfig({
      team: teamCode || role.id,
      cluster: selectedClusterId || targetEntity.clusterId || '',
      teamDeferred: false,
      tool,
    });
  } else if (interactiveProfileSelection || selectedClusterId) {
    await saveUserConfig({
      team: '',
      cluster: selectedClusterId || '',
      teamDeferred: true,
      tool,
    });
  }

  // Initialize Workspace-Private User Memory (USER.md) & ensure gitignored
  const memResult = await initUserMemory(dest, {
    team: teamCode || (role.id !== 'all' ? role.id : ''),
    cluster: selectedClusterId || '',
    starterPrompts: targetEntity?.starterPrompts || [],
    role: targetType === 'team'
      ? `บุคลากรทีม ${role.id.toUpperCase()}`
      : (selectedClusterId ? 'บุคลากร STeP — ยังไม่ระบุทีม' : (role.name || role.id)),
  });
  if (memResult.created) {
    info(`สร้างหน่วยความจำเฉพาะตัวใน ${colors.dim('USER.md')} (อยู่ใน .gitignore ไม่มีการเผยแพร่)`);
  } else {
    await updateUserMemoryProfile(dest, {
      team: teamCode || '',
      cluster: selectedClusterId || '',
      starterPrompts: targetEntity?.starterPrompts || [],
    });
  }

  const outputWorkspace = await initOutputWorkspace(dest, teamCode || (targetType === 'team' ? role.id : 'shared'));
  info(`เตรียมโฟลเดอร์เก็บไฟล์งาน: ${colors.dim(outputWorkspace.relativePath + '/')}`);

  console.log();
  const entityLabel = targetType === 'team' ? 'ทีม' : 'Role';
  success(`ติดตั้ง Approved Skills สำหรับ ${entityLabel} ${colors.bold(role.id)} เข้า ${colors.bold(tool)} สำเร็จเรียบร้อย!`);
  info(`บันทึก Checksum ใน ${colors.dim('.step-ai/manifest.json')} สำหรับตรวจสอบและ Rollback`);

  const teamDisplay = teamCode ? String(teamCode).toUpperCase() : 'ยังไม่ระบุ — เลือกภายหลังได้';
  console.log();
  console.log(colors.bold(colors.green('=================================================================')));
  console.log(colors.bold(colors.yellow('                 ✓ STeP AI พร้อมเริ่มงาน')));
  console.log(colors.bold(colors.green('=================================================================')));
  console.log(`  ทีม: ${colors.bold(teamDisplay)}`);
  console.log(`  AI adapters: ${tool === 'all' ? 'เตรียม instruction ให้ 8 โปรแกรมแล้ว' : tool}`);
  console.log(`  เปลี่ยนทีมภายหลัง: ${colors.cyan('step-ai config')}`);
  console.log();
  console.log(colors.bold('วิธีเริ่มใช้งาน:'));
  console.log('  1. เปิดโปรแกรม AI ที่องค์กรอนุมัติ');
  console.log('  2. เปิดโฟลเดอร์นี้ในโปรแกรมนั้น:');
  console.log(`     ${colors.yellow(dest)}`);
  console.log(`  3. พิมพ์: ${colors.bold('เริ่มใช้งาน STeP AI')}`);

  if (teamCode && Array.isArray(targetEntity?.starterPrompts) && targetEntity.starterPrompts.length > 0) {
    console.log();
    console.log(colors.bold(`ลองเริ่มจากงานของทีม ${String(teamCode).toUpperCase()}:`));
    targetEntity.starterPrompts.slice(0, 3).forEach((prompt, idx) => {
      console.log(`  ${idx + 1}. ${prompt}`);
    });
  } else {
    console.log(colors.dim('     ถ้ายังไม่ได้เลือกทีม ให้เริ่มจากงานจริงได้เลย ระบบจะช่วยก่อนแล้วค่อยเสนอทีมที่น่าจะเกี่ยวข้อง'));
  }

  console.log();
  console.log(colors.dim(`ตรวจสถานะภายหลัง: step-ai status`));
  console.log(colors.bold(colors.green('=================================================================')));
}
