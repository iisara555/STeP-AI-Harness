import { createRpc, ClaudeAdapter, closeClaudeSpares } from '../../electron/providers.ts';
import { NATIVE_SCHEMA, TOOLS } from './spec.mjs';
import { z } from 'zod';
import { providerUsage } from '../../../src/modules/providers/usage.js';

export const mcpShape = {
  tool: z.enum(TOOLS),
  input: z.string().max(2000),
  argsJson: z.string().max(200000),
  content: z.string().max(200000),
};

export function observeClaudeSdk(sdk, onModel, onBudgetUsage) {
  const messages = new Map();
  return {
    ...sdk,
    // Prevent a parked process from contaminating this measured cold trial.
    prewarm: undefined,
    query: options => {
      const stream = sdk.query(options);
      return new Proxy(stream, {
        get(target, key) {
          if (key === 'next')
            return async (...args) => {
              const event = await target.next(...args);
              const model =
                event.value?.type === 'system' && event.value.subtype === 'init' ? event.value.model : event.value?.message?.model;
              if (typeof model === 'string' && /^claude-[A-Za-z0-9.-]+$/.test(model)) onModel?.(model);
              const message = event.value?.type === 'assistant' ? event.value.message : undefined;
              if (onBudgetUsage && message?.id && message.usage) {
                const next = providerUsage('anthropic', message.usage);
                const previous = messages.get(message.id) || { input: 0, output: 0, total: 0 };
                messages.set(message.id, {
                  input: Math.max(next.input, previous.input),
                  output: Math.max(next.output, previous.output),
                  total: Math.max(next.total, previous.total),
                });
                onBudgetUsage({ total: [...messages.values()].reduce((n, u) => n + u.total, 0), lastInput: next.input });
              }
              return event;
            };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
}

export async function nativeClaude(prompt, connection, context, dispatch) {
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  const bridge = sdk.createSdkMcpServer({
    name: 'step-eval',
    version: '1.0.0',
    tools: [
      sdk.tool(
        'step_host',
        'Call a governed STeP host tool. All permission and privacy checks remain in the host.',
        mcpShape,
        async args => {
          const result = await dispatch(args);
          if (!context.allowNextNativeTurn?.()) context.stopProbe();
          return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: !result.ok };
        },
        { alwaysLoad: true },
      ),
    ],
  });
  const adapter = new ClaudeAdapter(async () =>
    observeClaudeSdk(
      {
        ...sdk,
        query: ({ prompt, options }) =>
          sdk.query({
            prompt,
            options: {
              ...options,
              tools: [],
              allowedTools: [],
              mcpServers: { step_eval: bridge },
              maxTurns: 8,
              canUseTool: async (name, input) =>
                name === 'mcp__step_eval__step_host'
                  ? { behavior: 'allow', updatedInput: input }
                  : { behavior: 'deny', message: 'EVAL_TOOL_DISABLED' },
            },
          }),
      },
      context.onModel,
      context.onBudgetUsage,
    ),
  );
  try {
    return await adapter.run(prompt, connection, context);
  } finally {
    closeClaudeSpares(connection.id);
  }
}

export async function nativeCodex(prompt, connection, context, dispatch) {
  const rpc = createRpc(connection, context);
  const abort = () => rpc.close();
  context.signal.addEventListener('abort', abort, { once: true });
  try {
    await rpc.request('initialize', {
      clientInfo: { name: 'step-parity-eval', version: '1.0.0' },
      capabilities: { experimentalApi: true },
    });
    rpc.notify('initialized');
    rpc.onRequest = async (method, params) => {
      if (method !== 'item/tool/call' || params.tool !== 'step_host') throw new Error('EVAL_TOOL_DISABLED');
      const result = await dispatch(params.arguments);
      if (context.probeOnly) context.stopProbe();
      return { contentItems: [{ type: 'inputText', text: JSON.stringify(result) }], success: result.ok };
    };
    const result = await rpc.request('thread/start', {
      cwd: context.cwd,
      model: connection.model,
      approvalPolicy: 'untrusted',
      sandbox: 'read-only',
      ephemeral: true,
      developerInstructions: context.system,
      config: {
        web_search: 'disabled',
        features: { shell_tool: false, plugins: false, apps: false, remote_plugin: false, goals: false },
        mcp_servers: {},
      },
      dynamicTools: [
        {
          name: 'step_host',
          description: 'Call a governed STeP host tool. Permission and privacy checks remain in the host.',
          inputSchema: NATIVE_SCHEMA,
        },
      ],
    });
    if (context.preflightOnly) return { initialized: true, dynamicToolRegistered: true, modelCalls: 0 };
    return await new Promise((resolve, reject) => {
      let text = '';
      const unsubscribe = rpc.onClose(reject);
      rpc.onNotification = (method, params) => {
        if (method === 'item/agentMessage/delta') text += params.delta;
        if (method === 'thread/tokenUsage/updated' && params.tokenUsage?.total) {
          const t = params.tokenUsage.total;
          context.onUsage?.({ input: t.inputTokens, output: t.outputTokens, total: t.totalTokens, cachedInput: t.cachedInputTokens });
        }
        if (method === 'turn/completed') {
          unsubscribe();
          if (params.turn.status === 'completed') resolve(text);
          else reject(new Error('PROVIDER_REQUEST_FAILED'));
        }
      };
      rpc
        .request('turn/start', { threadId: result.thread.id, input: [{ type: 'text', text: prompt }], effort: context.effort })
        .catch(reject);
    });
  } finally {
    context.signal.removeEventListener('abort', abort);
    await rpc.closeAndWait();
  }
}
