import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathExists } from './file-ops.js';

export const USER_CONFIG_DIR = join(homedir(), '.step-ai');
export const USER_CONFIG_PATH = join(USER_CONFIG_DIR, 'config.json');

/**
 * Load user configuration from ~/.step-ai/config.json
 * @returns {Promise<Record<string, any>>}
 */
export async function loadUserConfig() {
  try {
    if (await pathExists(USER_CONFIG_PATH)) {
      const text = await readFile(USER_CONFIG_PATH, 'utf-8');
      return JSON.parse(text);
    }
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
  const current = await loadUserConfig();
  const merged = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await mkdir(USER_CONFIG_DIR, { recursive: true });
  await writeFile(USER_CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
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
