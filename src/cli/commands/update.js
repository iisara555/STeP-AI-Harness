import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { PACKAGE_ROOT } from '../../modules/role-resolver.js';
import { loadUserConfig } from '../../utils/user-config.js';
import { inspectWorkspace, writeManifest } from '../../modules/manifest.js';
import { resolveRoleFiles, resolveTeamFiles } from '../../modules/role-resolver.js';
import { createSnapshot } from '../../modules/recovery.js';
import { safeCopyFile } from '../../utils/file-ops.js';
import { calculateFileSha256 } from '../../utils/checksum.js';
import { getAdapter } from '../../modules/adapters/index.js';
import { header, success, info, warn, error } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';
import { runDoctor } from './doctor.js';
import { initOutputWorkspace } from '../../modules/output-manager.js';
import { desiredManagedPaths, reconcileManagedFiles } from '../../modules/managed-files.js';
import { safeWorkspacePath } from '../../utils/workspace-path.js';

export async function runUpdate(args) {
  header('STeP AI — One-Click Update & Skill Sync');

  const dest = resolve(process.cwd(), args.dest || args.d || '.');
  const userCfg = await loadUserConfig();
  const pkgJson = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf-8'));

  info(`ตรวจสอบความพร้อมแพ็กเกจล่าสุด: ${colors.bold(`v${pkgJson.version}`)}`);

  const inspection = await inspectWorkspace(dest);
  if (!inspection.manifest) {
    info(`ยังไม่พบการติดตั้งในโฟลเดอร์นี้: ${colors.dim(dest)}`);
    // Check if user has global config
    const targetTeam = args.team || args.m || userCfg.team;
    const targetTool = args.tool || args.t || userCfg.tool || 'codex';

    if (targetTeam) {
      info(`พบการตั้งค่าทีมหลักของคุณ: ${colors.bold(targetTeam.toUpperCase())} กำลังดำเนินการติดตั้งให้ทันที...`);
      const { runInit } = await import('./init.js');
      await runInit({ team: targetTeam, tool: targetTool, dest });
      return;
    } else {
      warn('กรุณาเริ่มด้วยคำสั่งติดตั้ง: step-ai init หรือดับเบิลคลิก Install-STeP-AI.bat');
      return;
    }
  }

  const { manifest, modified } = inspection;
  info(`ตรวจพบการติดตั้งปัจจุบัน: ${colors.bold(manifest.team ? `ทีม ${manifest.team.toUpperCase()}` : `Role ${manifest.role}`)} (v${manifest.version})`);

  // Snapshot before update
  if (!args['skip-snapshot']) {
    const snapshotId = await createSnapshot(dest, `pre-update-v${pkgJson.version}`);
    if (snapshotId) {
      success(`สร้าง Backup Snapshot อัตโนมัติ: .step-ai/backups/${snapshotId}/`);
    }
  }

  // Resolve files (support both team and role)
  let resolved;
  let targetRole;
  if (manifest.team || manifest.targetType === 'team') {
    const teamCode = manifest.team || manifest.role;
    const teamResolved = await resolveTeamFiles(teamCode);
    const t = teamResolved.team;
    targetRole = {
      id: t.id,
      description: `${t.name} (${t.nameEn}) [${t.clusterName}]`,
      skills: t.skills,
      isTeam: true,
      clusterName: t.clusterName,
      clusterRouter: t.clusterRouter,
    };
    resolved = { role: targetRole, files: teamResolved.files };
  } else {
    resolved = await resolveRoleFiles(manifest.role);
    targetRole = resolved.role;
  }

  const { files } = resolved;
  const adapter = getAdapter(manifest.tool || userCfg.tool || 'codex');
  const instructionFiles = adapter.getInstructionFiles(targetRole, files);
  const reconciled = await reconcileManagedFiles(dest, manifest, desiredManagedPaths(files, instructionFiles), { packageRoot: PACKAGE_ROOT });
  if (reconciled.removed.length) info(`นำไฟล์ที่หมด scope ออกจาก workspace: ${reconciled.removed.length} ไฟล์`);
  if (reconciled.quarantined.length) {
    warn(`ย้ายไฟล์ที่เคยแก้แต่หมด scope ออกจากทางใช้งาน: ${reconciled.quarantined.length} ไฟล์`);
    info(`เก็บสำเนาไว้ที่ ${colors.dim(reconciled.orphanRoot + '/')}`);
  }

  let updatedCount = 0;
  let preservedCount = 0;
  const newManifestFiles = {};

  for (const f of files) {
    const targetPath = await safeWorkspacePath(dest, f.relativePath);
    const isModified = modified.includes(f.relativePath);

    if (isModified) {
      warn(`คงไฟล์เดิมที่มีการแก้ไข: ${f.relativePath}`);
      preservedCount++;
      if (manifest.files?.[f.relativePath]) newManifestFiles[f.relativePath] = manifest.files[f.relativePath];
    } else {
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

  // Update instructions.
  for (const inst of instructionFiles) {
    const instPath = await safeWorkspacePath(dest, inst.filename);
    if (modified.includes(inst.filename)) {
      preservedCount++;
      if (manifest.files?.[inst.filename]) newManifestFiles[inst.filename] = manifest.files[inst.filename];
      continue;
    }
    await (await import('node:fs/promises')).writeFile(instPath, inst.content, 'utf-8');
    const hash = await calculateFileSha256(instPath);
    const stat = await (await import('node:fs/promises')).stat(instPath);
    newManifestFiles[inst.filename] = { sha256: hash, size: stat.size };
  }

  // Write updated manifest
  const updatedManifest = {
    ...manifest,
    version: pkgJson.version,
    updatedAt: new Date().toISOString(),
    files: newManifestFiles,
  };
  await writeManifest(dest, updatedManifest);
  await initOutputWorkspace(dest, manifest.team || (manifest.targetType === 'team' ? manifest.role : 'shared'));

  success(`อัปเดตไฟล์ทักษะและ Router สำเร็จ (${updatedCount} ไฟล์อัปเดต, ${preservedCount} ไฟล์คงเดิม)`);

  // Run doctor summary check
  console.log();
  await runDoctor({ ...args, employee: true });
}
