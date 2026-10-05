#!/usr/bin/env node
// For Skill maintainers: applies a Skill change proposal made in STeP Desktop (Learning Inbox → "Propose to the Skill
// maintainers") to this repository, ready for a branch and a Pull Request.
//
//   node scripts/apply-skill-proposal.mjs <skill-proposal-….md> [--dry-run]
//
// It checks that the patch touches only that Skill's SKILL.md and still applies, refuses a test case whose prompt is
// still the TODO placeholder (it must be synthetic data the maintainer wrote), applies the patch with `git apply`, adds
// the regression case to evals/skills/<skill>.json, and runs the repository validator. It never commits or pushes.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const file = args.find((arg) => !arg.startsWith("--"));
const fail = (message) => {
  console.error("✗ " + message);
  process.exit(1);
};
if (!file)
  fail(
    "usage: node scripts/apply-skill-proposal.mjs <skill-proposal.md> [--dry-run]",
  );
const text = readFileSync(resolve(file), "utf8").replace(/\r\n/g, "\n");

/** The body of the first fenced block in a language (``` or ```` fences). */
const block = (language) => {
  const match = new RegExp(
    "^(`{3,4})" + language + "\\n([\\s\\S]*?)\\n\\1$",
    "m",
  ).exec(text);
  return match ? match[2] + "\n" : "";
};
const skill =
  /^- Skill: `([a-z0-9-]+)` \((skills\/[\w./-]+\/SKILL\.md)\)/m.exec(text);
if (!skill)
  fail(
    'no "- Skill: `name` (skills/…/SKILL.md)" line: is this a STeP Skill proposal?',
  );
const [, name, path] = skill;
if (path.split("/").includes("..") || !existsSync(join(root, path)))
  fail(`${path} is not a Skill in this repository`);

const patch = block("diff");
if (!patch) fail("no ```diff block");
const touched = [...patch.matchAll(/^(?:---|\+\+\+) [ab]\/(.+)$/gm)].map(
  (m) => m[1],
);
if (!touched.length || touched.some((target) => target !== path))
  fail(`the patch must change only ${path}`);

let lesson;
try {
  lesson = JSON.parse(block("json"));
} catch {
  fail("the ```json test case is not valid JSON");
}
if (!lesson?.id || !lesson.prompt || !Array.isArray(lesson.outputAssertions))
  fail("the test case needs id, prompt and outputAssertions");
if (/TODO/.test(lesson.prompt))
  fail(
    "write the test case prompt first: replace the TODO with a synthetic request (no real data) that needs this lesson",
  );
if (lesson.expect?.skill !== name)
  fail(`the test case must expect the Skill ${name}`);

// The patch appends to the end of SKILL.md. It is applied here rather than with `git apply`, so a checkout with CRLF
// line endings (Windows, core.autocrlf) takes it too: the context is compared without line endings and the file keeps
// its own line ending style.
const hunk = patch
  .split("\n")
  .slice(patch.split("\n").findIndex((line) => line.startsWith("@@")) + 1);
const context = [],
  added = [];
let removed = 0;
for (const line of hunk) {
  if (line.startsWith("\\") || line === "") continue;
  if (line.startsWith(" ") || line.startsWith("-")) {
    context.push(line.slice(1));
    if (line.startsWith("-")) removed++;
  } else if (line.startsWith("+")) added.push(line.slice(1));
  else fail("the patch has an unexpected line: " + line.slice(0, 40));
}
const original = readFileSync(join(root, path), "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";
const lines = original.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
const tail = lines.slice(-context.length);
if (!context.length || tail.join("\n") !== context.join("\n"))
  fail(
    `the patch no longer applies to ${path}: the end of the Skill changed since the proposal was made`,
  );
// A removed line is the old last line without a final newline; the patch adds it back unchanged first. The result is
// the old lines plus the new ones, ending in one newline.
const updated = [...lines, ...added.slice(removed)].join(eol) + eol;

const evalFile = join(root, "evals", "skills", name + ".json");
// A Skill without its full eval file cannot take a lone case (CI requires all four dimensions): it waits beside it.
const target = existsSync(evalFile)
  ? evalFile
  : join(root, "evals", "skills", "pending", name + ".lessons.json");
const evals = existsSync(target)
  ? JSON.parse(readFileSync(target, "utf8"))
  : {
      skill: name,
      source: "lesson-proposals",
      note: "Regression cases from confirmed lessons, waiting for the full eval file.",
      cases: [],
    };
if (evals.cases.some((item) => item.id === lesson.id))
  fail(`${target} already has the case ${lesson.id}`);

console.log(`Skill: ${name} (${path})`);
console.log(`Patch: applies cleanly (${added.length} lines added)`);
console.log(`Test case: ${lesson.id} → ${target.slice(root.length + 1)}`);
if (dry) {
  console.log("Dry run: nothing changed.");
  process.exit(0);
}
writeFileSync(join(root, path), updated);
evals.cases.push(lesson);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(evals, null, 2) + "\n");
try {
  execFileSync(process.execPath, ["scripts/validate-repo.js"], {
    cwd: root,
    stdio: "inherit",
  });
} catch {
  fail(
    "the repository validator failed: fix the Skill before opening a Pull Request (git checkout -- . undoes the change)",
  );
}
console.log(`
✓ Applied. Next:
  git checkout -b skill/${name}-${lesson.id}
  git add ${path} ${target.slice(root.length + 1)}
  git commit -m "${name}: lesson ${lesson.id}"
  node scripts/skill-eval-compare.mjs ${name}   # compare the Skill before and after on its cases, then open the Pull Request`);
