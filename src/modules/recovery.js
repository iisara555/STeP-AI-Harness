import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getStepAiDir, readManifest, writeManifest } from './manifest.js';
import { ensureDir, pathExists, safeCopyFile } from '../utils/file-ops.js';
import { safeWorkspacePath, validateRelativePath, validateBackupId } from '../utils/workspace-path.js';

export const BACKUPS_DIRNAME = 'backups';

export function getBackupsDir(workspaceDir) {
  return join(getStepAiDir(workspaceDir), BACKUPS_DIRNAME);
}

/**
 * Create a timestamped snapshot of current workspace files
 * @param {string} workspaceDir 
 * @param {string} reason 
 * @returns {Promise<string|null>} Snapshot ID if created, null if nothing to backup
 */
export async function createSnapshot(workspaceDir, reason = 'manual') {
  await safeWorkspacePath(workspaceDir, '.step-ai/manifest.json');
  const manifest = await readManifest(workspaceDir);
  if (!manifest || !manifest.files) return null;

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const snapshotId = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${String(now.getMilliseconds()).padStart(3, '0')}-${randomUUID()}`;

  const snapshotDir = await safeWorkspacePath(workspaceDir, `.step-ai/backups/${snapshotId}`);
  const filesBackupDir = join(snapshotDir, 'files');
  const paths = Object.keys(manifest.files).map(validateRelativePath);
  for (const relPath of paths) {
    if (relPath.split('/')[0].toLowerCase() === '.step-ai') throw new Error('Snapshot cannot include recovery metadata');
    await safeWorkspacePath(workspaceDir, relPath);
    await safeWorkspacePath(workspaceDir, `.step-ai/backups/${snapshotId}/files/${relPath}`);
  }
  await ensureDir(filesBackupDir);

  let backedUpCount = 0;
  for (const relPath of paths) {
    const srcPath = join(workspaceDir, relPath);
    if (await pathExists(srcPath)) {
      const destPath = join(filesBackupDir, relPath);
      await safeCopyFile(srcPath, destPath);
      backedUpCount++;
    }
  }

  const meta = {
    snapshotId,
    createdAt: now.toISOString(),
    reason,
    backedUpFilesCount: backedUpCount,
    version: manifest.version,
    role: manifest.role,
  };

  await writeFile(join(snapshotDir, 'snapshot.json'), JSON.stringify(meta, null, 2), 'utf-8');
  await writeFile(join(snapshotDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  return snapshotId;
}

/**
 * List all available snapshots for a workspace
 * @param {string} workspaceDir 
 * @returns {Promise<Array<{snapshotId: string, createdAt: string, reason: string, version: string, role: string}>>}
 */
export async function listSnapshots(workspaceDir) {
  const backupsDir = await safeWorkspacePath(workspaceDir, '.step-ai/backups');
  if (!(await pathExists(backupsDir))) return [];

  const entries = await readdir(backupsDir, { withFileTypes: true });
  const snapshots = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      validateBackupId(entry.name);
      const metaPath = await safeWorkspacePath(workspaceDir, `.step-ai/backups/${entry.name}/snapshot.json`);
      if (await pathExists(metaPath)) {
        try {
          const raw = await readFile(metaPath, 'utf-8');
          snapshots.push({ ...JSON.parse(raw), snapshotId: entry.name });
        } catch {
          // ignore corrupted snapshot metadata
        }
      }
    }
  }

  return snapshots.sort((a, b) => b.snapshotId.localeCompare(a.snapshotId));
}

/**
 * Rollback workspace to a specific snapshot
 * @param {string} workspaceDir 
 * @param {string} [targetSnapshotId] - Rollback to latest if omitted
 * @returns {Promise<{snapshotId: string, restoredFiles: string[]}>}
 */
export async function prepareSnapshotRestore(workspaceDir, targetSnapshotId) {
  if (targetSnapshotId) validateBackupId(targetSnapshotId);
  const snapshots = await listSnapshots(workspaceDir);
  if (snapshots.length === 0) {
    throw new Error('No backup snapshots found to rollback.');
  }

  const snapshot = targetSnapshotId
    ? snapshots.find((s) => s.snapshotId === targetSnapshotId)
    : snapshots[0];

  if (!snapshot) {
    throw new Error(`Snapshot '${targetSnapshotId}' not found.`);
  }

  await safeWorkspacePath(workspaceDir, `.step-ai/backups/${snapshot.snapshotId}/files`);
  const backupManifestPath = await safeWorkspacePath(workspaceDir, `.step-ai/backups/${snapshot.snapshotId}/manifest.json`);

  if (!(await pathExists(backupManifestPath))) {
    throw new Error(`Manifest missing in snapshot ${snapshot.snapshotId}`);
  }

  const manifestData = JSON.parse(await readFile(backupManifestPath, 'utf-8'));
  if (!manifestData.files || typeof manifestData.files !== 'object' || Array.isArray(manifestData.files)) throw new Error('Invalid snapshot manifest');
  const copies = [];
  await safeWorkspacePath(workspaceDir, '.step-ai/manifest.json');
  for (const relPath of Object.keys(manifestData.files)) {
    validateRelativePath(relPath);
    if (relPath.split('/')[0].toLowerCase() === '.step-ai') throw new Error('Snapshot cannot overwrite recovery metadata');
    const srcPath = await safeWorkspacePath(workspaceDir, `.step-ai/backups/${snapshot.snapshotId}/files/${relPath}`);
    const destPath = await safeWorkspacePath(workspaceDir, relPath);
    if (await pathExists(srcPath)) copies.push({ srcPath, destPath, relPath });
  }
  return { snapshot, manifestData, copies };
}

export async function restoreSnapshot(workspaceDir, targetSnapshotId) {
  const { snapshot, manifestData, copies } = await prepareSnapshotRestore(workspaceDir, targetSnapshotId);
  const restoredFiles = [];
  for (const { srcPath, destPath, relPath } of copies) {
    await safeCopyFile(srcPath, destPath);
    restoredFiles.push(relPath);
  }

  // Restore manifest
  await writeManifest(workspaceDir, manifestData);

  return { snapshotId: snapshot.snapshotId, restoredFiles };
}
