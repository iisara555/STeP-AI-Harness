import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Rpc } from './rpc';
import { explainRuntimeFailure } from './diagnostics';
import { claudeEnv } from './claude-auth';

// A failure keeps its code when the runtime said why; the scrubbed tail travels as `detail`.
export function runtimeError(error: unknown, rpc: Rpc) {
  const tail = rpc.stderrTail(),
    code = explainRuntimeFailure(tail);
  const base = error instanceof Error ? error : new Error(String(error));
  return Object.assign(code && base.message !== 'CANCELLED' ? new Error(code) : base, { detail: tail.slice(-8) });
}
import type { Connection, ModelOption } from '../src/types';

export type TokenCount = { input: number; output: number; total: number };
export type ProviderContext = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  key?: string;
  effort?: string;
  signal: AbortSignal;
  emit: (text: string) => void;
  onReasoning?: (text: string) => void;
  onUsage?: (usage: TokenCount) => void;
};
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
  if (connection.provider === 'gemini' && context.key) env.GEMINI_API_KEY = context.key;
  // Without a TTY, Gemini's browser-consent prompt waits on the JSON-RPC stdin forever; the manual-code flow can be answered.
  if (connection.provider === 'gemini') env.NO_BROWSER = 'true';
  return new Rpc(script ? process.execPath : executable, script ? [executable, ...args] : args, { cwd: context.cwd, env });
}

export async function initialize(rpc: Rpc, provider: string) {
  if (provider === 'openai') {
    await rpc.request('initialize', { clientInfo: { name: 'step-desktop', version: '0.1.0' }, capabilities: {} });
    rpc.notify('initialized');
  } else
    await rpc.request('initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: 'step-desktop', version: '0.1.0' },
    });
}

export class CodexAdapter implements ProviderAdapter {
  async run(prompt: string, connection: Connection, context: ProviderContext) {
    if (context.signal.aborted) throw new Error('CANCELLED');
    const rpc = createRpc(connection, context);
    let text = '';
    const abort = () => rpc.close();
    context.signal.addEventListener('abort', abort, { once: true });
    try {
      await initialize(rpc, 'openai');
      if (context.key) await rpc.request('account/login/start', { type: 'apiKey', apiKey: context.key });
      // No file or shell tools. Documents and instructions are supplied by the host.
      const result = await rpc.request('thread/start', {
        cwd: context.cwd,
        model: connection.model || undefined,
        approvalPolicy: 'untrusted',
        sandbox: 'read-only',
        config: { features: { shell_tool: false }, mcp_servers: {} },
        ephemeral: true,
      });
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
          if (method === 'item/agentMessage/delta') {
            text += params.delta;
            context.emit(params.delta);
          }
          if (method === 'item/reasoning/summaryTextDelta' && typeof params.delta === 'string') context.onReasoning?.(params.delta);
          // Each run uses an ephemeral thread, so the thread total is this run's usage.
          if (method === 'thread/tokenUsage/updated' && params.tokenUsage?.total) {
            const t = params.tokenUsage.total;
            context.onUsage?.({ input: t.inputTokens || 0, output: t.outputTokens || 0, total: t.totalTokens || 0 });
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
            input: [{ type: 'text', text: prompt }],
            ...(context.effort ? { effort: context.effort } : {}),
          })
          .catch(fail);
      });
    } catch (error) {
      throw runtimeError(error, rpc);
    } finally {
      context.signal.removeEventListener('abort', abort);
      rpc.close();
    }
  }
}

export class GeminiAdapter implements ProviderAdapter {
  async run(prompt: string, connection: Connection, context: ProviderContext) {
    if (context.signal.aborted) throw new Error('CANCELLED');
    const rpc = createRpc(connection, context);
    let text = '';
    const abort = () => rpc.close();
    context.signal.addEventListener('abort', abort, { once: true });
    try {
      rpc.onText = line => {
        if (isGoogleLogin(line)) rpc.close('LOGIN_REQUIRED');
      };
      await initialize(rpc, 'gemini');
      rpc.onRequest = async method => {
        if (method === 'session/request_permission') return { outcome: { outcome: 'cancelled' } };
        throw new Error('TOOL_DENIED');
      };
      await rpc.request('authenticate', { methodId: connection.mode === 'api' ? 'gemini-api-key' : 'oauth-personal' });
      const session = await rpc.request('session/new', { cwd: context.cwd, mcpServers: [] });
      if (connection.model) await rpc.request('session/set_model', { sessionId: session.sessionId, modelId: connection.model });
      rpc.onNotification = (method, params) => {
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
      await rpc.request('session/prompt', { sessionId: session.sessionId, prompt: [{ type: 'text', text: prompt }] }, 600_000);
      return text;
    } catch (error) {
      throw runtimeError(error, rpc);
    } finally {
      context.signal.removeEventListener('abort', abort);
      rpc.close();
    }
  }
}

export class ClaudeAdapter implements ProviderAdapter {
  constructor(private loadSdk = () => import('@anthropic-ai/claude-agent-sdk')) {}
  async run(prompt: string, connection: Connection, context: ProviderContext) {
    if (context.signal.aborted) throw new Error('CANCELLED');
    const authOptions = claudeSdkOptions(connection, context);
    const { query } = await this.loadSdk();
    if (context.signal.aborted) throw new Error('CANCELLED');
    const controller = new AbortController(),
      abort = () => controller.abort();
    context.signal.addEventListener('abort', abort, { once: true });
    let text = '';
    try {
      const stream = query({
        prompt,
        options: {
          cwd: context.cwd,
          ...authOptions,
          model: connection.model || undefined,
          ...(context.effort ? { effort: context.effort as any } : {}),
          tools: [],
          allowedTools: [],
          mcpServers: {},
          strictMcpConfig: true,
          settingSources: [],
          persistSession: false,
          includePartialMessages: true,
          abortController: controller,
          maxTurns: 1,
          canUseTool: async () => ({ behavior: 'deny', message: 'Only host-managed drafting is available.' }),
        },
      });
      for await (const message of stream) {
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
          const u: any = message.usage,
            input = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
          context.onUsage?.({ input, output: u.output_tokens || 0, total: input + (u.output_tokens || 0) });
        }
        if (message.type === 'result' && message.is_error)
          throw new Error(explainRuntimeFailure('errors' in message ? message.errors : []) || 'PROVIDER_REQUEST_FAILED');
        if (message.type === 'result' && message.subtype === 'success' && !text) {
          text = message.result;
          context.emit(text);
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

// Ask the provider which models this account can use, through the same isolated runtime used for drafting.
export async function listModels(connection: Connection, context: Pick<ProviderContext, 'cwd' | 'env' | 'key'>): Promise<ModelOption[]> {
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

export function adapter(provider: string): ProviderAdapter {
  if (provider === 'openai') return new CodexAdapter();
  if (provider === 'gemini') return new GeminiAdapter();
  if (provider === 'claude') return new ClaudeAdapter();
  throw new Error('UNKNOWN_PROVIDER');
}
