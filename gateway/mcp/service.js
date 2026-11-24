import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createInterface } from "node:readline";

export const PROTOCOL_VERSION = "2025-11-25";
export const MAX_BODY_BYTES = 64_000;
export const MAX_OUTPUT_BYTES = 180_000;
export const MAX_TOOLS = 100;
export const DEFAULT_TOOL_TIMEOUT_MS = 25_000;
export const MIN_TOKEN_LENGTH = 32;
export const PAGE_SIZE = 50;

const TOOL_NAME_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const CURSOR_RE = /^(?:0|[1-9]\d*)$/;
const DEFAULT_MAX_STRING = 2000;

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function jsonRpcError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id: id === undefined ? null : id,
    error: { code, message },
  };
}

function makeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function validateArgs(schema, args) {
  if (!isPlainObject(args)) {
    throw makeError("INVALID_PARAMS", "arguments must be an object");
  }
  const properties = isPlainObject(schema?.properties) ? schema.properties : {};
  if (schema?.additionalProperties === false) {
    for (const key of Object.keys(args)) {
      if (!Object.hasOwn(properties, key)) {
        throw makeError("INVALID_PARAMS", `unexpected argument: ${key}`);
      }
    }
  }
  const required = Array.isArray(schema?.required) ? schema.required : [];
  for (const key of required) {
    const val = args[key];
    if (val === undefined || val === null || (typeof val === "string" && !val.trim())) {
      throw makeError("INVALID_PARAMS", `missing required argument: ${key}`);
    }
  }
  for (const [key, prop] of Object.entries(properties)) {
    if (!Object.hasOwn(args, key) || args[key] === undefined) continue;
    const val = args[key];
    if (!isPlainObject(prop)) continue;
    if (prop.type === "string") {
      if (typeof val !== "string") {
        throw makeError("INVALID_PARAMS", `argument ${key} must be a string`);
      }
      const maxLen =
        typeof prop.maxLength === "number" && Number.isFinite(prop.maxLength)
          ? prop.maxLength
          : DEFAULT_MAX_STRING;
      if (val.length > maxLen) {
        throw makeError("INVALID_PARAMS", `argument ${key} exceeds maxLength`);
      }
      if (typeof prop.minLength === "number" && val.length < prop.minLength) {
        throw makeError("INVALID_PARAMS", `argument ${key} below minLength`);
      }
    } else if (prop.type === "number") {
      if (typeof val !== "number" || !Number.isFinite(val)) {
        throw makeError("INVALID_PARAMS", `argument ${key} must be a finite number`);
      }
    } else if (prop.type === "integer") {
      if (typeof val !== "number" || !Number.isInteger(val)) {
        throw makeError("INVALID_PARAMS", `argument ${key} must be an integer`);
      }
    } else if (prop.type === "boolean") {
      if (typeof val !== "boolean") {
        throw makeError("INVALID_PARAMS", `argument ${key} must be a boolean`);
      }
    }
    if (Array.isArray(prop.enum) && !prop.enum.includes(val)) {
      throw makeError("INVALID_PARAMS", `argument ${key} is not an allowed value`);
    }
    if (typeof val === "number") {
      if (typeof prop.minimum === "number" && val < prop.minimum) {
        throw makeError("INVALID_PARAMS", `argument ${key} below minimum`);
      }
      if (typeof prop.maximum === "number" && val > prop.maximum) {
        throw makeError("INVALID_PARAMS", `argument ${key} exceeds maximum`);
      }
    }
  }
}

export class StepMcpServer {
  constructor({
    tools = [],
    serverInfo = { name: "step-org-mcp", version: "0.1.0" },
    authToken,
    endpointPath = "/mcp",
    toolTimeoutMs = DEFAULT_TOOL_TIMEOUT_MS,
    onAudit,
  } = {}) {
    if (
      typeof endpointPath !== "string" ||
      !endpointPath.startsWith("/") ||
      /[\s?#]/.test(endpointPath)
    ) {
      throw new Error("MCP_ENDPOINT_INVALID");
    }
    if (!Number.isInteger(toolTimeoutMs) || toolTimeoutMs < 100 || toolTimeoutMs > 120_000) {
      throw new Error("MCP_TIMEOUT_INVALID");
    }
    if (authToken !== undefined && (typeof authToken !== "string" || authToken.length < MIN_TOKEN_LENGTH)) {
      throw new Error("MCP_AUTH_TOKEN_REQUIRED");
    }
    this.serverInfo = serverInfo;
    this.authToken = authToken;
    this.endpointPath = endpointPath;
    this.toolTimeoutMs = toolTimeoutMs;
    this.onAudit = typeof onAudit === "function" ? onAudit : undefined;
    this.tools = new Map();
    for (const def of tools) this.registerTool(def);
  }

  registerTool(def) {
    if (this.tools.size >= MAX_TOOLS) {
      throw new Error("MCP_TOOL_LIMIT");
    }
    if (
      !isPlainObject(def) ||
      typeof def.name !== "string" ||
      !TOOL_NAME_RE.test(def.name) ||
      this.tools.has(def.name) ||
      typeof def.description !== "string" ||
      !def.description.trim() ||
      def.description.length > 1500 ||
      !isPlainObject(def.inputSchema) ||
      typeof def.handler !== "function"
    ) {
      throw new Error("MCP_TOOL_DEFINITION_INVALID");
    }
    this.tools.set(def.name, {
      name: def.name,
      description: def.description.trim(),
      inputSchema: def.inputSchema,
      handler: def.handler,
    });
  }

  audit(entry) {
    try {
      this.onAudit?.(entry);
    } catch {
      // Audit callback errors must not break protocol responses.
    }
  }

  async handleMessage(message) {
    if (
      !isPlainObject(message) ||
      message.jsonrpc !== "2.0" ||
      typeof message.method !== "string" ||
      !message.method
    ) {
      const id =
        isPlainObject(message) &&
        (typeof message.id === "string" || typeof message.id === "number" || message.id === null)
          ? message.id
          : null;
      return jsonRpcError(id, -32600, "Invalid Request");
    }

    if (!Object.hasOwn(message, "id")) {
      this.audit({
        at: new Date().toISOString(),
        method: message.method,
        ok: true,
        ms: 0,
      });
      return null;
    }

    const id = message.id;
    if (typeof id !== "string" && typeof id !== "number" && id !== null) {
      return jsonRpcError(null, -32600, "Invalid Request id");
    }

    switch (message.method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: this.serverInfo,
          },
        };

      case "ping":
        return { jsonrpc: "2.0", id, result: {} };

      case "tools/list": {
        if (message.params !== undefined && !isPlainObject(message.params)) {
          return jsonRpcError(id, -32602, "Invalid params");
        }
        const all = [...this.tools.values()];
        let offset = 0;
        const cursor = message.params?.cursor;
        if (cursor !== undefined) {
          if (typeof cursor !== "string" || !CURSOR_RE.test(cursor)) {
            return jsonRpcError(id, -32602, "Invalid cursor");
          }
          offset = Number(cursor);
          if (!Number.isSafeInteger(offset) || offset < 0 || offset >= all.length) {
            return jsonRpcError(id, -32602, "Cursor out of range");
          }
        }
        const slice = all.slice(offset, offset + PAGE_SIZE);
        const nextOffset = offset + PAGE_SIZE;
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: slice.map(({ name, description, inputSchema }) => ({
              name,
              description,
              inputSchema,
            })),
            ...(nextOffset < all.length ? { nextCursor: String(nextOffset) } : {}),
          },
        };
      }

      case "tools/call": {
        if (!isPlainObject(message.params) || typeof message.params.name !== "string") {
          return jsonRpcError(id, -32602, "Invalid params");
        }
        const tool = this.tools.get(message.params.name);
        if (!tool) {
          return jsonRpcError(id, -32602, `Unknown tool: ${message.params.name}`);
        }
        const rawArgs = Object.hasOwn(message.params, "arguments")
          ? message.params.arguments
          : {};
        const started = Date.now();
        let ok = false;
        let code;
        try {
          if (rawArgs === undefined) {
            validateArgs(tool.inputSchema, {});
          } else {
            validateArgs(tool.inputSchema, rawArgs);
          }
          const args = rawArgs === undefined ? {} : rawArgs;
          const out = await tool.handler(args, {
            signal: AbortSignal.timeout(this.toolTimeoutMs),
          });
          const result =
            isPlainObject(out) && Array.isArray(out.content)
              ? {
                  content: out.content,
                  ...(out.isError !== undefined ? { isError: Boolean(out.isError) } : {}),
                }
              : {
                  content: [
                    {
                      type: "text",
                      text: typeof out === "string" ? out : JSON.stringify(out, null, 2),
                    },
                  ],
                };
          if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_OUTPUT_BYTES) {
            code = "MCP_OUTPUT_LIMIT";
            return jsonRpcError(id, -32603, "MCP_OUTPUT_LIMIT");
          }
          ok = true;
          return { jsonrpc: "2.0", id, result };
        } catch (error) {
          if (error?.code === "INVALID_PARAMS") {
            code = "INVALID_PARAMS";
            return jsonRpcError(id, -32602, error.message);
          }
          if (error?.name === "TimeoutError" || error?.name === "AbortError") {
            code = "MCP_TOOL_TIMEOUT";
            return jsonRpcError(id, -32603, "MCP_TOOL_TIMEOUT");
          }
          code =
            typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
              ? error.code
              : "MCP_TOOL_ERROR";
          return jsonRpcError(id, -32603, code);
        } finally {
          this.audit({
            at: new Date().toISOString(),
            method: "tools/call",
            tool: tool.name,
            ok,
            ms: Date.now() - started,
            ...(code ? { code } : {}),
          });
        }
      }

      default:
        return jsonRpcError(id, -32601, `Method not found: ${message.method}`);
    }
  }

  authenticate(req) {
    if (typeof this.authToken !== "string" || this.authToken.length < MIN_TOKEN_LENGTH) {
      return false;
    }
    const header = req?.headers?.authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      return false;
    }
    const expected = Buffer.from("Bearer " + this.authToken, "utf8");
    const actual = Buffer.from(header, "utf8");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  createHttpServer() {
    if (typeof this.authToken !== "string" || this.authToken.length < MIN_TOKEN_LENGTH) {
      throw new Error("MCP_AUTH_TOKEN_REQUIRED");
    }
    return createServer((req, res) => {
      void (async () => {
        const sendJson = (status, body, extraHeaders = {}) => {
          res.writeHead(status, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
            ...extraHeaders,
          });
          res.end(JSON.stringify(body));
        };

        try {
          if (req.url !== this.endpointPath) {
            return sendJson(404, { error: "NOT_FOUND" });
          }
          if (req.method !== "POST") {
            return sendJson(405, { error: "METHOD_NOT_ALLOWED" }, { allow: "POST" });
          }
          if (!this.authenticate(req)) {
            return sendJson(401, { error: "UNAUTHORIZED" });
          }

          const contentLength = Number(req.headers["content-length"]);
          if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
            return sendJson(413, { error: "PAYLOAD_TOO_LARGE" });
          }

          const chunks = [];
          let total = 0;
          for await (const chunk of req) {
            total += chunk.length;
            if (total > MAX_BODY_BYTES) {
              req.destroy();
              return sendJson(413, { error: "PAYLOAD_TOO_LARGE" });
            }
            chunks.push(chunk);
          }

          let message;
          try {
            message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            return sendJson(400, jsonRpcError(null, -32700, "Parse error"));
          }

          const reply = await this.handleMessage(message);
          if (reply === null) {
            res.writeHead(202, {
              "cache-control": "no-store",
              "x-content-type-options": "nosniff",
            });
            res.end();
            return;
          }
          return sendJson(200, reply);
        } catch {
          if (!res.headersSent) {
            return sendJson(500, jsonRpcError(null, -32603, "Internal error"));
          }
        }
      })();
    });
  }

  attachStdio({ input = process.stdin, output = process.stdout } = {}) {
    const rl = createInterface({ input, crlfDelay: Infinity });
    let chain = Promise.resolve();

    const writeReply = (payload) => {
      if (payload !== null && !output.destroyed) {
        output.write(JSON.stringify(payload) + "\n");
      }
    };

    rl.on("line", (line) => {
      chain = chain.then(async () => {
        if (!line.trim()) return;
        if (Buffer.byteLength(line, "utf8") > MAX_BODY_BYTES) {
          writeReply(jsonRpcError(null, -32600, "Request exceeds size limit"));
          return;
        }
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          writeReply(jsonRpcError(null, -32700, "Parse error"));
          return;
        }
        const reply = await this.handleMessage(message);
        writeReply(reply);
      });
    });

    return {
      close: () => rl.close(),
      settled: () => chain,
    };
  }
}
