import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, mkdir, open, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export const USER_CONFIG_DIR = join(homedir(), '.step-ai');
export const USER_CONFIG_PATH = join(USER_CONFIG_DIR, 'config.json');

/**
 * Load user configuration from ~/.step-ai/config.json
 * @returns {Promise<Record<string, any>>}
 */
export async function loadUserConfig() {
  try {
    return JSON.parse(await readFile(USER_CONFIG_PATH, 'utf-8'));
  } catch {
    // If parsing fails or corrupted, return empty config safely
  }
  return {};
}

/**
 * Save updates to ~/.step-ai/config.json
 * @param {Record<string, any>} updates
 * @returns {Promise<Record<string, any>>}
 */
export async function saveUserConfig(updates) {
  await mkdir(USER_CONFIG_DIR, { recursive: true, mode: 0o700 });
  const lockPath = USER_CONFIG_PATH + '.lock';
  const deadline = Date.now() + 5000;
  let lock;
  // The read/merge/write is one transaction, including other CLI processes.
  // Never remove another writer's lock, even after a timeout or crash.
  while (!lock) {
    try {
      lock = await open(lockPath, 'wx', 0o600);
    } catch (error) {
      // Windows reports EPERM/EACCES while another writer's lock is still being deleted (delete pending): also busy.
      const busy = error.code === 'EEXIST' || (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code));
      if (!busy) throw error;
      if (Date.now() >= deadline) throw error.code === 'EEXIST' ? new Error('USER_CONFIG_BUSY') : error;
      await delay(25);
    }
  }
  const temporary = USER_CONFIG_PATH + '.' + randomUUID() + '.tmp';
  try {
    const merged = { ...await loadUserConfig(), ...updates, updatedAt: new Date().toISOString() };
    await writeFile(temporary, JSON.stringify(merged, null, 2), { flag: 'wx', mode: 0o600 });
    // Windows readers or scanners can briefly prevent replacement. Keep the owned lock and old file intact.
    const replacementDeadline = Date.now() + 3000;
    for (;;) {
      try {
        await rename(temporary, USER_CONFIG_PATH);
        break;
      } catch (error) {
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || Date.now() >= replacementDeadline) throw error;
        await delay(25);
      }
    }
    return merged;
  } finally {
    try {
      await rm(temporary, { force: true });
    } finally {
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }
}

/**
 * Get current primary team ID from user configuration
 * @returns {Promise<string|null>}
 */
export async function getUserTeam() {
  const cfg = await loadUserConfig();
  return cfg.team || null;
}

/**
 * Get current routing cluster ID from user configuration.
 * Cluster can be known even when the employee has not selected a team yet.
 * @returns {Promise<string|null>}
 */
export async function getUserCluster() {
  const cfg = await loadUserConfig();
  return cfg.cluster || null;
}

/**
 * Get configured AI tools from user configuration
 * @returns {Promise<string[]>}
 */
export async function getUserTools() {
  const cfg = await loadUserConfig();
  if (Array.isArray(cfg.tools)) return cfg.tools;
  if (cfg.tool) return [cfg.tool];
  return [];
}
