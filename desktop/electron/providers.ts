import { compatibleRun } from '../../src/modules/providers/compatible.js';
import { providerUsage, type TokenCount } from '../../src/modules/providers/usage.js';
import { combineUsage } from './usage';
import { InputQueue } from './input-queue';
import { MAX_TOOL_TURNS } from './tool-loop';
import { GeminiApiAdapter } from './gemini-api';
import type { Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
export type { TokenCount } from '../../src/modules/providers/usage.js';
import { CopilotAdapter, copilotModels } from './copilot';
import { randomUUID, createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Rpc } from './rpc';
import { explainRuntimeFailure } from './diagnostics';
import { claudeEnv } from './claude-auth';
import { anthropicEnv } from './anthropic-auth';
import { AntigravityAdapter, antigravityModels } from './antigravity';
import { strictJsonSchema } from './json-schema';

// A failure keeps its code when the runtime said why; the scrubbed tail travels as `detail`.
export function runtimeError(error: unknown, rpc: Rpc) {
  const tail = rpc.stderrTail(),
    code = explainRuntimeFailure(tail);
  const base = error instanceof Error ? error : new Error(String(error));
  return Object.assign(code && base.message !== 'CANCELLED' ? new Error(code) : base, {
    detail: tail.slice(-8),
    ...((base as any).retryAfterMs !== undefined ? { retryAfterMs: (base as any).retryAfterMs } : {}),
  });
}
import type { Connection, ModelOption, VisionInput } from '../src/types';

export type ProviderContext = {
  images?: VisionInput[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** Loopback API override supplied only by the non-packaged synthetic test host. */
  geminiBaseUrl?: string;
  key?: string;
  effort?: string;
  /** Standing instructions for the runtime's system prompt; the prompt argument carries only the request sections. */
  system?: string;
  signal: AbortSignal;
  emit: (text: string) => void;
  /** Takes back the last `chars` characters passed to emit: a runtime calls it when a streamed attempt is discarded. */
  discard?: (chars: number) => void;
  onReasoning?: (text: string) => void;
  onUsage?: (usage: TokenCount) => void;
  onTransport?: (info: {
    mode: 'full' | 'delta';
    sentChars: number;
    startupMs?: number;
    resetReason?: string;
    cacheStatus?: 'created' | 'reused' | 'bypassed';
  }) => void;
  webSearch?: boolean;
  /**
   * The JSON shape the host will parse from the answer. ChatGPT (Codex) constrains the reply to it with outputSchema and
   * the Gemini API returns JSON only; others rely on the prompt. The host validates the reply either way.
   */
  jsonSchema?: Record<string, unknown>;
  onWebActivity?: (stage: 'search' | 'read' | 'complete' | 'failed') => void;
  /** Keeps the runtime conversation open between the tool turns of one run (see ProviderSession). */
  session?: ProviderSession;
};
/**
 * One runtime conversation kept open across the tool turns of a step. The tool loop sends the whole prompt every turn,
 * each one the previous prompt plus new tool results; a runtime that holds a conversation (Codex app-server) then sends
 * only the new part on the same thread, instead of starting a process and a thread and resending everything per turn.
 */
export class ProviderSession {
  rpc?: Rpc;
  threadId = '';
  sent = '';
  system = '';
  model = '';
  identity = '';
  usage: TokenCount = { input: 0, output: 0, total: 0 };
  /** Runs when the conversation closes, after its runtime stops (for example, removing a per-run instructions file). */
  onClose?: () => void | Promise<void>;
  private cleanup: Promise<void> = Promise.resolve();
  close() {
    const rpc = this.rpc,
      onClose = this.onClose;
    this.rpc = undefined;
    this.onClose = undefined;
    this.threadId = '';
    this.sent = '';
    this.identity = '';
    this.usage = { input: 0, output: 0, total: 0 };
    const shutdown = (async () => {
      try {
        await rpc?.closeAndWait();
      } finally {
        await onClose?.();
      }
    })();
    this.cleanup = Promise.allSettled([this.cleanup, shutdown]).then(results => {
      const failed = results.find(result => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
    });
    // Abort listeners call close() synchronously; closeAndWait() still observes shutdown failures.
    void this.cleanup.catch(() => {});
  }
  async closeAndWait() {
    this.close();
    await this.cleanup;
  }
}
/** Bound to one account, model, runtime, work directory and instructions; never persisted or logged. */
export function providerSessionKey(connection: Connection, context: ProviderContext) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        connection.provider,
        connection.id,
        connection.mode,
        connection.model,
        connection.executable,
        connection.googleCloudProject,
        context.cwd,
        context.key,
        context.effort,
        context.system,
      ]),
    )
    .digest('hex');
}
const resettableSessionError = (error: unknown) =>
  error instanceof Error && ['RUNTIME_EXITED', 'PROVIDER_SESSION_INVALID'].includes(error.message);
/**
 * SDK conversations (Claude, Copilot) report a process that died between tool turns as a generic request failure.
 * Sign-in, quota, permission, model and size failures are not among these, so they never cost a second call.
 */
export const retainedSdkError = (error: unknown) =>
  resettableSessionError(error) ||
  (error instanceof Error && ['PROVIDER_REQUEST_FAILED', 'COPILOT_REQUEST_FAILED', 'PROVIDER_NETWORK'].includes(error.message));
/** One fresh-session recovery, with cumulative usage across both physical attempts. */
export async function recoverSessionTurn(
  context: ProviderContext,
  turn: (context: ProviderContext) => Promise<string>,
  continuing = Boolean(context.session?.rpc && !context.webSearch),
  resettable: (error: unknown) => boolean = resettableSessionError,
) {
  let observed: TokenCount = { input: 0, output: 0, total: 0 };
  const attempt = {
    ...context,
    onUsage: (usage: TokenCount) => {
      observed = combineUsage(observed, usage, 'max');
      context.onUsage?.(observed);
    },
  };
  try {
    return await turn(attempt);
  } catch (error) {
    // Authentication and quota failures go to the host without a second provider call.
    if (!continuing || context.signal.aborted || !resettable(error)) throw error;
    await context.session?.closeAndWait();
    const failed = observed;
    observed = { input: 0, output: 0, total: 0 };
    return turn({
      ...context,
      onUsage: usage => {
        observed = combineUsage(observed, usage, 'max');
        context.onUsage?.(combineUsage(failed, observed));
      },
      onTransport: info => context.onTransport?.({ ...info, resetReason: 'session-invalid' }),
    });
  }
}
export interface ProviderAdapter {
  run(prompt: string, connection: Connection, context: ProviderContext): Promise<string>;
}

// The Codex npm launcher respawns its native binary without windowsHide, which flashes a
// console window on Windows. Start the native binary directly when it is installed.
export function nativeCodex(executable: string) {
  if (process.platform !== 'win32' || !/[\\/]@openai[\\/]codex[\\/]bin[\\/]codex\.js$/i.test(executable)) return executable;
  const packageRoot = dirname(dirname(executable)),
    triple = process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
  for (const vendor of [join(dirname(packageRoot), `codex-win32-${process.arch}`, 'vendor'), join(packageRoot, 'vendor')]) {
    const binary = join(vendor, triple, 'bin', 'codex.exe');
    if (existsSync(binary)) return binary;
  }
  return executable;
}

export function createRpc(connection: Connection, context: Pick<ProviderContext, 'cwd' | 'env' | 'key'>) {
  if (!connection.executable) throw new Error('RUNTIME_UNAVAILABLE');
  const args = connection.provider === 'openai' ? ['app-server'] : ['--acp'];
  const executable = connection.provider === 'openai' ? nativeCodex(connection.executable) : connection.executable;
  // JS CLI entrypoints run through the bundled Electron Node runtime; never a shell.
  const script = /\.[cm]?js$/i.test(executable);
  const env: NodeJS.ProcessEnv = { ...context.env, ...(script ? { ELECTRON_RUN_AS_NODE: '1' } : {}) };
  if (executable !== connection.executable) env.CODEX_MANAGED_PACKAGE_ROOT = dirname(dirname(connection.executable));
  if (connection.provider === 'gemini') {
    if (context.key) env.GEMINI_API_KEY = context.key;
    env.GEMINI_DEFAULT_AUTH_TYPE = connection.mode === 'api' ? 'gemini-api-key' : 'oauth-personal';
    // ACP is already host-controlled; bypass workspace trust UI that cannot be
    // answered through the JSON-RPC stream. Browser OAuth itself remains enabled.
    env.GEMINI_CLI_TRUST_WORKSPACE = 'true';
    delete env.NO_BROWSER;
  }
  return new Rpc(script ? process.execPath : executable, script ? [executable, ...args] : args, { cwd: context.cwd, env });
}

export async function initialize(rpc: Rpc, provider: string) {
  if (provider === 'openai') {
    const result = await rpc.request('initialize', { clientInfo: { name: 'step-desktop', version: '0.1.0' }, capabilities: {} });
    rpc.notify('initialized');
    return result;
  }
  return rpc.request('initialize', {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    clientInfo: { name: 'step-desktop', version: '0.1.0' },
  });
}

export class CodexAdapter implements ProviderAdapter {
  async run(prompt: string, connection: Connection, context: ProviderContext) {
    return recoverSessionTurn(context, attempt => this.turn(prompt, connection, attempt));
  }
  private async turn(prompt: string, connection: Connection, context: ProviderContext) {
    const started = Date.now();
    if (context.signal.aborted) throw new Error('CANCELLED');
    const session = context.webSearch ? undefined : context.session;
    const system = context.system || '';
    const identity = providerSessionKey(connection, context);
    // Continue the run's open thread when this prompt only adds to what it already holds (tool results).
    const reuse = Boolean(
      session?.rpc &&
      session.threadId &&
      session.system === system &&
      session.model === (connection.model || '') &&
      session.identity === identity &&
      session.sent &&
      prompt.startsWith(session.sent) &&
      !context.images?.length,
    );
    const resetReason =
      session?.sent && !reuse
        ? session.system !== system
          ? 'system-changed'
          : session.model !== (connection.model || '')
            ? 'model-changed'
            : context.images?.length
              ? 'images'
              : session.identity !== identity
                ? 'connection-changed'
                : 'prefix-changed'
        : undefined;
    if (session && !reuse) await session.closeAndWait();
    if (context.signal.aborted) throw new Error('CANCELLED');
    const rpc = reuse ? session!.rpc! : createRpc(connection, context);
    let text = '';
    const abort = () => (session ? session.close() : rpc.close());
    context.signal.addEventListener('abort', abort, { once: true });
    let keep = false;
    try {
      let threadId = session?.threadId || '';
      if (!reuse) {
        await initialize(rpc, 'openai');
        if (context.key) await rpc.request('account/login/start', { type: 'apiKey', apiKey: context.key });
        // No file or shell tools. Documents and instructions are supplied by the host.
        const result = await rpc.request('thread/start', {
          cwd: context.cwd,
          model: connection.model || undefined,
          approvalPolicy: 'untrusted',
          sandbox: 'read-only',
          config: { web_search: context.webSearch ? 'live' : 'disabled', features: { shell_tool: false }, mcp_servers: {} },
          // Developer instructions rank above the user message. The Codex base prompt stays in place:
          // ChatGPT-plan sign-ins have rejected requests whose base instructions were replaced.
          ...(context.system ? { developerInstructions: context.system } : {}),
          ephemeral: true,
        });
        threadId = result.thread.id;
        if (session) {
          Object.assign(session, {
            rpc,
            threadId,
            system,
            identity,
            model: connection.model || '',
            usage: { input: 0, output: 0, total: 0 },
          });
          rpc.onClose(() => {
            if (session.rpc === rpc) session.close();
          });
        }
      }
      const input = reuse ? prompt.slice(session!.sent.length) : prompt;
      context.onTransport?.({
        mode: reuse ? 'delta' : 'full',
        sentChars: input.length,
        startupMs: reuse ? 0 : Date.now() - started,
        resetReason,
      });
      const base = session?.usage || { input: 0, output: 0, total: 0 };
      const answer = await (async () => {
        const result = { thread: { id: threadId } };
        return await new Promise<string>((resolve, reject) => {
          let unsubscribe = () => {};
          const cleanup = () => {
            clearTimeout(timer);
            unsubscribe();
            context.signal.removeEventListener('abort', onAbort);
          };
          const fail = (error: Error) => {
            cleanup();
            reject(error);
          };
          const timer = setTimeout(() => {
            fail(new Error('PROVIDER_TIMEOUT'));
            rpc.close();
          }, 600_000);
          const onAbort = () => fail(new Error('CANCELLED'));
          context.signal.addEventListener('abort', onAbort, { once: true });
          unsubscribe = rpc.onClose(fail);
          if (context.signal.aborted) {
            onAbort();
            return;
          }
          rpc.onNotification = (method, params) => {
            if (context.webSearch && ['item/started', 'item/completed'].includes(method) && params.item?.type === 'webSearch') {
              context.onWebActivity?.(
                method === 'item/completed'
                  ? 'complete'
                  : params.item.action?.type === 'openPage' || params.item.action?.type === 'findInPage'
                    ? 'read'
                    : 'search',
              );
            }
            if (method === 'item/agentMessage/delta') {
              text += params.delta;
              context.emit(params.delta);
            }
            if (method === 'item/reasoning/summaryTextDelta' && typeof params.delta === 'string') context.onReasoning?.(params.delta);
            // The thread total covers every turn on the thread; report this turn's part of it.
            if (method === 'thread/tokenUsage/updated' && params.tokenUsage?.total) {
              const t = params.tokenUsage.total;
              const now = {
                input: t.inputTokens || 0,
                output: t.outputTokens || 0,
                total: t.totalTokens || 0,
                ...(Number.isSafeInteger(t.cachedInputTokens) && t.cachedInputTokens >= 0 ? { cachedInput: t.cachedInputTokens } : {}),
              };
              if (session) session.usage = now;
              context.onUsage?.(combineUsage(now, base, 'delta'));
            }
            // Codex reports why a turn failed (usage limit, unsupported model, expired sign-in) here.
            if (method === 'error' && params?.error?.message)
              rpc.note(
                'error: ' + params.error.message + (params.error.codexErrorInfo ? ' ' + JSON.stringify(params.error.codexErrorInfo) : ''),
              );
            if (method === 'turn/completed') {
              cleanup();
              if (params.turn?.error?.message)
                rpc.note(
                  'turn failed: ' +
                    params.turn.error.message +
                    (params.turn.error.codexErrorInfo ? ' ' + JSON.stringify(params.turn.error.codexErrorInfo) : ''),
                );
              if (params.turn?.status === 'completed') resolve(text);
              else reject(new Error('PROVIDER_REQUEST_FAILED'));
            }
          };
          rpc
            .request('turn/start', {
              threadId: result.thread.id,
              input: [
                { type: 'text', text: input },
                ...(context.images || []).map(i => ({ type: 'image', url: `data:${i.mime};base64,${i.data}` })),
              ],
              ...(context.effort ? { effort: context.effort } : {}),
              ...(context.jsonSchema ? { outputSchema: strictJsonSchema(context.jsonSchema) } : {}),
            })
            .catch(fail);
        });
      })();
      if (session) {
        session.sent = prompt;
        keep = true;
      }
      return answer;
    } catch (error) {
      session?.close();
      throw runtimeError(error, rpc);
    } finally {
      context.signal.removeEventListener('abort', abort);
      if (!keep) await rpc.closeAndWait().catch(() => {});
    }
  }
}

export class GeminiAdapter implements ProviderAdapter {
  constructor(private api = new GeminiApiAdapter()) {}
  async run(prompt: string, connection: Connection, context: ProviderContext) {
    if (
      connection.mode === 'api' &&
      connection.promptCaching === 'gemini-explicit' &&
      !connection.customRuntime &&
      connection.model &&
      !context.webSearch &&
      !context.images?.length
    ) {
      return this.api.run(prompt, connection, context);
    }
    return recoverSessionTurn(context, attempt => this.turn(prompt, connection, attempt));
  }
  private async turn(prompt: string, connection: Connection, context: ProviderContext) {
    const started = Date.now();
    if (context.signal.aborted) throw new Error('CANCELLED');
    const session = context.webSearch ? undefined : context.session;
    const system = context.system || '';
    const identity = providerSessionKey(connection, context);
    // Every tool turn of a run continues on one Gemini CLI process and ACP session, sending only the new tool results,
    // instead of starting the CLI again and resending the whole prompt each turn.
    const reuse = Boolean(
      session?.rpc &&
      session.threadId &&
      session.system === system &&
      session.model === (connection.model || '') &&
      session.identity === identity &&
      session.sent &&
      prompt.startsWith(session.sent) &&
      !context.images?.length,
    );
    const resetReason =
      session?.sent && !reuse
        ? session.system !== system
          ? 'system-changed'
          : session.model !== (connection.model || '')
            ? 'model-changed'
            : context.images?.length
              ? 'images'
              : session.identity !== identity
                ? 'connection-changed'
                : 'prefix-changed'
        : undefined;
    if (session && !reuse) await session.closeAndWait();
    if (context.signal.aborted) throw new Error('CANCELLED');
    // Gemini CLI replaces its own coding-agent system prompt with the file named in GEMINI_SYSTEM_MD.
    // One file per conversation, so parallel tasks on the same connection never read each other's instructions.
    const systemFile = !reuse && system ? join(dirname(context.cwd), `system-${randomUUID()}.md`) : '';
    if (systemFile) await writeFile(systemFile, system, 'utf8');
    const removeSystemFile = () => (systemFile ? void rm(systemFile, { force: true }).catch(() => {}) : undefined);
    const rpc = reuse
      ? session!.rpc!
      : createRpc(connection, systemFile ? { ...context, env: { ...context.env, GEMINI_SYSTEM_MD: systemFile } } : context);
    let text = '';
    let keep = false;
    const searches = new Set<string>();
    const abort = () => (session ? session.close() : rpc.close());
    context.signal.addEventListener('abort', abort, { once: true });
    if (context.signal.aborted) abort();
    try {
      let sessionId = reuse ? session!.threadId : '';
      if (!reuse) {
        rpc.onText = line => {
          if (isGoogleLogin(line)) rpc.close('LOGIN_REQUIRED');
        };
        const capabilities = await initialize(rpc, 'gemini');
        if (context.images?.length && !capabilities.agentCapabilities?.promptCapabilities?.image) throw new Error('VISION_UNAVAILABLE');
        rpc.onRequest = async method => {
          if (method === 'session/request_permission') return { outcome: { outcome: 'cancelled' } };
          throw new Error('TOOL_DENIED');
        };
        await rpc.request('authenticate', { methodId: connection.mode === 'api' ? 'gemini-api-key' : 'oauth-personal' });
        sessionId = (await rpc.request('session/new', { cwd: context.cwd, mcpServers: [] })).sessionId;
        if (connection.model) await rpc.request('session/set_model', { sessionId, modelId: connection.model });
        if (session) {
          Object.assign(session, { rpc, threadId: sessionId, system, identity, model: connection.model || '', sent: '' });
          session.onClose = removeSystemFile;
          rpc.onClose(() => {
            if (session.rpc === rpc) session.close();
          });
        }
      }
      rpc.onNotification = (method, params) => {
        const update = params.update;
        if (update?.kind === 'search' && typeof update.toolCallId === 'string') searches.add(update.toolCallId);
        if (
          context.webSearch &&
          method === 'session/update' &&
          ['tool_call', 'tool_call_update'].includes(update?.sessionUpdate) &&
          (update.kind === 'search' || searches.has(update.toolCallId))
        ) {
          // Some CLI versions report a tool-result error as ACP "completed".
          const toolError = update.content?.some((part: any) => /Error performing web search/i.test(part.content?.text || ''));
          context.onWebActivity?.(
            update.status === 'failed' || toolError ? 'failed' : update.status === 'completed' ? 'complete' : 'search',
          );
        }
        if (
          method === 'session/update' &&
          params.update?.sessionUpdate === 'agent_message_chunk' &&
          params.update.content?.type === 'text'
        ) {
          text += params.update.content.text;
          context.emit(params.update.content.text);
        }
        if (method === 'session/update' && params.update?.sessionUpdate === 'agent_thought_chunk' && params.update.content?.type === 'text')
          context.onReasoning?.(params.update.content.text);
      };
      const input = reuse ? prompt.slice(session!.sent.length) : prompt;
      context.onTransport?.({
        mode: reuse ? 'delta' : 'full',
        sentChars: input.length,
        startupMs: reuse ? 0 : Date.now() - started,
        resetReason,
      });
      await rpc.request(
        'session/prompt',
        {
          sessionId,
          prompt: [{ type: 'text', text: input }, ...(context.images || []).map(i => ({ type: 'image', data: i.data, mimeType: i.mime }))],
        },
        600_000,
      );
      if (session) {
        session.sent = prompt;
        keep = true;
      }
      return text;
    } catch (error) {
      session?.close();
      throw runtimeError(error, rpc);
    } finally {
      context.signal.removeEventListener('abort', abort);
      if (!keep) {
        await rpc.closeAndWait().catch(() => {});
        removeSystemFile();
      }
    }
  }
}

export class ClaudeAdapter implements ProviderAdapter {
  private conversations = new WeakMap<
    ProviderSession,
    { stream: Query; input: InputQueue<SDKUserMessage>; controller: AbortController; identity: string; sent: string; usage: TokenCount }
  >();
  constructor(private loadSdk = () => import('@anthropic-ai/claude-agent-sdk')) {}
  async run(prompt: string, connection: Connection, context: ProviderContext) {
    // A retained conversation that dies between tool turns is tried once more from a fresh start, as Codex/Gemini are.
    const held = context.session && !context.webSearch && !context.images?.length ? this.conversations.get(context.session) : undefined;
    const continuing = Boolean(held && held.identity === providerSessionKey(connection, context) && prompt.startsWith(held.sent));
    return recoverSessionTurn(context, attempt => this.turn(prompt, connection, attempt), continuing, retainedSdkError);
  }
  private async turn(prompt: string, connection: Connection, context: ProviderContext) {
    const started = Date.now();
    if (context.signal.aborted) throw new Error('CANCELLED');
    const authOptions = claudeSdkOptions(connection, context);
    const { query } = await this.loadSdk();
    if (context.signal.aborted) throw new Error('CANCELLED');
    const session = !context.webSearch && !context.images?.length ? context.session : undefined;
    const identity = providerSessionKey(connection, context);
    let conversation = session ? this.conversations.get(session) : undefined;
    const reuse = Boolean(conversation && conversation.identity === identity && prompt.startsWith(conversation.sent));
    if (session && !reuse) {
      await session.closeAndWait();
      conversation = undefined;
    }
    if (context.signal.aborted) throw new Error('CANCELLED');
    const controller = conversation?.controller || new AbortController(),
      abort = () => {
        controller.abort();
        if (session) session.close();
      };
    context.signal.addEventListener('abort', abort, { once: true });
    let text = '';
    let stream: Query | undefined;
    let keep = false;
    try {
      const input = conversation?.input || (session ? new InputQueue<SDKUserMessage>() : undefined);
      const delta = reuse ? prompt.slice(conversation!.sent.length) : prompt;
      if (input) input.push({ type: 'user', session_id: '', parent_tool_use_id: null, message: { role: 'user', content: delta } });
      stream =
        conversation?.stream ||
        query({
          prompt:
            input ||
            (context.images?.length
              ? (async function* () {
                  yield {
                    type: 'user' as const,
                    session_id: '',
                    parent_tool_use_id: null,
                    message: {
                      role: 'user' as const,
                      content: [
                        { type: 'text' as const, text: prompt },
                        ...(context.images || []).map(i => ({
                          type: 'image' as const,
                          source: { type: 'base64' as const, media_type: i.mime, data: i.data },
                        })),
                      ],
                    },
                  };
                })()
              : prompt),
          options: {
            cwd: context.cwd,
            ...authOptions,
            model: connection.model || undefined,
            ...(context.system ? { systemPrompt: context.system } : {}),
            ...(context.effort ? { effort: context.effort as any } : {}),
            tools: context.webSearch ? ['WebSearch'] : [],
            allowedTools: [],
            mcpServers: {},
            strictMcpConfig: true,
            settingSources: [],
            persistSession: false,
            includePartialMessages: true,
            abortController: controller,
            maxTurns: context.webSearch ? 6 : session ? MAX_TOOL_TURNS + 1 : 1,
            ...(context.webSearch
              ? {
                  hooks: {
                    PreToolUse: [
                      {
                        hooks: [
                          async (input: any) => {
                            if (input.tool_name !== 'WebSearch')
                              return {
                                hookSpecificOutput: {
                                  hookEventName: 'PreToolUse' as const,
                                  permissionDecision: 'deny' as const,
                                  permissionDecisionReason: 'Only public web search is available.',
                                },
                              };
                            context.onWebActivity?.('search');
                            return {};
                          },
                        ],
                      },
                    ],
                    PostToolUse: [
                      {
                        matcher: 'WebSearch',
                        hooks: [
                          async () => {
                            context.onWebActivity?.('complete');
                            return {};
                          },
                        ],
                      },
                    ],
                    PostToolUseFailure: [
                      {
                        matcher: 'WebSearch',
                        hooks: [
                          async () => {
                            context.onWebActivity?.('failed');
                            return {};
                          },
                        ],
                      },
                    ],
                  },
                }
              : {}),
            canUseTool: async (name, input) =>
              context.webSearch && name === 'WebSearch'
                ? { behavior: 'allow', updatedInput: input }
                : { behavior: 'deny', message: 'Only host-managed drafting is available.' },
          },
        });
      if (session && !conversation) {
        conversation = { stream, input: input!, controller, identity, sent: '', usage: { input: 0, output: 0, total: 0 } };
        this.conversations.set(session, conversation);
        session.onClose = () => {
          input!.close();
          controller.abort();
          stream?.close();
          this.conversations.delete(session);
        };
      }
      context.onTransport?.({ mode: reuse ? 'delta' : 'full', sentChars: delta.length, startupMs: reuse ? 0 : Date.now() - started });
      // Manual iteration preserves the SDK process after a result; for-await would close it on return.
      while (true) {
        const next = await stream.next();
        if (next.done) {
          if (session) throw new Error('PROVIDER_SESSION_INVALID');
          break;
        }
        const message = next.value;
        if (message.type === 'stream_event' && message.event.type === 'content_block_delta' && message.event.delta.type === 'text_delta') {
          text += message.event.delta.text;
          context.emit(message.event.delta.text);
        }
        if (
          message.type === 'stream_event' &&
          message.event.type === 'content_block_delta' &&
          message.event.delta.type === 'thinking_delta'
        )
          context.onReasoning?.(message.event.delta.thinking);
        if (message.type === 'result' && message.usage) {
          const models = message.modelUsage && Object.values(message.modelUsage);
          if (models?.length) {
            const total = models.reduce(
              (sum, usage) =>
                combineUsage(
                  sum,
                  providerUsage('anthropic', {
                    input_tokens: usage.inputTokens,
                    output_tokens: usage.outputTokens,
                    cache_read_input_tokens: usage.cacheReadInputTokens,
                    cache_creation_input_tokens: usage.cacheCreationInputTokens,
                  }),
                ),
              { input: 0, output: 0, total: 0 } as TokenCount,
            );
            context.onUsage?.(combineUsage(total, conversation?.usage || { input: 0, output: 0, total: 0 }, 'delta'));
            if (conversation) conversation.usage = total;
          } else context.onUsage?.(providerUsage('anthropic', message.usage));
        }
        if (message.type === 'result' && (message.is_error || message.subtype !== 'success'))
          throw new Error(explainRuntimeFailure('errors' in message ? message.errors : []) || 'PROVIDER_REQUEST_FAILED');
        if (message.type === 'result' && message.subtype === 'success' && !text) {
          text = message.result;
          context.emit(text);
        }
        if (message.type === 'result' && session) {
          conversation!.sent = prompt;
          keep = true;
          break;
        }
      }
      return text;
    } catch (error) {
      if (context.signal.aborted) throw new Error('CANCELLED');
      throw new Error(
        explainRuntimeFailure([String(error)]) ||
          (error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'PROVIDER_REQUEST_FAILED'),
      );
    } finally {
      context.signal.removeEventListener('abort', abort);
      if (!keep) {
        if (session) await session.closeAndWait();
        else stream?.close?.();
      }
    }
  }
}

export function claudeSdkOptions(
  connection: Connection,
  context: Pick<ProviderContext, 'env' | 'key'>,
): {
  env: NodeJS.ProcessEnv;
  pathToClaudeCodeExecutable?: string;
  executable?: 'node';
} {
  if (connection.mode === 'api') {
    if (!context.key) throw new Error('API_KEY_REQUIRED');
    return { env: { ...context.env, ANTHROPIC_API_KEY: context.key } };
  }
  if (connection.mode === 'oauth') {
    return {
      env: {
        ...anthropicEnv(context.env),
        ANTHROPIC_API_KEY: undefined,
        ANTHROPIC_AUTH_TOKEN: undefined,
        CLAUDE_CODE_OAUTH_TOKEN: undefined,
        ANTHROPIC_BASE_URL: undefined,
      },
    };
  }
  if (!connection.executable) throw new Error('CLAUDE_CODE_NOT_FOUND');
  const script = /\.[cm]?js$/i.test(connection.executable);
  return {
    pathToClaudeCodeExecutable: connection.executable,
    ...(script ? { executable: process.execPath as 'node' } : {}),
    // Explicitly unset ambient auth even in SDK versions that merge process.env.
    env: {
      ...claudeEnv(context.env),
      ANTHROPIC_API_KEY: undefined,
      ANTHROPIC_AUTH_TOKEN: undefined,
      CLAUDE_CODE_OAUTH_TOKEN: undefined,
      ANTHROPIC_BASE_URL: undefined,
      CLAUDE_CODE_USE_BEDROCK: undefined,
      CLAUDE_CODE_USE_VERTEX: undefined,
      CLAUDE_CODE_USE_FOUNDRY: undefined,
      ...(script ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
    },
  };
}

// A Google sign-in URL on stdout means cached credentials are missing or expired.
export function googleLoginUrl(line: string) {
  const match = /https:\/\/accounts\.google\.com\/\S+/.exec(line);
  if (!match) return undefined;
  try {
    const url = new URL(match[0]);
    return url.protocol === 'https:' && url.hostname === 'accounts.google.com' ? url : undefined;
  } catch {
    return undefined;
  }
}
const isGoogleLogin = (line: string) => Boolean(googleLoginUrl(line));
const text = (value: unknown, limit: number) => (typeof value === 'string' ? value.trim().slice(0, limit) : '');
// Provider catalogs are untrusted input: keep short plain strings and a bounded list.
export function normalizeModels(items: unknown[]): ModelOption[] {
  const seen = new Set<string>(),
    models: ModelOption[] = [];
  for (const item of items as any[]) {
    const id = text(item?.id, 100);
    if (!id || !/^[\w.:/@-]+$/.test(id) || seen.has(id) || models.length >= 100) continue;
    seen.add(id);
    const efforts = (Array.isArray(item.efforts) ? item.efforts : [])
      .map((e: any) => ({ id: text(e?.id, 20), description: text(e?.description, 200) || undefined }))
      .filter((e: any) => /^[a-z]+$/.test(e.id))
      .slice(0, 10);
    const defaultEffort = efforts.some((e: any) => e.id === item.defaultEffort) ? item.defaultEffort : undefined;
    models.push({
      id,
      label: text(item.label, 100) || id,
      description: text(item.description, 300) || undefined,
      isDefault: item.isDefault === true || undefined,
      ...(efforts.length ? { efforts, defaultEffort } : {}),
    });
  }
  return models;
}

// Read provider catalogs through isolated runtime configuration. Antigravity's catalog does not prove account entitlement.
export async function listModels(connection: Connection, context: Pick<ProviderContext, 'cwd' | 'env' | 'key'>): Promise<ModelOption[]> {
  if (connection.provider === 'antigravity') return antigravityModels(connection, context);
  if (connection.provider === 'compatible') return compatibleModels(connection, context.key);
  if (connection.provider === 'copilot') return copilotModels(context);
  if (connection.provider === 'claude') {
    const authOptions = claudeSdkOptions(connection, context);
    // The Agent SDK catalog is what Claude's own apps offer, including supported effort levels.
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const controller = new AbortController();
    async function* idle(): AsyncGenerator<never> {
      await new Promise(resolve => controller.signal.addEventListener('abort', resolve, { once: true }));
    }
    const q = query({
      prompt: idle(),
      options: {
        cwd: context.cwd,
        ...authOptions,
        tools: [],
        allowedTools: [],
        mcpServers: {},
        strictMcpConfig: true,
        settingSources: [],
        persistSession: false,
        abortController: controller,
        canUseTool: async () => ({ behavior: 'deny', message: 'Model listing only.' }),
      },
    });
    let timer: NodeJS.Timeout | undefined;
    try {
      const models = await Promise.race([
        q.supportedModels(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('PROVIDER_TIMEOUT')), 60_000);
        }),
      ]);
      return normalizeModels(
        models.map(m => ({
          id: m.value,
          label: m.displayName,
          description: m.description,
          isDefault: m.value === 'default',
          efforts: ((m.supportsEffort && m.supportedEffortLevels) || []).map(id => ({ id })),
        })),
      );
    } finally {
      clearTimeout(timer);
      controller.abort();
      q.close();
    }
  }
  const rpc = createRpc(connection, context);
  try {
    await initialize(rpc, connection.provider);
    if (connection.provider === 'openai') {
      if (context.key) await rpc.request('account/login/start', { type: 'apiKey', apiKey: context.key });
      const items: unknown[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 5; page++) {
        const result = await rpc.request('model/list', cursor ? { cursor } : {});
        items.push(
          ...(result.data || [])
            .filter((m: any) => !m.hidden)
            .map((m: any) => ({
              id: m.model || m.id,
              label: m.displayName,
              description: m.description,
              isDefault: m.isDefault,
              efforts: (m.supportedReasoningEfforts || []).map((e: any) => ({ id: e.reasoningEffort, description: e.description })),
              defaultEffort: m.defaultReasoningEffort,
            })),
        );
        cursor = result.nextCursor;
        if (!cursor) break;
      }
      return normalizeModels(items);
    }
    rpc.onRequest = async () => {
      throw new Error('TOOL_DENIED');
    };
    rpc.onText = line => {
      if (isGoogleLogin(line)) rpc.close('LOGIN_REQUIRED');
    };
    await rpc.request('authenticate', { methodId: connection.mode === 'api' ? 'gemini-api-key' : 'oauth-personal' });
    const session = await rpc.request('session/new', { cwd: context.cwd, mcpServers: [] });
    const current = session.models?.currentModelId;
    return normalizeModels(
      (session.models?.availableModels || []).map((m: any) => ({
        id: m.modelId,
        label: m.name,
        description: m.description,
        isDefault: m.modelId === current,
      })),
    );
  } finally {
    rpc.close();
  }
}

/**
 * The models an OpenAI-compatible (or Anthropic) service lists at GET {baseUrl}/models. A service without that list
 * still works with the model the employee typed, so a failure falls back to it.
 */
export async function compatibleModels(connection: Connection, key?: string, fetcher: typeof fetch = fetch): Promise<ModelOption[]> {
  const fallback = connection.model ? [{ id: connection.model, label: connection.model }] : [];
  let url: URL;
  try {
    url = new URL(String(connection.baseUrl || '').replace(/\/$/, '') + '/models');
  } catch {
    return fallback;
  }
  const headers: Record<string, string> = { accept: 'application/json' };
  if (connection.protocol === 'anthropic') {
    if (key) headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
  } else if (key) headers.authorization = 'Bearer ' + key;
  try {
    const response = await fetcher(url, { headers, redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      await response.body?.cancel();
      return fallback;
    }
    const body = (await response.json()) as { data?: unknown; models?: unknown };
    const items = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [];
    const models: ModelOption[] = [];
    for (const item of items.slice(0, 2000) as any[]) {
      const id = text(item?.id ?? item?.name, 160);
      if (!id || models.some(m => m.id === id)) continue;
      const label = text(item?.name ?? item?.display_name, 160) || id;
      models.push({ id, label, ...(id === connection.model ? { isDefault: true } : {}) });
      if (models.length >= 500) break;
    }
    if (connection.model && !models.some(m => m.id === connection.model)) models.unshift(...fallback);
    return models.length ? models : fallback;
  } catch {
    return fallback;
  }
}

export class CompatibleAdapter implements ProviderAdapter {
  constructor(private fetcher: typeof fetch = fetch) {}
  async run(prompt: string, connection: Connection, context: ProviderContext) {
    if (connection.promptCaching === 'gemini-explicit') throw new Error('INVALID_INPUT');
    try {
      return await compatibleRun(
        prompt,
        {
          baseUrl: connection.baseUrl || '',
          protocol: connection.protocol,
          model: connection.model,
          maxOutputTokens: connection.maxOutputTokens,
          promptCaching: connection.promptCaching,
        },
        context,
        this.fetcher,
      );
    } catch (error) {
      if (context.signal.aborted) throw new Error('CANCELLED');
      const codes: Record<string, string> = {
        PROVIDER_NETWORK_FAILED: 'PROVIDER_NETWORK',
        PROVIDER_RATE_LIMIT: 'PROVIDER_BUSY',
        PROVIDER_UNAVAILABLE: 'PROVIDER_BUSY',
        PROVIDER_AUTH_FAILED: 'LOGIN_REQUIRED',
      };
      if (error instanceof Error && codes[error.message])
        throw Object.assign(new Error(codes[error.message]), { retryAfterMs: (error as any).retryAfterMs });
      throw error;
    }
  }
}
export function adapter(provider: string): ProviderAdapter {
  if (provider === 'antigravity') return new AntigravityAdapter();
  if (provider === 'compatible') return new CompatibleAdapter();
  if (provider === 'copilot') return new CopilotAdapter();
  if (provider === 'openai') return new CodexAdapter();
  if (provider === 'gemini') return new GeminiAdapter();
  if (provider === 'claude') return new ClaudeAdapter();
  throw new Error('UNKNOWN_PROVIDER');
}
