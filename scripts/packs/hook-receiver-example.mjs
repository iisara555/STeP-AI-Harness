#!/usr/bin/env node
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BODY_BYTES = 16_384;

function globToRegExp(pattern) {
  const escaped = String(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + escaped.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
}

export function createHookReceiverServer({
  blockTools = [],
  endpointPath = "/v1/tool-audit",
  onAudit,
} = {}) {
  if (typeof endpointPath !== "string" || !endpointPath.startsWith("/") || /[\s?#]/.test(endpointPath)) {
    throw new Error("HOOK_ENDPOINT_INVALID");
  }
  const matchers = blockTools
    .map((p) => String(p).trim())
    .filter(Boolean)
    .map(globToRegExp);

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
        if (req.url !== endpointPath) {
          return sendJson(404, { error: "NOT_FOUND" });
        }
        if (req.method !== "POST") {
          return sendJson(405, { error: "METHOD_NOT_ALLOWED" }, { allow: "POST" });
        }

        const contentLength = Number(req.headers["content-length"]);
        if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
          return sendJson(413, { error: "PAYLOAD_TOO_LARGE" });
        }

        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            req.destroy();
            return sendJson(413, { error: "PAYLOAD_TOO_LARGE" });
          }
          chunks.push(chunk);
        }

        let payload;
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          return sendJson(400, { error: "INVALID_JSON" });
        }

        if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.event !== "string") {
          return sendJson(400, { error: "INVALID_PAYLOAD" });
        }

        const tool = typeof payload.tool === "string" ? payload.tool : "";
        const blocked = Boolean(tool) && matchers.some((rx) => rx.test(tool));
        try {
          onAudit?.({
            at: new Date().toISOString(),
            event: payload.event,
            tool,
            blocked,
          });
        } catch {
          // Audit logging errors do not fail hook evaluation.
        }

        return sendJson(
          200,
          blocked
            ? { decision: "block", reason: "blocked by organization pack hook" }
            : { decision: "allow" },
        );
      } catch {
        if (!res.headersSent) {
          return sendJson(500, { error: "HOOK_RECEIVER_ERROR" });
        }
      }
    })();
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes("--serve")) {
    process.stderr.write(
      "Usage: node scripts/packs/hook-receiver-example.mjs --serve\n" +
        "Env: STEP_HOOK_PORT (default 8791), STEP_HOOK_BLOCK_TOOLS (comma-separated globs)\n",
    );
    process.exit(1);
  }
  const port = Number(process.env.STEP_HOOK_PORT || 8791);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    process.stderr.write("STEP_HOOK_PORT must be an integer between 1024 and 65535.\n");
    process.exit(1);
  }
  const blockTools = String(process.env.STEP_HOOK_BLOCK_TOOLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const server = createHookReceiverServer({
    blockTools,
    onAudit: (entry) => process.stderr.write(JSON.stringify(entry) + "\n"),
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.listen(port, "127.0.0.1", () => console.log("STEP_HOOK_RECEIVER_READY"));

  let closing = false;
  const stop = () => {
    if (closing) return;
    closing = true;
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
