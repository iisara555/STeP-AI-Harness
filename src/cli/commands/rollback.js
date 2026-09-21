import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { listSnapshots, restoreSnapshot } from '../../modules/recovery.js';
import { rollbackDistributionUpgrade } from '../../modules/distribution-upgrade.js';
import { pathExists } from '../../utils/file-ops.js';
import { header, success, info, warn, error, table } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';

export async function runRollback(args) {
  header('Rollback to Previous Snapshot');

  const dest = resolve(process.cwd(), args.dest || args.d || '.');
  const targetId = args.snapshot || args.s;
  const isListOnly = Boolean(args.list || args.l);

  const snapshots = await listSnapshots(dest);

  if (snapshots.length === 0) {
    warn(`ไม่พบประวัติ Backup Snapshot ในไดเรกทอรีนี้ (${dest})`);
    return;
  }

  if (isListOnly) {
    console.log(`${colors.bold('รายการ Backup Snapshots ที่มีอยู่:')}\n`);
    const rows = snapshots.map((s) => [
      s.snapshotId,
      s.createdAt ? new Date(s.createdAt).toLocaleString('th-TH') : '-',
      s.reason || 'manual',
      `v${s.version || '0.1.0'} (${s.role || '-'})`,
    ]);
    table(['Snapshot ID', 'วันที่/เวลา', 'เหตุผลที่บันทึก', 'เวอร์ชัน'], rows);
    console.log(`\nวิธี Rollback ไปยัง Snapshot ที่ต้องการ:\n  ${colors.cyan('step-ai rollback --snapshot <Snapshot ID>')}\n`);
    return;
  }

  try {
    const snapshot = targetId ? snapshots.find((item) => item.snapshotId === targetId) : snapshots[0];
    if (!snapshot) throw new Error(`Snapshot '${targetId}' not found.`);
    const packagePath = join(dest, 'package.json');
    const currentVersion = await pathExists(packagePath)
      ? JSON.parse(await readFile(packagePath, 'utf-8')).version : null;
    if (snapshot.versionBackupId) {
      if (currentVersion !== snapshot.targetVersion) {
        throw new Error('Rollback version upgrades in reverse order. Select the pre-version-upgrade snapshot for the currently installed version.');
      }
    } else if (snapshot.reason?.startsWith('pre-version-upgrade-') || (currentVersion && currentVersion !== snapshot.version)) {
      throw new Error('This snapshot cannot restore the installed runtime version. Use a linked pre-version-upgrade snapshot or a complete workspace backup.');
    }
    const result = snapshot.versionBackupId
      ? await rollbackDistributionUpgrade(dest, snapshot.versionBackupId, snapshot.snapshotId)
      : await restoreSnapshot(dest, snapshot.snapshotId);
    console.log();
    success(`Rollback กลับไปยัง Snapshot ${colors.bold(result.snapshotId)} สำเร็จ!`);
    info(`คืนค่าไฟล์ทั้งหมด ${colors.bold(result.restoredFiles.length)} ไฟล์เรียบร้อยแล้ว`);
    console.log(`\nสามารถรัน ${colors.cyan('step-ai status')} เพื่อตรวจสอบสถานะไฟล์ปัจจุบัน\n`);
  } catch (err) {
    error(`Rollback ล้มเหลว: ${err.message}`);
    throw err;
  }
}
