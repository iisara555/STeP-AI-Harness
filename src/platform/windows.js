import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathExists } from '../utils/file-ops.js';

/**
 * Detect installed AI tools on Windows
 * @param {object} [options]
 * @param {string} [options.home]
 * @returns {Promise<Array<{ id: string, name: string, installed: boolean }>>}
 */
export async function detectWindowsTools(options = {}) {
  const home = options.home || homedir();
  const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local');

  const codePaths = [
    join(appData, 'Code'),
    join(home, '.vscode'),
    join(localAppData, 'Programs', 'Microsoft VS Code'),
  ];
  const cursorPaths = [
    join(localAppData, 'Programs', 'cursor'),
    join(appData, 'Cursor'),
    join(home, '.cursor'),
  ];
  const claudePaths = [
    join(appData, 'Claude'),
    join(home, '.claude'),
    join(localAppData, 'Programs', 'Claude'),
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
