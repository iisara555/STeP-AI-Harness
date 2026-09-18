import { resolve } from 'node:path';
import { PACKAGE_ROOT } from '../../modules/role-resolver.js';
import {
  applyDistributionUpgrade,
  rollbackDistributionUpgrade,
} from '../../modules/distribution-upgrade.js';
import { runUpdate } from './update.js';
import { header, info, success, warn, error } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';

export async function runUpgradeApply(args) {
  const dest = resolve(process.cwd(), args.dest || args.d || '.');
  const targetVersion = args.version || args.targetVersion;

  header('STeP AI — Apply Version Upgrade');
  info(`แหล่งอัปเดต: ${colors.dim(PACKAGE_ROOT)}`);
  info(`Workspace:   ${colors.dim(dest)}`);

  let result;
  try {
    result = await applyDistributionUpgrade({
      sourceDir: PACKAGE_ROOT,
      destDir: dest,
      targetVersion,
    });

    info(`อัปเดตตัวระบบ v${result.currentVersion} → v${result.targetVersion}`);
    if (result.preserved.length > 0) {
      warn(`เก็บไฟล์ที่ผู้ใช้แก้เองไว้ ${result.preserved.length} ไฟล์ โดยไม่เขียนทับ`);
    }

    await runUpdate({
      dest,
      'skip-snapshot': true,
      employee: true,
    });

    success(`อัปเดต STeP AI เป็น v${result.targetVersion} สำเร็จ`);
  } catch (err) {
    if (result?.versionBackupId) {
      try {
        await rollbackDistributionUpgrade(dest, result.versionBackupId, result.snapshotId);
        warn('เกิดข้อผิดพลาด ระบบคืนไฟล์จาก Backup รุ่นเดิมแล้ว');
      } catch (rollbackErr) {
        error(`Rollback ไม่สำเร็จ: ${rollbackErr.message}`);
      }
    }
    throw err;
  }
}
