import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getStepAiDir, readManifest, writeManifest } from './manifest.js';
import { ensureDir, pathExists, safeCopyFile } from '../utils/file-ops.js';

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
  const manifest = await readManifest(workspaceDir);
  if (!manifest || !manifest.files) return null;

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const snapshotId = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const snapshotDir = join(getBackupsDir(workspaceDir), snapshotId);
  const filesBackupDir = join(snapshotDir, 'files');
  await ensureDir(filesBackupDir);

  let backedUpCount = 0;
  for (const relPath of Object.keys(manifest.files)) {
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
  const backupsDir = getBackupsDir(workspaceDir);
  if (!(await pathExists(backupsDir))) return [];

  const entries = await readdir(backupsDir, { withFileTypes: true });
  const snapshots = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const metaPath = join(backupsDir, entry.name, 'snapshot.json');
      if (await pathExists(metaPath)) {
        try {
          const raw = await readFile(metaPath, 'utf-8');
          snapshots.push(JSON.parse(raw));
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
export async function restoreSnapshot(workspaceDir, targetSnapshotId) {
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

  const snapshotDir = join(getBackupsDir(workspaceDir), snapshot.snapshotId);
  const filesBackupDir = join(snapshotDir, 'files');
  const backupManifestPath = join(snapshotDir, 'manifest.json');

  if (!(await pathExists(backupManifestPath))) {
    throw new Error(`Manifest missing in snapshot ${snapshot.snapshotId}`);
  }

  const manifestData = JSON.parse(await readFile(backupManifestPath, 'utf-8'));
  const restoredFiles = [];

  for (const relPath of Object.keys(manifestData.files || {})) {
    const srcPath = join(filesBackupDir, relPath);
    if (await pathExists(srcPath)) {
      const destPath = join(workspaceDir, relPath);
      await safeCopyFile(srcPath, destPath);
      restoredFiles.push(relPath);
    }
  }

  // Restore manifest
  await writeManifest(workspaceDir, manifestData);

  return { snapshotId: snapshot.snapshotId, restoredFiles };
}
