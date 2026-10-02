import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mkdir } from 'node:fs/promises';
import type { McpServer, Policy } from './policy';
import { sensitivePath, evaluatePermission } from './permissions';
import { killPidTree } from './bounded-process';
import { tm } from './i18n';

export type McpTool = { server: string; name: string; description: string; inputSchema: unknown };
type Consent = (title: string, text: string, signal?: AbortSignal) => Promise<boolean>;
/** SDK capabilities are deliberately empty: servers cannot request sampling, roots or elicitation. */
export class Mcp {
  private clients = new Set<Client>();
  private closers = new Map<Client, () => Promise<void>>();
  constructor(
    private policy: () => Policy,
    private identity: () => string,
    private home: string,
    private privacy: (text: string) => any,
    private consent: Consent,
  ) {}
  servers() {
    return this.policy().mcpServers.map(s => ({ name: s.name, transport: s.transport }));
  }
  async close() {
    await Promise.allSettled([...this.clients].map(c => this.closers.get(c)?.() || c.close()));
    this.clients.clear();
  }
  private async connected<T>(
    server: McpServer,
    signal: AbortSignal | undefined,
    action: (client: Client, check: () => void) => Promise<T>,
  ) {
    const policy = this.policy(),
      identity = this.identity();
    const check = () => {
      if (signal?.aborted) throw new Error('CANCELLED');
      if (policy !== this.policy() || !this.policy().features.mcp) throw new Error('MCP_DISABLED');
      if (identity !== this.identity()) throw new Error('WORKSPACE_CHANGED');
    };
    check();
    const client = new Client({ name: 'step-desktop', version: '0.5.0' }, { capabilities: {} });
    await mkdir(this.home, { recursive: true, mode: 0o700 });
    let transport: StdioClientTransport | StreamableHTTPClientTransport;
    if (server.transport === 'stdio') {
      const env = Object.fromEntries(
        ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'PATHEXT'].filter(k => process.env[k]).map(k => [k, process.env[k]!]),
      );
      transport = new StdioClientTransport({
        command: server.command,
        args: server.args,
        cwd: this.home,
        env: {
          ...env,
          HOME: this.home,
          USERPROFILE: this.home,
          APPDATA: this.home,
          LOCALAPPDATA: this.home,
          TEMP: this.home,
          TMP: this.home,
        },
        stderr: 'pipe',
        maxBufferSize: 1_000_000,
      });
      let stderr = 0;
      transport.stderr?.on('data', (data: Buffer) => {
        stderr += data.length;
        if (stderr > 200_000) stop();
      });
    } else {
      const endpoint = new URL(server.url);
      if (endpoint.username || endpoint.password || endpoint.hash || !['http:', 'https:'].includes(endpoint.protocol))
        throw new Error('MCP_URL_INVALID');
      transport = new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers: server.headers },
        reconnectionOptions: { maxRetries: 2, initialReconnectionDelay: 250, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 2 },
        fetch: async (url, init) => {
          check();
          const target = new URL(String(url));
          if (target.origin !== endpoint.origin || target.pathname !== endpoint.pathname) throw new Error('MCP_URL_INVALID');
          const response = await fetch(url, { ...init, redirect: 'error' });
          let size = 0;
          if (!response.body) return response;
          const bounded = response.body.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, control) {
                size += chunk.byteLength;
                if (size > 1_000_000) control.error(new Error('MCP_OUTPUT_LIMIT'));
                else control.enqueue(chunk);
              },
            }),
          );
          return new Response(bounded, { status: response.status, statusText: response.statusText, headers: response.headers });
        },
      });
    }
    let closing: Promise<void> | undefined;
    const close = () =>
      (closing ||= (async () => {
        if (transport instanceof StdioClientTransport && transport.pid) await killPidTree(transport.pid);
        await client.close().catch(() => {});
      })());
    this.clients.add(client);
    this.closers.set(client, close);
    const stop = () => void close();
    const timer = setTimeout(stop, 60_000),
      watcher = setInterval(() => {
        try {
          check();
        } catch {
          stop();
        }
      }, 250);
    signal?.addEventListener('abort', stop, { once: true });
    try {
      await client.connect(transport, { timeout: 15_000 });
      check();
      const result = await action(client, check);
      check();
      return result;
    } catch (error) {
      check();
      throw new Error(
        ['MCP_OUTPUT_LIMIT', 'MCP_TOOL_LIMIT'].includes((error as Error).message) ? (error as Error).message : 'MCP_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timer);
      clearInterval(watcher);
      signal?.removeEventListener('abort', stop);
      await close();
      this.closers.delete(client);
      this.clients.delete(client);
    }
  }
  private server(name: string) {
    if (!this.policy().features.mcp) throw new Error('MCP_DISABLED');
    const server = this.policy().mcpServers.find(s => s.name === name);
    if (!server) throw new Error('MCP_SERVER_NOT_ALLOWED');
    return server;
  }
  async search(name: string, query = '', signal?: AbortSignal) {
    const server = this.server(name),
      policy = this.policy(),
      identity = this.identity();
    if (
      !(await this.consent(
        tm('ค้นหาเครื่องมือจาก MCP?'),
        tm('เชื่อมต่อ server ที่ผู้ดูแลกำหนด: {0}\nจะส่งเฉพาะข้อมูลเริ่มต้นของแอป', name),
        signal,
      ))
    )
      throw new Error('CANCELLED');
    if (policy !== this.policy() || identity !== this.identity()) throw new Error('POLICY_CHANGED');
    // Discovery is idempotent. Calls below are never replayed after an uncertain remote execution.
    for (let attempt = 0; ; attempt++)
      try {
        return await this.connected(server, signal, async (client, check) => {
          const tools: McpTool[] = [];
          const seen = new Set<string>();
          let cursor: string | undefined;
          do {
            const page = await client.listTools(cursor ? { cursor } : undefined, { timeout: 15_000 });
            check();
            for (const t of page.tools) {
              if (tools.length >= 100) throw new Error('MCP_TOOL_LIMIT');
              const tool = { server: name, name: t.name, description: (t.description || '').slice(0, 2000), inputSchema: t.inputSchema };
              if (JSON.stringify(tool).length > 20_000) throw new Error('MCP_TOOL_LIMIT');
              tools.push(tool);
            }
            cursor = page.nextCursor;
            if (cursor && seen.has(cursor)) throw new Error('MCP_TOOL_LIMIT');
            if (cursor) seen.add(cursor);
          } while (cursor);
          const words = query.toLowerCase().split(/\s+/).filter(Boolean);
          return {
            total: tools.length,
            searchRequired: tools.length > 12,
            tools: tools
              .filter(t => !words.length || words.every(w => (t.name + ' ' + t.description).toLowerCase().includes(w)))
              .slice(0, 12),
          };
        });
      } catch (error) {
        if (signal?.aborted || attempt >= 2 || (error as Error).message !== 'MCP_UNAVAILABLE') throw error;
      }
  }
  async call(name: string, tool: string, args: Record<string, unknown>, signal?: AbortSignal) {
    const server = this.server(name),
      policy = this.policy(),
      identity = this.identity();
    if (!tool || tool.length > 120 || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('INVALID_INPUT');
    const text = JSON.stringify(args);
    if (text.length > 30_000) throw new Error('INVALID_INPUT');
    const scan = this.privacy(text);
    if (scan.action !== 'pass' || scan.containsPersonalData || scan.redactedText !== text) throw new Error('PRIVACY_REVIEW_REQUIRED');
    const inspect = (v: unknown) => {
      if (
        typeof v === 'string' &&
        (sensitivePath(v) || !evaluatePermission({ tool: 'mcp_call', readOnly: false, command: v, path: v }, 'ask', policy).allowed)
      )
        throw new Error('MCP_ARGUMENT_DENIED');
      if (v && typeof v === 'object') Object.values(v).forEach(inspect);
    };
    inspect(args);
    if (
      !(await this.consent(
        tm('เรียกใช้เครื่องมือ MCP?'),
        tm(
          'ปลายทาง: {0}\nเครื่องมือ: {1}\nข้อมูลที่จะส่ง:\n{2}\nคำอธิบายและสิทธิ์ที่ server อ้างไม่ใช่การอนุมัติของ STeP',
          name,
          tool,
          text,
        ),
        signal,
      ))
    )
      throw new Error('CANCELLED');
    if (policy !== this.policy() || identity !== this.identity()) throw new Error('POLICY_CHANGED');
    return this.connected(server, signal, async (client, check) => {
      const result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 30_000 });
      check();
      if (JSON.stringify(result).length > 200_000) throw new Error('MCP_OUTPUT_LIMIT');
      return result;
    });
  }
}
