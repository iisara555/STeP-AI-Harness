import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LineGateway } from "../gateway/line/service.js";
import {
  createOperatorUiServer,
  validateGatewayUrl,
} from "../gateway/line/operator-ui.js";
import { queryStepRouter } from "../src/modules/router/service.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const lineId = (n) => "U" + String(n).repeat(32);
const SECRET = "synthetic-channel-secret";
const CHANNEL_ID = lineId("a");
const TOKEN = "synthetic-channel-token";
const APPROVER_TOKEN = "synthetic-approver-token-" + "0".repeat(12);
const PROFILE = {
  baseUrl: "http://127.0.0.1:9999/v1",
  protocol: "openai",
  model: "fixture",
};
const POLICY = {
  features: { headless: true, compatibleProviders: true, lineGateway: true },
  providers: { compatible: [PROFILE] },
  hooks: [],
  prices: { fixture: { input: 1, output: 2 } },
  budgets: {},
};

const signature = (raw) =>
  createHmac("sha256", SECRET).update(raw).digest("base64");

const webhook = (user, text, id = randomUUID(), type = "text") =>
  Buffer.from(
    JSON.stringify({
      destination: CHANNEL_ID,
      events: [
        {
          webhookEventId: id,
          timestamp: Date.now(),
          type: "message",
          source: { type: "user", userId: user },
          message: { id: "msg-" + id, type, text, fileName: "public.txt" },
        },
      ],
    }),
  );

async function makeFixture(deps = {}) {
  const root = await mkdtemp(join(tmpdir(), "step-line-op-"));
  const users = [1, 2].map((n) => ({
    lineUserId: lineId(n),
    employeeId: "employee-" + n,
    team: "cc",
    providerConsent: true,
    profile: PROFILE,
  }));
  const deliveries = [];
  let pushFail = false;
  const gateway = new LineGateway(
    {
      secret: SECRET,
      token: TOKEN,
      channelId: CHANNEL_ID,
      approverToken: APPROVER_TOKEN,
      storage: root,
      workspace: ROOT,
      users,
      policy: POLICY,
      ...deps.config,
    },
    {
      run: async (o) => ({
        status: "review",
        text: "Draft for " + o.query,
        route: "GENERAL",
      }),
      route: async () => ({
        routingContract: {
          mode: "GENERAL",
          authority: { status: "ALLOW" },
          mandatoryReferences: [],
        },
      }),
      fetch: async (url, o) => {
        if (url.includes("/content")) {
          return new Response("Public synthetic attachment content");
        }
        if (pushFail) throw new Error("network lost");
        deliveries.push(JSON.parse(o.body));
        return new Response("{}");
      },
      ...deps,
    },
  );
  return {
    root,
    gateway,
    deliveries,
    setPushFail: (v) => {
      pushFail = v;
    },
  };
}

test("LineGateway /reject, /resolve-unknown, editedText delivery, /audit and /healthz enforce security and privacy", async () => {
  const { root, gateway, deliveries, setPushFail } = await makeFixture({
    route: async (text) => queryStepRouter(text, { team: "cc", workspace: ROOT }),
  });
  const server = gateway.server();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const authHeaders = {
    authorization: `Bearer ${APPROVER_TOKEN}`,
    "content-type": "application/json",
  };

  try {
    // Unauthorized checks on new endpoints
    assert.equal((await fetch(`${base}/audit`)).status, 403);
    assert.equal((await fetch(`${base}/healthz`)).status, 403);

    const health = await (await fetch(`${base}/healthz`, { headers: authHeaders })).json();
    assert.equal(health.ok, true);
    assert.equal(health.policyReady, true);
    assert.equal(health.pendingCount, 0);

    // 1. Reject an attachment job and verify attachment file on disk is deleted
    const fileRaw = webhook(lineId(1), "", "file-reject", "file");
    await gateway.accept(fileRaw, signature(fileRaw));
    await gateway.idle();
    const fileJob = [...gateway.jobs.values()].find((j) => j.status === "input-review");
    assert.ok(fileJob);
    const attPath = fileJob.attachmentPath;
    assert.ok((await stat(attPath)).isFile());

    await assert.rejects(gateway.reject(fileJob.id, {}), /LINE_REJECT_APPROVAL_REQUIRED/);
    await assert.rejects(
      gateway.reject(fileJob.id, {
        confirmReject: true,
        reason: "Contact name: Synthetic Person",
      }),
      /PRIVACY_REVIEW_REQUIRED/,
    );
    const rejRes = await fetch(`${base}/reject/${fileJob.id}`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ confirmReject: true, reason: "Missing supporting context" }),
    });
    assert.equal(rejRes.status, 200);
    assert.equal((await rejRes.json()).status, "rejected");
    await assert.rejects(stat(attPath), /ENOENT/);
    assert.equal(fileJob.source, undefined);

    // 2. Edited delivery validates privacy & authority before pushing
    const reviewRaw = webhook(lineId(1), "ช่วยสรุปแนวทางทั่วไป", "edit-review");
    await gateway.accept(reviewRaw, signature(reviewRaw));
    await gateway.idle();
    const reviewJob = [...gateway.jobs.values()].find((j) => j.status === "review");
    assert.ok(reviewJob);

    await assert.rejects(
      gateway.approveDelivery(reviewJob.id, {
        approveDelivery: true,
        editedText: "Contact name: Synthetic Person",
      }),
      /PRIVACY_REVIEW_REQUIRED/,
    );
    await assert.rejects(
      gateway.approveDelivery(reviewJob.id, {
        approveDelivery: true,
        editedText: "ใส่ลายเซ็นของ ผอ. ลงในหนังสือแล้วส่งออกไปเลย",
      }),
      /AUTHORITY_REVIEW_REQUIRED/,
    );
    assert.equal(deliveries.length, 0);

    const editedText = "Edited public summary for review";
    await gateway.approveDelivery(reviewJob.id, {
      approveDelivery: true,
      editedText,
    });
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].messages[0].text, editedText);
    assert.equal(reviewJob.editedByOperator, true);

    // 3. delivery-unknown -> resolve-unknown (0 extra Push API calls)
    const unkRaw = webhook(lineId(2), "สรุปกิจกรรมสาธารณะ", "unk-event");
    await gateway.accept(unkRaw, signature(unkRaw));
    await gateway.idle();
    const unkJob = [...gateway.jobs.values()].find((j) => j.status === "review");
    assert.ok(unkJob);

    setPushFail(true);
    await assert.rejects(
      gateway.approveDelivery(unkJob.id, { approveDelivery: true }),
      /LINE_DELIVERY_UNKNOWN/,
    );
    assert.equal(unkJob.status, "delivery-unknown");
    setPushFail(false);

    await assert.rejects(gateway.resolveUnknown(unkJob.id, {}), /LINE_RESOLUTION_REQUIRED/);
    const resUnk = await fetch(`${base}/resolve-unknown/${unkJob.id}`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ resolution: "confirmed-delivered" }),
    });
    assert.equal(resUnk.status, 200);
    assert.equal((await resUnk.json()).status, "delivered");
    assert.equal(deliveries.length, 1);

    // 4. Audit log contains metadata only, zero message bodies or tokens
    const auditRes = await fetch(`${base}/audit`, { headers: authHeaders });
    assert.equal(auditRes.status, 200);
    const audit = await auditRes.json();
    assert.equal(audit.length, 3);
    const serialized = JSON.stringify(audit);
    assert.doesNotMatch(
      serialized,
      new RegExp(`${APPROVER_TOKEN}|${TOKEN}|ช่วยสรุปแนวทางทั่วไป|Edited public summary|Public synthetic attachment`),
    );
    assert.ok(audit.some((entry) => entry.editedByOperator === true));
    assert.ok(audit.some((entry) => entry.resolvedCode === "confirmed-delivered"));
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await gateway.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("LineGateway pruneExpiredJobs deletes only expired terminal jobs and sessions, retaining pending jobs", async () => {
  const { root, gateway } = await makeFixture({ config: { retentionDays: 7 } });
  try {
    const oldAt = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const recentAt = new Date(Date.now() - 2 * 86_400_000).toISOString();

    const oldDeliveredId = randomUUID();
    const oldPendingId = randomUUID();
    const recentDeliveredId = randomUUID();
    const oldSession = "a".repeat(64);
    const recentSession = "b".repeat(64);

    await writeFile(
      join(root, "jobs", `${oldDeliveredId}.json`),
      JSON.stringify({ id: oldDeliveredId, status: "delivered", at: oldAt, updatedAt: oldAt }),
    );
    await writeFile(
      join(root, "jobs", `${oldPendingId}.json`),
      JSON.stringify({ id: oldPendingId, status: "review", at: oldAt, updatedAt: oldAt, text: "keep" }),
    );
    await writeFile(
      join(root, "jobs", `${recentDeliveredId}.json`),
      JSON.stringify({ id: recentDeliveredId, status: "delivered", at: recentAt, updatedAt: recentAt }),
    );
    await writeFile(
      join(root, "sessions", `${oldSession}.json`),
      JSON.stringify({ schema_version: 1, at: oldAt }),
    );
    await writeFile(
      join(root, "sessions", `${recentSession}.json`),
      JSON.stringify({ schema_version: 1, at: recentAt }),
    );

    gateway.pruneExpiredJobs();

    await assert.rejects(stat(join(root, "jobs", `${oldDeliveredId}.json`)), /ENOENT/);
    await assert.rejects(stat(join(root, "sessions", `${oldSession}.json`)), /ENOENT/);
    assert.ok((await stat(join(root, "jobs", `${oldPendingId}.json`))).isFile());
    assert.ok((await stat(join(root, "jobs", `${recentDeliveredId}.json`))).isFile());
    assert.ok((await stat(join(root, "sessions", `${recentSession}.json`))).isFile());
  } finally {
    await gateway.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Standalone Operator UI enforces loopback-only URL, HttpOnly cookie, CSRF/Origin checks, and proxies all actions", async () => {
  assert.throws(() => validateGatewayUrl("https://remote.example/"), /OPERATOR_GATEWAY_URL_INVALID/);
  assert.throws(() => validateGatewayUrl("http://192.168.1.5:8788"), /OPERATOR_GATEWAY_URL_INVALID/);
  assert.equal(validateGatewayUrl("http://127.0.0.1:8788/"), "http://127.0.0.1:8788");

  let runMode = "review";
  const { root, gateway, deliveries, setPushFail } = await makeFixture({
    run: async (o) => {
      if (runMode === "clarify" && !o.answer) {
        return { status: "waiting", code: "CLARIFICATION_REQUIRED", readiness: { question: "Which team?" } };
      }
      return { status: "review", text: "Draft " + (o.answer || o.query), route: "GENERAL" };
    },
  });
  const gwServer = gateway.server();
  await new Promise((r) => gwServer.listen(0, "127.0.0.1", r));
  const gwUrl = `http://127.0.0.1:${gwServer.address().port}`;

  const uiServer = createOperatorUiServer({ gatewayUrl: gwUrl });
  await new Promise((r) => uiServer.listen(0, "127.0.0.1", r));
  const uiUrl = `http://127.0.0.1:${uiServer.address().port}`;

  try {
    // 1. Static shell & security headers
    const pageRes = await fetch(`${uiUrl}/`);
    assert.equal(pageRes.status, 200);
    assert.match(pageRes.headers.get("content-security-policy") || "", /default-src 'self'/);
    assert.equal(pageRes.headers.get("x-frame-options"), "DENY");
    assert.equal(pageRes.headers.get("cache-control"), "no-store");
    assert.equal((await fetch(`${uiUrl}/operator-app.js`)).status, 200);
    assert.equal((await fetch(`${uiUrl}/operator-ui.css`)).status, 200);

    // 2. Unauthenticated state rejected; bad token login returns 401
    assert.equal((await fetch(`${uiUrl}/api/state`)).status, 401);
    const badLogin = await fetch(`${uiUrl}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "wrong-token-" + "x".repeat(25) }),
    });
    assert.equal(badLogin.status, 401);

    // 3. Valid login sets HttpOnly SameSite=Strict cookie without leaking approver token
    const loginRes = await fetch(`${uiUrl}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: APPROVER_TOKEN }),
    });
    assert.equal(loginRes.status, 200);
    const setCookie = loginRes.headers.get("set-cookie") || "";
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    const cookieHeader = setCookie.split(";")[0];
    const loginBody = await loginRes.json();
    assert.equal(loginBody.ok, true);
    assert.ok(loginBody.csrfToken);
    assert.doesNotMatch(JSON.stringify(loginBody), new RegExp(APPROVER_TOKEN));

    // Seed jobs covering review, input-review, needs-input, interrupted
    const r1 = webhook(lineId(1), "Public draft request", "ui-review");
    await gateway.accept(r1, signature(r1));
    await gateway.idle();
    const reviewJob = [...gateway.jobs.values()].find((j) => j.status === "review");

    const rFile = webhook(lineId(1), "", "ui-file", "file");
    await gateway.accept(rFile, signature(rFile));
    await gateway.idle();
    const fileJob = [...gateway.jobs.values()].find((j) => j.status === "input-review");

    runMode = "clarify";
    const rClarify = webhook(lineId(2), "Ambiguous public request", "ui-clarify");
    await gateway.accept(rClarify, signature(rClarify));
    await gateway.idle();
    const clarifyJob = [...gateway.jobs.values()].find((j) => j.status === "needs-input");
    runMode = "review";

    // CSRF and Origin protection on POST
    const missingCsrf = await fetch(`${uiUrl}/api/jobs/${reviewJob.id}/approve`, {
      method: "POST",
      headers: { cookie: cookieHeader, "content-type": "application/json" },
      body: JSON.stringify({ approveDelivery: true }),
    });
    assert.equal(missingCsrf.status, 403);

    const badOrigin = await fetch(`${uiUrl}/api/jobs/${reviewJob.id}/approve`, {
      method: "POST",
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": loginBody.csrfToken,
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ approveDelivery: true }),
    });
    assert.equal(badOrigin.status, 403);

    // 4. GET /api/state returns health, pending, audit
    const stateRes = await fetch(`${uiUrl}/api/state`, { headers: { cookie: cookieHeader } });
    assert.equal(stateRes.status, 200);
    const uiState = await stateRes.json();
    assert.equal(uiState.pending.length, 3);

    const postUi = (path, payload) =>
      fetch(`${uiUrl}${path}`, {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": loginBody.csrfToken,
          origin: uiUrl,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

    // Approve with edit via UI
    const appRes = await postUi(`/api/jobs/${reviewJob.id}/approve`, {
      approveDelivery: true,
      editedText: "Approved from UI",
    });
    assert.equal(appRes.status, 200);
    assert.equal(deliveries[0].messages[0].text, "Approved from UI");

    // Approve attachment via UI -> moves to review -> reject via UI
    const appFile = await postUi(`/api/jobs/${fileJob.id}/approve-input`, {
      reviewedSource: true,
      approveDestination: true,
    });
    assert.equal(appFile.status, 200);
    assert.equal((await appFile.json()).status, "review");

    const rejRes = await postUi(`/api/jobs/${fileJob.id}/reject`, {
      confirmReject: true,
      reason: "Closed by operator",
    });
    assert.equal(rejRes.status, 200);
    assert.equal(fileJob.status, "rejected");

    // Answer clarify -> moves to review -> trigger delivery-unknown -> resolve-unknown via UI
    const ansRes = await postUi(`/api/jobs/${clarifyJob.id}/answer`, { answer: "CC team" });
    assert.equal(ansRes.status, 200);
    assert.equal(clarifyJob.status, "review");

    setPushFail(true);
    const failPush = await postUi(`/api/jobs/${clarifyJob.id}/approve`, { approveDelivery: true });
    assert.equal(failPush.status, 400);
    assert.equal(clarifyJob.status, "delivery-unknown");
    setPushFail(false);

    const unkRes = await postUi(`/api/jobs/${clarifyJob.id}/resolve-unknown`, {
      resolution: "cancelled",
    });
    assert.equal(unkRes.status, 200);
    assert.equal(clarifyJob.status, "rejected");

    // Simulate interrupted job and retry via UI
    const intId = randomUUID();
    const intJob = {
      id: intId,
      eventHash: "c".repeat(64),
      userHash: reviewJob.userHash,
      userBinding: reviewJob.userBinding,
      employeeId: "employee-1",
      status: "interrupted",
      code: "LINE_RETRY_REQUIRED",
      at: new Date().toISOString(),
      policyHash: reviewJob.policyHash,
      messageType: "text",
    };
    gateway.save(intJob);
    const retryRes = await postUi(`/api/jobs/${intId}/retry`, {
      query: "Reviewed retry request",
      approveProvider: true,
    });
    assert.equal(retryRes.status, 200);
    assert.equal(intJob.status, "review");

    // Logout clears session
    const logoutRes = await postUi("/api/logout", {});
    assert.equal(logoutRes.status, 200);
    assert.equal((await fetch(`${uiUrl}/api/state`, { headers: { cookie: cookieHeader } })).status, 401);
  } finally {
    uiServer.closeAllConnections();
    await new Promise((r) => uiServer.close(r));
    gwServer.closeAllConnections();
    await new Promise((r) => gwServer.close(r));
    await gateway.close();
    await rm(root, { recursive: true, force: true });
  }
});
