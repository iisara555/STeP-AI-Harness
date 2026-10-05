import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { scrub, explainRuntimeFailure } from './diagnostics';
import type { Connection, ModelOption } from '../src/types';
import type { ProviderAdapter, ProviderContext, TokenCount } from './providers';

const LIMIT = 4_000_000;
const AGENT = 'step-draft';
export const ANTIGRAVITY_DENY = ['read_file', 'write_file', 'read_url', 'execute_url', 'command', 'unsandboxed', 'mcp'].map(
  action => `${action}(*)`,
);

/** Native credentials stay in the OS keyring. Configuration and request state are isolated per invocation. */
export async function antigravityHome(context: Pick<ProviderContext, 'cwd' | 'env' | 'system'>) {
  const base = resolve(context.cwd);
  const home = await mkdtemp(join(base, 'antigravity-'));
  const cwd = join(home, 'workspace');
  const settings = join(home, '.gemini', 'antigravity-cli', 'settings.json');
  const agent = join(home, '.gemini', 'config', 'agents', AGENT, 'agent.md');
  const close = async () => {
    if (dirname(resolve(home)) !== base || !home.startsWith(join(base, 'antigravity-'))) throw new Error('INVALID_RUNTIME_HOME');
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  try {
    await mkdir(cwd, { recursive: true });
    await mkdir(dirname(settings), { recursive: true });
    await mkdir(dirname(agent), { recursive: true });
    // agy skips its background updater when this file was touched in the last 15 minutes. Each run has a fresh home,
    // so without it every message started `agy --bg-updater`, which flashed a console window on Windows.
    // AGY_CLI_DISABLE_AUTO_UPDATE below does not stop that spawn (checked with the Windows 1.2.17 binary).
    await writeFile(join(dirname(settings), 'last_check.timestamp'), '');
    await writeFile(
      settings,
      JSON.stringify({
        toolPermission: 'strict',
        artifactReviewPolicy: 'asks-for-review',
        allowNonWorkspaceAccess: false,
        permissions: { allow: [], ask: [], deny: ANTIGRAVITY_DENY },
      }),
      { mode: 0o600 },
    );
    // Declare only harmless finish and opt out of the built-in tools and prompt sections (excludeDefaultComponents,
    // agy 1.2.1+). Neither narrows the init catalog; the denied permissions and the tool-step stop below enforce it.
    await writeFile(
      agent,
      '---\nname: step-draft\ndescription: STeP governed text generation\ntools: [finish]\nexcludeDefaultComponents: true\nmainAgent: true\nsubagent: false\ncommandExecutionPolicy: off\nmcpServers: []\nskills: []\nplugins: []\n---\n' +
        (context.system || 'Answer the supplied request as a text-only assistant. Do not use tools.'),
      { mode: 0o600 },
    );
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
  const env: NodeJS.ProcessEnv = {
    PATH: context.env.PATH,
    SystemRoot: context.env.SystemRoot,
    WINDIR: context.env.WINDIR,
    TEMP: context.env.TEMP,
    TMP: context.env.TMP,
    HOME: home,
    USERPROFILE: home,
    APPDATA: home,
    LOCALAPPDATA: home,
    // The pinned CLI contains this update switch; STeP never runs its update command.
    AGY_CLI_DISABLE_AUTO_UPDATE: '1',
  };
  return {
    cwd,
    env,
    close,
  };
}

/** One native process, no shell, bounded output and lifetime, with process-tree termination. */
export function runAntigravity(
  executable: string,
  args: string[],
  context: Pick<ProviderContext, 'cwd' | 'env'>,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    holdInput?: boolean;
    line?: (line: string, send: (message: unknown) => void) => void;
  } = {},
): Promise<{ output: string; tail: string[] }> {
  if (!executable) return Promise.reject(new Error('ANTIGRAVITY_RUNTIME_REQUIRED'));
  if (options.signal?.aborted) return Promise.reject(new Error('CANCELLED'));
  const script = /\.[cm]?js$/i.test(executable);
  return new Promise((resolveRun, reject) => {
    const child = spawn(script ? process.execPath : executable, script ? [executable, ...args] : args, {
      cwd: context.cwd,
      env: { ...context.env, ...(script ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
      stdio: 'pipe',
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
    });
    let failed: Error | undefined;
    let settled = false;
    let stopping: Promise<void> | undefined;
    let shutdown: NodeJS.Timeout | undefined;
    let output = '';
    let pending = '';
    const tail: string[] = [];
    const decoder = new StringDecoder('utf8');
    const remember = (value: string) => {
      const clean = scrub(value);
      if (clean) tail.push(clean);
      if (tail.length > 8) tail.shift();
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(shutdown);
      options.signal?.removeEventListener('abort', abort);
      if (error) reject(Object.assign(error, { detail: tail }));
      else resolveRun({ output, tail });
    };
    const fail = (error: Error) => {
      if (failed || settled) return;
      failed = error;
      if (child.pid && child.exitCode === null && child.signalCode === null) {
        if (process.platform === 'win32') {
          stopping = new Promise<void>(done => {
            const kill = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
              windowsHide: true,
              shell: false,
              stdio: 'ignore',
            });
            kill.once('error', () => {
              child.kill();
              done();
            });
            kill.once('close', code => {
              if (code && child.exitCode === null) child.kill();
              done();
            });
          });
        } else {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            child.kill();
          }
        }
      }
      shutdown = setTimeout(() => finish(Object.assign(new Error('RUNTIME_SHUTDOWN_TIMEOUT'), { shutdownIncomplete: true })), 5000);
    };
    const send = (message: unknown) => {
      if (failed || settled || child.stdin.destroyed || child.stdin.writableEnded) throw new Error('RUNTIME_EXITED');
      child.stdin.end(JSON.stringify(message) + '\n');
    };
    const line = (value: string) => {
      if (failed) return;
      try {
        options.line?.(value, send);
      } catch (error) {
        fail(error instanceof Error ? error : new Error('PROVIDER_STREAM_INVALID'));
      }
    };
    const abort = () => fail(new Error('CANCELLED'));
    const timer = setTimeout(() => fail(new Error('PROVIDER_TIMEOUT')), options.timeoutMs ?? 600_000);
    options.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => {
      if (failed) return;
      const text = decoder.write(chunk);
      output += text;
      if (output.length > LIMIT) return fail(new Error('PROVIDER_OUTPUT_LIMIT'));
      pending += text;
      let end: number;
      while ((end = pending.indexOf('\n')) >= 0) {
        const value = pending.slice(0, end).replace(/\r$/, '');
        pending = pending.slice(end + 1);
        if (value.trim()) line(value);
      }
    });
    child.stderr.on('data', chunk => {
      for (const value of String(chunk).split(/\r?\n/)) remember(value);
    });
    child.stdin.on('error', () => fail(new Error('RUNTIME_EXITED')));
    child.once('error', () => fail(new Error('ANTIGRAVITY_RUNTIME_REQUIRED')));
    child.once('close', async code => {
      if (!failed) {
        pending += decoder.end();
        if (pending.trim()) line(pending);
      }
      await stopping;
      finish(failed || (code !== 0 ? new Error(explainRuntimeFailure(tail) || 'RUNTIME_EXITED') : undefined));
    });
    if (!options.holdInput) child.stdin.end();
    if (options.signal?.aborted) abort();
  });
}

// The runtime reports its real working folder, which can differ from ours by an OS link (macOS /var → /private/var).
const canonical = (path: string) => {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
};
const samePath = (a: string, b: string) =>
  process.platform === 'win32' ? canonical(a).toLowerCase() === canonical(b).toLowerCase() : canonical(a) === canonical(b);

export function antigravityUsage(value: any): TokenCount | undefined {
  if (value === undefined) return undefined;
  const { input_tokens: input, output_tokens: output, total_tokens: total } = value || {};
  if (![input, output, total].every(n => Number.isSafeInteger(n) && n >= 0) || total < input + output)
    throw new Error('PROVIDER_STREAM_INVALID');
  return { input, output, total };
}

export class AntigravityAdapter implements ProviderAdapter {
  constructor(private timeoutMs = 600_000) {}
  async run(prompt: string, connection: Connection, context: ProviderContext) {
    if (context.signal.aborted) throw new Error('CANCELLED');
    if (connection.provider !== 'antigravity' || connection.mode !== 'subscription' || context.key) throw new Error('INVALID_CONNECTION');
    if (context.images?.length) throw new Error('VISION_UNAVAILABLE');
    if (context.webSearch) throw new Error('WEB_SEARCH_UNAVAILABLE');
    if (!/^gemini-[\w.-]{1,93}$/.test(connection.model)) throw new Error('MODEL_NOT_AVAILABLE');
    if (context.effort && !['low', 'medium', 'high', 'max'].includes(context.effort)) throw new Error('MODEL_EFFORT_UNAVAILABLE');
    const home = await antigravityHome(context);
    let clean = true;
    let initialized = false;
    let conversation = '';
    let text = '';
    let result: any;
    try {
      await checkAntigravity(connection.executable, home, context.signal);
      const args = [
        '--agent',
        AGENT,
        '--disable-slash-commands',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--print-timeout',
        '9m',
      ];
      if (connection.model) args.push('--model', connection.model);
      if (context.effort) args.push('--effort', context.effort);
      await runAntigravity(connection.executable, args, home, {
        signal: context.signal,
        timeoutMs: this.timeoutMs,
        holdInput: true,
        line: (line, send) => {
          let event: any;
          try {
            event = JSON.parse(line);
          } catch {
            throw new Error('PROVIDER_STREAM_INVALID');
          }
          if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('PROVIDER_STREAM_INVALID');
          if (event.event === 'init') {
            const init = event.init;
            if (
              initialized ||
              !init ||
              typeof init.cwd !== 'string' ||
              !samePath(init.cwd, home.cwd) ||
              init.agent !== AGENT ||
              init.permission_mode !== 'strict'
            )
              throw new Error('ANTIGRAVITY_POLICY_UNCONFIRMED');
            if (init.model !== undefined && init.model !== connection.model) throw new Error('MODEL_NOT_AVAILABLE');
            // The CLI lists its built-in tools in init whatever the agent declares (live-tested 2026-10-05), so the
            // listing is a catalog, not permission. Strict mode, confirmed above, proves the isolated settings that deny
            // every native action were loaded; the workspace is an empty temporary folder; and the first tool step
            // below stops the process. The owner accepted relying on these instead of an empty catalog.
            if (!Array.isArray(init.tools)) throw new Error('ANTIGRAVITY_POLICY_UNCONFIRMED');
            if (typeof event.conversation_id !== 'string' || !event.conversation_id || event.conversation_id.length > 128)
              throw new Error('PROVIDER_STREAM_INVALID');
            initialized = true;
            conversation = event.conversation_id;
            send({ event: 'user', message: { content: prompt } });
          } else if (event.event === 'step_update') {
            const step = event.step_update;
            if (!initialized || result || !step || step.conversation_id !== conversation) throw new Error('PROVIDER_STREAM_INVALID');
            if (step.step_type === 'tool' || step.tool_name !== undefined || step.tool_call !== undefined) throw new Error('TOOL_DENIED');
            if (step.step_type === 'agent_response' && step.text_delta !== undefined) {
              if (typeof step.text_delta !== 'string') throw new Error('PROVIDER_STREAM_INVALID');
              text += step.text_delta;
              context.emit(step.text_delta);
            }
          } else if (event.event === 'result') {
            if (result) throw new Error('PROVIDER_STREAM_INVALID');
            result = event.result;
            if (!result || typeof result.status !== 'string') throw new Error('PROVIDER_STREAM_INVALID');
            const count = antigravityUsage(result.usage);
            if (count) context.onUsage?.(count);
            // Authentication failures may be emitted before init; never copy their raw message.
            if (result.status !== 'SUCCESS') {
              const reason = typeof result.error === 'string' ? scrub(result.error) : '';
              throw new Error(
                explainRuntimeFailure([reason]) ||
                  (['CANCELED', 'INTERRUPTED'].includes(result.status) ? 'CANCELLED' : 'PROVIDER_REQUEST_FAILED'),
              );
            }
            if (!initialized || result.conversation_id !== conversation || result.num_turns !== 1 || typeof result.response !== 'string')
              throw new Error('PROVIDER_STREAM_INVALID');
            if (result.response.length > LIMIT) throw new Error('PROVIDER_OUTPUT_LIMIT');
          } else throw new Error('PROVIDER_STREAM_INVALID');
        },
      });
      if (!result || result.status !== 'SUCCESS') throw new Error('PROVIDER_REQUEST_FAILED');
      if (!result.response.trim()) throw new Error('EMPTY_RESULT');
      if (!result.response.startsWith(text)) throw new Error('PROVIDER_STREAM_INVALID');
      const remaining = result.response.slice(text.length);
      if (remaining) context.emit(remaining);
      return result.response as string;
    } catch (error) {
      clean = !(error as any)?.shutdownIncomplete;
      throw error;
    } finally {
      if (clean) await home.close();
    }
  }
}

export async function checkAntigravity(executable: string, context: Pick<ProviderContext, 'cwd' | 'env'>, signal?: AbortSignal) {
  const { output } = await runAntigravity(executable, ['--version'], context, { timeoutMs: 10_000, signal });
  const version = /^\s*(\d+)\.(\d+)\.(\d+)\s*$/.exec(output);
  if (
    !version ||
    Number(version[1]) < 1 ||
    (Number(version[1]) === 1 && Number(version[2]) < 2) ||
    (Number(version[1]) === 1 && Number(version[2]) === 2 && Number(version[3]) < 14)
  )
    throw new Error('ANTIGRAVITY_UPDATE_REQUIRED');
}

export async function antigravityModels(connection: Connection, context: Pick<ProviderContext, 'cwd' | 'env'>): Promise<ModelOption[]> {
  const home = await antigravityHome(context);
  let clean = true;
  try {
    await checkAntigravity(connection.executable, home);
    const { output } = await runAntigravity(connection.executable, ['models'], home, { timeoutMs: 30_000 });
    const seen = new Set<string>();
    return output.split(/\r?\n/).flatMap(line => {
      const match = /^(gemini-[\w.-]{1,93})\s+(.{1,100})$/.exec(line.trim());
      if (!match || seen.has(match[1]) || seen.size >= 100) return [];
      seen.add(match[1]);
      return [{ id: match[1], label: match[2].trim() }];
    });
  } catch (error) {
    clean = !(error as any)?.shutdownIncomplete;
    throw error;
  } finally {
    if (clean) await home.close();
  }
}
