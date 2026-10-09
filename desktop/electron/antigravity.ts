import { spawn } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { scrub, explainRuntimeFailure } from './diagnostics';
import type { Connection, ModelOption } from '../src/types';
import { providerSessionKey, type ProviderAdapter, type ProviderContext, type ProviderSession, type TokenCount } from './providers';
import { combineUsage } from './usage';
import { strictJsonSchema } from './json-schema';

const LIMIT = 4_000_000;
/** The `--effort` levels agy accepts (`agy --help`, 1.2.17 and 1.3.2). */
export const ANTIGRAVITY_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const AGENT = 'step-draft';
const TEXT_TRANSPORT_RULES = `Native tools are unavailable in this STeP connection, including finish, file access, commands, MCP and native web search. Return the host's requested text format, including JSON when required. If the host supplied tools, request only those tools using fenced step-tool JSON in your text, never native function calls. Do not invent current facts or claim a search was performed. For fresh information without supplied evidence, ask for a source or explain that live search requires a supported connection.`;
const TOOL_RECOVERY_RULES = `The previous attempt was stopped because it requested a native tool. No native tool result is available. Answer the original request in its required text format or use the host's step-tool text protocol if supplied. Do not repeat the native tool call.`;
export const ANTIGRAVITY_DENY = ['read_file', 'write_file', 'read_url', 'execute_url', 'command', 'unsandboxed', 'mcp'].map(
  action => `${action}(*)`,
);

/** The employee's real home, where agy keeps its sign-in. */
function profileHome() {
  try {
    return userInfo().homedir;
  } catch {
    return homedir();
  }
}

const TOKEN_FILE = join('.gemini', 'antigravity-cli', 'antigravity-oauth-token');

/**
 * Lets an isolated run see the sign-in made with the real profile. agy keeps it in the OS keyring, or in a token file
 * under the real home when the keyring is unavailable or timed out. macOS looks for the login keychain under
 * $HOME/Library/Keychains, which the isolated HOME hides, so that one folder is linked back to the real one.
 */
async function shareSignIn(home: string, profile: string, platform: NodeJS.Platform) {
  if (!profile || resolve(profile) === resolve(home)) return;
  try {
    await copyFile(join(profile, TOKEN_FILE), join(home, TOKEN_FILE));
    await chmod(join(home, TOKEN_FILE), 0o600);
  } catch {
    /* No token file: the keyring holds the sign-in. */
  }
  const keychains = join(profile, 'Library', 'Keychains');
  if (platform === 'darwin' && existsSync(keychains)) {
    await mkdir(join(home, 'Library'), { recursive: true });
    await symlink(keychains, join(home, 'Library', 'Keychains')).catch(() => {});
  }
}

/** Native credentials stay in the OS keyring. Configuration and request state are isolated per invocation. */
export async function antigravityHome(
  context: Pick<ProviderContext, 'cwd' | 'env' | 'system'>,
  profile = { home: profileHome(), platform: process.platform },
) {
  const base = resolve(context.cwd);
  const home = await mkdtemp(join(base, 'antigravity-'));
  const cwd = join(home, 'workspace');
  const settings = join(home, '.gemini', 'antigravity-cli', 'settings.json');
  const agent = join(home, '.gemini', 'config', 'agents', AGENT, 'agent.md');
  const close = async () => {
    if (dirname(resolve(home)) !== base || !home.startsWith(join(base, 'antigravity-'))) throw new Error('INVALID_RUNTIME_HOME');
    // Remove the link to the real keychain folder first, so nothing below it can ever be deleted.
    await unlink(join(home, 'Library', 'Keychains')).catch(() => {});
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
    await shareSignIn(home, profile.home, profile.platform);
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
    /** Keep stdin open after each message, for a stream-json conversation that runs one turn per message. */
    keepInput?: boolean;
    /** Receives handles to close stdin (ends a kept conversation) or stop the process tree with an error. */
    control?: (handles: { end: () => void; stop: (error: Error) => void; send: (message: unknown) => void }) => void;
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
      if (options.keepInput) child.stdin.write(JSON.stringify(message) + '\n');
      else child.stdin.end(JSON.stringify(message) + '\n');
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
      // A kept conversation reads its output line by line only; its whole lifetime is not held in memory.
      if (!options.keepInput) output += text;
      if (output.length > LIMIT || pending.length > LIMIT) return fail(new Error('PROVIDER_OUTPUT_LIMIT'));
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
    options.control?.({
      end: () => {
        if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end();
      },
      stop: fail,
      send,
    });
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
  const {
    input_tokens: input,
    output_tokens: output,
    total_tokens: total,
    thinking_tokens: thinking,
    cache_read_tokens: cached,
  } = value || {};
  if (![input, output, total].every(n => Number.isSafeInteger(n) && n >= 0) || total < input + output)
    throw new Error('PROVIDER_STREAM_INVALID');
  const extra = (n: unknown) => {
    if (n === undefined || n === null) return 0;
    if (!Number.isSafeInteger(n) || (n as number) < 0) throw new Error('PROVIDER_STREAM_INVALID');
    return n as number;
  };
  // agy 1.2.x reports thinking and prompt-cache reads apart from input and output. Thinking counts against the plan like
  // output (as Gemini's own thoughtsTokenCount does), and cache reads are a part of the input, as for every other runtime.
  const reasoning = extra(thinking),
    reads = extra(cached);
  const fullInput = reads > input ? input + reads : input,
    fullOutput = output + reasoning;
  return {
    input: fullInput,
    output: fullOutput,
    total: Math.max(total, fullInput + fullOutput),
    ...(reads ? { cachedInput: reads } : {}),
  };
}

/** One agy process kept open across the tool turns of a run: stream-json runs one turn per message on one conversation. */
type AgyConversation = {
  home: Awaited<ReturnType<typeof antigravityHome>>;
  identity: string;
  /** The whole prompt the conversation already holds; a later turn sends only what follows it. */
  sent: string;
  /** Turns answered on this process. */
  turns: number;
  conversation: string;
  /** The last usage the CLI reported, for when it reports conversation totals. */
  usage?: TokenCount;
  handles?: { end: () => void; stop: (error: Error) => void; send: (message: unknown) => void };
  /** Receives the stream events of the turn in progress. */
  handler?: (event: any, send: (message: unknown) => void) => void;
  /** Told when the process ends while a turn waits. */
  onExit?: (error: Error) => void;
  exited: boolean;
  /** Settles once the process has stopped and its isolated home is removed (or kept when shutdown was uncertain). */
  done: Promise<void>;
};

const resettable = (error: unknown) =>
  error instanceof Error && ['RUNTIME_EXITED', 'PROVIDER_STREAM_INVALID', 'PROVIDER_SESSION_INVALID'].includes(error.message);

function parseEvent(line: string) {
  let event: any;
  try {
    event = JSON.parse(line);
  } catch {
    throw new Error('PROVIDER_STREAM_INVALID');
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('PROVIDER_STREAM_INVALID');
  return event;
}

/** The isolated settings and agent must be the ones agy loaded before any request text is written. */
function checkInit(event: any, cwd: string, connection: Connection) {
  const init = event.init;
  if (!init || typeof init.cwd !== 'string' || !samePath(init.cwd, cwd) || init.agent !== AGENT || init.permission_mode !== 'strict')
    throw new Error('ANTIGRAVITY_POLICY_UNCONFIRMED');
  if (init.model !== undefined && init.model !== connection.model) throw new Error('MODEL_NOT_AVAILABLE');
  // The CLI lists its built-in tools in init whatever the agent declares (live-tested 2026-10-05), so the
  // listing is a catalog, not permission. Strict mode, confirmed above, proves the isolated settings that deny
  // every native action were loaded; the workspace is an empty temporary folder; and the first tool step
  // stops the process. The owner accepted relying on these instead of an empty catalog.
  if (!Array.isArray(init.tools)) throw new Error('ANTIGRAVITY_POLICY_UNCONFIRMED');
  if (typeof event.conversation_id !== 'string' || !event.conversation_id || event.conversation_id.length > 128)
    throw new Error('PROVIDER_STREAM_INVALID');
  return event.conversation_id as string;
}

/**
 * Follows one turn's step updates and result. Text is passed on as it arrives; the returned answer is the validated final
 * response. `turns` is how many turns the process answered before this one: a later turn may report either its own
 * number of turns or the conversation's.
 */
function turnReader(
  conversation: () => string,
  turns: number,
  emit: (text: string) => void,
  onUsage: (count: TokenCount, cumulative: boolean) => void,
) {
  let text = '';
  let result: any;
  return {
    get result() {
      return result;
    },
    read(event: any) {
      if (event.event === 'step_update') {
        const step = event.step_update;
        if (!conversation() || result || !step || step.conversation_id !== conversation()) throw new Error('PROVIDER_STREAM_INVALID');
        if (step.step_type === 'tool' || step.tool_name !== undefined || step.tool_call !== undefined) throw new Error('TOOL_DENIED');
        if (step.step_type === 'agent_response' && step.text_delta !== undefined) {
          if (typeof step.text_delta !== 'string') throw new Error('PROVIDER_STREAM_INVALID');
          text += step.text_delta;
          emit(step.text_delta);
        }
        return undefined;
      }
      if (event.event !== 'result' || result) throw new Error('PROVIDER_STREAM_INVALID');
      result = event.result;
      if (!result || typeof result.status !== 'string') throw new Error('PROVIDER_STREAM_INVALID');
      const count = antigravityUsage(result.usage);
      if (count) onUsage(count, turns > 0 && result.num_turns === turns + 1);
      // Authentication failures may be emitted before init; never copy their raw message.
      if (result.status !== 'SUCCESS') {
        const reason = typeof result.error === 'string' ? scrub(result.error) : '';
        throw new Error(
          explainRuntimeFailure([reason]) ||
            (['CANCELED', 'INTERRUPTED'].includes(result.status) ? 'CANCELLED' : 'PROVIDER_REQUEST_FAILED'),
        );
      }
      if (
        !conversation() ||
        result.conversation_id !== conversation() ||
        !(result.num_turns === 1 || (turns > 0 && result.num_turns === turns + 1)) ||
        typeof result.response !== 'string'
      )
        throw new Error('PROVIDER_STREAM_INVALID');
      if (result.response.length > LIMIT) throw new Error('PROVIDER_OUTPUT_LIMIT');
      if (!result.response.trim()) throw new Error('EMPTY_RESULT');
      if (!result.response.startsWith(text)) throw new Error('PROVIDER_STREAM_INVALID');
      const remaining = result.response.slice(text.length);
      if (remaining) emit(remaining);
      return result.response as string;
    },
  };
}

export class AntigravityAdapter implements ProviderAdapter {
  private conversations = new WeakMap<ProviderSession, AgyConversation>();
  constructor(private timeoutMs = 600_000) {}
  async run(prompt: string, connection: Connection, context: ProviderContext) {
    const deadline = Date.now() + this.timeoutMs;
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = AbortSignal.any([context.signal, timeout]);
    for (let attempt = 0; attempt < 2; attempt++) {
      const attemptContext = {
        ...context,
        signal,
        system: [context.system || '', TEXT_TRANSPORT_RULES, ...(attempt ? [TOOL_RECOVERY_RULES] : [])].join('\n\n'),
      };
      // Text is shown as it arrives. An attempt that fails takes its text back first, so the recovery attempt
      // (or the error) never leaves a stopped attempt's prose or tool requests on screen next to the new one.
      let shown = 0;
      const emit = (delta: string) => {
        shown += delta.length;
        context.emit(delta);
      };
      const discard = (chars: number) => {
        shown -= chars;
        context.discard?.(chars);
      };
      let answer: string;
      try {
        // The tool turns of a run continue on one process. A structured request and the recovery attempt run alone.
        answer =
          attempt === 0 && context.session && !context.jsonSchema
            ? await this.conversationTurn(prompt, connection, { ...attemptContext, emit, discard }, deadline)
            : await this.runOnce(prompt, connection, { ...attemptContext, session: undefined, emit }, deadline, attempt === 0);
        if (signal.aborted) throw new Error(context.signal.aborted ? 'CANCELLED' : 'PROVIDER_TIMEOUT');
      } catch (error) {
        if (shown) discard(shown);
        if (timeout.aborted && !context.signal.aborted && !(error as any)?.shutdownIncomplete) throw new Error('PROVIDER_TIMEOUT');
        // A failed attempt has stopped its process and deleted its isolated home first.
        // Never replay quota/auth failures, unconfirmed policy or uncertain shutdown.
        if (
          attempt === 0 &&
          error instanceof Error &&
          error.message === 'TOOL_DENIED' &&
          !signal.aborted &&
          !(error as any)?.shutdownIncomplete
        )
          continue;
        throw error;
      }
      return answer;
    }
    throw new Error('TOOL_DENIED');
  }

  private check(connection: Connection, context: ProviderContext) {
    if (context.signal.aborted) throw new Error('CANCELLED');
    if (connection.provider !== 'antigravity' || connection.mode !== 'subscription' || context.key) throw new Error('INVALID_CONNECTION');
    if (context.images?.length) throw new Error('VISION_UNAVAILABLE');
    if (context.webSearch) throw new Error('WEB_SEARCH_UNAVAILABLE');
    if (!/^gemini-[\w.-]{1,93}$/.test(connection.model)) throw new Error('MODEL_NOT_AVAILABLE');
    if (context.effort && !ANTIGRAVITY_EFFORTS.includes(context.effort)) throw new Error('MODEL_EFFORT_UNAVAILABLE');
  }

  private args(connection: Connection, context: ProviderContext, extra: string[] = []) {
    return [
      '--agent',
      AGENT,
      '--disable-slash-commands',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--print-timeout',
      '9m',
      ...(connection.model ? ['--model', connection.model] : []),
      ...(context.effort ? ['--effort', context.effort] : []),
      ...extra,
    ];
  }

  /** One process, one message, stdin closed after it; success needs a validated result and exit 0. */
  private async runOnce(prompt: string, connection: Connection, context: ProviderContext, deadline: number, useSchema: boolean) {
    this.check(connection, context);
    const home = await antigravityHome(context);
    let clean = true;
    let conversation = '';
    try {
      await checkAntigravity(connection.executable, home, context.signal);
      const extra: string[] = [];
      // agy constrains the final result to this schema (`--json-schema`, 1.2.14+). The recovery attempt goes without it,
      // in case the CLI answers a schema through a tool step, which STeP stops.
      if (useSchema && context.jsonSchema) {
        const file = join(dirname(home.cwd), 'output-schema.json');
        await writeFile(file, JSON.stringify(strictJsonSchema(context.jsonSchema)), { mode: 0o600 });
        extra.push('--json-schema', file);
      }
      const reader = turnReader(
        () => conversation,
        0,
        context.emit,
        count => context.onUsage?.(count),
      );
      let answer = '';
      await runAntigravity(connection.executable, this.args(connection, context, extra), home, {
        signal: context.signal,
        timeoutMs: Math.max(1, deadline - Date.now()),
        holdInput: true,
        line: (line, send) => {
          const event = parseEvent(line);
          if (event.event === 'init') {
            if (conversation) throw new Error('ANTIGRAVITY_POLICY_UNCONFIRMED');
            conversation = checkInit(event, home.cwd, connection);
            send({ event: 'user', message: { content: prompt } });
            return;
          }
          answer = reader.read(event) ?? answer;
        },
      });
      if (!reader.result || reader.result.status !== 'SUCCESS' || !answer) throw new Error('PROVIDER_REQUEST_FAILED');
      return answer;
    } catch (error) {
      clean = !(error as any)?.shutdownIncomplete;
      throw error;
    } finally {
      if (clean) await home.close();
    }
  }

  /** A turn on the run's kept process: the first sends the whole prompt, later ones only the new tool results. */
  private async conversationTurn(prompt: string, connection: Connection, context: ProviderContext, deadline: number) {
    this.check(connection, context);
    const session = context.session!;
    const identity = providerSessionKey(connection, context);
    const held = this.conversations.get(session);
    const reuse = Boolean(held && !held.exited && held.identity === identity && held.sent && prompt.startsWith(held.sent));
    if (held && !reuse) await session.closeAndWait();
    if (reuse) {
      let shown = 0;
      try {
        return await this.turn(
          held!,
          prompt,
          connection,
          {
            ...context,
            emit: delta => {
              shown += delta.length;
              context.emit(delta);
            },
          },
          deadline,
          Date.now(),
        );
      } catch (error) {
        // A process that ended or answered out of protocol between turns gets one fresh start with the whole prompt,
        // after its partial text is taken back.
        if (context.signal.aborted || !resettable(error)) throw error;
        if (shown) context.discard?.(shown);
        await session.closeAndWait();
        return this.turn(
          await this.open(session, identity, connection, context),
          prompt,
          connection,
          context,
          deadline,
          Date.now(),
          'session-invalid',
        );
      }
    }
    const started = Date.now();
    return this.turn(await this.open(session, identity, connection, context), prompt, connection, context, deadline, started);
  }

  private async open(session: ProviderSession, identity: string, connection: Connection, context: ProviderContext) {
    const home = await antigravityHome(context);
    try {
      await checkAntigravity(connection.executable, home, context.signal);
    } catch (error) {
      if (!(error as any)?.shutdownIncomplete) await home.close();
      throw error;
    }
    const held: AgyConversation = { home, identity, sent: '', turns: 0, conversation: '', exited: false, done: Promise.resolve() };
    const running = runAntigravity(connection.executable, this.args(connection, context), home, {
      // The process lives for the whole run; each turn has its own deadline and cancellation below.
      timeoutMs: 60 * 60_000,
      holdInput: true,
      keepInput: true,
      control: handles => (held.handles = handles),
      line: (line, send) => {
        const event = parseEvent(line);
        if (!held.handler) throw new Error('PROVIDER_STREAM_INVALID');
        held.handler(event, send);
      },
    });
    held.done = running
      .then(
        async () => {
          held.exited = true;
          held.onExit?.(new Error('RUNTIME_EXITED'));
          await home.close();
        },
        async error => {
          held.exited = true;
          held.onExit?.(error instanceof Error ? error : new Error('RUNTIME_EXITED'));
          if (!(error as any)?.shutdownIncomplete) await home.close();
        },
      )
      // A home that cannot be removed is left behind; it must never leave a turn waiting forever.
      .catch(() => {});
    this.conversations.set(session, held);
    session.onClose = async () => {
      this.conversations.delete(session);
      // Closing stdin ends the conversation; a process that does not exit soon is stopped.
      held.handles?.end();
      const stop = setTimeout(() => held.handles?.stop(new Error('CANCELLED')), 5000);
      await held.done;
      clearTimeout(stop);
    };
    return held;
  }

  private turn(
    held: AgyConversation,
    prompt: string,
    connection: Connection,
    context: ProviderContext,
    deadline: number,
    started: number,
    resetReason?: string,
  ) {
    const fresh = !held.turns;
    const input = fresh ? prompt : prompt.slice(held.sent.length);
    context.onTransport?.({
      mode: fresh ? 'full' : 'delta',
      sentChars: input.length,
      startupMs: fresh ? Date.now() - started : 0,
      ...(resetReason ? { resetReason } : {}),
    });
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, answer?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        context.signal.removeEventListener('abort', abort);
        held.handler = undefined;
        held.onExit = undefined;
        if (error) {
          // Wait until the process has stopped and its home is removed, as a one-shot run does.
          held.handles?.stop(error);
          held.done.then(() => reject(error));
        } else resolve(answer!);
      };
      const timer = setTimeout(() => finish(new Error('PROVIDER_TIMEOUT')), Math.max(1, deadline - Date.now()));
      const abort = () => finish(new Error('CANCELLED'));
      context.signal.addEventListener('abort', abort, { once: true });
      held.onExit = error =>
        finish(error.message === 'RUNTIME_EXITED' || error.message === 'CANCELLED' ? new Error('RUNTIME_EXITED') : error);
      const reader = turnReader(
        () => held.conversation,
        held.turns,
        context.emit,
        (count, cumulative) => {
          // When agy reports conversation totals, this turn's part is the growth since the last report.
          const turnCount = cumulative && held.usage ? combineUsage(count, held.usage, 'delta') : count;
          held.usage = count;
          context.onUsage?.(turnCount);
        },
      );
      const ask = (send: (message: unknown) => void) => send({ event: 'user', message: { content: input } });
      held.handler = (event, send) => {
        if (event.event === 'init') {
          const id = checkInit(event, held.home.cwd, connection);
          // A later turn may announce the same conversation again; a different one is not this conversation.
          if (held.conversation) {
            if (id !== held.conversation) throw new Error('PROVIDER_SESSION_INVALID');
            return;
          }
          held.conversation = id;
          ask(send);
          return;
        }
        const answer = reader.read(event);
        if (answer !== undefined) {
          held.turns++;
          held.sent = prompt;
          finish(undefined, answer);
        }
      };
      if (context.signal.aborted) return abort();
      if (held.exited) return finish(new Error('RUNTIME_EXITED'));
      // A process that already started its conversation waits for the next message on stdin; a new one asks after init.
      if (held.conversation) {
        try {
          if (!held.handles) throw new Error('RUNTIME_EXITED');
          ask(held.handles.send);
        } catch (error) {
          finish(error instanceof Error ? error : new Error('RUNTIME_EXITED'));
        }
      }
    });
  }
}

// Executables that already answered as 1.2.14+, keyed by path with the file's size and change time, so replacing or
// updating the binary checks it again. Without this every message started one extra agy process just for --version.
const checked = new Map<string, string>();
function fileStamp(executable: string) {
  try {
    const info = statSync(executable);
    return `${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
  } catch {
    return '';
  }
}

export async function checkAntigravity(executable: string, context: Pick<ProviderContext, 'cwd' | 'env'>, signal?: AbortSignal) {
  const stamp = fileStamp(executable);
  if (stamp && checked.get(executable) === stamp) {
    if (signal?.aborted) throw new Error('CANCELLED');
    return;
  }
  const { output } = await runAntigravity(executable, ['--version'], context, { timeoutMs: 10_000, signal });
  const version = /^\s*(\d+)\.(\d+)\.(\d+)\s*$/.exec(output);
  if (
    !version ||
    Number(version[1]) < 1 ||
    (Number(version[1]) === 1 && Number(version[2]) < 2) ||
    (Number(version[1]) === 1 && Number(version[2]) === 2 && Number(version[3]) < 14)
  )
    throw new Error('ANTIGRAVITY_UPDATE_REQUIRED');
  if (stamp) checked.set(executable, stamp);
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
