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
 * @returns {Promise<Array<{ id: string, name: string, installed: boolean }>>}
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

export { detectWindowsTools, detectMacTools, getMacCpuArch };
