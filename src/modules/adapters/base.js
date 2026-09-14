import { writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { safeCopyFile } from '../../utils/file-ops.js';
import { calculateFileSha256 } from '../../utils/checksum.js';

/**
 * Copy all resolved role files into workspace
 * @param {string} workspaceDir 
 * @param {Array<{relativePath: string, sourcePath: string, type: string}>} files 
 * @param {boolean} dryRun 
 * @returns {Promise<Array<{relativePath: string, sha256: string, size: number}>>}
 */
export async function copyRoleFiles(workspaceDir, files, dryRun = false) {
  const installedFiles = [];

  for (const f of files) {
    if (dryRun) {
      installedFiles.push({
        relativePath: f.relativePath,
        sha256: '(dry-run)',
        size: 0,
      });
      continue;
    }

    const destPath = join(workspaceDir, f.relativePath);
    await safeCopyFile(f.sourcePath, destPath);
    const hash = await calculateFileSha256(destPath);
    const fileStat = await stat(destPath);
    installedFiles.push({
      relativePath: f.relativePath,
      sha256: hash,
      size: fileStat.size,
    });
  }

  return installedFiles;
}

/**
 * Write an instruction file and calculate its hash
 * @param {string} workspaceDir 
 * @param {string} filename 
 * @param {string} content 
 * @param {boolean} dryRun 
 * @returns {Promise<{relativePath: string, sha256: string, size: number}>}
 */
export async function writeInstructionFile(workspaceDir, filename, content, dryRun = false) {
  if (dryRun) {
    return {
      relativePath: filename,
      sha256: '(dry-run)',
      size: Buffer.byteLength(content, 'utf-8'),
    };
  }

  const filePath = join(workspaceDir, filename);
  await writeFile(filePath, content, 'utf-8');
  const hash = await calculateFileSha256(filePath);
  const fileStat = await stat(filePath);

  return {
    relativePath: filename,
    sha256: hash,
    size: fileStat.size,
  };
}
