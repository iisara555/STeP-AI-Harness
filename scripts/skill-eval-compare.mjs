#!/usr/bin/env node
// Compares a Skill before and after a change on its eval cases, model-side: the same requests are answered with the
// old SKILL.md and with the new one, and a grader model checks each answer against the case's outputAssertions.
// This is the evaluation gate for a Skill change (for example one applied with apply-skill-proposal.mjs): the change
// should help its own case without making the others worse.
//
//   node scripts/skill-eval-compare.mjs <skill> [--base <git-ref>] [--cases id,id] [--runs N] [--out report.md]
//                                               [--record] [--dry-run]
//
// Old = SKILL.md at --base (default HEAD); new = the file in the working tree. The model comes from the environment,
// never the command line: STEP_EVAL_BASE_URL (an OpenAI-compatible or Anthropic API, https, or http on loopback),
// STEP_EVAL_PROTOCOL (openai | anthropic, default openai), STEP_EVAL_MODEL, STEP_EVAL_KEY, and optionally
// STEP_EVAL_JUDGE_MODEL (a different grader model is more trustworthy than the one that answers).
// Exit code 1 when any case scores lower with the new Skill, or the eval set cannot be run.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compatibleRun } from "../src/modules/providers/compatible.js";
import { loadSkillCatalog } from "../src/modules/skills/catalog.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes("--" + name);
const option = (name) => {
  const at = argv.indexOf("--" + name);
  return at >= 0 ? argv[at + 1] : undefined;
};
const fail = (message) => {
  console.error("✗ " + message);
  process.exit(1);
};
const name = argv.find(
  (arg, i) =>
    !arg.startsWith("--") && !argv[i - 1]?.match(/^--(base|cases|runs|out)$/),
);
if (!name)
  fail(
    "usage: node scripts/skill-eval-compare.mjs <skill> [--base <ref>] [--cases id,id] [--runs N] [--out file] [--record] [--dry-run]",
  );

const skill = (await loadSkillCatalog(root)).find(
  (entry) => entry.name === name && entry.path,
);
if (!skill) fail(`unknown Skill ${name}`);
const base = option("base") || "HEAD";
const runs = Math.min(Math.max(Number(option("runs") || 1), 1), 5);
const current = readFileSync(join(root, skill.path), "utf8");
let previous;
try {
  previous = execFileSync("git", ["show", `${base}:${skill.path}`], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  }).toString();
} catch {
  fail(`${skill.path} does not exist at ${base}`);
}
if (previous === current && !option("base"))
  console.warn(
    `! ${skill.path} is unchanged since ${base}: both versions are the same`,
  );

// Cases with assertions from the Skill's eval file and the lesson cases waiting beside it; a TODO prompt is skipped.
const files = [
  join(root, "evals/skills", name + ".json"),
  join(root, "evals/skills/pending", name + ".lessons.json"),
].filter(existsSync);
if (!files.length)
  fail(`no eval cases for ${name} (evals/skills/${name}.json)`);
const only = option("cases")?.split(",");
const cases = files
  .flatMap((file) => JSON.parse(readFileSync(file, "utf8")).cases || [])
  .filter(
    (item) =>
      item.outputAssertions?.length &&
      item.prompt &&
      !/TODO/.test(item.prompt) &&
      (!only || only.includes(item.id)),
  );
if (!cases.length) fail("no case with outputAssertions to run");

const calls = cases.length * runs * 2 * 2;
console.log(
  `Skill ${name}: ${cases.length} cases × ${runs} run(s) × old/new, ${calls} model calls (answer + grade)`,
);
if (flag("dry-run")) {
  for (const item of cases)
    console.log(
      `  ${item.id} (${item.dimension}): ${item.outputAssertions.length} assertions`,
    );
  process.exit(0);
}

const env = process.env;
if (!env.STEP_EVAL_BASE_URL || !env.STEP_EVAL_MODEL)
  fail("set STEP_EVAL_BASE_URL and STEP_EVAL_MODEL (and STEP_EVAL_KEY) to run");
const profile = (model) => ({
  baseUrl: env.STEP_EVAL_BASE_URL,
  protocol: env.STEP_EVAL_PROTOCOL || "openai",
  model,
});
const answerModel = env.STEP_EVAL_MODEL,
  judgeModel = env.STEP_EVAL_JUDGE_MODEL || env.STEP_EVAL_MODEL;
let tokens = 0;
const ask = async (model, system, prompt) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await compatibleRun(prompt, profile(model), {
        system,
        key: env.STEP_EVAL_KEY,
        onUsage: (usage) => (tokens += usage.total || 0),
      });
    } catch (error) {
      if (
        attempt >= 3 ||
        ![
          "PROVIDER_RATE_LIMIT",
          "PROVIDER_UNAVAILABLE",
          "PROVIDER_NETWORK_FAILED",
        ].includes(error.message)
      )
        throw error;
      await new Promise((done) =>
        setTimeout(done, error.retryAfterMs || 2000 * attempt),
      );
    }
  }
};

const ANSWER = (skillText) =>
  `You are STeP's work assistant. Follow this Skill for the request; it is the organization's procedure.\n<skill>\n${skillText}\n</skill>`;
const JUDGE = `You grade one answer against a list of assertions. Judge only what the answer actually contains, not what it
could have meant. An assertion passes only when the answer clearly satisfies it. Return ONLY JSON:
{"results":[{"pass":true|false,"why":"short reason"}]} with one result per assertion, in order.`;

async function grade(answer, assertions) {
  const reply = await ask(
    judgeModel,
    JUDGE,
    `Assertions:\n${assertions.map((a, i) => `${i + 1}. ${a}`).join("\n")}\n\nAnswer to grade:\n<answer>\n${answer}\n</answer>`,
  );
  try {
    const results = JSON.parse(
      reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1),
    ).results;
    if (Array.isArray(results) && results.length === assertions.length)
      return results.map((r) => r?.pass === true);
  } catch {
    /* An unreadable grade counts as failed, never as passed. */
  }
  return assertions.map(() => false);
}

const report = [];
for (const item of cases) {
  const score = { old: 0, new: 0 },
    misses = { old: new Set(), new: new Set() };
  for (let run = 0; run < runs; run++)
    for (const [version, text] of [
      ["old", previous],
      ["new", current],
    ]) {
      const answer = await ask(answerModel, ANSWER(text), item.prompt);
      const passed = await grade(answer, item.outputAssertions);
      score[version] += passed.filter(Boolean).length / passed.length / runs;
      passed.forEach(
        (ok, i) => !ok && misses[version].add(item.outputAssertions[i]),
      );
    }
  const verdict =
    score.new > score.old + 1e-9
      ? "better"
      : score.new < score.old - 1e-9
        ? "worse"
        : "same";
  report.push({
    id: item.id,
    dimension: item.dimension,
    old: score.old,
    new: score.new,
    verdict,
    missedByNew: [...misses.new],
  });
  console.log(
    `  ${item.id}: old ${(score.old * 100).toFixed(0)}% → new ${(score.new * 100).toFixed(0)}% (${verdict})`,
  );
}

const mean = (key) =>
  report.reduce((sum, row) => sum + row[key], 0) / report.length;
const worse = report.filter((row) => row.verdict === "worse");
const summary = {
  skill: name,
  base,
  date: new Date().toISOString().slice(0, 10),
  model: answerModel,
  judge: judgeModel,
  runs,
  old: Number(mean("old").toFixed(3)),
  new: Number(mean("new").toFixed(3)),
  worse: worse.map((row) => row.id),
  tokens,
};
const markdown = [
  `# Skill eval: ${name} (${base} → working tree)`,
  "",
  `Model ${answerModel}, grader ${judgeModel}${judgeModel === answerModel ? " (same model: less trustworthy)" : ""}, ${runs} run(s), ${tokens} tokens.`,
  "",
  "| Case | Dimension | Old | New | Result |",
  "| --- | --- | --- | --- | --- |",
  ...report.map(
    (r) =>
      `| ${r.id} | ${r.dimension} | ${(r.old * 100).toFixed(0)}% | ${(r.new * 100).toFixed(0)}% | ${r.verdict} |`,
  ),
  "",
  `Overall: ${(summary.old * 100).toFixed(0)}% → ${(summary.new * 100).toFixed(0)}%. ${worse.length ? "Worse on: " + summary.worse.join(", ") : "No case got worse."}`,
  ...report
    .filter((r) => r.missedByNew.length)
    .map(
      (r) =>
        `\n${r.id}, missed by the new Skill:\n${r.missedByNew.map((m) => "- " + m).join("\n")}`,
    ),
  "",
].join("\n");
console.log("\n" + markdown);
if (option("out")) writeFileSync(resolve(option("out")), markdown);
if (flag("record")) {
  const file = join(root, "evals/skills", name + ".json");
  if (!existsSync(file)) fail("--record needs evals/skills/" + name + ".json");
  const spec = JSON.parse(readFileSync(file, "utf8"));
  spec.baseline = { ...spec.baseline, modelSideRun: summary };
  writeFileSync(file, JSON.stringify(spec, null, 2) + "\n");
  console.log(`Recorded in evals/skills/${name}.json (baseline.modelSideRun)`);
}
process.exit(worse.length ? 1 : 0);
