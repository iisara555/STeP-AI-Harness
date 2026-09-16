import { detectTools } from '../platform/index.js';

/**
 * Detect installed AI tools and editors on the user machine
 * @param {object} [options]
 * @param {string} [options.platform] - Override OS platform for testing ('darwin', 'win32', 'linux')
 * @param {string} [options.home] - Override user home directory for testing
 * @returns {Promise<Array<{ id: string, name: string, installed: boolean }>>}
 */
export async function detectInstalledTools(options = {}) {
  return detectTools(options);
}

export { detectTools };
