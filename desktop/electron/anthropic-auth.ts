import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
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

/**
 * Full path of Anthropic's official `ant` CLI, or null when it is not installed.
 * `managed` lists copies STeP installed itself; they are checked after the employee's own install.
 */
export async function findAnthropicCli(managed: string[] = []): Promise<string | null> {
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
    return [...found.filter(path => /\.exe$/i.test(path)), ...managed, ...known].find(path => existsSync(path)) || null;
  }

  const shell = process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh';
  const found = (await findOnPath(shell, ['-lc', 'command -v ant'])).trim();
  return (
    [
      found,
      ...managed,
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
  // "ant" is also the name of Apache Ant. Verify the OAuth command surface,
  // not just a version-looking string, before trusting the executable.
  const authHelp = await runAnt(executable, ['auth', '--help'], context);
  const official = authHelp.code === 0 && /\blogin\b/.test(authHelp.output) && /print-credentials/.test(authHelp.output);
  // Interactive OAuth profiles landed in Anthropic ant 1.5.0.
  if (result.code !== 0 || !version || !official || Number(version[1]) < 1 || (Number(version[1]) === 1 && Number(version[2]) < 5))
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

// Anthropic publishes `ant` for Windows only as a GitHub release archive (no installer), so STeP
// installs that exact release for the employee: one pinned version and its published SHA-256.
// https://github.com/anthropics/anthropic-cli/releases/tag/v1.36.0 (MIT licence)
export const ANT_VERSION = '1.36.0';
const ANT_BUILDS: Record<string, { asset: string; sha256: string }> = {
  'win32-x64': {
    asset: `ant_${ANT_VERSION}_windows_amd64.zip`,
    sha256: '8d23af7f718ca6deba10aa81da8214660478b94c6c2006e7659e570ee6011bab',
  },
  'win32-arm64': {
    asset: `ant_${ANT_VERSION}_windows_arm64.zip`,
    sha256: '076ba23210582c3e677c0bd3aabbea418afcc8872cbefa27b622097845b7d2fd',
  },
  'darwin-arm64': {
    asset: `ant_${ANT_VERSION}_macos_arm64.zip`,
    sha256: '57389381f52821fe86b3de69f5842706a391ee5531b3a9afeac3ceb375d3ec76',
  },
  'darwin-x64': {
    asset: `ant_${ANT_VERSION}_macos_amd64.zip`,
    sha256: 'b96eef66169f6be29c67cb2f47cfa46760c3176e24e77f9e5bf92671f0f711f6',
  },
};
export function antComponentSpec(platform = process.platform, arch = process.arch) {
  return ANT_BUILDS[`${platform}-${arch}`] || null;
}
/** Where STeP keeps the `ant` it installed, inside the employee's app data. */
export function antComponentPath(componentDir: string, platform = process.platform) {
  return join(componentDir, platform === 'win32' ? 'ant.exe' : 'ant');
}

async function downloadRelease(url: string, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(5 * 60_000);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout }).catch(() => {
    throw new Error(signal?.aborted ? 'CANCELLED' : 'ANTHROPIC_CLI_DOWNLOAD_FAILED');
  });
  if (!response.ok) throw new Error('ANTHROPIC_CLI_DOWNLOAD_FAILED');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 64 * 1024 * 1024) throw new Error('ANTHROPIC_CLI_DOWNLOAD_FAILED');
  return bytes;
}
// The system bsdtar reads zip archives on Windows 10+ and macOS; no shell is involved.
function extractArchive(archive: string, target: string) {
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : '/usr/bin/tar';
  return new Promise<boolean>(resolveExtract => {
    const child = spawn(tar, ['-xf', archive, '-C', target], { windowsHide: true, shell: false, stdio: 'ignore' });
    child.on('error', () => resolveExtract(false));
    child.on('close', code => resolveExtract(code === 0));
  });
}
async function findBinary(dir: string, name: string, depth = 3): Promise<string | null> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name) return path;
    if (entry.isDirectory() && depth > 0) {
      const found = await findBinary(path, name, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

export type AntInstallDeps = {
  /** Release asset and checksum; tests substitute their own archive. */
  spec?: { asset: string; sha256: string } | null;
  download?: (url: string, signal?: AbortSignal) => Promise<Buffer>;
  extract?: (archive: string, target: string) => Promise<boolean>;
  /** Proves the extracted file is Anthropic's ant with OAuth support before it replaces anything. */
  verify?: (executable: string, context: AnthropicContext) => Promise<unknown>;
};

/**
 * Installs the pinned official `ant` release into `componentDir` and returns its path. Nothing is
 * replaced unless the download matches the published checksum and the binary answers as ant 1.5+.
 */
export async function installAnthropicCli(
  componentDir: string,
  log: (line: string) => void,
  deps: AntInstallDeps = {},
  signal?: AbortSignal,
) {
  const spec = deps.spec === undefined ? antComponentSpec() : deps.spec;
  if (!spec) throw new Error('ANTHROPIC_CLI_UNSUPPORTED');
  const url = `https://github.com/anthropics/anthropic-cli/releases/download/v${ANT_VERSION}/${spec.asset}`;
  const work = await mkdtemp(join(tmpdir(), 'step-ant-'));
  try {
    log(`กำลังดาวน์โหลด ant CLI ${ANT_VERSION} ของ Anthropic (ประมาณ 10 MB)`);
    const bytes = await (deps.download || downloadRelease)(url, signal);
    if (createHash('sha256').update(bytes).digest('hex') !== spec.sha256) throw new Error('ANTHROPIC_CLI_CHECKSUM_FAILED');
    const archive = join(work, spec.asset),
      unpacked = join(work, 'unpacked');
    await writeFile(archive, bytes);
    await mkdir(unpacked);
    log('ตรวจ checksum ผ่านแล้ว กำลังแตกไฟล์');
    if (!(await (deps.extract || extractArchive)(archive, unpacked))) throw new Error('ANTHROPIC_CLI_INSTALL_FAILED');
    const found = await findBinary(unpacked, process.platform === 'win32' ? 'ant.exe' : 'ant');
    if (!found) throw new Error('ANTHROPIC_CLI_INSTALL_FAILED');
    await mkdir(componentDir, { recursive: true });
    const target = antComponentPath(componentDir),
      staged = join(componentDir, process.platform === 'win32' ? 'ant-staged.exe' : 'ant-staged');
    await copyFile(found, staged);
    if (process.platform !== 'win32') await chmod(staged, 0o755);
    const profile = join(work, 'profile');
    await mkdir(profile);
    // Checked in a throwaway profile, so the check never touches a real sign-in.
    const context: AnthropicContext = {
      cwd: work,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        HOME: work,
        USERPROFILE: work,
        APPDATA: work,
        LOCALAPPDATA: work,
        ANTHROPIC_CONFIG_DIR: profile,
      },
    };
    try {
      await (deps.verify || ((executable, ctx) => resolveAnthropicCli(ctx, async () => executable)))(staged, context);
    } catch (error) {
      await rm(staged, { force: true });
      throw new Error(error instanceof Error && error.message === 'CANCELLED' ? 'CANCELLED' : 'ANTHROPIC_CLI_INSTALL_FAILED');
    }
    await rm(target, { force: true });
    await rename(staged, target);
    log('ติดตั้ง ant CLI เรียบร้อย');
    return target;
  } finally {
    await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
