import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  MAX_BODY_BYTES,
  MAX_OUTPUT_BYTES,
  StepMcpServer,
} from "../gateway/mcp/service.js";
import {
  checkAfpCategory,
  createStepCatalogTools,
  parseDocumentsYaml,
  parseMisRegister,
} from "../gateway/mcp/tools/step-catalog.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const AUTH_TOKEN = "synthetic-mcp-token-" + "a".repeat(16);

async function startHttpServer(server) {
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address();
  return `http://127.0.0.1:${port}/mcp`;
}

async function stopHttpServer(server) {
  server.closeAllConnections?.();
  await new Promise((resolveClose) => server.close(resolveClose));
}

async function rpc(url, body, { token = AUTH_TOKEN, headers = {} } = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    text,
    json: text ? JSON.parse(text) : null,
  };
}

test("StepMcpServer enforces auth token length, HTTP auth, methods, paths, limits and metadata-only audits", async () => {
  assert.throws(() => new StepMcpServer({ authToken: "short" }), /MCP_AUTH_TOKEN_REQUIRED/);
  assert.throws(() => new StepMcpServer({}).createHttpServer(), /MCP_AUTH_TOKEN_REQUIRED/);

  const audits = [];
  const server = new StepMcpServer({
    authToken: AUTH_TOKEN,
    tools: [
      {
        name: "echo_public",
        description: "Echo synthetic public value",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["text"],
          properties: {
            text: { type: "string", maxLength: 50 },
            count: { type: "integer", minimum: 1, maximum: 5 },
          },
        },
        handler: async ({ text }) => ({ reply: `ok:${text}` }),
      },
      {
        name: "oversized_tool",
        description: "Exceeds max output size",
        inputSchema: { type: "object", additionalProperties: false, properties: {} },
        handler: async () => "x".repeat(MAX_OUTPUT_BYTES + 100),
      },
    ],
    onAudit: (entry) => audits.push(entry),
  });

  const httpServer = server.createHttpServer();
  const url = await startHttpServer(httpServer);
  const origin = url.slice(0, -4);

  try {
    // Method & path guards (no redirects)
    const getRes = await fetch(url, { method: "GET", redirect: "manual" });
    assert.equal(getRes.status, 405);
    assert.equal(getRes.headers.get("allow"), "POST");

    for (const badPath of ["/mcp/", "/mcp?foo=1", "/other"]) {
      const badRes = await fetch(origin + badPath, {
        method: "POST",
        headers: { authorization: `Bearer ${AUTH_TOKEN}` },
        body: "{}",
        redirect: "manual",
      });
      assert.equal(badRes.status, 404);
      assert.equal(badRes.headers.get("location"), null);
    }

    // Auth guards
    const unauth = await rpc(url, { jsonrpc: "2.0", id: 1, method: "ping" }, { token: "" });
    assert.equal(unauth.status, 401);
    const wrongAuth = await rpc(
      url,
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { token: "wrong-token-" + "b".repeat(24) },
    );
    assert.equal(wrongAuth.status, 401);

    // Initialize, notification, ping
    const init = await rpc(url, { jsonrpc: "2.0", id: 1, method: "initialize" });
    assert.equal(init.status, 200);
    assert.equal(init.json.result.protocolVersion, "2025-11-25");
    assert.deepEqual(init.json.result.capabilities, { tools: {} });

    const notif = await rpc(url, { jsonrpc: "2.0", method: "notifications/initialized" });
    assert.equal(notif.status, 202);
    assert.equal(notif.text, "");

    const ping = await rpc(url, { jsonrpc: "2.0", id: 2, method: "ping" });
    assert.deepEqual(ping.json.result, {});

    // Invalid JSON and body size limit
    const badJson = await rpc(url, "{not-json");
    assert.equal(badJson.status, 400);
    assert.equal(badJson.json.error.code, -32700);

    const tooLarge = await rpc(url, "x".repeat(MAX_BODY_BYTES + 10));
    assert.equal(tooLarge.status, 413);

    // Unknown tool & schema validation
    const unknownTool = await rpc(url, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "missing_tool", arguments: {} },
    });
    assert.equal(unknownTool.json.error.code, -32602);

    const badArg = await rpc(url, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "echo_public", arguments: { text: "hi", extra: true } },
    });
    assert.equal(badArg.json.error.code, -32602);

    const missingReq = await rpc(url, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "echo_public", arguments: { count: 2 } },
    });
    assert.equal(missingReq.json.error.code, -32602);

    // Valid call & metadata-only audit check
    const secretSentinel = "SecretArgumentShouldNotAudit";
    const okCall = await rpc(url, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "echo_public", arguments: { text: secretSentinel, count: 2 } },
    });
    assert.equal(okCall.status, 200);
    assert.match(okCall.json.result.content[0].text, /ok:SecretArgumentShouldNotAudit/);

    // Output limit
    const bigOut = await rpc(url, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "oversized_tool", arguments: {} },
    });
    assert.equal(bigOut.json.error.code, -32603);
    assert.match(bigOut.json.error.message, /MCP_OUTPUT_LIMIT/);

    const serializedAudit = JSON.stringify(audits);
    assert.doesNotMatch(serializedAudit, new RegExp(secretSentinel));
    assert.doesNotMatch(serializedAudit, new RegExp(AUTH_TOKEN));
    assert.ok(audits.some((a) => a.tool === "echo_public" && a.ok === true));
    assert.ok(audits.some((a) => a.tool === "oversized_tool" && a.code === "MCP_OUTPUT_LIMIT"));
  } finally {
    await stopHttpServer(httpServer);
  }
});

test("StepMcpServer tools/list paginates with cursor and rejects invalid cursors", async () => {
  const manyTools = Array.from({ length: 55 }, (_, i) => ({
    name: `tool_${i}`,
    description: `Synthetic tool ${i}`,
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    handler: async () => ({ index: i }),
  }));
  const server = new StepMcpServer({ tools: manyTools });
  const page1 = await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.equal(page1.result.tools.length, 50);
  assert.equal(page1.result.nextCursor, "50");

  const page2 = await server.handleMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: { cursor: page1.result.nextCursor },
  });
  assert.equal(page2.result.tools.length, 5);
  assert.equal(page2.result.nextCursor, undefined);

  for (const badCursor of ["-1", "abc", "55", "999"]) {
    const err = await server.handleMessage({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
      params: { cursor: badCursor },
    });
    assert.equal(err.error.code, -32602);
  }
});

test("STeP catalog tools query MIS register, AFP rules, and filter out restricted/unavailable docs", async () => {
  const parsedDocs = parseDocumentsYaml(
    [
      "documents:",
      "  public-doc:",
      '    title: "Public Guide"',
      "    path: docs/knowledge/public.md",
      "    owner: afp",
      "    status: active",
      "    sensitivity: public",
      "  secret-doc:",
      '    title: "Restricted File"',
      "    path: docs/knowledge/restricted.md",
      "    owner: afp",
      "    status: active",
      "    sensitivity: restricted",
      "  missing-doc:",
      '    title: "Not Provided"',
      "    path: docs/knowledge/missing.md",
      "    owner: afp",
      "    status: not-provided",
    ].join("\n"),
  );
  assert.deepEqual(
    parsedDocs.map((d) => d.id),
    ["public-doc"],
  );

  const misSample = parseMisRegister(
    [
      "**ดึงข้อมูลเมื่อ:** 2026-10-10",
      "| ทีม | เลขที่ | ประเภท | REV | วันที่บังคับใช้ | ชื่อ | สถานะ |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| FOOD FABR | QM-FF-001 | QM | V.06 | 2025-10-16 | คู่มือระบบบริหารงานคุณภาพ | ใช้อยู่ |",
      "## ทีม AFP · วิธีปฏิบัติงาน (WI)",
      "| เลขที่ | ประเภท | REV | วันที่บังคับใช้ | ชื่อ | สถานะ |",
      "| --- | --- | --- | --- | --- | --- |",
      "| WI-AF-001 | WI | - | 2026-04-01 | ขั้นตอนการเบิกกระดาษและน้ำดื่ม | ยกเลิก |",
    ].join("\n"),
  );
  assert.equal(misSample.fetchedAt, "2026-10-10");
  assert.equal(misSample.entries.length, 2);
  assert.equal(misSample.entries[1].team, "AFP");
  assert.equal(misSample.entries[1].active, false);

  const server = new StepMcpServer({
    authToken: AUTH_TOKEN,
    tools: createStepCatalogTools({ rootDir: ROOT }),
  });
  const httpServer = server.createHttpServer();
  const url = await startHttpServer(httpServer);

  try {
    const fmRes = await rpc(url, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "step_mis_lookup", arguments: { code: "FM-AF-014" } },
    });
    const fm = JSON.parse(fmRes.json.result.content[0].text);
    assert.equal(fm.fetchedAt, "2026-10-10");
    assert.equal(fm.entries[0].code, "FM-AF-014");
    assert.equal(fm.entries[0].rev, "V.02");
    assert.equal(fm.entries[0].active, true);

    const qmRes = await rpc(url, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "step_mis_lookup", arguments: { code: "QM-FF-001" } },
    });
    const qm = JSON.parse(qmRes.json.result.content[0].text);
    assert.equal(qm.entries[0].code, "QM-FF-001");
    assert.equal(qm.entries[0].rev, "V.06");

    const cancelledRes = await rpc(url, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "step_mis_lookup", arguments: { code: "WI-AF-001" } },
    });
    const cancelled = JSON.parse(cancelledRes.json.result.content[0].text);
    assert.equal(cancelled.entries[0].active, false);
    assert.equal(cancelled.entries[0].status, "ยกเลิก");

    const b10 = checkAfpCategory({ category: "B10", amountThb: 4500 });
    assert.equal(b10.found, true);
    assert.equal(b10.capThb, 10_000);
    assert.equal(b10.reportDeadlineWorkingDays, 3);
    assert.equal(b10.overCap, false);

    const bv = checkAfpCategory({ category: "BV", amountThb: 12_000 });
    assert.equal(bv.found, true);
    assert.equal(bv.overCap, true);
    assert.equal(bv.bvTravelReasonParts.length, 5);
    assert.match(bv.overCapWarning, /10,000/);

    const emergency = checkAfpCategory({ category: "emergency" });
    assert.equal(emergency.reportDeadlineWorkingDays, 5);
    assert.equal(emergency.conditionsRequired.length, 4);

    const catC = checkAfpCategory({ category: "C" });
    assert.equal(catC.advanceAllowed, false);

    const unknown = checkAfpCategory({ category: "Z99" });
    assert.equal(unknown.found, false);

    const docRes = await rpc(url, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "step_doc_catalog",
        arguments: { owner: "afp", query: "QP-AF-003" },
      },
    });
    const docData = JSON.parse(docRes.json.result.content[0].text);
    assert.ok(docData.documents.some((d) => d.id === "afp-advance-procedure"));
    assert.ok(!docData.documents.some((d) => d.status === "not-provided"));
  } finally {
    await stopHttpServer(httpServer);
  }
});

test("gateway/mcp/run.js --stdio handles initialize, tools/list, and tools/call", async () => {
  const child = spawn(
    process.execPath,
    [resolve(ROOT, "gateway/mcp/run.js"), "--stdio", "--root", ROOT],
    { stdio: ["pipe", "pipe", "pipe"] },
  );

  const lines = [];
  let buffer = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() || "";
    for (const part of parts) {
      if (part.trim()) lines.push(JSON.parse(part));
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  const send = (obj) => child.stdin.write(JSON.stringify(obj) + "\n");
  send({ jsonrpc: "2.0", id: 1, method: "initialize" });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "step_mis_lookup", arguments: { code: "QP-AF-003" } },
  });
  child.stdin.end();

  const exitCode = await new Promise((resolveExit) => {
    child.once("close", resolveExit);
  });

  assert.equal(exitCode, 0, stderr);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].result.protocolVersion, "2025-11-25");
  assert.equal(lines[1].result.tools.length, 3);
  const qp = JSON.parse(lines[2].result.content[0].text);
  assert.equal(qp.entries[0].code, "QP-AF-003");
  assert.equal(qp.entries[0].rev, "V.02");
});
