import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { inspectWorkspace, writeManifest } from '../../modules/manifest.js';
import { resolveRoleFiles, PACKAGE_ROOT } from '../../modules/role-resolver.js';
import { createSnapshot } from '../../modules/recovery.js';
import { safeCopyFile } from '../../utils/file-ops.js';
import { calculateFileSha256 } from '../../utils/checksum.js';
import { header, success, info, warn, error } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';
import { generateCodexInstructions } from '../../modules/adapter-codex.js';

export async function runSync(args) {
  header('Sync & Update Skills to Latest Version');

  const dest = resolve(process.cwd(), args.dest || args.d || '.');
  const inspection = await inspectWorkspace(dest);

  if (!inspection.manifest) {
    warn(`ไม่พบไฟล์ติดตั้งใน: ${dest}`);
    console.log(`\nกรุณาเริ่มด้วยคำสั่ง:\n  ${colors.cyan('step-ai init --role <role> --tool codex')}\n`);
    return;
  }

  const { manifest, clean, modified, missing } = inspection;
  const pkgJson = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf-8'));

  info(`บทบาทปัจจุบัน: ${colors.bold(manifest.role)}`);
  info(`เวอร์ชันติดตั้ง:  ${colors.yellow(manifest.version)} -> เวอร์ชันล่าสุด: ${colors.green(pkgJson.version)}`);

  // Auto snapshot before sync
  const snapshotId = await createSnapshot(dest, `pre-sync-v${pkgJson.version}`);
  if (snapshotId) {
    success(`สร้าง Backup Snapshot อัตโนมัติ: .step-ai/backups/${snapshotId}/`);
  }

  const { role, files } = await resolveRoleFiles(manifest.role);

  let updatedCount = 0;
  let preservedCount = 0;
  const newManifestFiles = { ...manifest.files };

  for (const f of files) {
    const targetPath = join(dest, f.relativePath);
    const isModified = modified.includes(f.relativePath);

    if (isModified) {
      // Preserve user modifications safely
      warn(`คงไฟล์เดิมที่มีการแก้ไข: ${f.relativePath}`);
      preservedCount++;
      // Keep existing hash in manifest
    } else {
      // Safe to update
      await safeCopyFile(f.sourcePath, targetPath);
      const newHash = await calculateFileSha256(targetPath);
      const stat = await (await import('node:fs/promises')).stat(targetPath);
      newManifestFiles[f.relativePath] = {
        sha256: newHash,
        size: stat.size,
      };
      updatedCount++;
    }
  }

  // Update instruction files if not locally modified
  const { getAdapter } = await import('../../modules/adapters/index.js');
  const adapter = getAdapter(manifest.tool || 'codex');
  const instructionFiles = adapter.getInstructionFiles(role, files);

  for (const inst of instructionFiles) {
    const instPath = join(dest, inst.filename);
    if (!modified.includes(inst.filename)) {
      await (await import('node:fs/promises')).writeFile(instPath, inst.content, 'utf-8');
      const hash = await calculateFileSha256(instPath);
      const stat = await (await import('node:fs/promises')).stat(instPath);
      newManifestFiles[inst.filename] = { sha256: hash, size: stat.size };
    }
  }

  // Update manifest data
  const updatedManifest = {
    ...manifest,
    version: pkgJson.version,
    updatedAt: new Date().toISOString(),
    files: newManifestFiles,
  };

  await writeManifest(dest, updatedManifest);

  console.log();
  success(`ซิงก์อัปเดตเสร็จสมบูรณ์!`);
  console.log(`  - อัปเดตไฟล์เป็นรุ่นล่าสุด: ${colors.bold(updatedCount)} ไฟล์`);
  if (preservedCount > 0) {
    console.log(`  - คงไฟล์ที่มีการแก้ไขในเครื่องไว้: ${colors.bold(preservedCount)} ไฟล์ (ปลอดภัย ไม่ถูกเขียนทับ)`);
  }
}
