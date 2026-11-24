#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectPackSource } from "../../src/modules/packs/index.js";

const DIGEST_RE = /^[a-f0-9]{64}$/;

export function inspectPack(packDir) {
  const result = inspectPackSource(resolve(packDir));
  const nonHookFindings = (result.review?.findings || []).filter(
    (f) => f.code !== "safety.hooks",
  );
  const readyForAdminApproval = !nonHookFindings.some((f) => f.level === "fail");
  return {
    id: result.id,
    version: result.version,
    digest: result.digest,
    fileCount: result.fileCount,
    skills: result.skills,
    agents: result.agents,
    hooks: result.hooks,
    review: result.review,
    nonHookFindings,
    readyForAdminApproval,
  };
}

export function buildPackPolicy(packDir, existingPolicy = {}) {
  const info = inspectPack(packDir);
  if (!info.readyForAdminApproval) {
    const reasons = info.nonHookFindings
      .filter((f) => f.level === "fail")
      .map((f) => `${f.code}: ${f.message}`)
      .join("; ");
    throw new Error(`PACK_NOT_READY_FOR_ADMIN_APPROVAL: ${reasons}`);
  }
  if (!DIGEST_RE.test(info.digest)) {
    throw new Error("PACK_DIGEST_INVALID");
  }
  const base =
    existingPolicy && typeof existingPolicy === "object" && !Array.isArray(existingPolicy)
      ? structuredClone(existingPolicy)
      : {};
  const existingDigests = Array.isArray(base.skillPacks?.approvedDigests)
    ? base.skillPacks.approvedDigests
    : [];
  base.features = { ...(base.features || {}), skillPacks: true };
  base.skillPacks = {
    ...(base.skillPacks || {}),
    approvedDigests: [...new Set([...existingDigests, info.digest])],
  };
  return base;
}

function readExistingArg(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--existing" && argv[i + 1]) return argv[i + 1];
    if (argv[i].startsWith("--existing=")) return argv[i].slice("--existing=".length);
  }
  return "";
}

function main() {
  const [command, packDir, ...rest] = process.argv.slice(2);
  if (!command || !packDir || !["inspect", "policy"].includes(command)) {
    process.stderr.write(
      "Usage:\n" +
        "  node scripts/packs/pack-admin.mjs inspect <pack-dir>\n" +
        "  node scripts/packs/pack-admin.mjs policy <pack-dir> [--existing <desktop-policy.json>]\n",
    );
    process.exitCode = 1;
    return;
  }

  if (command === "inspect") {
    const summary = inspectPack(packDir);
    console.log(JSON.stringify(summary, null, 2));
    if (!summary.readyForAdminApproval) process.exitCode = 1;
    return;
  }

  const existingPath = readExistingArg(rest);
  let existing = {};
  if (existingPath) {
    existing = JSON.parse(readFileSync(resolve(existingPath), "utf8"));
  }
  const policy = buildPackPolicy(packDir, existing);
  console.log(JSON.stringify(policy, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
