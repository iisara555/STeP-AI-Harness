import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  autopilot,
  scoreIssue,
  coderArgs,
  deniedAutopilotPath,
} from "../src/modules/autopilot/index.js";
import { boundedCommand } from "../src/utils/bounded-command.js";

const metadata = {
  nameWithOwner: "example/synthetic",
  isPrivate: false,
  defaultBranchRef: { name: "main" },
};
const issue = {
  number: 7,
  title: "Correct a synthetic value",
  body: "Replace the value in value.js.",
  labels: [{ name: "autopilot:approved" }, { name: "bug" }],
};
const github = (args) =>
  args[0] === "repo"
    ? metadata
    : args[0] === "issue" && args[1] === "list"
      ? [issue]
      : args[0] === "issue" && args[1] === "view"
        ? issue
        : [];
test("managed autopilot path denial covers relative, absolute and nested wildcard rules", () => {
  const root = "C:\\review\\workspace";
  for (const pattern of [
    "private/*",
    "*/private/*",
    "C:\\review\\workspace\\private\\*",
  ])
    assert.ok(
      deniedAutopilotPath(
        "private/nested/file.js",
        [{ pattern, allow: false }],
        root,
      ),
    );
  assert.equal(
    deniedAutopilotPath(
      "public/file.js",
      [{ pattern: "private/*", allow: false }],
      root,
    ),
    false,
  );
  assert.ok(
    deniedAutopilotPath(
      "private/a.js",
      [
        { pattern: "private/*", allow: true },
        { pattern: "private/*", allow: false },
      ],
      root,
    ),
  );
});
test("autopilot scores only human-approved issues and denies blocked labels", () => {
  assert.ok(scoreIssue(issue) > 0);
  assert.equal(scoreIssue({ ...issue, labels: [] }), -1);
  assert.equal(
    scoreIssue({ ...issue, labels: [...issue.labels, { name: "human-gate" }] }),
    -1,
  );
  const codex = coderArgs("codex", "/work");
  assert.ok(codex.includes("read-only"));
  assert.ok(codex.includes("shell_tool"));
  assert.ok(!codex.includes("--dangerously-bypass-approvals-and-sandbox"));
  const claude = coderArgs("claude", "/work");
  assert.equal(claude[claude.indexOf("--tools") + 1], "");
  assert.ok(!claude.includes("--dangerously-skip-permissions"));
});
test("dry-run on a disposable repository performs only GitHub reads, no model, worktree or publication", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "step-autopilot-dry-")),
    calls = [];
  const before = await boundedCommand("git", ["init", "-b", "main"], { cwd });
  assert.equal(before.code, 0);
  const run = async (command, args) => {
    calls.push([command, ...args]);
    assert.equal(command, "gh");
    return { code: 0, output: JSON.stringify(github(args)) };
  };
  const result = await autopilot(
    { repo: "example/synthetic", cwd, "dry-run": true },
    { run },
  );
  assert.equal(result.dryRun, true);
  assert.equal(result.issue, 7);
  assert.equal(result.status, "planned");
  assert.equal(calls.length, 3);
  assert.equal(
    (
      await boundedCommand("git", ["status", "--porcelain"], { cwd })
    ).output.trim(),
    "",
  );
  assert.ok(calls.every((c) => ["view", "list"].includes(c[2])));
});
test("execution is denied without administrator policy and explicit provider consent", async () => {
  const run = async (_command, args) => ({
    code: 0,
    output: JSON.stringify(github(args)),
  });
  await assert.rejects(
    autopilot(
      { repo: "example/synthetic", execute: true },
      { run, policy: {} },
    ),
    /AUTOPILOT_APPROVAL_REQUIRED/,
  );
  await assert.rejects(
    autopilot(
      { repo: "example/synthetic", execute: true },
      { run, policy: { features: { autopilot: true } } },
    ),
    /AUTOPILOT_APPROVAL_REQUIRED/,
  );
  await assert.rejects(
    autopilot(
      { repo: "example/synthetic", execute: true, "approve-provider": true },
      {
        run,
        policy: { features: { autopilot: true }, hooks: [{ type: "prompt" }] },
      },
    ),
    /PROMPT_HOOK_UNAVAILABLE/,
  );
});
test("continuing an existing autopilot PR never bypasses human-gate or exact-head review", async () => {
  let gate = true,
    reviewed = false;
  const calls = [],
    head = "a".repeat(40);
  const run = async (_command, args) => {
    calls.push(args);
    let result = github(args);
    if (args[0] === "pr" && args[1] === "list")
      result = [{ number: 12, headRefName: "codex/autopilot-7-123456ab" }];
    if (args[0] === "pr" && args[1] === "view")
      result = {
        number: 12,
        labels: gate ? [{ name: "human-gate" }] : [],
        isDraft: false,
        reviewDecision: "APPROVED",
        mergeStateStatus: "CLEAN",
        headRefOid: head,
        baseRefName: "main",
      };
    if (args[0] === "api")
      result = [
        [{ state: "APPROVED", commit_id: reviewed ? head : "b".repeat(40) }],
      ];
    return { code: 0, output: JSON.stringify(result) };
  };
  const options = {
      repo: "example/synthetic",
      cwd: await mkdtemp(join(tmpdir(), "step-autopilot-review-")),
      "pull-request": 12,
      execute: true,
      "approve-merge": true,
    },
    dependencies = {
      run,
      policy: { features: { autopilot: true, autoMerge: true }, hooks: [] },
    };
  await assert.rejects(autopilot(options, dependencies), /HUMAN_GATE_REQUIRED/);
  gate = false;
  await assert.rejects(autopilot(options, dependencies), /HUMAN_GATE_REQUIRED/);
  assert.equal(
    calls.some((c) => c[0] === "pr" && c[1] === "merge"),
    false,
  );
  reviewed = true;
  assert.equal((await autopilot(options, dependencies)).status, "merged");
  const merge = calls.find((c) => c[0] === "pr" && c[1] === "merge");
  assert.ok(merge.includes("--match-head-commit"));
  assert.ok(merge.includes(head));
});
test("synthetic coder proposals are host-validated in a real isolated worktree, with isolated test profile and no external writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "step-autopilot-execute-")),
    cwd = join(root, "checkout"),
    remote = join(root, "remote.git");
  await mkdir(cwd);
  const git = async (args) => {
    const r = await boundedCommand("git", args, { cwd });
    assert.equal(r.code, 0, r.output);
    return r.output.trim();
  };
  await git(["init", "-b", "main"]);
  await git(["config", "user.name", "Synthetic"]);
  await git(["config", "user.email", "synthetic@localhost"]);
  await writeFile(join(cwd, "value.js"), "export const value = 1;\n");
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({
      scripts: {
        test: 'node -e "process.exit(0)"',
        validate: 'node -e "process.exit(0)"',
      },
    }),
  );
  await writeFile(
    join(cwd, ".gitignore"),
    "output/\nUSER.md\nMEMORY.md\nASSISTANT.md\n.step/\n",
  );
  await git(["add", "."]);
  await git(["commit", "-m", "Synthetic baseline"]);
  assert.equal(
    (await boundedCommand("git", ["init", "--bare", remote], { cwd: root }))
      .code,
    0,
  );
  await git(["remote", "add", "origin", remote]);
  await git(["push", "origin", "main"]);
  const calls = [];
  const run = async (command, args, options) => {
    calls.push([command, ...args]);
    if (command === "gh")
      return { code: 0, output: JSON.stringify(github(args)) };
    if (command === "git" && args.join(" ") === "remote get-url origin")
      return { code: 0, output: "https://github.com/example/synthetic.git" };
    if (command === "codex") {
      assert.ok(args.includes("read-only"));
      assert.ok(!options.input.includes("synthetic@localhost"));
      const sources = JSON.parse(
        /<source_files>([\s\S]+)<\/source_files>/.exec(options.input)[1],
      );
      await writeFile(
        args[args.indexOf("--output-last-message") + 1],
        JSON.stringify({
          changes: [
            {
              path: "value.js",
              beforeSha256: sources[0].beforeSha256,
              content: "export const value = 2;\n",
            },
          ],
        }),
      );
      return { code: 0, output: "synthetic model transcript" };
    }
    if (command === "npm") {
      assert.notEqual(options.env.HOME, process.env.HOME);
      assert.equal(options.env.GH_TOKEN, undefined);
    }
    return boundedCommand(command, args, options);
  };
  const result = await autopilot(
    {
      repo: "example/synthetic",
      cwd,
      files: "value.js",
      execute: true,
      "approve-provider": true,
    },
    {
      run,
      policy: { features: { autopilot: true }, hooks: [] },
      route: async () => ({
        routingContract: { mode: "GENERAL", authority: { status: "ALLOW" } },
      }),
    },
  );
  assert.equal(result.status, "local-review");
  assert.equal(
    await readFile(join(cwd, "value.js"), "utf8"),
    "export const value = 1;\n",
  );
  assert.equal(
    await readFile(join(result.worktree, "value.js"), "utf8"),
    "export const value = 2;\n",
  );
  assert.ok(calls.some((c) => c[0] === "npm" && c[1] === "test"));
  assert.ok(calls.some((c) => c[0] === "npm" && c[2] === "validate"));
  assert.ok(!calls.some((c) => c[0] === "git" && c[1] === "push"));
  assert.ok(
    !calls.some(
      (c) => c[0] === "gh" && ["create", "merge", "edit"].includes(c[2]),
    ),
  );
  const dashboard = JSON.parse(
    await readFile(join(cwd, "output/autopilot/status.json"), "utf8"),
  );
  assert.equal(dashboard.status, "local-review");
});
