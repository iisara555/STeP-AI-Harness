import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { antigravityHome, runAntigravity, antigravityUsage, ANTIGRAVITY_DENY } from '../../electron/antigravity.ts';

export async function nativeAntigravity(prompt, connection, context, dispatch) {
  const home = await antigravityHome(context);
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\step-parity-${randomUUID()}` : join(home.cwd, 'bridge.sock');
  const sockets = new Set();
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let text = '',
      used = false;
    socket.setTimeout(30000, () => socket.destroy());
    socket.on('data', bytes => {
      text += bytes;
      if (text.length > 210000 || used) return socket.destroy();
      if (!text.includes('\n')) return;
      used = true;
      void (async () => {
        let value;
        try {
          value = JSON.parse(text.slice(0, text.indexOf('\n')));
        } catch {
          socket.end(JSON.stringify({ ok: false, code: 'INVALID_TOOL_REQUEST' }) + '\n');
          return;
        }
        const result = await dispatch(value);
        if (context.probeOnly) context.stopProbe();
        else await context.beforeNativeStep?.();
        socket.end(JSON.stringify(result) + '\n');
      })().catch(() => socket.destroy());
    });
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(endpoint, resolve);
    });
    const config = join(home.env.HOME, '.gemini/config/mcp_config.json');
    await mkdir(dirname(config), { recursive: true });
    await writeFile(
      config,
      JSON.stringify({
        mcpServers: { step_eval: { command: process.execPath, args: [fileURLToPath(new URL('./stdio.mjs', import.meta.url)), endpoint] } },
      }),
    );
    await writeFile(
      join(home.env.HOME, '.gemini/antigravity-cli/settings.json'),
      JSON.stringify({
        toolPermission: 'strict',
        artifactReviewPolicy: 'asks-for-review',
        allowNonWorkspaceAccess: false,
        permissions: { allow: ['mcp(step_eval/step_host)'], ask: [], deny: ANTIGRAVITY_DENY.filter(rule => rule !== 'mcp(*)') },
      }),
    );
    await writeFile(
      join(home.env.HOME, '.gemini/config/agents/step-draft/agent.md'),
      // MCP definitions come from the isolated global config, not a tools
      // alias or a string[] mcpServers frontmatter (the CLI expects objects).
      '---\nname: step-draft\ndescription: STeP governed native-tool evaluation\ntools: [finish, mcp]\nexcludeDefaultComponents: true\nmainAgent: true\nsubagent: false\ncommandExecutionPolicy: off\nskills: []\nplugins: []\n---\n' +
        context.system,
    );
    const configured = await runAntigravity(connection.executable, ['mcp', 'list'], home, {
      signal: context.signal,
      timeoutMs: 10000,
    });
    if (!/\bstep_eval\b/.test(configured.output)) throw new Error('EVAL_NATIVE_MCP_UNAVAILABLE');
    let initialized = false,
      result;
    let nativeCatalog = [];
    const diagnosticLines = [];
    let observed = { input: 0, output: 0, total: 0 };
    const steps = new Map();
    try {
      await runAntigravity(
        connection.executable,
        [
          '--agent',
          'step-draft',
          '--disable-slash-commands',
          '--input-format',
          'stream-json',
          '--output-format',
          'stream-json',
          '--print-timeout',
          '4m',
          '--model',
          connection.model,
          '--effort',
          context.effort,
        ],
        home,
        {
          signal: context.signal,
          holdInput: true,
          timeoutMs: 245000,
          line: (line, send) => {
            let event;
            try {
              event = JSON.parse(line);
            } catch {
              diagnosticLines.push(line.slice(0, 2000));
              if (diagnosticLines.length > 8) diagnosticLines.shift();
              return;
            }
            if (event.event === 'init') {
              const canonical = path => (process.platform === 'win32' ? realpathSync(path).toLowerCase() : realpathSync(path));
              if (
                initialized ||
                event.init?.agent !== 'step-draft' ||
                event.init?.permission_mode !== 'strict' ||
                typeof event.init?.cwd !== 'string' ||
                canonical(event.init.cwd) !== canonical(home.cwd)
              )
                throw new Error('EVAL_NATIVE_INIT_REJECTED');
              initialized = true;
              // agy 1.2.17 advertises a generic call_mcp_tool, not expanded
              // server/tool names. Its isolated config contains only step_eval.
              nativeCatalog = (event.init.tools || []).filter(tool => tool === 'call_mcp_tool' || tool === 'mcp__step_eval__step_host');
              if (!nativeCatalog.length) throw new Error('EVAL_NATIVE_MCP_UNAVAILABLE');
              if (context.preflightOnly) throw new Error('EVAL_PREFLIGHT_COMPLETE');
              send({ event: 'user', message: { content: prompt } });
            }
            if (event.event === 'step_update') {
              const step = event.step_update;
              if (
                (step.step_type === 'tool' || step.tool_info?.name) &&
                step.tool_name !== 'finish' &&
                !nativeCatalog.includes(step.tool_name || step.tool_info?.name)
              )
                throw new Error('EVAL_NATIVE_TOOL_DENIED');
              if (step.state === 'DONE' && step.usage && !steps.has(step.step_index)) {
                const usage = antigravityUsage(step.usage);
                steps.set(step.step_index, usage);
                for (const key of ['input', 'output', 'total', 'cachedInput']) observed[key] = (observed[key] || 0) + (usage[key] || 0);
                context.onBudgetUsage?.({ ...observed, lastInput: usage.input });
              }
            }
            if (event.event === 'result') {
              result = event.result;
              const usage = antigravityUsage(result?.usage);
              if (usage) context.onUsage?.(usage);
            }
          },
        },
      );
    } catch (e) {
      if (context.preflightOnly && initialized && e.message === 'EVAL_PREFLIGHT_COMPLETE')
        return { initialized, nativeCatalog, mcpConfigured: true, nativeModelUseVerified: false, modelCalls: 0 };
      const diagnostic = [...(e.detail || []), ...diagnosticLines, JSON.stringify(result || {})].join('\n');
      context.onDiagnostic?.({
        modelEffortConflict: /invalid model selection|conflicts with.*effort/i.test(diagnostic),
        configParse: /yaml|unmarshal|configuration.*(?:invalid|failed)/i.test(diagnostic),
        mcpStartup: /mcp/i.test(diagnostic),
        missingModule: /cannot find module|ERR_MODULE|module not found/i.test(diagnostic),
        agentOrTool: /agent|unknown tool|invalid tool/i.test(diagnostic),
        authentication: /authenticat|sign.?in|oauth|credential/i.test(diagnostic),
        backend: /trajectory|transport|connect|backend|network/i.test(diagnostic),
        quota: /quota|rate.?limit|resource.?exhaust/i.test(diagnostic),
      });
      if (/invalid model selection|conflicts with.*effort/i.test(diagnostic)) throw new Error('EVAL_MODEL_EFFORT_CONFLICT');
      throw e;
    }
    if (!initialized || result?.status !== 'SUCCESS' || typeof result.response !== 'string') throw new Error('EVAL_NATIVE_RESULT_FAILED');
    return result.response;
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
    await home.close();
  }
}
