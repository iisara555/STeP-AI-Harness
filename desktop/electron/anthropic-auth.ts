import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type AnthropicContext = { cwd: string; env: NodeJS.ProcessEnv };

// Keep the OAuth profile isolated from personal API keys and unrelated provider
// configuration. The official ant CLI and Claude Agent SDK both honor
// ANTHROPIC_CONFIG_DIR, so STeP never needs to read or persist the token itself.
export function anthropicEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!env.ANTHROPIC_CONFIG_DIR) throw new Error('ANTHROPIC_PROFILE_REQUIRED');
  const keys = [
    'PATH',
    'SystemRoot',
    'WINDIR',
    'TEMP',
    'TMP',
    'HOME',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'ANTHROPIC_CONFIG_DIR',
    'ANTHROPIC_PROFILE',
  ];
  return Object.fromEntries(keys.filter(key => env[key] !== undefined).map(key => [key, env[key]]));
}

function findOnPath(command: string, args: string[]) {
  return new Promise<string>(resolveFound => {
    let output = '';
    const child = spawn(command, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.on('data', chunk => {
      output += chunk.toString();
    });
    child.on('error', () => resolveFound(''));
    child.on('close', code => resolveFound(code === 0 ? output : ''));
  });
}

/** Full path of Anthropic's official `ant` CLI, or null when it is not installed. */
export async function findAnthropicCli(): Promise<string | null> {
  const home = homedir();
  if (process.platform === 'win32') {
    const found = (await findOnPath('where.exe', ['ant']))
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    const known = [
      join(home, '.local', 'bin', 'ant.exe'),
      join(home, 'go', 'bin', 'ant.exe'),
      join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'Microsoft', 'WinGet', 'Links', 'ant.exe'),
    ];
    return [...found.filter(path => /\.exe$/i.test(path)), ...known].find(path => existsSync(path)) || null;
  }

  const shell = process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh';
  const found = (await findOnPath(shell, ['-lc', 'command -v ant'])).trim();
  return (
    [
      found,
      join(home, '.local', 'bin', 'ant'),
      join(home, 'go', 'bin', 'ant'),
      '/opt/homebrew/bin/ant',
      '/usr/local/bin/ant',
      '/usr/bin/ant',
    ].find(path => path.startsWith('/') && existsSync(path)) || null
  );
}

export function antCommand(executable: string, args: string[], env: NodeJS.ProcessEnv) {
  if (!executable || /\.(cmd|bat)$/i.test(executable)) throw new Error('ANTHROPIC_CLI_NOT_FOUND');
  const script = /\.[cm]?js$/i.test(executable);
  return {
    command: script ? process.execPath : executable,
    args: script ? [executable, ...args] : args,
    env: { ...anthropicEnv(env), ...(script ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
  };
}

// Raw stdout can contain an OAuth access token. It never leaves the main
// process and must never be forwarded into diagnostics, IPC, or error text.
export function runAnt(
  executable: string,
  args: string[],
  context: AnthropicContext,
  options: { signal?: AbortSignal; timeout?: number } = {},
): Promise<{ code: number | null; output: string }> {
  if (options.signal?.aborted) return Promise.reject(new Error('CANCELLED'));
  const invocation = antCommand(executable, args, context.env);
  return new Promise((resolveRun, reject) => {
    let output = '',
      settled = false;
    const child = spawn(invocation.command, invocation.args, {
      cwd: context.cwd,
      env: invocation.env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const finish = (error?: string, code: number | null = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      if (error && child.pid && child.exitCode === null) {
        if (process.platform === 'win32') {
          const kill = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          kill.on('error', () => child.kill());
        } else {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            child.kill();
          }
        }
      }
      if (error) reject(new Error(error));
      else resolveRun({ code, output });
    };
    const abort = () => finish('CANCELLED');
    const timer = setTimeout(() => finish('ANTHROPIC_AUTH_TIMEOUT'), options.timeout ?? 20_000);
    options.signal?.addEventListener('abort', abort, { once: true });
    const read = (chunk: Buffer) => {
      if (settled) return;
      output += chunk.toString();
      if (output.length > 128_000) finish('LOGIN_FAILED');
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.on('error', () => finish('ANTHROPIC_CLI_NOT_FOUND'));
    child.on('close', code => finish(undefined, code));
    if (options.signal?.aborted) abort();
  });
}

export async function resolveAnthropicCli(
  context: AnthropicContext,
  discover: () => Promise<string | null> = findAnthropicCli,
): Promise<string> {
  const executable = await discover();
  if (!executable) throw new Error('ANTHROPIC_CLI_NOT_FOUND');
  const result = await runAnt(executable, ['--version'], context);
  const version = /\b(\d+)\.(\d+)\.(\d+)\b/.exec(result.output);
  // Interactive OAuth profiles landed in ant 1.5.0.
  if (result.code !== 0 || !version || Number(version[1]) < 1 || (Number(version[1]) === 1 && Number(version[2]) < 5))
    throw new Error('ANTHROPIC_CLI_UPDATE_REQUIRED');
  return executable;
}

export async function anthropicStatus(executable: string, context: AnthropicContext, signal?: AbortSignal) {
  const result = await runAnt(executable, ['auth', 'print-credentials', '--access-token'], context, { signal, timeout: 30_000 });
  // The command refreshes an expiring token before printing it. Never return it.
  return result.code === 0 && /sk-ant-oat[\w-]{12,}/.test(result.output);
}

export async function anthropicLogin(
  executable: string,
  context: AnthropicContext,
  deps: { progress: (text: string) => void },
  signal: AbortSignal,
) {
  if (await anthropicStatus(executable, context, signal)) return;
  deps.progress('กำลังเปิด Claude Console เพื่อลงชื่อเข้าใช้…');
  try {
    const result = await runAnt(executable, ['auth', 'login'], context, { signal, timeout: 300_000 });
    if (result.code !== 0) throw new Error('LOGIN_FAILED');
    if (!(await anthropicStatus(executable, context, signal))) throw new Error('LOGIN_REQUIRED');
  } catch (error) {
    if (error instanceof Error && error.message === 'ANTHROPIC_AUTH_TIMEOUT') throw new Error('LOGIN_TIMEOUT');
    throw error;
  }
}

export async function anthropicLogout(executable: string, context: AnthropicContext) {
  const result = await runAnt(executable, ['auth', 'logout'], context, { timeout: 30_000 });
  if (result.code !== 0) throw new Error('ANTHROPIC_LOGOUT_FAILED');
}
