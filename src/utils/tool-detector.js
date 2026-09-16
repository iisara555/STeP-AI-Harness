import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { pathExists } from './file-ops.js';

/**
 * Detect installed AI tools and editors on the user machine
 * @param {object} [options]
 * @param {string} [options.platform] - Override OS platform for testing ('darwin', 'win32', 'linux')
 * @param {string} [options.home] - Override user home directory for testing
 * @returns {Promise<Array<{ id: string, name: string, installed: boolean }>>}
 */
export async function detectInstalledTools(options = {}) {
  const currentPlatform = options.platform || platform();
  const home = options.home || homedir();
  const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local');

  let codePaths = [];
  let cursorPaths = [];
  let claudePaths = [];

  if (currentPlatform === 'darwin') {
    codePaths = [
      '/Applications/Visual Studio Code.app',
      join(home, 'Applications', 'Visual Studio Code.app'),
      join(home, 'Library', 'Application Support', 'Code'),
      join(home, '.vscode'),
    ];
    cursorPaths = [
      '/Applications/Cursor.app',
      join(home, 'Applications', 'Cursor.app'),
      join(home, 'Library', 'Application Support', 'Cursor'),
      join(home, '.cursor'),
    ];
    claudePaths = [
      '/Applications/Claude.app',
      join(home, 'Applications', 'Claude.app'),
      join(home, 'Library', 'Application Support', 'Claude'),
      join(home, '.claude'),
      join(home, '.claude-code'),
    ];
  } else if (currentPlatform === 'win32') {
    codePaths = [
      join(appData, 'Code'),
      join(home, '.vscode'),
      join(localAppData, 'Programs', 'Microsoft VS Code'),
    ];
    cursorPaths = [
      join(localAppData, 'Programs', 'cursor'),
      join(appData, 'Cursor'),
      join(home, '.cursor'),
    ];
    claudePaths = [
      join(appData, 'Claude'),
      join(home, '.claude'),
      join(localAppData, 'Programs', 'Claude'),
    ];
  } else {
    // Linux and other Unix systems
    codePaths = [
      join(home, '.vscode'),
      join(home, '.config', 'Code'),
      '/usr/share/code',
    ];
    cursorPaths = [
      join(home, '.cursor'),
      join(home, '.config', 'Cursor'),
    ];
    claudePaths = [
      join(home, '.claude'),
      join(home, '.claude-code'),
    ];
  }

  const tools = [];

  // 1. VS Code / Codex
  let codexFound = false;
  for (const p of codePaths) {
    if (await pathExists(p)) {
      codexFound = true;
      break;
    }
  }
  tools.push({
    id: 'codex',
    name: 'OpenAI Codex / VS Code',
    installed: codexFound,
  });

  // 2. Cursor IDE
  let cursorFound = false;
  for (const p of cursorPaths) {
    if (await pathExists(p)) {
      cursorFound = true;
      break;
    }
  }
  tools.push({
    id: 'cursor',
    name: 'Cursor IDE',
    installed: cursorFound,
  });

  // 3. Claude (Desktop / CLI)
  let claudeFound = false;
  for (const p of claudePaths) {
    if (await pathExists(p)) {
      claudeFound = true;
      break;
    }
  }
  tools.push({
    id: 'claude',
    name: 'Claude Desktop / Claude Code',
    installed: claudeFound,
  });

  return tools;
}
