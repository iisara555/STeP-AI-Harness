import { mkdir, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { calculateFileSha256 } from '../utils/checksum.js';
import { ensureDir, listFilesRecursive, pathExists, safeCopyFile } from '../utils/file-ops.js';
import { inspectWorkspace, readManifest, writeManifest, getStepAiDir } from './manifest.js';
import { createSnapshot, restoreSnapshot, prepareSnapshotRestore } from './recovery.js';
import { safeWorkspacePath, validateRelativePath, validateBackupId } from '../utils/workspace-path.js';

export const DISTRIBUTION_DIRS = ['bin', 'src', 'install', 'manifest', 'skills', 'rules', 'docs'];
export const DISTRIBUTION_FILES = [
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'step-ai',
  'step-ai.cmd',
  'SUPPORT.md',
  'START-HERE.md',
  'MAC-START-HERE.txt',
  'START-PROMPT.txt',
  'culture.md',
  '.env.example',
  'Install-STeP-AI.bat',
  'Update-STeP-AI.bat',
  'Feedback-STeP-AI.bat',
  'Install-STeP-AI.command',
  'Update-STeP-AI.command',
  'Feedback-STeP-AI.command',
  'Check-Privacy-STeP-AI.bat',
  'Check-Privacy-STeP-AI.command',
];

function isDistributionPath(relPath) {
  const normalized = String(relPath || '').replace(/\\/g, '/');
  return DISTRIBUTION_FILES.includes(normalized)
    || DISTRIBUTION_DIRS.some((dirName) => normalized.startsWith(`${dirName}/`));
}

export function parseVersion(value) {
  const match = String(value || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) throw new Error(`Invalid semantic version: ${value}`);
  return match.slice(1).map(Number);
}

export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (left[i] > right[i]) return 1;
    if (left[i] < right[i]) return -1;
  }
  return 0;
}

async function readPackageVersion(rootDir) {
  const pkg = JSON.parse(await readFile(join(rootDir, 'package.json'), 'utf-8'));
  return pkg.version;
}

async function distributionRelativeFiles(rootDir) {
  const files = [];

  for (const name of DISTRIBUTION_FILES) {
    if (await pathExists(join(rootDir, name))) files.push(name);
  }

  for (const dirName of DISTRIBUTION_DIRS) {
    const dirPath = join(rootDir, dirName);
    if (!(await pathExists(dirPath))) continue;
    const relFiles = await listFilesRecursive(dirPath);
    files.push(...relFiles.map((rel) => `${dirName}/${rel}`));
  }

  return [...new Set(files)].sort();
}

async function backupDistribution(destDir, relativeFiles, backupId, snapshotId, currentVersion, targetVersion) {
  const backupRoot = join(getStepAiDir(destDir), 'version-backups', backupId);
  const filesRoot = join(backupRoot, 'files');
  const createdPaths = [];
  let backedUp = 0;

  await ensureDir(filesRoot);

  for (const relPath of relativeFiles) {
    const existing = join(destDir, relPath);
    if (await pathExists(existing)) {
      await safeCopyFile(existing, join(filesRoot, relPath));
      backedUp++;
    } else {
      createdPaths.push(relPath);
    }
  }

  await writeFile(
    join(backupRoot, 'version-backup.json'),
    JSON.stringify({ backupId, snapshotId, currentVersion, targetVersion, createdAt: new Date().toISOString(), backedUp, createdPaths }, null, 2),
    'utf-8'
  );

  return { backupRoot, filesRoot, createdPaths, backedUp };
}

async function restoreDistribution(destDir, backup) {
  if (!backup) return;
  await safeWorkspacePath(destDir, relative(destDir, backup.filesRoot).replace(/\\/g, '/'));
  const backupFiles = await listFilesRecursive(backup.filesRoot);
  if (!Array.isArray(backup.createdPaths)) throw new Error('Invalid created paths');
  // Validate the complete operation, including deletion targets, before copying.
  for (const relPath of [...backupFiles, ...backup.createdPaths]) {
    validateRelativePath(relPath);
    if (!isDistributionPath(relPath)) throw new Error('Backup contains a non-distribution path');
    await safeWorkspacePath(destDir, relPath);
  }
  for (const relPath of backupFiles) await safeWorkspacePath(backup.filesRoot, relPath);
  for (const relPath of backupFiles) {
    await safeCopyFile(join(backup.filesRoot, relPath), join(destDir, relPath));
  }

  for (const relPath of backup.createdPaths || []) {
    await rm(join(destDir, relPath), { force: true });
  }
}

async function refreshManifestHashes(destDir, preservedPaths, relativeFiles, sourceVersion, removedPaths) {
  const manifest = await readManifest(destDir);
  if (!manifest?.files) return;

  const sourcePaths = new Set(relativeFiles);
  const removed = new Set(removedPaths);
  const nextFiles = {};

  for (const [relPath, entry] of Object.entries(manifest.files)) {
    if (removed.has(relPath)) continue;
    if (!sourcePaths.has(relPath) || preservedPaths.has(relPath)) {
      nextFiles[relPath] = entry;
    }
  }

  for (const relPath of sourcePaths) {
    if (preservedPaths.has(relPath) && nextFiles[relPath]) continue;
    const target = join(destDir, relPath);
    if (!(await pathExists(target))) continue;

    const fileStat = await stat(target);
    nextFiles[relPath] = {
      sha256: await calculateFileSha256(target),
      size: fileStat.size,
    };
  }

  await writeManifest(destDir, {
    ...manifest,
    version: sourceVersion,
    files: nextFiles,
    upgradePreparedAt: new Date().toISOString(),
  });
}

export async function applyDistributionUpgrade({
  sourceDir,
  destDir,
  targetVersion,
} = {}) {
  if (!sourceDir || !destDir) throw new Error('sourceDir and destDir are required');
  await safeWorkspacePath(destDir, '.step-ai/manifest.json');
  const preflightFiles = await distributionRelativeFiles(sourceDir);
  for (const relPath of preflightFiles) {
    await safeWorkspacePath(sourceDir, relPath);
    await safeWorkspacePath(destDir, relPath);
  }
  const preflightManifest = await readManifest(destDir);
  for (const relPath of Object.keys(preflightManifest?.files || {})) await safeWorkspacePath(destDir, relPath);
  await safeWorkspacePath(destDir, '.step-ai/version-backups');

  const sourceVersion = await readPackageVersion(sourceDir);
  const currentVersion = await readPackageVersion(destDir);
  const desiredVersion = targetVersion || sourceVersion;

  if (sourceVersion !== desiredVersion) {
    throw new Error(`Release package version mismatch: expected ${desiredVersion}, found ${sourceVersion}`);
  }
  if (compareVersions(sourceVersion, currentVersion) <= 0) {
    throw new Error(`Upgrade requires a newer version (current ${currentVersion}, source ${sourceVersion})`);
  }

  const inspection = await inspectWorkspace(destDir);
  if (!inspection.manifest) {
    throw new Error('Current workspace manifest not found. Run the installer before using version upgrade.');
  }

  const preservedPaths = new Set(inspection.modified || []);
  const snapshotId = await createSnapshot(destDir, `pre-version-upgrade-v${sourceVersion}`);
  const relativeFiles = await distributionRelativeFiles(sourceDir);
  const sourcePaths = new Set(relativeFiles);
  const removedPaths = Object.keys(inspection.manifest.files || {})
    .filter((relPath) => isDistributionPath(relPath)
      && !sourcePaths.has(relPath)
      && !preservedPaths.has(relPath));

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const backupId = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-v${currentVersion}-${randomUUID()}`;
  const backupPaths = [...new Set([...relativeFiles, ...removedPaths])].sort();
  const backup = await backupDistribution(destDir, backupPaths, backupId, snapshotId, currentVersion, sourceVersion);
  // Link the employee-visible snapshot to its complete runtime backup before
  // changing any distribution files. Legacy snapshots remain readable.
  const snapshotMetaPath = join(getStepAiDir(destDir), 'backups', snapshotId, 'snapshot.json');
  const snapshotMeta = JSON.parse(await readFile(snapshotMetaPath, 'utf-8'));
  await writeFile(snapshotMetaPath, JSON.stringify({ ...snapshotMeta, versionBackupId: backupId, targetVersion: sourceVersion }, null, 2), 'utf-8');

  let copied = 0;
  try {
    for (const relPath of relativeFiles) {
      if (preservedPaths.has(relPath)) continue;
      await safeCopyFile(join(sourceDir, relPath), join(destDir, relPath));
      copied++;
    }

    for (const relPath of removedPaths) {
      await rm(join(destDir, relPath), { force: true });
    }

    await refreshManifestHashes(destDir, preservedPaths, relativeFiles, sourceVersion, removedPaths);

    return {
      currentVersion,
      targetVersion: sourceVersion,
      snapshotId,
      versionBackupId: backupId,
      copied,
      removed: removedPaths.length,
      preserved: [...preservedPaths].sort(),
    };
  } catch (error) {
    await restoreDistribution(destDir, backup);
    if (snapshotId) {
      try {
        await restoreSnapshot(destDir, snapshotId);
      } catch {
        // Keep original upgrade error as the primary failure.
      }
    }
    throw error;
  }
}

export async function rollbackDistributionUpgrade(destDir, versionBackupId, snapshotId) {
  validateBackupId(versionBackupId);
  const backupRoot = await safeWorkspacePath(destDir, `.step-ai/version-backups/${versionBackupId}`);
  const metaPath = await safeWorkspacePath(destDir, `.step-ai/version-backups/${versionBackupId}/version-backup.json`);
  if (!(await pathExists(metaPath))) {
    throw new Error(`Version backup not found: ${versionBackupId}`);
  }

  const meta = JSON.parse(await readFile(metaPath, 'utf-8'));
  if (snapshotId) await prepareSnapshotRestore(destDir, snapshotId);
  await restoreDistribution(destDir, {
    filesRoot: join(backupRoot, 'files'),
    createdPaths: meta.createdPaths || [],
  });

  if (snapshotId) return restoreSnapshot(destDir, snapshotId);
}
