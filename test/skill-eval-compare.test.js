// The Skill evaluation gate: old vs new SKILL.md on the same cases, against a fake OpenAI-compatible model on loopback.
// The fake answers with the lesson only when the Skill text has it, and grades an assertion as passed when the answer
// contains it word for word, so the result is deterministic.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const LESSON = "ช่อง Owner ของงานที่ไม่มีผู้รับผิดชอบเขียนว่า รอยืนยัน";

function fakeModel() {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const request = JSON.parse(body);
      const system =
        request.messages.find((m) => m.role === "system")?.content || "";
      const prompt = request.messages.at(-1).content;
      let text;
      if (system.startsWith("You grade one answer")) {
        const assertions = [...prompt.matchAll(/^\d+\. (.*)$/gm)].map(
          (m) => m[1],
        );
        const answer = prompt.split("<answer>")[1] || "";
        text = JSON.stringify({
          results: assertions.map((a) => ({
            pass: answer.includes(a),
            why: "fixture",
          })),
        });
      } else
        text = system.includes(LESSON) ? "สรุปประชุม\n" + LESSON : "สรุปประชุม";
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(
        `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n` +
          `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\ndata: [DONE]\n\n`,
      );
    });
  });
  return new Promise((done) =>
    server.listen(0, "127.0.0.1", () => done(server)),
  );
}

const run = (cwd, args, env) =>
  new Promise((done) => {
    const child = spawn(
      process.execPath,
      ["scripts/skill-eval-compare.mjs", ...args],
      { cwd, env: { ...process.env, ...env } },
    );
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => done({ code, out }));
  });

test("a Skill change is compared old vs new on the same cases, and a worse case fails the gate", async (t) => {
  const copy = join(await mkdtemp(join(tmpdir(), "step-eval-")), "repo");
  execFileSync("git", ["worktree", "add", "-q", "--detach", copy, "HEAD"], {
    cwd: repo,
  });
  t.after(() =>
    execFileSync("git", ["worktree", "remove", "--force", copy], { cwd: repo }),
  );
  for (const file of ["scripts/skill-eval-compare.mjs"])
    await writeFile(join(copy, file), await readFile(join(repo, file)));
  const server = await fakeModel();
  t.after(() => server.close());
  const env = {
    STEP_EVAL_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`,
    STEP_EVAL_MODEL: "fake",
    STEP_EVAL_KEY: "x",
  };
  const evalFile = join(copy, "evals/skills/meeting-summary.json");
  const spec = JSON.parse(await readFile(evalFile, "utf8"));
  spec.cases.push({
    id: "lesson-owner",
    dimension: "regression",
    team: "ga",
    prompt: "สรุปประชุมนี้ให้หน่อย ในบันทึกไม่ระบุว่าใครรับผิดชอบงานไหน",
    expect: { mode: "SKILL", skill: "meeting-summary" },
    outputAssertions: [LESSON],
  });
  await writeFile(evalFile, JSON.stringify(spec, null, 2));

  const dry = await run(
    copy,
    ["meeting-summary", "--dry-run", "--cases", "lesson-owner"],
    {},
  );
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.out, /1 cases × 1 run\(s\) × old\/new, 4 model calls/);

  // The lesson is added to the Skill in the working tree: its case goes from 0% to 100%.
  await appendFile(
    join(copy, "skills/pm/meeting-summary/SKILL.md"),
    "\n## บทเรียนจากการใช้งาน\n\n" + LESSON + "\n",
  );
  const better = await run(
    copy,
    [
      "meeting-summary",
      "--cases",
      "lesson-owner",
      "--out",
      join(copy, "report.md"),
      "--record",
    ],
    env,
  );
  assert.equal(better.code, 0, better.out);
  assert.match(better.out, /lesson-owner: old 0% → new 100% \(better\)/);
  assert.match(
    await readFile(join(copy, "report.md"), "utf8"),
    /\| lesson-owner \| regression \| 0% \| 100% \| better \|/,
  );
  const recorded = JSON.parse(await readFile(evalFile, "utf8")).baseline
    .modelSideRun;
  assert.deepEqual([recorded.old, recorded.new, recorded.worse], [0, 1, []]);

  // Comparing in the other direction (the lesson removed) is a regression: the gate fails.
  execFileSync("git", ["add", "-A"], { cwd: copy });
  execFileSync(
    "git",
    [
      "-c",
      "user.email=t@example.test",
      "-c",
      "user.name=t",
      "commit",
      "-q",
      "-m",
      "lesson",
    ],
    { cwd: copy },
  );
  execFileSync(
    "git",
    ["checkout", "HEAD~1", "--", "skills/pm/meeting-summary/SKILL.md"],
    { cwd: copy },
  );
  const worse = await run(
    copy,
    ["meeting-summary", "--cases", "lesson-owner"],
    env,
  );
  assert.equal(worse.code, 1, worse.out);
  assert.match(worse.out, /Worse on: lesson-owner/);

  const missing = await run(
    copy,
    ["meeting-summary", "--cases", "lesson-owner"],
    { STEP_EVAL_BASE_URL: "", STEP_EVAL_MODEL: "" },
  );
  assert.equal(missing.code, 1);
  assert.match(missing.out, /set STEP_EVAL_BASE_URL/);
});
