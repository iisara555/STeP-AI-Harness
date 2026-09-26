import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Pre-approve only the read-only STeP AI commands the instructions tell agents
// to run, so staff are not asked to confirm them on every request. Nothing else
// is approved. Keys come from each tool's own documentation:
// - Gemini CLI: `.gemini/settings.json` → `tools.allowed`, prefix match on
//   `run_shell_command(<command>)`; loaded only after the user trusts the folder.
// - VS Code + Copilot: `.vscode/settings.json` → `chat.tools.terminal.autoApprove`,
//   `/regex/` keys matched per subcommand.
// OpenCode already allows shell commands by default, and Cursor and Antigravity
// keep their allowlists outside the project, so none of them get a file here.

export const STEP_AI_COMMANDS = [
  'sh ./step-ai ask',
  'sh ./step-ai output',
  '.\\step-ai.cmd ask',
  '.\\step-ai.cmd output',
];

const GEMINI_ALLOWED = STEP_AI_COMMANDS.map((command) => `run_shell_command(${command})`);

const VSCODE_AUTO_APPROVE = {
  '/^sh \\.\\/step-ai (ask|output)\\b/': true,
  '/^\\.\\\\step-ai\\.cmd (ask|output)\\b/': true,
};

export const TOOL_PERMISSION_FILES = ['.gemini/settings.json', '.vscode/settings.json'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Returns the merged settings, or null when the existing file cannot be merged
// safely (not JSON, or a key holds an unexpected type). Existing user choices win.
export function mergeGeminiSettings(existing) {
  const settings = isPlainObject(existing) ? structuredClone(existing) : {};
  if (settings.tools !== undefined && !isPlainObject(settings.tools)) return null;
  settings.tools = settings.tools || {};
  if (settings.tools.allowed !== undefined && !Array.isArray(settings.tools.allowed)) return null;
  const allowed = settings.tools.allowed || [];
  for (const entry of GEMINI_ALLOWED) if (!allowed.includes(entry)) allowed.push(entry);
  settings.tools.allowed = allowed;
  return settings;
}

export function mergeVSCodeSettings(existing) {
  const settings = isPlainObject(existing) ? structuredClone(existing) : {};
  const key = 'chat.tools.terminal.autoApprove';
  if (settings[key] !== undefined && !isPlainObject(settings[key])) return null;
  const rules = settings[key] || {};
  for (const [pattern, value] of Object.entries(VSCODE_AUTO_APPROVE)) {
    if (!(pattern in rules)) rules[pattern] = value;
  }
  settings[key] = rules;
  return settings;
}

const MERGERS = {
  '.gemini/settings.json': mergeGeminiSettings,
  '.vscode/settings.json': mergeVSCodeSettings,
};

/**
 * Write or merge the permission files. Never overwrites a file it cannot parse;
 * reports it as skipped so the installer can tell the user.
 */
export async function writeToolPermissions(workspaceDir, dryRun = false) {
  const results = [];
  for (const [relativePath, merge] of Object.entries(MERGERS)) {
    const filePath = join(workspaceDir, relativePath);
    let existing = null;
    let raw = null;
    try {
      raw = await readFile(filePath, 'utf-8');
    } catch { /* missing file: start from an empty object */ }
    if (raw !== null && raw.trim()) {
      try {
        existing = JSON.parse(raw);
      } catch {
        // VS Code settings allow comments (JSONC); leave such files untouched.
        results.push({ relativePath, status: 'skipped-unparseable' });
        continue;
      }
    }
    const merged = merge(existing);
    if (!merged) {
      results.push({ relativePath, status: 'skipped-unexpected-shape' });
      continue;
    }
    const next = `${JSON.stringify(merged, null, 2)}\n`;
    if (next === raw) {
      results.push({ relativePath, status: 'unchanged' });
      continue;
    }
    if (!dryRun) {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, next, 'utf-8');
    }
    results.push({ relativePath, status: raw === null ? 'created' : 'merged' });
  }
  return results;
}
