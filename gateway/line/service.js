import { createServer } from "node:http";
import {
  createHash,
  createHmac,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import {
  mkdirSync,
  lstatSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { join, extname } from "node:path";
import { evaluatePrivacyGate } from "../../src/modules/privacy/index.js";
import { evaluateDocumentPrivacy } from "../../src/modules/privacy/document.js";
import { runGovernedDraft } from "../../src/modules/runner/index.js";

const hash = (text) => createHash("sha256").update(text).digest("hex");
const clean = (text) => {
  const p = evaluatePrivacyGate(text);
  if (p.action !== "pass" || p.containsPersonalData || p.redactedText !== text)
    throw new Error("PRIVACY_REVIEW_REQUIRED");
};
export function verifySignature(raw, signature, secret) {
  if (typeof signature !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(signature))
    return false;
  const actual = Buffer.from(signature, "base64"),
    expected = createHmac("sha256", secret).update(raw).digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function validateAllowlist(value) {
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error("LINE_ALLOWLIST_INVALID");
  const seen = new Set();
  return value.map((u) => {
    if (
      !u ||
      Object.keys(u).some(
        (k) =>
          ![
            "lineUserId",
            "employeeId",
            "team",
            "profile",
            "providerConsent",
          ].includes(k),
      ) ||
      !/^U[a-f0-9]{32}$/.test(u.lineUserId) ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(u.employeeId) ||
      !/^[a-z][a-z0-9-]{0,40}$/.test(u.team) ||
      u.providerConsent !== true ||
      !u.profile ||
      Object.keys(u.profile).some(
        (k) => !["baseUrl", "protocol", "model"].includes(k),
      ) ||
      typeof u.profile.model !== "string" ||
      !u.profile.model ||
      u.profile.model.length > 160 ||
      seen.has(u.lineUserId)
    )
      throw new Error("LINE_ALLOWLIST_INVALID");
    seen.add(u.lineUserId);
    return u;
  });
}
async function boundedBody(response, max) {
  if (!response.ok || !response.body) throw new Error("LINE_API_FAILED");
  let total = 0;
  const chunks = [];
  try {
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > max) throw new Error("LINE_CONTENT_LIMIT");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } finally {
    await response.body.cancel().catch(() => {});
  }
}
function privateFolder(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true, mode: 0o700 });
  const s = lstatSync(path);
  if (
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    (process.platform !== "win32" &&
      ((s.mode & 0o077) !== 0 || s.uid !== process.getuid()))
  )
    throw new Error("LINE_STORAGE_INVALID");
}
export class LineGateway {
  constructor(config, dependencies = {}) {
    this.config = config;
    this.deps = dependencies;
    this.users = validateAllowlist(config.users);
    this.jobs = new Map();
    this.events = new Map();
    this.queue = [];
    this.running = new Set();
    this.controllers = new Set();
    this.closed = false;
    if (
      typeof config.secret !== "string" ||
      config.secret.length < 16 ||
      typeof config.token !== "string" ||
      config.token.length < 16 ||
      typeof config.approverToken !== "string" ||
      config.approverToken.length < 32 ||
      !/^U[a-f0-9]{32}$/.test(config.channelId)
    )
      throw new Error("LINE_CONFIG_INVALID");
    privateFolder(config.storage);
    privateFolder(join(config.storage, "sessions"));
    privateFolder(join(config.storage, "jobs"));
    for (const f of readdirSync(join(config.storage, "jobs"))
      .filter((f) => /^[a-f0-9-]{36}\.json$/.test(f))
      .slice(-200)) {
      try {
        const j = JSON.parse(
          readFileSync(join(config.storage, "jobs", f), "utf8"),
        );
        if (
          j.id + ".json" === f &&
          [
            "review",
            "input-review",
            "needs-input",
            "delivery-unknown",
            "delivering",
          ].includes(j.status)
        ) {
          if (j.status === "delivering") j.status = "delivery-unknown";
          this.jobs.set(j.id, j);
        }
      } catch {}
    }
    try {
      const saved = JSON.parse(
        readFileSync(join(config.storage, "events.json"), "utf8"),
      );
      for (const [id, time] of saved)
        if (/^[a-f0-9]{64}$/.test(id) && time > Date.now() - 7 * 86400_000)
          this.events.set(id, time);
    } catch {}
    this.assertPolicy();
  }
  policy() {
    return this.deps.policy?.() || this.config.policy;
  }
  currentUsers() {
    return this.deps.users ? validateAllowlist(this.deps.users()) : this.users;
  }
  assertPolicy() {
    const p = this.policy();
    if (
      p?.features?.lineGateway !== true ||
      p?.features?.headless !== true ||
      p?.features?.compatibleProviders !== true ||
      (p.hooks || []).some((h) => h.type !== "http")
    )
      throw new Error("LINE_DISABLED");
    return p;
  }
  save(job) {
    this.jobs.set(job.id, job);
    this.atomic(
      join(this.config.storage, "jobs", job.id + ".json"),
      JSON.stringify(job),
    );
  }
  atomic(path, text) {
    const temp = path + "." + randomUUID() + ".tmp";
    writeFileSync(temp, text, { mode: 0o600, flag: "wx" });
    renameSync(temp, path);
  }
  async accept(raw, signature) {
    if (this.closed || !verifySignature(raw, signature, this.config.secret))
      throw new Error("LINE_SIGNATURE_INVALID");
    this.assertPolicy();
    const value = JSON.parse(raw.toString("utf8"));
    if (
      value.destination !== this.config.channelId ||
      !Array.isArray(value.events) ||
      value.events.length > 20
    )
      throw new Error("LINE_WEBHOOK_INVALID");
    if (this.jobs.size >= 150)
      for (const [id, job] of this.jobs) {
        if (
          ["delivered", "blocked"].includes(job.status) &&
          /^[a-f0-9-]{36}$/.test(id)
        ) {
          this.jobs.delete(id);
          try {
            unlinkSync(join(this.config.storage, "jobs", id + ".json"));
          } catch {}
          if (this.jobs.size < 100) break;
        }
      }
    const users = this.currentUsers();
    for (const event of value.events) {
      const user = users.find((u) => u.lineUserId === event.source?.userId);
      if (
        !user ||
        event.source.type !== "user" ||
        event.type !== "message" ||
        !["text", "file", "image", "audio", "video"].includes(
          event.message?.type,
        )
      )
        continue;
      if (
        typeof event.webhookEventId !== "string" ||
        !/^[\w-]{1,100}$/.test(event.webhookEventId) ||
        !Number.isFinite(event.timestamp) ||
        Math.abs(Date.now() - event.timestamp) > 300_000 ||
        !/^[0-9a-zA-Z_-]{1,100}$/.test(event.message.id)
      )
        continue;
      const id = hash(this.config.channelId + "\0" + event.webhookEventId);
      if (this.events.has(id)) continue;
      if (this.queue.length + this.running.size >= 32 || this.jobs.size >= 200)
        throw new Error("LINE_BUSY");
      this.events.set(id, Date.now());
      while (this.events.size > 5000)
        this.events.delete(this.events.keys().next().value);
      this.atomic(
        join(this.config.storage, "events.json"),
        JSON.stringify([...this.events]),
      );
      const job = {
        id: randomUUID(),
        userHash: hash(this.config.channelId + "\0" + user.lineUserId),
        userBinding: hash(JSON.stringify(user)),
        employeeId: user.employeeId,
        status: "queued",
        at: new Date().toISOString(),
        policyHash: hash(JSON.stringify(this.policy())),
        messageType: event.message.type,
      };
      this.queue.push({ job, user, event });
      this.jobs.set(job.id, job);
    }
    this.pump();
    return { accepted: true };
  }
  pump() {
    if (this.closed) return;
    for (let i = 0; this.running.size < 3 && i < this.queue.length;) {
      const item = this.queue[i];
      if (this.running.has(item.job.userHash)) {
        i++;
        continue;
      }
      this.queue.splice(i, 1);
      this.running.add(item.job.userHash);
      void this.process(item)
        .catch((error) => {
          item.job.status = "blocked";
          item.job.code = /^[A-Z_]{1,80}$/.test(error.message)
            ? error.message
            : "LINE_DRAFT_BLOCKED";
          delete item.job.query;
          delete item.job.source;
          delete item.job.text;
          this.save(item.job);
        })
        .finally(() => {
          this.running.delete(item.job.userHash);
          this.pump();
        });
    }
  }
  async content(job, message, signal) {
    const extension =
      message.type === "file"
        ? extname(String(message.fileName)).toLowerCase()
        : ".unsupported";
    if (![".txt", ".md", ".csv", ".pdf", ".docx"].includes(extension))
      throw new Error("LINE_ATTACHMENT_UNSUPPORTED");
    const response = await (this.deps.fetch || fetch)(
      `https://api-data.line.me/v2/bot/message/${message.id}/content`,
      {
        headers: { authorization: "Bearer " + this.config.token },
        redirect: "error",
        signal,
      },
    );
    const bytes = await boundedBody(response, 25 * 1024 * 1024),
      path = join(this.config.storage, "jobs", job.id + extension);
    writeFileSync(path, bytes, { mode: 0o600, flag: "wx" });
    job.attachmentPath = path;
    const report = await (this.deps.scanDocument || evaluateDocumentPrivacy)(
      path,
      { includeRedacted: true },
    );
    if (
      report.action === "block-external" ||
      report.extractionStatus !== "text-extracted" ||
      typeof report.redactedText !== "string" ||
      report.containsPersonalData ||
      report.redactionApplied
    )
      throw new Error("PRIVACY_REVIEW_REQUIRED");
    clean(report.redactedText);
    job.source = report.redactedText;
    job.documentReport = {
      action: report.action,
      classification: report.classification,
      reviewReasons: report.reviewReasons,
    };
    job.query = "Summarize the attached source as a draft for human review.";
    job.status = "input-review";
    this.save(job);
  }
  async process({ job, user, event }) {
    const controller = new AbortController();
    this.controllers.add(controller);
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(600_000),
    ]);
    try {
      this.assertPolicy();
      if (event.message.type !== "text") {
        await this.content(job, event.message, signal);
        return;
      }
      if (
        typeof event.message.text !== "string" ||
        event.message.text.length > 30_000
      )
        throw new Error("INVALID_INPUT");
      clean(event.message.text);
      job.query = event.message.text;
      await this.draft(job, user, signal);
    } finally {
      this.controllers.delete(controller);
      if (job.status !== "input-review" && job.attachmentPath)
        this.removeAttachment(job);
    }
  }
  removeAttachment(job) {
    const ext = extname(job.attachmentPath || "");
    if (
      [".txt", ".md", ".csv", ".pdf", ".docx"].includes(ext) &&
      job.attachmentPath === join(this.config.storage, "jobs", job.id + ext)
    ) {
      try {
        unlinkSync(job.attachmentPath);
      } catch {}
    }
    delete job.attachmentPath;
  }
  user(job) {
    return this.currentUsers().find(
      (u) =>
        hash(this.config.channelId + "\0" + u.lineUserId) === job.userHash &&
        u.employeeId === job.employeeId &&
        hash(JSON.stringify(u)) === job.userBinding,
    );
  }
  async draft(job, user, signal) {
    const policy = this.assertPolicy();
    if (job.policyHash !== hash(JSON.stringify(policy)))
      throw new Error("POLICY_CHANGED");
    if (!this.user(job)) throw new Error("LINE_ALLOWLIST_CHANGED");
    const result = await (this.deps.run || runGovernedDraft)(
      {
        query: job.query,
        answer: job.answer,
        source: job.source || "",
        team: user.team,
        profile: user.profile,
        key: this.config.providerKey,
        policy,
        workspace: this.config.workspace,
        approveProvider: user.providerConsent === true,
        signal,
      },
      {
        ...this.deps.runner,
        policy: () => {
          if (!this.user(job)) throw new Error("LINE_ALLOWLIST_CHANGED");
          return this.assertPolicy();
        },
      },
    );
    if (
      result.status === "waiting" &&
      result.code === "CLARIFICATION_REQUIRED"
    ) {
      job.status = "needs-input";
      job.readiness = result.readiness;
      this.save(job);
      return;
    }
    if (result.status !== "review" || !result.text)
      throw new Error("LINE_DRAFT_BLOCKED");
    clean(result.text);
    if (job.policyHash !== hash(JSON.stringify(this.assertPolicy())))
      throw new Error("POLICY_CHANGED");
    job.text = result.text;
    job.status = "review";
    job.route = result.route;
    this.save(job);
    this.atomic(
      join(this.config.storage, "sessions", job.userHash + ".json"),
      JSON.stringify({
        schema_version: 1,
        employeeId: user.employeeId,
        jobId: job.id,
        query: job.query,
        text: job.text,
        at: job.at,
      }),
    );
  }
  async approveInput(id, confirmation) {
    const job = this.jobs.get(id),
      user = job && this.user(job);
    if (
      !job ||
      !user ||
      job.status !== "input-review" ||
      confirmation?.reviewedSource !== true ||
      confirmation?.approveDestination !== true
    )
      throw new Error("LINE_INPUT_APPROVAL_REQUIRED");
    if (this.running.has(job.userHash) || this.running.size >= 3)
      throw new Error("LINE_BUSY");
    this.running.add(job.userHash);
    const ctl = new AbortController();
    this.controllers.add(ctl);
    try {
      clean(job.source);
      await this.draft(
        job,
        user,
        AbortSignal.any([ctl.signal, AbortSignal.timeout(600_000)]),
      );
    } catch (e) {
      job.status = "blocked";
      job.code = "LINE_DRAFT_BLOCKED";
      delete job.text;
      delete job.source;
      delete job.query;
      this.save(job);
      throw e;
    } finally {
      this.removeAttachment(job);
      this.save(job);
      this.controllers.delete(ctl);
      this.running.delete(job.userHash);
      this.pump();
    }
    return { status: job.status };
  }
  async answer(id, confirmation) {
    const job = this.jobs.get(id),
      user = job && this.user(job);
    if (
      !job ||
      !user ||
      job.status !== "needs-input" ||
      typeof confirmation?.answer !== "string" ||
      !confirmation.answer.trim() ||
      confirmation.answer.length > 2000 ||
      (job.answerCount || 0) >= 5
    )
      throw new Error("LINE_CLARIFICATION_REQUIRED");
    if (this.running.has(job.userHash) || this.running.size >= 3)
      throw new Error("LINE_BUSY");
    clean(confirmation.answer);
    job.answer = [job.answer || "", confirmation.answer]
      .filter(Boolean)
      .join("\n");
    job.answerCount = (job.answerCount || 0) + 1;
    this.running.add(job.userHash);
    const ctl = new AbortController();
    this.controllers.add(ctl);
    try {
      await this.draft(
        job,
        user,
        AbortSignal.any([ctl.signal, AbortSignal.timeout(600_000)]),
      );
      return { status: job.status };
    } finally {
      this.controllers.delete(ctl);
      this.running.delete(job.userHash);
      this.pump();
    }
  }
  async approveDelivery(id, confirmation) {
    const job = this.jobs.get(id),
      user = job && this.user(job);
    if (
      !job ||
      !user ||
      job.status !== "review" ||
      confirmation?.approveDelivery !== true
    )
      throw new Error("LINE_DELIVERY_APPROVAL_REQUIRED");
    if (job.text.length > 25_000) throw new Error("LINE_DELIVERY_LIMIT");
    const policy = this.assertPolicy();
    if (job.policyHash !== hash(JSON.stringify(policy)))
      throw new Error("POLICY_CHANGED");
    clean(job.text);
    // Re-route the exact outgoing text. A draft cannot turn into an approval, procurement or submission.
    const routed = await (
      this.deps.route ||
      (await import("../../src/modules/router/service.js")).queryStepRouter
    )(job.text, { team: user.team, workspace: this.config.workspace });
    const c = routed.routingContract;
    if (
      !c ||
      c.authority?.status !== "ALLOW" ||
      !["GENERAL", "SKILL", "PLAYBOOK"].includes(c.mode) ||
      routed.playbookPlan?.some(
        (s) => s.type === "action" || s.action || s.actionId,
      )
    )
      throw new Error("AUTHORITY_REVIEW_REQUIRED");
    if (
      job.status !== "review" ||
      job.policyHash !== hash(JSON.stringify(this.assertPolicy()))
    )
      throw new Error("POLICY_CHANGED");
    job.status = "delivering";
    this.save(job);
    try {
      const ctl = new AbortController();
      this.controllers.add(ctl);
      let response;
      try {
        response = await (this.deps.fetch || fetch)(
          "https://api.line.me/v2/bot/message/push",
          {
            method: "POST",
            headers: {
              authorization: "Bearer " + this.config.token,
              "content-type": "application/json",
              "X-Line-Retry-Key": job.id,
            },
            body: JSON.stringify({
              to: user.lineUserId,
              messages: Array.from(
                { length: Math.ceil(job.text.length / 5000) },
                (_, i) => ({
                  type: "text",
                  text: job.text.slice(i * 5000, (i + 1) * 5000),
                }),
              ),
            }),
            redirect: "error",
            signal: AbortSignal.any([ctl.signal, AbortSignal.timeout(30_000)]),
          },
        );
        await response.body?.cancel();
      } finally {
        this.controllers.delete(ctl);
      }
      if (!response.ok && response.status !== 409)
        throw new Error("LINE_DELIVERY_FAILED");
      job.status = "delivered";
      delete job.text;
      delete job.query;
      delete job.source;
      this.save(job);
      return { status: job.status };
    } catch {
      job.status = "delivery-unknown";
      this.save(job);
      throw new Error("LINE_DELIVERY_UNKNOWN");
    }
  }
  authenticated(request) {
    const received = Buffer.from(String(request.headers.authorization || "")),
      expected = Buffer.from("Bearer " + this.config.approverToken);
    return (
      ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        request.socket.remoteAddress,
      ) &&
      received.length === expected.length &&
      timingSafeEqual(received, expected)
    );
  }
  server() {
    return createServer(
      (req, res) =>
        void (async () => {
          try {
            const chunks = [];
            let size = 0;
            for await (const c of req) {
              size += c.length;
              if (size > 1_000_000) throw new Error("LINE_CONTENT_LIMIT");
              chunks.push(c);
            }
            const raw = Buffer.concat(chunks);
            let result;
            if (req.method === "POST" && req.url === "/webhook")
              result = await this.accept(raw, req.headers["x-line-signature"]);
            else {
              if (!this.authenticated(req))
                throw new Error("LINE_APPROVER_DENIED");
              if (req.method === "GET" && req.url === "/pending")
                result = [...this.jobs.values()].filter((j) =>
                  [
                    "review",
                    "input-review",
                    "needs-input",
                    "delivery-unknown",
                  ].includes(j.status),
                );
              else if (
                req.method === "POST" &&
                /^\/answer\/[a-f0-9-]{36}$/.test(req.url)
              )
                result = await this.answer(
                  req.url.split("/").at(-1),
                  JSON.parse(raw.toString()),
                );
              else if (
                req.method === "POST" &&
                /^\/approve(?:-input)?\/[a-f0-9-]{36}$/.test(req.url)
              ) {
                const id = req.url.split("/").at(-1),
                  body = JSON.parse(raw.toString());
                result = req.url.startsWith("/approve-input/")
                  ? await this.approveInput(id, body)
                  : await this.approveDelivery(id, body);
              } else throw new Error("LINE_OPERATION_INVALID");
            }
            res.writeHead(200, {
              "content-type": "application/json",
              "cache-control": "no-store",
            });
            res.end(JSON.stringify(result));
          } catch (e) {
            const code = /^[A-Z_]+$/.test(e.message)
              ? e.message
              : "LINE_REQUEST_INVALID";
            res.writeHead(
              code === "LINE_SIGNATURE_INVALID" ||
                code === "LINE_APPROVER_DENIED"
                ? 403
                : 400,
              { "content-type": "application/json" },
            );
            res.end(JSON.stringify({ code }));
          }
        })(),
    );
  }
  async idle() {
    while (this.running.size || this.queue.length)
      await new Promise((r) => setTimeout(r, 5));
  }
  async close() {
    this.closed = true;
    this.queue = [];
    for (const c of this.controllers) c.abort();
    await this.idle();
  }
}
