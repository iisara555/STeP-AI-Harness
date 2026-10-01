import { CopilotClient } from '@github/copilot-sdk';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { ProviderAdapter, ProviderContext } from './providers';
import type { Connection, ModelOption } from '../src/types';

export class CopilotAdapter implements ProviderAdapter {
  constructor(private create = (options: ConstructorParameters<typeof CopilotClient>[0]) => new CopilotClient(options)) {}
  async run(prompt: string, connection: Connection, context: ProviderContext) {
    if (!context.key) throw new Error('COPILOT_LOGIN_REQUIRED');
    if (context.images?.length || context.webSearch) throw new Error('PROVIDER_CAPABILITY_UNSUPPORTED');
    if (context.signal.aborted) throw new Error('CANCELLED');
    const client = this.create({
      mode: 'empty',
      workingDirectory: context.cwd,
      baseDirectory: join(context.cwd, 'copilot'),
      env: context.env,
      gitHubToken: context.key,
      useLoggedInUser: false,
      logLevel: 'none',
    });
    let timedOut = false;
    const stop = () => void client.forceStop().catch(() => {}),
      timer = setTimeout(() => {
        timedOut = true;
        stop();
      }, 600_000);
    context.signal.addEventListener('abort', stop, { once: true });
    let session: Awaited<ReturnType<CopilotClient['createSession']>> | undefined,
      text = '';
    try {
      await client.start();
      if (context.signal.aborted) throw new Error('CANCELLED');
      session = await client.createSession({
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
        onEvent: event => {
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
            });
        },
      });
      const final = await session.sendAndWait({ prompt }, 600_000);
      if (context.signal.aborted) throw new Error('CANCELLED');
      if (text.length > 200_000) throw new Error('PROVIDER_OUTPUT_LIMIT');
      const result = final?.data.content || text;
      if (!result.trim() || result.length > 200_000) throw new Error('PROVIDER_REQUEST_FAILED');
      if (!text) context.emit(result);
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
      if (session) await client.deleteSession(session.sessionId).catch(() => {});
      await client.forceStop().catch(() => {});
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
