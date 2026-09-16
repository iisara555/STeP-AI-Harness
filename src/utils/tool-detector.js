import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathExists } from './file-ops.js';

/**
 * Detect installed AI tools and editors on the user machine
 * @returns {Promise<Array<{ id: string, name: string, installed: boolean, path?: string }>>}
 */
export async function detectInstalledTools() {
  const home = homedir();
  const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local');

  const tools = [];

  // 1. VS Code / Codex
  const codePaths = [
    join(appData, 'Code'),
    join(home, '.vscode'),
    join(localAppData, 'Programs', 'Microsoft VS Code'),
  ];
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
  const cursorPaths = [
    join(localAppData, 'Programs', 'cursor'),
    join(appData, 'Cursor'),
    join(home, '.cursor'),
  ];
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
  const claudePaths = [
    join(appData, 'Claude'),
    join(home, '.claude'),
    join(localAppData, 'Programs', 'Claude'),
  ];
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
