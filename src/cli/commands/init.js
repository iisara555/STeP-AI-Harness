import { resolve } from 'node:path';
import { getAvailableRoles, resolveRoleFiles } from '../../modules/role-resolver.js';
import { getAdapter, isToolSupported, getSupportedTools } from '../../modules/adapters/index.js';
import { writeManifest, readManifest, inspectWorkspace } from '../../modules/manifest.js';
import { createSnapshot } from '../../modules/recovery.js';
import { header, success, info, warn, error, table } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';
import { PACKAGE_ROOT } from '../../modules/role-resolver.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function runInit(args) {
  header('Initialize Approved Skills for Workspace');

  const roleId = args.role || args.r;
  const tool = (args.tool || args.t || 'codex').toLowerCase();
  const dest = resolve(process.cwd(), args.dest || args.d || '.');
  const isDryRun = Boolean(args['dry-run']);

  const roles = await getAvailableRoles();

  if (!roleId) {
    warn('กรุณาระบุ Role ที่ต้องการติดตั้ง');
    console.log(`\nRole ที่รองรับในระบบ:`);
    for (const r of roles) {
      console.log(`  - ${colors.bold(r.id.padEnd(12))}: ${r.description}`);
    }
    console.log(`\nเครื่องมือที่รองรับ (--tool): ${colors.cyan(getSupportedTools().join(', '))}`);
    console.log(`\nตัวอย่างคำสั่ง:\n  step-ai init --role pm --tool claude\n  step-ai init --role developer --tool cursor\n  step-ai init --role pm --tool all\n`);
    process.exit(1);
  }

  if (!isToolSupported(tool)) {
    error(`เครื่องมือ '${tool}' ไม่ถูกต้อง (เครื่องมือที่รองรับ: ${getSupportedTools().join(', ')})`);
    process.exit(1);
  }

  const adapter = getAdapter(tool);

  let resolved;
  try {
    resolved = await resolveRoleFiles(roleId);
  } catch (err) {
    error(err.message);
    process.exit(1);
  }

  const { role, files } = resolved;
  const pkgJson = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf-8'));

  info(`บทบาท (Role):       ${colors.bold(role.id)} (${role.description})`);
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
    tool,
    files: manifestFiles,
  };

  await writeManifest(dest, manifestData);

  console.log();
  success(`ติดตั้ง Approved Skills สำหรับ Role ${colors.bold(role.id)} เข้า ${colors.bold(tool)} สำเร็จเรียบร้อย!`);
  info(`บันทึก Checksum ใน ${colors.dim('.step-ai/manifest.json')} สำหรับตรวจสอบและ Rollback`);
  const toolNameDisplay = tool === 'all' ? 'Claude / Cursor / Codex' : tool;
  console.log(`\nขั้นตอนถัดไป:\n  1. เปิดไดเรกทอรีนี้ใน ${toolNameDisplay}\n  2. รัน ${colors.cyan('step-ai status')} เพื่อตรวจสอบสถานะไฟล์ได้ตลอดเวลา\n`);
}
