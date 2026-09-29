import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

// Optional handoff to the employee's personal Claude Code. In-app subscription
// chat uses a separate profile (claude-auth.ts); handoff never reads credentials.

function run(command: string, args: string[]) {
  return new Promise<string>(resolve => {
    let out = '';
    const child = spawn(command, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.on('data', chunk => {
      out += chunk;
    });
    child.on('error', () => resolve(''));
    child.on('close', code => resolve(code === 0 ? out : ''));
  });
}

/** Full path of the employee's Claude Code, or null when it is not installed. */
export async function findClaudeCode(): Promise<string | null> {
  const home = homedir();
  if (process.platform === 'win32') {
    const found = (await run('where.exe', ['claude']))
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    const known = [
      join(home, '.local', 'bin', 'claude.exe'),
      join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'npm', 'claude.cmd'),
    ];
    return [...found.filter(path => /\.(exe|cmd)$/i.test(path)), ...known].find(path => existsSync(path)) || null;
  }
  // Apps opened from Finder get a minimal PATH, so ask a login shell and check the usual install locations.
  const found = (await run('/bin/zsh', ['-lc', 'command -v claude'])).trim();
  return (
    [
      found,
      join(home, '.local', 'bin', 'claude'),
      join(home, '.claude', 'local', 'claude'),
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
    ].find(path => path.startsWith('/') && existsSync(path)) || null
  );
}

/** The text the employee pastes into Claude Code; a chosen Skill is referenced by its file. */
export function handoffText(text: string, skill?: { name: string; file: string }) {
  return skill ? `${text}\n\n[STeP] ใช้แนวทางของ Skill "${skill.name}" จากไฟล์ ${skill.file}` : text;
}

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

/** Opens a terminal in `cwd` running Claude Code. Nothing from the request is put on the command line. */
export async function openClaudeCode(claude: string, cwd: string) {
  if (process.platform === 'win32') {
    // Windows paths cannot contain double quotes, so quoting the program path is safe.
    const child = spawn('cmd.exe', ['/d', '/s', '/c', `start "Claude Code" cmd.exe /k "${claude}"`], {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: true,
    });
    child.unref();
    return;
  }
  const script = join(tmpdir(), `step-claude-code-${process.pid}.command`);
  await writeFile(script, `#!/bin/zsh -l\ncd ${shellQuote(cwd)} || exit 1\nexec ${shellQuote(claude)}\n`);
  await chmod(script, 0o700);
  spawn('open', ['-a', 'Terminal', script], { detached: true, stdio: 'ignore' }).unref();
}
