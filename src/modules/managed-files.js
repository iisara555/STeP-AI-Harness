import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { calculateFileSha256 } from '../utils/checksum.js';
import { pathExists } from '../utils/file-ops.js';
import { safeWorkspacePath, validateRelativePath } from '../utils/workspace-path.js';

function normalizedPaths(paths = []) {
  return new Set(
    [...paths]
      .map(value => String(value || '').replace(/\\/g, '/'))
      .filter(Boolean)
      .map(validateRelativePath),
  );
}

/**
 * Remove managed files that are no longer part of the target Harness profile.
 *
 * Clean files are deleted. Locally modified stale files are moved out of active
 * Skill/Rule/instruction paths into .step-ai/orphans so user work is preserved
 * without leaving obsolete context visible to AI clients.
 */
export async function reconcileManagedFiles(workspaceDir, manifest, desiredPaths = []) {
  if (!manifest?.files || typeof manifest.files !== 'object') {
    return { removed: [], quarantined: [], orphanRoot: '' };
  }

  const desired = normalizedPaths(desiredPaths);
  const stale = Object.keys(manifest.files)
    .map(path => String(path).replace(/\\/g, '/'))
    .filter(path => !desired.has(path))
    .map(validateRelativePath)
    .sort();

  if (stale.length === 0) return { removed: [], quarantined: [], orphanRoot: '' };

  const batchId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const orphanRoot = `.step-ai/orphans/${batchId}`;
  const removed = [];
  const quarantined = [];

  for (const relPath of stale) {
    if (relPath.split('/')[0].toLowerCase() === '.step-ai') {
      throw new Error('Managed file list cannot reconcile recovery metadata');
    }

    const source = await safeWorkspacePath(workspaceDir, relPath);
    if (!(await pathExists(source))) {
      removed.push(relPath);
      continue;
    }

    const baseline = manifest.files[relPath]?.sha256;
    const current = await calculateFileSha256(source);
    const modified = !baseline || current !== baseline;

    if (!modified) {
      await rm(source, { force: true });
      removed.push(relPath);
      continue;
    }

    const orphanRel = `${orphanRoot}/${relPath}`;
    const orphanPath = await safeWorkspacePath(workspaceDir, orphanRel);
    await mkdir(dirname(orphanPath), { recursive: true });
    await rename(source, orphanPath);
    quarantined.push({ path: relPath, preservedAt: orphanRel });
  }

  return { removed, quarantined, orphanRoot: quarantined.length ? orphanRoot : '' };
}

/** Build the exact managed-file set for one profile before install/update. */
export function desiredManagedPaths(files = [], instructionFiles = []) {
  return [
    ...files.map(file => file.relativePath),
    ...instructionFiles.map(file => file.filename),
  ];
}


async function sameFileContent(path, expected) {
  if (Buffer.isBuffer(expected)) {
    const current = await import('node:fs/promises').then(fs => fs.readFile(path));
    return current.equals(expected);
  }
  const current = await import('node:fs/promises').then(fs => fs.readFile(path, 'utf8'));
  return current === String(expected);
}

/**
 * Detect pre-existing files at paths the Harness wants to own but does not
 * currently own according to the workspace manifest. Identical packaged files
 * may be adopted; different user files must not be overwritten silently.
 */
export async function findUntrackedManagedConflicts(
  workspaceDir,
  manifest,
  files = [],
  instructionFiles = [],
) {
  const tracked = normalizedPaths(Object.keys(manifest?.files || {}));
  const conflicts = [];

  for (const file of files) {
    const relPath = validateRelativePath(String(file.relativePath).replace(/\\/g, '/'));
    if (tracked.has(relPath)) continue;
    const target = await safeWorkspacePath(workspaceDir, relPath);
    if (!(await pathExists(target))) continue;

    // The distribution installer initializes its own root, where source and
    // destination are intentionally the same packaged file.
    if (resolve(file.sourcePath) === resolve(target)) continue;
    const source = await import('node:fs/promises').then(fs => fs.readFile(file.sourcePath));
    if (!(await sameFileContent(target, source))) conflicts.push(relPath);
  }

  for (const file of instructionFiles) {
    const relPath = validateRelativePath(String(file.filename).replace(/\\/g, '/'));
    if (tracked.has(relPath)) continue;
    const target = await safeWorkspacePath(workspaceDir, relPath);
    if (!(await pathExists(target))) continue;
    if (!(await sameFileContent(target, file.content))) conflicts.push(relPath);
  }

  return [...new Set(conflicts)].sort();
}
