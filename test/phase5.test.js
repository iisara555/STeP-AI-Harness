import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  link,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  compatibleRun,
  providerEndpoint,
  approvedProfile,
} from "../src/modules/providers/compatible.js";
import { prepareDraft, runGovernedDraft } from "../src/modules/runner/index.js";
import { RunnerLedger } from "../src/modules/runner/ledger.js";
import { runRun } from "../src/cli/commands/run.js";
import {
  installPack,
  listPacks,
  enablePack,
  packAsset,
  exportPack,
  enabledPackHooks,
} from "../src/modules/packs/index.js";
import { LineGateway, verifySignature } from "../gateway/line/service.js";

const harness = {
  route: async () => ({
    routingContract: {
      mode: "GENERAL",
      authority: { status: "ALLOW" },
      mandatoryReferences: [],
    },
  }),
};
const profile = {
  baseUrl: "http://127.0.0.1:9999/v1",
  protocol: "openai",
  model: "fixture",
};
const policy = {
  features: { headless: true, compatibleProviders: true, lineGateway: true },
  providers: { compatible: [profile] },
  hooks: [],
  prices: { fixture: { input: 1, output: 2 } },
  budgets: {},
};
const sse = (value) =>
  "data: " +
  (typeof value === "string" ? value : JSON.stringify(value)) +
  "\n\n";
const opts = () => ({
  query: "Prepare a public draft",
  team: "cc",
  profile,
  policy,
  approveProvider: true,
});
const fixture = () => mkdtemp(join(tmpdir(), "step-phase5-"));

test("compatible streaming preserves split Thai UTF-8, usage and native tool denial over real HTTP", async () => {
  let request,
    variant = "openai";
  const server = createServer(async (req, res) => {
    let text = "";
    for await (const b of req) text += b;
    request = { body: JSON.parse(text), headers: req.headers, path: req.url };
    res.writeHead(200, { "content-type": "text/event-stream" });
    const textBody =
      variant === "anthropic"
        ? sse({
            type: "message_start",
            message: { usage: { input_tokens: 11 } },
          }) +
          sse({
            type: "content_block_delta",
            delta: { type: "text_delta", text: "ร่างทดสอบ" },
          }) +
          sse({ type: "message_delta", usage: { output_tokens: 4 } }) +
          sse({ type: "message_stop" })
        : variant === "tools"
          ? sse({
              choices: [
                { delta: { tool_calls: [{ function: { name: "shell" } }] } },
              ],
            })
          : sse({ choices: [{ delta: { content: "ร่างทดสอบ" } }] }) +
            sse({
              choices: [],
              usage: { prompt_tokens: 11, completion_tokens: 4 },
            }) +
            sse("[DONE]");
    const bytes = Buffer.from(textBody);
    for (let i = 0; i < bytes.length; i += 3)
      res.write(bytes.subarray(i, i + 3));
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  let usage;
  const deltas = [];
  try {
    assert.equal(
      await compatibleRun(
        "Public request",
        { ...profile, baseUrl },
        { emit: (t) => deltas.push(t), onUsage: (u) => (usage = u) },
      ),
      "ร่างทดสอบ",
    );
    assert.deepEqual(usage, { input: 11, output: 4, total: 15 });
    assert.equal(deltas.join(""), "ร่างทดสอบ");
    assert.equal(request.path, "/v1/chat/completions");
    assert.equal(request.body.max_tokens, 8192);
    assert.equal(request.body.tools, undefined);
    variant = "anthropic";
    assert.equal(
      await compatibleRun(
        "Public request",
        { ...profile, baseUrl, protocol: "anthropic" },
        { key: "synthetic-key", onUsage: (u) => (usage = u) },
      ),
      "ร่างทดสอบ",
    );
    assert.equal(request.path, "/v1/messages");
    assert.equal(request.headers["anthropic-version"], "2023-06-01");
    assert.equal(usage.total, 15);
    variant = "tools";
    await assert.rejects(
      compatibleRun("Public request", { ...profile, baseUrl }),
      /PROVIDER_TOOL_DENIED/,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
test("compatible profiles deny unapproved, credential-bearing and remote plaintext endpoints; fail closed on incomplete streams", async () => {
  for (const url of [
    "http://example.com/v1",
    "https://user:secret@example.com/v1",
    "https://example.com/v1?key=value",
  ])
    assert.throws(() => providerEndpoint(url), /PROVIDER_URL_INVALID/);
  assert.throws(() => approvedProfile(profile, {}), /FEATURE_DISABLED/);
  assert.throws(
    () => approvedProfile(profile, { features: { compatibleProviders: true } }),
    /DESTINATION_DENIED/,
  );
  assert.throws(
    () =>
      approvedProfile(profile, {
        ...policy,
        network: { proxyUrl: "https://proxy.example.invalid" },
      }),
    /PROVIDER_PROXY_UNAVAILABLE/,
  );
  const fetcher = async () =>
    new Response(sse({ choices: [{ delta: { content: "Partial" } }] }), {
      headers: { "content-type": "text/event-stream" },
    });
  await assert.rejects(
    compatibleRun("Text", profile, {}, fetcher),
    /INCOMPLETE/,
  );
  await assert.rejects(
    compatibleRun(
      "Text",
      profile,
      {},
      async () =>
        new Response("private failure", {
          status: 429,
          headers: { "retry-after": "2" },
        }),
    ),
    (e) => e.message === "PROVIDER_RATE_LIMIT" && e.retryAfterMs === 2000,
  );
  const ctl = new AbortController();
  ctl.abort();
  await assert.rejects(
    compatibleRun("Text", profile, { signal: ctl.signal }),
    /abort/i,
  );
  await assert.rejects(
    compatibleRun("Text", profile, { images: [{}] }, fetcher),
    /CAPABILITY_UNSUPPORTED/,
  );
});
test("shared preflight and draft runner block authority, source privacy, hooks, policy drift and tool actions", async () => {
  const ready = await prepareDraft(opts(), { harness });
  assert.equal(ready.readiness.status, "ready");
  assert.ok(ready.readiness.estimate.inputTokens > 0);
  assert.ok(ready.readiness.estimate.usd > 0);
  const provider = async (_p, _profile, c) => {
    c.onUsage({ input: 20, output: 10, total: 30 });
    return "Public draft for review";
  };
  const result = await runGovernedDraft(opts(), { harness, provider });
  assert.equal(result.status, "review");
  assert.equal(result.usage.total, 30);
  await assert.rejects(
    runGovernedDraft(
      { ...opts(), approveProvider: false },
      { harness, provider },
    ),
    /APPROVAL_REQUIRED/,
  );
  await assert.rejects(
    runGovernedDraft(
      { ...opts(), source: "Contact name: Synthetic Person" },
      { harness, provider },
    ),
    /PRIVACY_REVIEW_REQUIRED/,
  );
  await assert.rejects(
    runGovernedDraft(opts(), {
      harness: {
        route: async () => ({
          routingContract: { mode: "BLOCK", authority: { status: "BLOCK" } },
        }),
      },
      provider,
    }),
    /AUTHORITY/,
  );
  await assert.rejects(
    runGovernedDraft(opts(), {
      harness: {
        route: async () => ({
          routingContract: { mode: "UNKNOWN", authority: { status: "ALLOW" } },
        }),
      },
      provider,
    }),
    /AUTHORITY/,
  );
  await assert.rejects(
    runGovernedDraft(opts(), {
      harness: {
        route: async () => ({
          routingContract: { mode: "PLAYBOOK", authority: { status: "ALLOW" } },
          playbookPlan: [{ type: "action", actionId: "submit" }],
        }),
      },
      provider,
    }),
    /AUTHORITY/,
  );
  const waiting = await runGovernedDraft(opts(), {
    harness: {
      route: async () => ({
        routingContract: { mode: "CLARIFY", authority: { status: "ALLOW" } },
      }),
    },
    provider,
  });
  assert.equal(waiting.status, "waiting");
  let changed = false;
  await assert.rejects(
    runGovernedDraft(opts(), {
      harness,
      provider: async () => {
        changed = true;
        return "Draft";
      },
      policy: () => (changed ? {} : policy),
    }),
    /POLICY_CHANGED/,
  );
  await assert.rejects(
    runGovernedDraft(
      {
        ...opts(),
        policy: {
          ...policy,
          hooks: [
            { type: "prompt", event: "user_prompt_submit", prompt: "Review" },
          ],
        },
      },
      { harness, provider },
    ),
    /HOOK_UNAVAILABLE/,
  );
  const http = createServer((req, res) => {
    req.resume();
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ decision: "block" }));
  });
  await new Promise((r) => http.listen(0, "127.0.0.1", r));
  try {
    await assert.rejects(
      runGovernedDraft(
        {
          ...opts(),
          policy: {
            ...policy,
            hooks: [
              {
                type: "http",
                event: "user_prompt_submit",
                url: `http://127.0.0.1:${http.address().port}`,
                blockOnFailure: false,
              },
            ],
          },
        },
        { harness, provider },
      ),
      /HOOK_BLOCKED/,
    );
  } finally {
    http.closeAllConnections();
    await new Promise((r) => http.close(r));
  }
});
test("budget reservations persist, settle usage, preserve uncertain costs and deny repeated spend", async () => {
  const root = await fixture();
  try {
    const ledger = new RunnerLedger(root),
      p = { ...policy, budgets: { dailyTokens: 20000, monthlyCostUsd: 1 } };
    const result = await runGovernedDraft(
      { ...opts(), policy: p },
      {
        harness,
        ledger,
        provider: async (_p, _m, c) => {
          c.onUsage({ input: 20, output: 10, total: 30 });
          return "Draft";
        },
      },
    );
    assert.equal(result.status, "review");
    const records = JSON.parse(
      await readFile(join(root, "usage", "ledger.json"), "utf8"),
    ).records;
    assert.equal(records[0].tokens, 30);
    assert.throws(
      () =>
        ledger.reserve({ inputTokens: 20000, outputTokens: 100, usd: 0.1 }, p),
      /BUDGET_BLOCKED/,
    );
    await assert.rejects(
      runGovernedDraft(
        { ...opts(), policy: p },
        { harness, provider: async () => "" },
      ),
      /LEDGER_REQUIRED/,
    );
    assert.throws(
      () => ledger.reserve({ inputTokens: 10, outputTokens: 10, usd: null }, p),
      /PRICE_UNAVAILABLE/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("CLI stream-json emits metadata, privacy-reviewed draft and completion; default CLI denies unattended calls", async () => {
  const root = await fixture();
  let out = "";
  try {
    const result = await runRun(
      {
        _: ["run", "Prepare a public draft"],
        "base-url": profile.baseUrl,
        model: profile.model,
        "approve-provider": true,
        "approve-destination": true,
        "output-format": "stream-json",
      },
      {
        harness,
        policy,
        ledger: new RunnerLedger(root),
        provider: async () => "Synthetic CLI draft",
        write: (t) => (out += t),
      },
    );
    assert.equal(result.status, "review");
    assert.deepEqual(
      out
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l).type),
      ["start", "step", "delta", "complete"],
    );
    out = "";
    await runRun(
      { _: ["run", "Prepare a draft"], "output-format": "stream-json" },
      { policy: {}, ledger: new RunnerLedger(root), write: (t) => (out += t) },
    );
    assert.match(out, /PROVIDER_APPROVAL_REQUIRED/);
    process.exitCode = 0;
    const denied = spawnSync(
      process.execPath,
      [
        "bin/step-ai.js",
        "run",
        "Prepare a public draft",
        "--output-format",
        "stream-json",
      ],
      {
        encoding: "utf8",
        env: { ...process.env, HOME: root, USERPROFILE: root },
      },
    );
    assert.equal(denied.status, 1);
    assert.equal(JSON.parse(denied.stdout.trim()).type, "error");
    assert.match(denied.stdout, /PROVIDER_APPROVAL_REQUIRED/);
  } finally {
    process.exitCode = 0;
    await rm(root, { recursive: true, force: true });
  }
});
const skill =
  "---\nname: public-draft\ndescription: Prepare public draft text.\n---\nUse supplied facts. Missing facts stay unconfirmed.\n";
test("packs import Anthropic layout inertly, require approved digest and explicit hooks, export into a fresh directory, detect tampering", async () => {
  const root = await fixture(),
    work = join(root, "work"),
    source = join(root, "source");
  await mkdir(work);
  await mkdir(source);
  await writeFile(join(source, "SKILL.md"), skill);
  try {
    const installed = installPack(work, source, { name: "public-writing" }),
      p = {
        features: { skillPacks: true },
        skillPacks: { approvedDigests: [installed.digest] },
      };
    assert.equal(listPacks(work, p)[0].enabled, false);
    assert.throws(() => enablePack(work, installed.id, p), /APPROVAL_REQUIRED/);
    enablePack(work, installed.id, p, { approve: true });
    assert.equal(
      packAsset(work, installed.id, "public-draft", "skill", p).text,
      skill,
    );
    assert.equal(
      exportPack(work, installed.id, join(root, "export"), { approve: true })
        .nativeExecutionAuthorized,
      false,
    );
    assert.equal(
      await readFile(join(root, "export", "public-draft", "SKILL.md"), "utf8"),
      skill,
    );
    assert.throws(
      () =>
        exportPack(work, installed.id, join(root, "export"), { approve: true }),
      /EXPORT_EXISTS/,
    );
    await writeFile(
      join(work, ".step", "packs", installed.id, "assets", "SKILL.md"),
      skill + "Modified\n",
    );
    assert.equal(listPacks(work, p)[0].enabled, false);
    assert.throws(
      () => packAsset(work, installed.id, "public-draft", "skill", p),
      /PACK_DISABLED/,
    );
    assert.deepEqual(enabledPackHooks(work, p), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("pack validators reject links, secrets, self-granted authority and malformed hooks", async () => {
  const root = await fixture(),
    work = join(root, "work"),
    source = join(root, "source");
  await mkdir(work);
  await mkdir(source);
  await writeFile(join(source, "SKILL.md"), skill);
  try {
    await link(join(source, "SKILL.md"), join(source, "copy.md"));
    assert.throws(
      () => installPack(work, source, { name: "bad-pack" }),
      /LINK_REJECTED/,
    );
    await rm(join(source, "copy.md"));
    await writeFile(join(source, ".env"), "PUBLIC=1");
    assert.throws(
      () => installPack(work, source, { name: "bad-pack" }),
      /PRIVATE_FILE/,
    );
    await rm(join(source, ".env"));
    await writeFile(
      join(source, "SKILL.md"),
      skill.replace("description:", "tools: shell\ndescription:"),
    );
    assert.throws(
      () => installPack(work, source, { name: "bad-pack" }),
      /AUTHORITY_REJECTED/,
    );
    await writeFile(join(source, "SKILL.md"), skill);
    const manifest = {
      schema_version: 1,
      name: "bad-pack",
      version: "1.0.0",
      skills: [{ id: "public-draft", path: "SKILL.md" }],
      hooks: [
        {
          type: "command",
          event: "pre_tool_use",
          command: "echo block",
          timeoutSeconds: 10,
          blockOnFailure: false,
        },
      ],
      agents: [],
    };
    await writeFile(join(source, "pack.json"), JSON.stringify(manifest));
    assert.throws(() => installPack(work, source), /HOOK_INVALID/);
    manifest.hooks[0].blockOnFailure = true;
    await writeFile(join(source, "pack.json"), JSON.stringify(manifest));
    const installed = installPack(work, source),
      p = {
        features: { skillPacks: true },
        skillPacks: { approvedDigests: [installed.digest] },
      };
    enablePack(work, installed.id, p, { approve: true });
    assert.deepEqual(enabledPackHooks(work, p), []);
    enablePack(work, installed.id, p, { approve: true, hooks: true });
    assert.equal(enabledPackHooks(work, p).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const lineId = (n) => "U" + String(n).repeat(32),
  secret = "synthetic-channel-secret",
  channelId = lineId("a"),
  token = "synthetic-channel-token",
  approverToken = "synthetic-approver-token-0000000000";
const webhook = (user, text, id = "event-1", type = "text") =>
  Buffer.from(
    JSON.stringify({
      destination: channelId,
      events: [
        {
          webhookEventId: id,
          timestamp: Date.now(),
          type: "message",
          source: { type: "user", userId: user },
          message: { id: "123456", type, text, fileName: "public.txt" },
        },
      ],
    }),
  );
const signature = (raw) =>
  createHmac("sha256", secret).update(raw).digest("base64");
async function lineFixture(deps = {}) {
  const root = await fixture(),
    users = [1, 2].map((n) => ({
      lineUserId: lineId(n),
      employeeId: "employee-" + n,
      team: "cc",
      providerConsent: true,
      profile,
    }));
  const deliveries = [],
    gateway = new LineGateway(
      {
        secret,
        token,
        channelId,
        approverToken,
        storage: root,
        workspace: root,
        users,
        policy,
      },
      {
        run: async (o) => ({
          status: "review",
          text: "Reviewed draft " + o.query,
          route: "GENERAL",
        }),
        route: harness.route,
        fetch: async (url, o) => {
          if (url.includes("/content"))
            return new Response("Public attachment text");
          deliveries.push(JSON.parse(o.body));
          return new Response("{}");
        },
        ...deps,
      },
    );
  return { root, gateway, deliveries };
}
test("LINE verifies exact signed bytes, isolates user sessions, rejects outsiders and deduplicates events across restart", async () => {
  const { root, gateway, deliveries } = await lineFixture();
  try {
    const raw = webhook(lineId(1), "Public A");
    assert.equal(verifySignature(raw, signature(raw), secret), true);
    assert.equal(
      verifySignature(
        Buffer.concat([raw, Buffer.from(" ")]),
        signature(raw),
        secret,
      ),
      false,
    );
    await assert.rejects(gateway.accept(raw, "bad"), /SIGNATURE_INVALID/);
    await gateway.accept(raw, signature(raw));
    await gateway.accept(raw, signature(raw));
    const outsider = webhook(lineId(3), "Outsider", "event-x");
    await gateway.accept(outsider, signature(outsider));
    const second = webhook(lineId(2), "Public B", "event-2");
    await gateway.accept(second, signature(second));
    await gateway.idle();
    assert.equal(gateway.jobs.size, 2);
    assert.equal(deliveries.length, 0);
    const pending = [...gateway.jobs.values()];
    assert.notEqual(pending[0].userHash, pending[1].userHash);
    await assert.rejects(
      gateway.approveDelivery(pending[0].id, {}),
      /APPROVAL_REQUIRED/,
    );
    await gateway.approveDelivery(pending[0].id, { approveDelivery: true });
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].to, lineId(1));
    const first = JSON.parse(
      await readFile(
        join(root, "sessions", pending[0].userHash + ".json"),
        "utf8",
      ),
    );
    assert.match(first.query, /Public A/);
    assert.doesNotMatch(JSON.stringify(first), /Public B/);
    await gateway.close();
    const replay = new LineGateway(gateway.config, {
      run: async () => {
        throw new Error("replay");
      },
      route: harness.route,
    });
    await replay.accept(raw, signature(raw));
    await replay.idle();
    assert.equal(replay.running.size, 0);
    assert.equal(replay.jobs.size, 1);
    await replay.close();
  } finally {
    await gateway.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("LINE inbound/outbound privacy, attachment review, policy drift and loopback approval authorization fail closed", async () => {
  const { root, gateway, deliveries } = await lineFixture();
  const server = gateway.server();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const raw = webhook(lineId(1), "Contact name: Synthetic Person");
    assert.equal(
      (
        await fetch(base + "/webhook", {
          method: "POST",
          headers: { "X-Line-Signature": signature(raw) },
          body: raw,
        })
      ).status,
      200,
    );
    await gateway.idle();
    assert.equal([...gateway.jobs.values()][0].status, "blocked");
    assert.equal((await fetch(base + "/pending")).status, 403);
    const file = webhook(lineId(1), "", "file-event", "file");
    await gateway.accept(file, signature(file));
    await gateway.idle();
    const job = [...gateway.jobs.values()].find(
      (j) => j.status === "input-review",
    );
    assert.ok(job);
    assert.equal(deliveries.length, 0);
    await assert.rejects(
      gateway.approveInput(job.id, {}),
      /INPUT_APPROVAL_REQUIRED/,
    );
    await gateway.approveInput(job.id, {
      reviewedSource: true,
      approveDestination: true,
    });
    assert.equal(job.status, "review");
    const pending = await fetch(base + "/pending", {
      headers: { authorization: "Bearer " + approverToken },
    });
    assert.equal(pending.status, 200);
    assert.equal((await pending.json()).length, 1);
    job.text = "Contact name: Synthetic Person";
    await assert.rejects(
      gateway.approveDelivery(job.id, { approveDelivery: true }),
      /PRIVACY/,
    );
    assert.equal(deliveries.length, 0);
    job.text = "Public draft";
    gateway.config.policy = {
      ...policy,
      features: { ...policy.features, lineGateway: false },
    };
    await assert.rejects(
      gateway.approveDelivery(job.id, { approveDelivery: true }),
      /LINE_DISABLED/,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await gateway.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("LINE executes the shared governed runner against real routing and keeps delivery behind human approval", async () => {
  let providerCalls = 0;
  const { root, gateway, deliveries } = await lineFixture({
    run: runGovernedDraft,
    runner: {
      provider: async () => {
        providerCalls++;
        return "Public community event draft for review";
      },
    },
  });
  try {
    const raw = webhook(lineId(1), "ช่วยสรุปข้อความสาธารณะ", "governed-event");
    await gateway.accept(raw, signature(raw));
    await gateway.idle();
    const job = [...gateway.jobs.values()][0];
    assert.equal(job.status, "review", job.code);
    assert.equal(providerCalls, 1);
    assert.equal(deliveries.length, 0);
    await gateway.approveDelivery(job.id, { approveDelivery: true });
    assert.equal(deliveries.length, 1);
    const privateRaw = webhook(
      lineId(1),
      "Contact name: Synthetic Person",
      "privacy-event",
    );
    await gateway.accept(privateRaw, signature(privateRaw));
    await gateway.idle();
    assert.equal(providerCalls, 1);
    const ambiguous = webhook(
      lineId(2),
      "Please summarize the public community event",
      "clarify-event",
    );
    await gateway.accept(ambiguous, signature(ambiguous));
    await gateway.idle();
    const waiting = [...gateway.jobs.values()].find(
      (j) => j.status === "needs-input",
    );
    assert.ok(waiting);
    assert.equal(providerCalls, 1);
    await gateway.answer(waiting.id, { answer: "document-review" });
    assert.equal(waiting.status, "review");
    assert.equal(providerCalls, 2);
  } finally {
    await gateway.close();
    await rm(root, { recursive: true, force: true });
  }
});
