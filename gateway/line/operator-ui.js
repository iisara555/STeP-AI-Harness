import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_JS = readFileSync(join(HERE, "operator-app.js"), "utf8");
const APP_CSS = readFileSync(join(HERE, "operator-ui.css"), "utf8");

const HTML_SHELL = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ผู้ตรวจคิวงาน LINE · STeP</title>
  <link rel="stylesheet" href="/operator-ui.css" />
  <script defer src="/operator-app.js"></script>
</head>
<body>
  <div id="app" class="op-shell">
    <p class="op-loading">กำลังโหลดระบบตรวจคิวงาน LINE…</p>
  </div>
</body>
</html>
`;

const LOOPBACK_REMOTE = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOOPBACK_HOST_RE = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i;
const JOB_ACTION_RE =
  /^\/api\/jobs\/([a-f0-9-]{36})\/(approve|approve-input|answer|retry|reject|resolve-unknown)$/;
const SESSION_COOKIE = "step_line_op";
const MAX_SESSIONS = 50;

const SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'none'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store",
};

export function validateGatewayUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || ""));
  } catch {
    throw new Error("OPERATOR_GATEWAY_URL_INVALID");
  }
  if (
    u.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]", "::1"].includes(u.hostname) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  ) {
    throw new Error("OPERATOR_GATEWAY_URL_INVALID");
  }
  const path = u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "");
  return `${u.origin}${path}`;
}

function sameToken(expected, actual) {
  if (typeof expected !== "string" || typeof actual !== "string") return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(actual, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseCookie(header, name) {
  if (typeof header !== "string" || !header) return "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return part.slice(idx + 1).trim();
  }
  return "";
}

async function readJsonBody(req, maxBytes) {
  const contentLength = Number(req.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("OPERATOR_BODY_TOO_LARGE");
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      req.destroy();
      throw new Error("OPERATOR_BODY_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("OPERATOR_JSON_INVALID");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("OPERATOR_JSON_INVALID");
  }
  return parsed;
}

export function createOperatorUiServer({
  gatewayUrl = "http://127.0.0.1:8788",
  sessionTtlMs = 8 * 3600_000,
  fetchImpl = fetch,
} = {}) {
  const gateway = validateGatewayUrl(gatewayUrl);
  const sessions = new Map();

  function pruneSessions(now = Date.now()) {
    for (const [id, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(id);
    }
    while (sessions.size > MAX_SESSIONS) {
      const oldest = sessions.keys().next().value;
      sessions.delete(oldest);
    }
  }

  function currentSession(req) {
    pruneSessions();
    const sid = parseCookie(req.headers.cookie, SESSION_COOKIE);
    if (!sid || !/^[a-f0-9]{64}$/.test(sid)) return null;
    const s = sessions.get(sid);
    if (!s || s.expiresAt <= Date.now()) {
      sessions.delete(sid);
      return null;
    }
    return { sid, ...s };
  }

  async function callGateway(path, token, { method = "GET", body, timeoutMs = 15_000 } = {}) {
    const res = await fetchImpl(`${gateway}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, ok: res.ok, json };
  }

  const server = createServer((req, res) => {
    void (async () => {
      const send = (status, contentType, body, extraHeaders = {}) => {
        res.writeHead(status, {
          ...SECURITY_HEADERS,
          "content-type": contentType,
          ...extraHeaders,
        });
        res.end(body);
      };
      const sendJson = (status, data, extraHeaders = {}) =>
        send(status, "application/json; charset=utf-8", JSON.stringify(data), extraHeaders);

      try {
        if (!LOOPBACK_REMOTE.has(req.socket.remoteAddress || "")) {
          return sendJson(403, { code: "OPERATOR_LOOPBACK_ONLY" });
        }

        if (req.method === "POST") {
          const host = String(req.headers.host || "");
          if (!LOOPBACK_HOST_RE.test(host)) {
            return sendJson(403, { code: "OPERATOR_ORIGIN_DENIED" });
          }
          if (req.headers.origin !== undefined && req.headers.origin !== `http://${host}`) {
            return sendJson(403, { code: "OPERATOR_ORIGIN_DENIED" });
          }
        }

        if (req.method === "GET" && req.url === "/") {
          return send(200, "text/html; charset=utf-8", HTML_SHELL);
        }
        if (req.method === "GET" && req.url === "/operator-app.js") {
          return send(200, "application/javascript; charset=utf-8", APP_JS);
        }
        if (req.method === "GET" && req.url === "/operator-ui.css") {
          return send(200, "text/css; charset=utf-8", APP_CSS);
        }

        if (req.method === "GET" && req.url === "/api/session") {
          const session = currentSession(req);
          if (!session) return sendJson(401, { authenticated: false });
          return sendJson(200, { authenticated: true, csrfToken: session.csrfToken });
        }

        if (req.method === "POST" && req.url === "/api/login") {
          const body = await readJsonBody(req, 4_096);
          if (typeof body.token !== "string" || body.token.length < 32) {
            return sendJson(400, { code: "OPERATOR_TOKEN_INVALID" });
          }
          let check;
          try {
            check = await callGateway("/healthz", body.token, { timeoutMs: 10_000 });
          } catch {
            return sendJson(502, { code: "OPERATOR_GATEWAY_UNAVAILABLE" });
          }
          if (check.status === 401 || check.status === 403) {
            return sendJson(401, { code: "OPERATOR_AUTH_FAILED" });
          }
          if (!check.ok) {
            return sendJson(502, { code: "OPERATOR_GATEWAY_UNAVAILABLE" });
          }
          const sid = randomBytes(32).toString("hex");
          const csrfToken = randomBytes(24).toString("hex");
          pruneSessions();
          sessions.set(sid, {
            token: body.token,
            csrfToken,
            expiresAt: Date.now() + sessionTtlMs,
          });
          pruneSessions();
          const maxAge = Math.max(1, Math.floor(sessionTtlMs / 1000));
          return sendJson(
            200,
            { ok: true, csrfToken, health: check.json },
            {
              "set-cookie": `${SESSION_COOKIE}=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`,
            },
          );
        }

        const session = currentSession(req);
        if (!session) {
          return sendJson(401, { code: "OPERATOR_UNAUTHENTICATED" });
        }

        if (req.method === "POST" && !sameToken(session.csrfToken, req.headers["x-csrf-token"])) {
          return sendJson(403, { code: "OPERATOR_CSRF_INVALID" });
        }

        if (req.method === "POST" && req.url === "/api/logout") {
          sessions.delete(session.sid);
          return sendJson(
            200,
            { ok: true },
            {
              "set-cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
            },
          );
        }

        if (req.method === "GET" && req.url === "/api/state") {
          let health, pending, audit;
          try {
            [health, pending, audit] = await Promise.all([
              callGateway("/healthz", session.token),
              callGateway("/pending", session.token),
              callGateway("/audit", session.token),
            ]);
          } catch {
            return sendJson(502, { code: "OPERATOR_GATEWAY_UNAVAILABLE" });
          }
          if ([health, pending, audit].some((r) => r.status === 401 || r.status === 403)) {
            sessions.delete(session.sid);
            return sendJson(401, { code: "OPERATOR_AUTH_FAILED" });
          }
          if (!health.ok || !pending.ok || !audit.ok) {
            return sendJson(502, { code: "OPERATOR_GATEWAY_UNAVAILABLE" });
          }
          return sendJson(200, {
            health: health.json,
            pending: pending.json,
            audit: audit.json,
          });
        }

        const actionMatch = req.method === "POST" ? JOB_ACTION_RE.exec(req.url || "") : null;
        if (actionMatch) {
          const [, jobId, action] = actionMatch;
          const payload = await readJsonBody(req, 64_000);
          let reply;
          try {
            reply = await callGateway(`/${action}/${jobId}`, session.token, {
              method: "POST",
              body: payload,
              timeoutMs: 120_000,
            });
          } catch {
            return sendJson(502, { code: "OPERATOR_GATEWAY_UNAVAILABLE" });
          }
          if (reply.status === 401 || reply.status === 403) {
            sessions.delete(session.sid);
            return sendJson(401, { code: "OPERATOR_AUTH_FAILED" });
          }
          return sendJson(reply.status, reply.json || { ok: reply.ok });
        }

        return sendJson(404, { code: "NOT_FOUND" });
      } catch (err) {
        const msg = String(err?.message || "");
        if (msg === "OPERATOR_BODY_TOO_LARGE") {
          return sendJson(413, { code: msg });
        }
        if (msg === "OPERATOR_JSON_INVALID") {
          return sendJson(400, { code: msg });
        }
        if (!res.headersSent) {
          return sendJson(500, { code: "OPERATOR_INTERNAL_ERROR" });
        }
      }
    })();
  });

  server.requestTimeout = 130_000;
  server.headersTimeout = 15_000;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes("--serve")) {
    process.stderr.write(
      "Usage: node gateway/line/operator-ui.js --serve\n" +
        "Env: STEP_LINE_UI_PORT (default 8789), STEP_LINE_GATEWAY_URL (default http://127.0.0.1:8788)\n",
    );
    process.exit(1);
  }
  const port = Number(process.env.STEP_LINE_UI_PORT || 8789);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    process.stderr.write("STEP_LINE_UI_PORT must be an integer between 1024 and 65535.\n");
    process.exit(1);
  }
  const gatewayUrl = process.env.STEP_LINE_GATEWAY_URL || "http://127.0.0.1:8788";
  const server = createOperatorUiServer({ gatewayUrl });
  server.listen(port, "127.0.0.1", () => console.log("LINE_OPERATOR_UI_READY"));

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
