import { platform, arch } from 'node:os';
import { detectWindowsTools } from './windows.js';
import { detectMacTools, getMacCpuArch } from './macos.js';

/**
 * Get current platform identifier ('darwin', 'win32', 'linux')
 * @returns {string}
 */
export function getPlatform() {
  return platform();
}

/**
 * Get a friendly human-readable platform description for employee display
 * @param {object} [options]
 * @param {string} [options.platform]
 * @param {string} [options.arch]
 * @returns {string}
 */
export function getPlatformDisplay(options = {}) {
  const p = options.platform || platform();
  const a = options.arch || arch();

  if (p === 'darwin') {
    return `macOS (${getMacCpuArch(a)})`;
  }
  if (p === 'win32') {
    return `Windows (${a})`;
  }
  if (p === 'linux') {
    return `Linux (${a})`;
  }
  return `${p} (${a})`;
}

/**
 * Unified tool detector delegating to platform-specific detection
 * @param {object} [options]
 * @param {string} [options.platform]
 * @param {string} [options.home]
 * @returns {Promise<Array<{
 *   id: string,
 *   name: string,
 *   installed: boolean,
 *   url: string,
 *   description: string,
 *   recommendation: string,
 *   instructionFile: string
 * }>>}
 */
export async function detectTools(options = {}) {
  const p = options.platform || platform();

  if (p === 'darwin') {
    return detectMacTools(options);
  }
  if (p === 'win32') {
    return detectWindowsTools(options);
  }

  return detectWindowsTools(options);
}

/**
 * Get recommendations for AI tools, especially when none are installed
 * @param {object} [options]
 * @returns {Promise<Array<{ id: string, name: string, url: string, description: string, recommendation: string }>>}
 */
export async function getToolRecommendations(options = {}) {
  const tools = await detectTools(options);
  return tools.map((t) => ({
    id: t.id,
    name: t.name,
    url: t.url,
    description: t.description,
    recommendation: t.recommendation,
    installed: t.installed,
  }));
}

export { detectWindowsTools, detectMacTools, getMacCpuArch };

