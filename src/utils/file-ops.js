import { mkdir, readdir, stat, copyFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

/**
 * Check if a file or directory exists
 * @param {string} path 
 * @returns {Promise<boolean>}
 */
export async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure directory exists
 * @param {string} dirPath 
 */
export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

/**
 * Recursively list all files under a directory
 * @param {string} dirPath 
 * @param {string} [basePath]
 * @returns {Promise<string[]>} List of paths relative to dirPath
 */
export async function listFilesRecursive(dirPath, basePath = dirPath) {
  if (!(await pathExists(dirPath))) return [];
  const entries = await readdir(dirPath, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await listFilesRecursive(fullPath, basePath);
      results.push(...subFiles);
    } else if (entry.isFile()) {
      results.push(relative(basePath, fullPath).replace(/\\/g, '/'));
    }
  }

  return results.sort();
}

/**
 * Copy file ensuring parent directory exists
 * @param {string} src 
 * @param {string} dest 
 */
export async function safeCopyFile(src, dest) {
  await ensureDir(dirname(dest));
  await copyFile(src, dest);
}
