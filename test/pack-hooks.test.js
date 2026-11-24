import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  enablePack,
  enabledPackHooks,
  inspectPackSource,
  installPack,
  listPacks,
  packAsset,
  validatePack,
} from "../src/modules/packs/index.js";
import { buildPackPolicy, inspectPack } from "../scripts/packs/pack-admin.mjs";
import { createHookReceiverServer } from "../scripts/packs/hook-receiver-example.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const REF_PACK = join(ROOT, "packs", "step-governance-pack");

test("validatePack accepts optional safe matcher and rejects unsafe matchers; enabledPackHooks normalizes priority and headers", async () => {
  const root = await mkdtemp(join(tmpdir(), "step-pack-hooks-"));
  const work = join(root, "work");
  const src = join(root, "src");
  await mkdir(work);
  await mkdir(src);

  const skillText = [
    "---",
    "name: hook-skill",
    "description: ทดสอบการตรวจสอบ matcher และ priority ของ hook ใน Skill Pack",
    "standardVersion: 2",
    "---",
    "## Purpose",
    "ทดสอบ",
    "## เมื่อควรใช้",
    "ทดสอบ",
    "## Inputs",
    "ข้อความ",
    "## Source",
    "ไม่ต้องใช้แหล่งข้อมูลภายนอก",
    "## Workflow",
    "1. ตรวจ",
    "## Output",
    "ผลตรวจ",
    "## Authority",
    "ผู้ใช้ต้องยืนยันก่อนใช้",
    "## Handoff",
    "ส่งให้ผู้ใช้",
    "## Guardrails",
    "ห้ามอนุมัติแทน",
  ].join("\n");
  await writeFile(join(src, "SKILL.md"), skillText);

  const baseManifest = {
    schema_version: 1,
    name: "hook-matcher-pack",
    version: "1.0.0",
    skills: [{ id: "hook-skill", path: "SKILL.md" }],
    agents: [],
    hooks: [
      {
        event: "pre_tool_use",
        type: "http",
        url: "https://hooks.example.invalid/audit",
        matcher: "write*",
        timeoutSeconds: 10,
        blockOnFailure: true,
      },
    ],
  };

  try {
    // Reject bad matchers
    for (const bad of ["", "write *", "../bad", "a".repeat(201), 123]) {
      const files = new Map([
        ["SKILL.md", Buffer.from(skillText, "utf8")],
        [
          "pack.json",
          Buffer.from(
            JSON.stringify({
              ...baseManifest,
              hooks: [{ ...baseManifest.hooks[0], matcher: bad }],
            }),
          ),
        ],
      ]);
      assert.throws(() => validatePack(JSON.parse(files.get("pack.json").toString()), files), /PACK_HOOK_INVALID/);
    }

    // Valid pack with omitted priority
    await writeFile(join(src, "pack.json"), JSON.stringify(baseManifest));
    const installed = installPack(work, src);
    const policy = {
      features: { skillPacks: true },
      skillPacks: { approvedDigests: [installed.digest] },
    };
    enablePack(work, installed.id, policy, { approve: true, hooks: true });
    const hooks = enabledPackHooks(work, policy);
    assert.equal(hooks.length, 1);
    assert.equal(hooks[0].matcher, "write*");
    assert.equal(hooks[0].priority, 0);
    assert.deepEqual(hooks[0].headers, {});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reference packs/step-governance-pack passes inspect, refuses personal mode, enables hooks/agents under admin policy, and works with pack-admin", async () => {
  const inspected = inspectPackSource(REF_PACK);
  assert.equal(inspected.id, "step-governance-pack");
  assert.equal(inspected.skills.length, 1);
  assert.equal(inspected.agents.length, 1);
  assert.equal(inspected.hooks.length, 1);

  const adminInfo = inspectPack(REF_PACK);
  assert.equal(adminInfo.readyForAdminApproval, true);
  assert.deepEqual(adminInfo.nonHookFindings, []);

  const builtPolicy = buildPackPolicy(REF_PACK, { features: { toolLoop: true } });
  assert.equal(builtPolicy.features.toolLoop, true);
  assert.equal(builtPolicy.features.skillPacks, true);
  assert.deepEqual(builtPolicy.skillPacks.approvedDigests, [adminInfo.digest]);

  const root = await mkdtemp(join(tmpdir(), "step-ref-pack-"));
  try {
    const installed = installPack(root, REF_PACK);
    assert.equal(installed.digest, adminInfo.digest);
    // Personal enable must refuse because pack contains hooks and agents.
    assert.throws(
      () => enablePack(root, installed.id, { features: { staffSkills: true } }, { approve: true, personal: true }),
      /PACK_REVIEW_FAILED/,
    );
    // Admin enable with hooks + agents exposes both hooks and agent template.
    enablePack(root, installed.id, builtPolicy, { approve: true, hooks: true, agents: true });
    const list = listPacks(root, builtPolicy);
    assert.equal(list.length, 1);
    assert.equal(list[0].adminApproved, true);
    assert.equal(list[0].hooksEnabled, true);
    assert.equal(list[0].agentsEnabled, true);

    const hooks = enabledPackHooks(root, builtPolicy);
    assert.equal(hooks.length, 1);
    assert.equal(hooks[0].matcher, "write*");
    assert.equal(hooks[0].priority, 10);

    const agent = packAsset(root, installed.id, "step-policy-reviewer", "agent", builtPolicy);
    assert.match(agent.text, /step-policy-reviewer/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createHookReceiverServer evaluates allow/block rules and records metadata-only audits", async () => {
  const audits = [];
  const server = createHookReceiverServer({
    blockTools: ["shell", "mcp_*"],
    onAudit: (entry) => audits.push(entry),
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    assert.equal((await fetch(`${base}/other`, { method: "POST" })).status, 404);
    assert.equal((await fetch(`${base}/v1/tool-audit`, { method: "GET" })).status, 405);

    const allowed = await fetch(`${base}/v1/tool-audit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "pre_tool_use", tool: "write", sessionId: "s1" }),
    });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { decision: "allow" });

    const blocked = await fetch(`${base}/v1/tool-audit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "pre_tool_use", tool: "mcp_call", sessionId: "s1" }),
    });
    assert.equal(blocked.status, 200);
    const blockedJson = await blocked.json();
    assert.equal(blockedJson.decision, "block");
    assert.equal(audits.length, 2);
    assert.deepEqual(
      audits.map((a) => ({ tool: a.tool, blocked: a.blocked })),
      [
        { tool: "write", blocked: false },
        { tool: "mcp_call", blocked: true },
      ],
    );
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});
