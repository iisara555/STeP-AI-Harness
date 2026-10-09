import { CopilotClient } from '@github/copilot-sdk';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { ProviderAdapter, ProviderContext } from './providers';
import { providerSessionKey, recoverSessionTurn, retainedSdkError, type ProviderSession } from './providers';
import type { Connection, ModelOption } from '../src/types';

export class CopilotAdapter implements ProviderAdapter {
  private conversations = new WeakMap<
    ProviderSession,
    {
      client: CopilotClient;
      session?: Awaited<ReturnType<CopilotClient['createSession']>>;
      identity: string;
      sent: string;
      event?: (event: any) => void;
    }
  >();
  constructor(private create = (options: ConstructorParameters<typeof CopilotClient>[0]) => new CopilotClient(options)) {}
  async run(prompt: string, connection: Connection, context: ProviderContext) {
    // A retained session whose CLI stopped between tool turns is tried once more from a fresh start.
    const held = context.session ? this.conversations.get(context.session) : undefined;
    const continuing = Boolean(held?.session && held.identity === providerSessionKey(connection, context) && prompt.startsWith(held.sent));
    return recoverSessionTurn(context, attempt => this.turn(prompt, connection, attempt), continuing, retainedSdkError);
  }
  private async turn(prompt: string, connection: Connection, context: ProviderContext) {
    const started = Date.now();
    if (!context.key) throw new Error('COPILOT_LOGIN_REQUIRED');
    if (context.images?.length || context.webSearch) throw new Error('PROVIDER_CAPABILITY_UNSUPPORTED');
    if (context.signal.aborted) throw new Error('CANCELLED');
    const holder = context.session;
    const identity = providerSessionKey(connection, context);
    let state = holder ? this.conversations.get(holder) : undefined;
    const reuse = Boolean(state?.session && state.identity === identity && prompt.startsWith(state.sent));
    if (holder && !reuse) {
      await holder.closeAndWait();
      state = undefined;
    }
    if (context.signal.aborted) throw new Error('CANCELLED');
    const client =
      state?.client ||
      this.create({
        mode: 'empty',
        workingDirectory: context.cwd,
        baseDirectory: join(context.cwd, 'copilot'),
        env: context.env,
        gitHubToken: context.key,
        useLoggedInUser: false,
        logLevel: 'none',
      });
    state ||= { client, identity, sent: '' };
    const current = state;
    let timedOut = false,
      interrupted = false;
    const stop = () => {
        interrupted = true;
        if (holder) holder.close();
        else void client.forceStop().catch(() => {});
      },
      timer = setTimeout(() => {
        timedOut = true;
        stop();
      }, 600_000);
    context.signal.addEventListener('abort', stop, { once: true });
    let session = current.session,
      text = '';
    let keep = false;
    current.event = event => {
      if (event.type === 'assistant.message_delta') {
        text += event.data.deltaContent;
        if (text.length > 200_000) stop();
        else context.emit(event.data.deltaContent);
      }
      if (event.type === 'assistant.usage')
        context.onUsage?.({
          input: event.data.inputTokens || 0,
          output: event.data.outputTokens || 0,
          total: (event.data.inputTokens || 0) + (event.data.outputTokens || 0),
          ...(Number.isSafeInteger(event.data.cacheReadTokens) && event.data.cacheReadTokens >= 0
            ? { cachedInput: event.data.cacheReadTokens }
            : {}),
          ...(Number.isSafeInteger(event.data.cacheWriteTokens) && event.data.cacheWriteTokens >= 0
            ? { cacheWriteInput: event.data.cacheWriteTokens }
            : {}),
        });
    };
    if (holder) {
      this.conversations.set(holder, current);
      holder.onClose = async () => {
        current.event = undefined;
        // Deletion requires a connected client; cancellation stops immediately instead.
        if (!interrupted && current.session) await client.deleteSession(current.session.sessionId).catch(() => {});
        await client.forceStop().catch(() => {});
        this.conversations.delete(holder);
      };
    }
    try {
      if (!reuse) await client.start();
      if (context.signal.aborted) throw new Error('CANCELLED');
      session ||= await client.createSession({
        sessionId: randomUUID(),
        ...(connection.model ? { model: connection.model } : {}),
        availableTools: [],
        excludedTools: ['builtin:*', 'mcp:*', 'custom:*'],
        tools: [],
        mcpServers: {},
        customAgents: [],
        skillDirectories: [],
        pluginDirectories: [],
        instructionDirectories: [],
        includedBuiltinSkills: [],
        enableConfigDiscovery: false,
        enableFileHooks: false,
        enableHostGitOperations: false,
        enableSessionStore: false,
        enableSkills: false,
        enableSessionTelemetry: false,
        remoteSession: 'off',
        streaming: true,
        infiniteSessions: { enabled: false },
        systemMessage: { mode: 'replace', content: context.system || 'Produce a text draft only. No tools or external actions.' },
        onPermissionRequest: async () => ({ kind: 'denied-interactively-by-user' }),
        onUserInputRequest: async () => {
          throw new Error('PROVIDER_TOOL_DENIED');
        },
        hooks: { onPreToolUse: async () => ({ permissionDecision: 'deny', permissionDecisionReason: 'STeP native tools disabled' }) },
        onEvent: event => current.event?.(event),
      });
      current.session = session;
      const delta = reuse ? prompt.slice(current.sent.length) : prompt;
      context.onTransport?.({ mode: reuse ? 'delta' : 'full', sentChars: delta.length, startupMs: reuse ? 0 : Date.now() - started });
      const final = await session.sendAndWait({ prompt: delta }, 600_000);
      if (context.signal.aborted) throw new Error('CANCELLED');
      if (text.length > 200_000) throw new Error('PROVIDER_OUTPUT_LIMIT');
      const result = final?.data.content || text;
      if (!result.trim() || result.length > 200_000) throw new Error('PROVIDER_REQUEST_FAILED');
      if (!text) context.emit(result);
      current.sent = prompt;
      keep = Boolean(holder);
      return result;
    } catch (error) {
      if (context.signal.aborted) throw new Error('CANCELLED');
      if (timedOut) throw new Error('PROVIDER_TIMEOUT');
      if (text.length > 200_000) throw new Error('PROVIDER_OUTPUT_LIMIT');
      const message = (error as Error).message;
      throw new Error(
        ['PROVIDER_OUTPUT_LIMIT', 'PROVIDER_TOOL_DENIED', 'CANCELLED'].includes(message) ? message : 'COPILOT_REQUEST_FAILED',
      );
    } finally {
      clearTimeout(timer);
      context.signal.removeEventListener('abort', stop);
      current.event = undefined;
      if (!keep) {
        if (holder) await holder.closeAndWait();
        else {
          if (!interrupted && session) await client.deleteSession(session.sessionId).catch(() => {});
          await client.forceStop().catch(() => {});
        }
      }
    }
  }
}

export async function copilotModels(context: Pick<ProviderContext, 'cwd' | 'env' | 'key'>): Promise<ModelOption[]> {
  if (!context.key) throw new Error('COPILOT_LOGIN_REQUIRED');
  const client = new CopilotClient({
    mode: 'empty',
    workingDirectory: context.cwd,
    baseDirectory: join(context.cwd, 'copilot'),
    env: context.env,
    gitHubToken: context.key,
    useLoggedInUser: false,
    logLevel: 'none',
  });
  const timeout = setTimeout(() => void client.forceStop().catch(() => {}), 30_000);
  try {
    await client.start();
    return (await client.listModels()).slice(0, 100).map(m => ({ id: m.id, label: m.name || m.id }));
  } catch {
    throw new Error('MODEL_LIST_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
    await client.forceStop().catch(() => {});
  }
}
