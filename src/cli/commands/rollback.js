import { resolve } from 'node:path';
import { listSnapshots, restoreSnapshot } from '../../modules/recovery.js';
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
    const result = await restoreSnapshot(dest, targetId);
    console.log();
    success(`Rollback กลับไปยัง Snapshot ${colors.bold(result.snapshotId)} สำเร็จ!`);
    info(`คืนค่าไฟล์ทั้งหมด ${colors.bold(result.restoredFiles.length)} ไฟล์เรียบร้อยแล้ว`);
    console.log(`\nสามารถรัน ${colors.cyan('step-ai status')} เพื่อตรวจสอบสถานะไฟล์ปัจจุบัน\n`);
  } catch (err) {
    error(`Rollback ล้มเหลว: ${err.message}`);
    process.exit(1);
  }
}
