import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { findClaudeCode } from './handoff';
import { explainRuntimeFailure } from './diagnostics';

export type ClaudeContext = { cwd: string; env: NodeJS.ProcessEnv };

// An allowlist is intentional: ambient API keys, proxies to other providers, and
// personal Claude settings must never override this connection's subscription.
export function claudeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!env.CLAUDE_CONFIG_DIR) throw new Error('CLAUDE_PROFILE_REQUIRED');
  const keys = ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'CLAUDE_CONFIG_DIR'];
  return Object.fromEntries(keys.filter(k => env[k] !== undefined).map(k => [k, env[k]]));
}

export function claudeCommand(executable: string, args: string[], env: NodeJS.ProcessEnv) {
  if (!executable || /\.(cmd|bat)$/i.test(executable)) throw new Error('CLAUDE_CODE_NOT_FOUND');
  const script = /\.[cm]?js$/i.test(executable);
  return {
    command: script ? process.execPath : executable,
    args: script ? [executable, ...args] : args,
    env: { ...claudeEnv(env), ...(script ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
  };
}

// Output stays in this process. In particular, never return raw auth status,
// authorization URLs or terminal output through diagnostics/IPC.
export function runClaude(
  executable: string,
  args: string[],
  context: ClaudeContext,
  options: {
    signal?: AbortSignal;
    timeout?: number;
    onOutput?: (text: string, write: (code: string) => void) => void;
  } = {},
): Promise<{ code: number | null; output: string }> {
  if (options.signal?.aborted) return Promise.reject(new Error('CANCELLED'));
  const invocation = claudeCommand(executable, args, context.env);
  return new Promise((resolveRun, reject) => {
    let output = '',
      settled = false;
    const child = spawn(invocation.command, invocation.args, {
      cwd: context.cwd,
      env: invocation.env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: 'pipe',
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
    const timer = setTimeout(() => finish('CLAUDE_AUTH_TIMEOUT'), options.timeout ?? 15_000);
    options.signal?.addEventListener('abort', abort, { once: true });
    const read = (chunk: Buffer) => {
      if (settled) return;
      output += chunk.toString();
      if (output.length > 128_000) return finish('LOGIN_FAILED');
      options.onOutput?.(output.replace(/\x1b\[[0-9;?<>]*[A-Za-z]/g, ''), code => {
        if (!settled && !child.stdin.destroyed) child.stdin.write(code + '\n');
      });
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.stdin.on('error', () => finish('LOGIN_FAILED'));
    child.on('error', () => finish('CLAUDE_CODE_NOT_FOUND'));
    child.on('close', code => finish(undefined, code));
    if (options.signal?.aborted) abort();
  });
}

export function claudeLauncherExecutable(executable: string | null) {
  if (executable && /\.cmd$/i.test(executable)) {
    const packageRoot = join(dirname(executable), 'node_modules', '@anthropic-ai', 'claude-code');
    executable = [join(packageRoot, 'bin', 'claude.exe'), join(packageRoot, 'cli.js')].find(path => existsSync(path)) || null;
  }
  return executable;
}
export async function resolveClaudeRuntime(context: ClaudeContext, discover = findClaudeCode): Promise<string> {
  const executable = claudeLauncherExecutable(await discover());
  if (!executable) throw new Error('CLAUDE_CODE_NOT_FOUND');
  const result = await runClaude(executable, ['--version'], context);
  const version = /\b(\d+)\.(\d+)\.(\d+)\s+\(Claude Code\)/.exec(result.output);
  // auth status.configDirectory lets us verify that the CLI honors isolation.
  if (
    result.code !== 0 ||
    !version ||
    Number(version[1]) < 2 ||
    (Number(version[1]) === 2 && (Number(version[2]) < 1 || (Number(version[2]) === 1 && Number(version[3]) < 268)))
  )
    throw new Error('CLAUDE_CODE_UPDATE_REQUIRED');
  return executable;
}

export async function claudeStatus(executable: string, context: ClaudeContext, signal?: AbortSignal) {
  const result = await runClaude(executable, ['auth', 'status', '--json'], context, { signal });
  let status: any;
  try {
    status = JSON.parse(result.output);
  } catch {
    throw new Error('CLAUDE_AUTH_STATUS_INVALID');
  }
  if (typeof status.configDirectory !== 'string' || resolve(status.configDirectory) !== resolve(context.env.CLAUDE_CONFIG_DIR!))
    throw new Error('CLAUDE_PROFILE_MISMATCH');
  if (!status.loggedIn && result.code === 1) return false;
  if (result.code !== 0 || status.loggedIn !== true) throw new Error('CLAUDE_AUTH_STATUS_INVALID');
  if (status.authMethod !== 'claude.ai') throw new Error('CLAUDE_SUBSCRIPTION_REQUIRED');
  return true;
}

/** Read only a complete authorization URL emitted by the official CLI, never a model-supplied link. */
export function claudeLoginUrl(output: string) {
  for (const match of output.matchAll(/https:\/\/[^\s<>"\x1b]+(?=\s)/g)) {
    try {
      const url = new URL(match[0]);
      if (
        url.protocol === 'https:' &&
        ['claude.com', 'claude.ai'].includes(url.hostname) &&
        !url.port &&
        !url.username &&
        !url.password &&
        !url.hash &&
        url.pathname === '/oauth/authorize' &&
        url.searchParams.get('response_type') === 'code' &&
        ['client_id', 'state', 'code_challenge', 'redirect_uri'].every(key => !!url.searchParams.get(key))
      )
        return url.href;
    } catch {
      // A malformed or incomplete link must not open a browser.
    }
  }
}

export async function claudeLogin(
  executable: string,
  context: ClaudeContext,
  deps: {
    progress: (text: string) => void;
    askForCode: () => Promise<string | null>;
    dropCode: () => void;
    openExternal?: (url: string) => Promise<void>;
  },
  signal: AbortSignal,
) {
  if (await claudeStatus(executable, context, signal)) return;
  deps.progress('รอลงชื่อบัญชี Claude ในเบราว์เซอร์…');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  let asked = false,
    finished = false,
    opened = false,
    browserFailed = false;
  try {
    if (signal.aborted) controller.abort();
    const result = await runClaude(executable, ['auth', 'login', '--claudeai'], context, {
      signal: controller.signal,
      timeout: 300_000,
      onOutput: (text, write) => {
        // Piped Claude Code may print a link without opening the browser. Keep
        // that link process-only and let the official CLI own OAuth and storage.
        const url = !opened && deps.openExternal ? claudeLoginUrl(text) : undefined;
        if (url) {
          opened = true;
          void Promise.resolve()
            .then(() => {
              if (!finished && !controller.signal.aborted) return deps.openExternal!(url);
            })
            .catch(() => {
              if (finished) return;
              browserFailed = true;
              controller.abort();
            });
        }
        // Only bridge the CLI's optional manual-code prompt.
        if (!asked && /paste.{0,60}code|authorization code:/i.test(text)) {
          asked = true;
          void deps
            .askForCode()
            .then(code => {
              if (finished) return;
              if (code && /^[\w\-/.~%#]+$/.test(code) && code.length <= 4096) write(code);
              else controller.abort();
            })
            .catch(() => controller.abort());
        }
      },
    });
    if (result.code !== 0) throw new Error(explainRuntimeFailure([result.output]) || 'LOGIN_FAILED');
    if (!(await claudeStatus(executable, context, signal))) throw new Error('LOGIN_REQUIRED');
  } catch (error) {
    if (browserFailed && !signal.aborted) throw new Error('LOGIN_BROWSER_FAILED');
    if (error instanceof Error && error.message === 'CLAUDE_AUTH_TIMEOUT') throw new Error('LOGIN_TIMEOUT');
    throw error;
  } finally {
    finished = true;
    signal.removeEventListener('abort', abort);
    deps.dropCode();
  }
}

export async function claudeLogout(executable: string, context: ClaudeContext) {
  // Check the actual directory before letting a runtime revoke a credential.
  // A non-subscription login in this isolated profile must also be removable.
  try {
    await claudeStatus(executable, context);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'CLAUDE_SUBSCRIPTION_REQUIRED') throw error;
  }
  const result = await runClaude(executable, ['auth', 'logout'], context);
  if (result.code !== 0) throw new Error('CLAUDE_LOGOUT_FAILED');
}
