import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { calculateFileSha256 } from '../utils/checksum.js';
import { ensureDir, pathExists } from '../utils/file-ops.js';

export const MANIFEST_FILENAME = 'manifest.json';
export const STEP_AI_DIR = '.step-ai';

export function getStepAiDir(workspaceDir) {
  return join(workspaceDir, STEP_AI_DIR);
}

export function getManifestPath(workspaceDir) {
  return join(getStepAiDir(workspaceDir), MANIFEST_FILENAME);
}

/**
 * Read the installation manifest from a workspace
 * @param {string} workspaceDir 
 * @returns {Promise<any|null>}
 */
export async function readManifest(workspaceDir) {
  const path = getManifestPath(workspaceDir);
  if (!(await pathExists(path))) return null;
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse manifest at ${path}: ${err.message}`);
  }
}

/**
 * Write or update the installation manifest
 * @param {string} workspaceDir 
 * @param {object} data 
 */
export async function writeManifest(workspaceDir, data) {
  const stepAiDir = getStepAiDir(workspaceDir);
  await ensureDir(stepAiDir);
  const path = getManifestPath(workspaceDir);
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Check the integrity of all files listed in manifest
 * @param {string} workspaceDir 
 * @returns {Promise<{
 *   manifest: any,
 *   clean: string[],
 *   modified: string[],
 *   missing: string[]
 * }>}
 */
export async function inspectWorkspace(workspaceDir) {
  const manifest = await readManifest(workspaceDir);
  if (!manifest) {
    return { manifest: null, clean: [], modified: [], missing: [] };
  }

  const clean = [];
  const modified = [];
  const missing = [];

  for (const [relPath, info] of Object.entries(manifest.files || {})) {
    const fullPath = join(workspaceDir, relPath);
    if (!(await pathExists(fullPath))) {
      missing.push(relPath);
      continue;
    }

    try {
      const currentHash = await calculateFileSha256(fullPath);
      if (currentHash === info.sha256) {
        clean.push(relPath);
      } else {
        modified.push(relPath);
      }
    } catch {
      missing.push(relPath);
    }
  }

  return { manifest, clean, modified, missing };
}
