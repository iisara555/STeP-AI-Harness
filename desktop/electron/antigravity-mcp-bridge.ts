import { randomUUID, timingSafeEqual } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server as NetServer, type Socket } from 'node:net';
import { join } from 'node:path';
import { LOOP_TOOLS, taskAction, type LoopRequest } from '../src/tools';
import { validateToolRequest } from '../src/tool-registry';

export const NATIVE_STEP_HOST_SCHEMA = {
  type: 'object',
  required: ['tool', 'input'],
  properties: {
    tool: { enum: [...LOOP_TOOLS] },
    input: { type: 'string', maxLength: 2000 },
    content: { type: 'string', maxLength: 200000 },
    args: { type: 'object' },
  },
  additionalProperties: false,
} as const;

export type AntigravityMcpBridgeConfig = {
  command: string;
  args: string[];
  env: Record<string, string>;
  endpoint: string;
};

export type GovernedBridgeResponse = {
  ok: boolean;
  result?: unknown;
  code?: string;
  hint?: string;
};

/**
 * How long one bridge call may take, approvals included: just under agy's default 180-second MCP tool timeout, so the
 * model gets STeP's BRIDGE_TIMEOUT instead of agy's. The socket then closes, which cancels the host call (and an
 * approval still open) so nothing runs after the model was told it failed.
 */
export const BRIDGE_CALL_MS = 170_000;

export type GovernedBridgeExecutor = (request: LoopRequest, signal: AbortSignal) => Promise<GovernedBridgeResponse>;

const GOVERNED_BRIDGE_TOOL_NAMES = new Set([
  'step_host',
  'mcp:step_host:step_host',
  'mcp(step_host/step_host)',
  'mcp__step_host__step_host',
  'call_mcp_tool',
]);

/** Only the single governed STeP host MCP bridge tool is permitted during native bridge execution. */
export function isGovernedBridgeTool(name: unknown): boolean {
  return typeof name === 'string' && GOVERNED_BRIDGE_TOOL_NAMES.has(name.trim());
}

function sameToken(expected: string, actual: unknown): boolean {
  if (typeof actual !== 'string' || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(actual, 'utf8'));
}

/**
 * Local per-run MCP bridge over an authenticated Windows named pipe or 0600 Unix domain socket.
 * The stdio child inside agy holds zero workspace/credential authority and only forwards `step_host`
 * calls to the governed STeP host callback.
 */
export class AntigravityMcpBridge {
  private server?: NetServer;
  private sockets = new Set<Socket>();
  private sockDir?: string;
  private closed = false;
  readonly token = randomUUID();
  endpoint = '';

  constructor(
    private readonly execute: GovernedBridgeExecutor,
    private readonly signal?: AbortSignal,
  ) {}

  async start(home: string): Promise<AntigravityMcpBridgeConfig> {
    if (this.closed) throw new Error('CANCELLED');
    if (process.platform === 'win32') {
      this.endpoint = `\\\\.\\pipe\\step-agy-host-${randomUUID()}`;
    } else {
      // macOS sockaddr_un.sun_path is 104 bytes (103 chars); fall back to a 0700 /tmp dir when TMPDIR is long.
      const candidate = join(home, 'h.sock');
      if (candidate.length <= 96) {
        this.endpoint = candidate;
      } else {
        this.sockDir = await mkdtemp('/tmp/step-agy-');
        await chmod(this.sockDir, 0o700).catch(() => {});
        this.endpoint = join(this.sockDir, 'h.sock');
      }
    }

    const runnerPath = join(home, 'step-mcp-stdio.mjs');
    const runnerSource = [
      `import { connect } from 'node:net';`,
      `import { createInterface } from 'node:readline';`,
      `const endpoint = process.argv[2];`,
      `const token = process.env.STEP_MCP_TOKEN || '';`,
      `if (!endpoint || !token) process.exit(1);`,
      `const schema = ${JSON.stringify(NATIVE_STEP_HOST_SCHEMA)};`,
      `const send = msg => process.stdout.write(JSON.stringify(msg) + '\\n');`,
      `const callBridge = args => new Promise((resolve, reject) => {`,
      `  const socket = connect(endpoint);`,
      `  let text = '';`,
      `  socket.setTimeout(${BRIDGE_CALL_MS}, () => socket.destroy(new Error('BRIDGE_TIMEOUT')));`,
      `  socket.on('connect', () => socket.write(JSON.stringify({ token, arguments: args || {} }) + '\\n'));`,
      `  socket.on('error', reject);`,
      `  socket.on('data', chunk => {`,
      `    text += chunk.toString('utf8');`,
      `    if (text.length > 1000000) return socket.destroy(new Error('TOOL_OUTPUT_LIMIT'));`,
      `    const nl = text.indexOf('\\n');`,
      `    if (nl >= 0) {`,
      `      try { resolve(JSON.parse(text.slice(0, nl))); } catch { reject(new Error('INVALID_TOOL_RESULT')); }`,
      `      socket.end();`,
      `    }`,
      `  });`,
      `});`,
      `createInterface({ input: process.stdin }).on('line', async line => {`,
      `  if (!line.trim()) return;`,
      `  let req;`,
      `  try { req = JSON.parse(line); } catch { return; }`,
      `  if (req.id === undefined) return;`,
      `  try {`,
      `    if (req.method === 'initialize') {`,
      `      return send({ jsonrpc: '2.0', id: req.id, result: { protocolVersion: req.params?.protocolVersion || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'step_host', version: '1.0.0' } } });`,
      `    }`,
      `    if (req.method === 'ping') return send({ jsonrpc: '2.0', id: req.id, result: {} });`,
      `    if (req.method === 'tools/list') {`,
      `      return send({ jsonrpc: '2.0', id: req.id, result: { tools: [{ name: 'step_host', description: 'Call a governed STeP host tool. Host permission, authority and privacy checks apply.', inputSchema: schema }] } });`,
      `    }`,
      `    if (req.method === 'tools/call') {`,
      `      if (req.params?.name !== 'step_host') {`,
      `        return send({ jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: JSON.stringify({ ok: false, code: 'TOOL_DENIED' }) }], isError: true } });`,
      `      }`,
      `      const result = await callBridge(req.params?.arguments || {});`,
      `      return send({ jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: JSON.stringify(result) }], isError: !result?.ok } });`,
      `    }`,
      `    send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'Method not found' } });`,
      `  } catch (err) {`,
      `    send({ jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: JSON.stringify({ ok: false, code: err?.message || 'BRIDGE_ERROR' }) }], isError: true } });`,
      `  }`,
      `});`,
    ].join('\n');

    await writeFile(runnerPath, runnerSource, { mode: 0o600 });

    this.server = createServer(socket => {
      this.sockets.add(socket);
      socket.once('close', () => this.sockets.delete(socket));
      let buffer = '';
      let handled = false;
      // A caller that goes away (timeout, agy stopped) cancels its host call.
      const gone = new AbortController();
      socket.once('close', () => gone.abort());
      socket.setTimeout(BRIDGE_CALL_MS + 5_000, () => socket.destroy());
      socket.on('error', () => {});
      socket.on('data', chunk => {
        if (handled) return;
        buffer += chunk.toString('utf8');
        if (buffer.length > 260_000) {
          handled = true;
          socket.end(JSON.stringify({ ok: false, code: 'INVALID_INPUT' }) + '\n');
          return;
        }
        const nl = buffer.indexOf('\n');
        if (nl < 0) return;
        handled = true;
        void this.handleLine(buffer.slice(0, nl), gone.signal).then(response => {
          if (!socket.destroyed) socket.end(JSON.stringify(response) + '\n');
        });
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.endpoint, () => resolve());
    });
    if (process.platform !== 'win32') await chmod(this.endpoint, 0o600).catch(() => {});
    if (this.signal) {
      if (this.signal.aborted) {
        await this.close();
        throw new Error('CANCELLED');
      }
      this.signal.addEventListener('abort', () => void this.close(), { once: true });
    }

    return {
      command: process.execPath,
      args: [runnerPath, this.endpoint],
      env: { ELECTRON_RUN_AS_NODE: '1', STEP_MCP_TOKEN: this.token },
      endpoint: this.endpoint,
    };
  }

  /** Direct in-process validation and dispatch using the exact same rules as socket calls. */
  async invoke(rawArgs: unknown, caller?: AbortSignal): Promise<GovernedBridgeResponse> {
    if (this.closed || this.signal?.aborted || caller?.aborted) return { ok: false, code: 'CANCELLED' };
    try {
      validateToolRequest(rawArgs);
      const req = rawArgs as LoopRequest;
      if (req.tool === 'tasks') taskAction(req.input, req.args);
      return await this.execute(
        {
          tool: req.tool,
          input: req.input,
          ...(req.content !== undefined ? { content: req.content } : {}),
          ...(req.args ? { args: req.args } : {}),
        },
        AbortSignal.any([this.signal, caller].filter((signal): signal is AbortSignal => Boolean(signal))),
      );
    } catch (error) {
      const code = /^[A-Z_]+$/.test((error as Error)?.message || '') ? (error as Error).message : 'INVALID_INPUT';
      const field = (error as { field?: unknown })?.field;
      return {
        ok: false,
        code,
        ...(typeof field === 'string' && field ? { hint: field.slice(0, 160) } : {}),
      };
    }
  }

  private async handleLine(line: string, caller: AbortSignal): Promise<GovernedBridgeResponse> {
    let envelope: { token?: unknown; arguments?: unknown; request?: unknown };
    try {
      envelope = JSON.parse(line);
    } catch {
      return { ok: false, code: 'INVALID_INPUT' };
    }
    if (!envelope || typeof envelope !== 'object' || !sameToken(this.token, envelope.token)) {
      return { ok: false, code: 'TOOL_DENIED' };
    }
    return this.invoke(envelope.arguments ?? envelope.request, caller);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    const server = this.server;
    this.server = undefined;
    if (server) {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
    if (this.sockDir) {
      await rm(this.sockDir, { recursive: true, force: true }).catch(() => {});
      this.sockDir = undefined;
    }
  }
}
