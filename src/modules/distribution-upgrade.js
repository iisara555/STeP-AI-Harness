import { mkdir, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { calculateFileSha256 } from '../utils/checksum.js';
import { ensureDir, listFilesRecursive, pathExists, safeCopyFile } from '../utils/file-ops.js';
import { inspectWorkspace, readManifest, writeManifest, getStepAiDir } from './manifest.js';
import { createSnapshot, restoreSnapshot } from './recovery.js';

export const DISTRIBUTION_DIRS = ['bin', 'src', 'install', 'manifest', 'skills', 'rules', 'docs'];
export const DISTRIBUTION_FILES = [
  'package.json',
  'README.md',
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
];

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

async function backupDistribution(destDir, relativeFiles, backupId) {
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
    JSON.stringify({ backupId, createdAt: new Date().toISOString(), backedUp, createdPaths }, null, 2),
    'utf-8'
  );

  return { backupRoot, filesRoot, createdPaths, backedUp };
}

async function restoreDistribution(destDir, backup) {
  if (!backup) return;
  const backupFiles = await listFilesRecursive(backup.filesRoot);

  for (const relPath of backupFiles) {
    await safeCopyFile(join(backup.filesRoot, relPath), join(destDir, relPath));
  }

  for (const relPath of backup.createdPaths || []) {
    await rm(join(destDir, relPath), { force: true });
  }
}

async function refreshManifestHashes(destDir, preservedPaths) {
  const manifest = await readManifest(destDir);
  if (!manifest?.files) return;

  const nextFiles = { ...manifest.files };
  for (const relPath of Object.keys(nextFiles)) {
    if (preservedPaths.has(relPath)) continue;
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

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const backupId = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-v${currentVersion}`;
  const backup = await backupDistribution(destDir, relativeFiles, backupId);

  let copied = 0;
  try {
    for (const relPath of relativeFiles) {
      if (preservedPaths.has(relPath)) continue;
      await safeCopyFile(join(sourceDir, relPath), join(destDir, relPath));
      copied++;
    }

    await refreshManifestHashes(destDir, preservedPaths);

    return {
      currentVersion,
      targetVersion: sourceVersion,
      snapshotId,
      versionBackupId: backupId,
      copied,
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
  const backupRoot = join(getStepAiDir(destDir), 'version-backups', versionBackupId);
  const metaPath = join(backupRoot, 'version-backup.json');
  if (!(await pathExists(metaPath))) {
    throw new Error(`Version backup not found: ${versionBackupId}`);
  }

  const meta = JSON.parse(await readFile(metaPath, 'utf-8'));
  await restoreDistribution(destDir, {
    filesRoot: join(backupRoot, 'files'),
    createdPaths: meta.createdPaths || [],
  });

  if (snapshotId) await restoreSnapshot(destDir, snapshotId);
}
