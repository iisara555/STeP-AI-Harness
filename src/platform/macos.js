import { homedir, arch } from 'node:os';
import { join } from 'node:path';
import { pathExists } from '../utils/file-ops.js';

/**
 * Get macOS CPU architecture description
 * @param {string} [overrideArch]
 * @returns {string}
 */
export function getMacCpuArch(overrideArch) {
  const a = overrideArch || arch();
  if (a === 'arm64') {
    return 'Apple Silicon (arm64)';
  }
  if (a === 'x64' || a === 'x86_64') {
    return 'Intel Mac (x86_64)';
  }
  return a;
}

/**
 * Detect installed AI tools on macOS
 * @param {object} [options]
 * @param {string} [options.home]
 * @returns {Promise<Array<{ id: string, name: string, installed: boolean }>>}
 */
export async function detectMacTools(options = {}) {
  const home = options.home || homedir();

  const codePaths = [
    '/Applications/Visual Studio Code.app',
    join(home, 'Applications', 'Visual Studio Code.app'),
    join(home, 'Library', 'Application Support', 'Code'),
    join(home, '.vscode'),
  ];

  const cursorPaths = [
    '/Applications/Cursor.app',
    join(home, 'Applications', 'Cursor.app'),
    join(home, 'Library', 'Application Support', 'Cursor'),
    join(home, '.cursor'),
  ];

  const claudePaths = [
    '/Applications/Claude.app',
    join(home, 'Applications', 'Claude.app'),
    join(home, 'Library', 'Application Support', 'Claude'),
    join(home, '.claude'),
    join(home, '.claude-code'),
  ];

  let codexFound = false;
  for (const p of codePaths) {
    if (await pathExists(p)) {
      codexFound = true;
      break;
    }
  }

  let cursorFound = false;
  for (const p of cursorPaths) {
    if (await pathExists(p)) {
      cursorFound = true;
      break;
    }
  }

  let claudeFound = false;
  for (const p of claudePaths) {
    if (await pathExists(p)) {
      claudeFound = true;
      break;
    }
  }

  return [
    { id: 'codex', name: 'OpenAI Codex / VS Code', installed: codexFound },
    { id: 'cursor', name: 'Cursor IDE', installed: cursorFound },
    { id: 'claude', name: 'Claude Desktop / Claude Code', installed: claudeFound },
  ];
}
