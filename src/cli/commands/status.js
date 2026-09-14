import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { inspectWorkspace } from '../../modules/manifest.js';
import { listSnapshots } from '../../modules/recovery.js';
import { header, info, warn, table } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';
import { PACKAGE_ROOT } from '../../modules/role-resolver.js';

export async function runStatus(args) {
  header('Installation & File Integrity Status');

  const dest = resolve(process.cwd(), args.dest || args.d || '.');
  const inspection = await inspectWorkspace(dest);

  if (!inspection.manifest) {
    warn(`ไม่พบไฟล์ติดตั้งใน: ${dest}`);
    console.log(`\nหากต้องการติดตั้ง Skill สำหรับโปรเจกต์นี้ ให้รัน:\n  ${colors.cyan('step-ai init --role <role> --tool codex')}\n`);
    return;
  }

  const { manifest, clean, modified, missing } = inspection;
  const pkgJson = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf-8'));

  const versionStatus = manifest.version === pkgJson.version
    ? colors.green(`${manifest.version} (Up-to-date)`)
    : colors.yellow(`${manifest.version} (CLI package is ${pkgJson.version}, run 'step-ai sync' to update)`);

  console.log(`${colors.bold('ข้อมูลการติดตั้ง:')}`);
  console.log(`  Package:           ${colors.cyan(manifest.package)}`);
  console.log(`  Role:              ${colors.bold(manifest.role)}`);
  console.log(`  Tool:              ${manifest.tool}`);
  console.log(`  Installed Version: ${versionStatus}`);
  console.log(`  Installed At:      ${manifest.installedAt}`);
  console.log();

  const totalFiles = Object.keys(manifest.files || {}).length;
  console.log(`${colors.bold('สรุปสถานะไฟล์ (' + totalFiles + ' ไฟล์):')}`);
  console.log(`  ${colors.green('✔')} สมบูรณ์ตรงตามระบบ (Clean):      ${clean.length}`);
  console.log(`  ${colors.yellow('⚠')} มีการแก้ไขในเครื่อง (Modified):  ${modified.length}`);
  console.log(`  ${colors.red('✖')} ไฟล์สูญหาย (Missing):            ${missing.length}`);
  console.log();

  if (modified.length > 0 || missing.length > 0) {
    const detailRows = [];
    for (const file of modified) {
      detailRows.push([file, colors.yellow('Modified'), 'การแก้ไขในเครื่องจะไม่ถูกเขียนทับ']);
    }
    for (const file of missing) {
      detailRows.push([file, colors.red('Missing'), 'รัน sync เพื่อดึงไฟล์กลับมา']);
    }
    table(['ไฟล์ที่มีการเปลี่ยนแปลง', 'สถานะ', 'คำแนะนำ'], detailRows);
    console.log();
  }

  const snapshots = await listSnapshots(dest);
  if (snapshots.length > 0) {
    console.log(`${colors.bold('ประวัติ Backup Snapshots:')} ${snapshots.length} รายการ (ใช้ ${colors.cyan('step-ai rollback')} เพื่อย้อนกลับ)`);
  }
}
