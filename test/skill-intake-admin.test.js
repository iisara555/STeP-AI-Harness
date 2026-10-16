import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  copyFile,
  rm,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  check,
  report,
  pilotPolicy,
  addToRepo,
  manifestEntry,
} from "../scripts/skill-intake/admin.mjs";
import { installPack } from "../src/modules/packs/index.js";

// A synthetic staff Skill (Standard v2) as the intake's Drive folder holds it: flat names, "/" stored as "__".
const skill = `---
name: meeting-room-booking
description: ใช้เมื่อพนักงานต้องร่างอีเมลขอจองห้องประชุมของอุทยานฯ ให้ครบรายละเอียด
standardVersion: 2
---

# จองห้องประชุม

## Purpose
ร่างคำขอจองห้องประชุม

## เมื่อควรใช้
เมื่อผู้ใช้ขอให้ร่างคำขอจองห้อง

## Inputs
วันที่ เวลา จำนวนคน

## Source
ไม่มี source ภายนอกที่จำเป็น

## Workflow
1. ถามข้อมูลที่ขาด
2. ร่างคำขอตาม \`references/rooms.md\`

## Output
ร่างอีเมลหนึ่งฉบับ

## Authority
AI ร่างได้ ผู้ใช้ต้องยืนยันก่อนส่ง การอนุมัติห้องเป็นอำนาจของผู้ดูแลห้อง

## Handoff
ส่งร่างให้ผู้ใช้ตรวจ

## Guardrails
ห้ามอนุมัติแทนผู้ดูแลห้อง ห้ามส่งอีเมลเอง
`;
const pack = {
  schema_version: 1,
  name: "staff-pack",
  version: "1.2.0",
  skills: [
    { id: "meeting-room-booking", path: "meeting-room-booking/SKILL.md" },
  ],
  hooks: [],
  agents: [],
};

async function driveFolder(extra = {}) {
  const dir = await mkdtemp(join(tmpdir(), "drive-"));
  // Drive's zip wraps the files in a folder named after the submission.
  const inner = join(dir, "A1B2 staff-pack");
  await mkdir(inner);
  const files = {
    "pack.json": JSON.stringify(pack, null, 2) + "\n",
    "meeting-room-booking__SKILL.md": skill,
    "meeting-room-booking__references__rooms.md":
      "# ห้องประชุม\n\nห้อง A รับ 10 คน\n",
    ...extra,
  };
  for (const [name, text] of Object.entries(files))
    await writeFile(join(inner, name), text);
  return dir;
}

// The digest the app computed when the staff member pressed "เสนอให้องค์กรใช้".
async function appDigest() {
  const src = await mkdtemp(join(tmpdir(), "src-"));
  await mkdir(join(src, "meeting-room-booking/references"), {
    recursive: true,
  });
  await writeFile(join(src, "pack.json"), JSON.stringify(pack, null, 2) + "\n");
  await writeFile(join(src, "meeting-room-booking/SKILL.md"), skill);
  await writeFile(
    join(src, "meeting-room-booking/references/rooms.md"),
    "# ห้องประชุม\n\nห้อง A รับ 10 คน\n",
  );
  const workspace = await mkdtemp(join(tmpdir(), "ws-"));
  return installPack(workspace, src).digest;
}

test("check restores Drive's flat names and matches the digest the app sent", async () => {
  const digest = await appDigest();
  const result = check(await driveFolder(), { digest });
  assert.equal(result.id, "staff-pack");
  assert.equal(result.digest, digest);
  assert.equal(result.matches, true);
  assert.notEqual(result.review.status, "fail");
  assert.ok(
    existsSync(join(result.folder, "meeting-room-booking/references/rooms.md")),
  );
  assert.match(report(result), /Digest ตรงกับชีต/);
});

test("a file edited in Drive after submission no longer matches the sheet", async () => {
  const digest = await appDigest();
  const folder = await driveFolder({
    "meeting-room-booking__references__rooms.md":
      "# ห้องประชุม\n\nห้อง A รับ 99 คน\n",
  });
  const result = check(folder, { digest });
  assert.equal(result.matches, false);
  assert.match(report(result), /ไม่ตรงกับชีต/);
  assert.throws(
    () => addToRepo(result, { owner: "ga" }),
    /ยังเพิ่มเข้า repository ไม่ได้/,
  );
});

test("the app's privacy check runs again on the downloaded files", async () => {
  const folder = await driveFolder({
    "meeting-room-booking__notes.md":
      "ติดต่อ 081-234-5678 หรือ somchai@example.com\n",
  });
  assert.throws(() => check(folder), /ข้อมูลส่วนบุคคลหรือรหัสลับ/);
});

test("pilot policy turns on admin-approved packs and keeps existing settings and digests", () => {
  const a = "a".repeat(64),
    b = "b".repeat(64);
  const policy = pilotPolicy(b, {
    features: { developmentMode: true },
    skillPacks: {
      approvedDigests: [a],
      submitUrl: "https://script.google.com/macros/s/x/exec",
    },
  });
  assert.deepEqual(policy, {
    features: { developmentMode: true, skillPacks: true },
    skillPacks: {
      approvedDigests: [a, b],
      submitUrl: "https://script.google.com/macros/s/x/exec",
    },
  });
  assert.deepEqual(pilotPolicy(a, policy).skillPacks.approvedDigests, [a, b]);
  assert.throws(() => pilotPolicy("nope"), /Digest/);
});

test("add copies the Skill into the repository at stage draft with its contributor", async () => {
  const root = await mkdtemp(join(tmpdir(), "repo-"));
  await mkdir(join(root, "skills/common"), { recursive: true });
  await mkdir(join(root, "manifest"));
  for (const name of ["teams.yaml", "skills.yaml"])
    await copyFile(join("manifest", name), join(root, "manifest", name));
  const result = check(await driveFolder(), { digest: await appDigest() });
  const added = addToRepo(result, {
    root,
    owner: "ga",
    contributor: "สมมติ ทดสอบ, [ชื่อสังเคราะห์]",
    team: "GA",
    date: "2026-10-16",
  });
  assert.deepEqual(added.written.sort(), [
    "skills/common/meeting-room-booking/SKILL.md",
    "skills/common/meeting-room-booking/references/rooms.md",
  ]);
  assert.equal(
    await readFile(
      join(root, "skills/common/meeting-room-booking/SKILL.md"),
      "utf8",
    ),
    skill,
  );
  const manifest = await readFile(join(root, "manifest/skills.yaml"), "utf8");
  assert.match(
    manifest,
    /\n {2}meeting-room-booking:\n {4}owner: ga\n {4}version: 1\.2\.0\n/,
  );
  assert.match(
    manifest,
    / {4}contributors: \["สมมติ ทดสอบ ชื่อสังเคราะห์ \/ GA \/ 2026-10-16"\]\n/,
  );
  assert.match(manifest, /meeting-room-booking:[\s\S]*stage: draft\n/);
  // The repository's manifest linter accepts the new entry.
  const lint = execFileSync(
    "python3",
    [
      "-c",
      "import sys; sys.path.insert(0, 'scripts'); import validate_repo as v; print('\\n'.join(v.lint_manifest_text('skills.yaml', open(sys.argv[1], encoding='utf-8').read())))",
      join(root, "manifest/skills.yaml"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(lint.trim(), "");
  // A second add of the same name is refused instead of overwriting.
  assert.throws(
    () => addToRepo(result, { root, owner: "ga" }),
    /มี Skill ชื่อ meeting-room-booking/,
  );
  assert.throws(() => addToRepo(result, { root, owner: "nobody" }), /--owner/);
  await rm(root, { recursive: true, force: true });
});

test("a manifest entry without consent to credit lists no contributors", () => {
  const entry = manifestEntry({
    name: "x-skill",
    owner: "ga",
    version: "1.0.0",
    path: "skills/common/x-skill/SKILL.md",
    description: 'a: "b"',
    date: "2026-10-16",
  });
  assert.match(entry, / {4}contributors: \[\]\n/);
  assert.match(entry, / {4}description: "a: b"\n/);
});

test("credit can name only the team when the contributor did not agree to a public name", () => {
  const entry = manifestEntry({
    name: "x-skill",
    owner: "ga",
    version: "1.0.0",
    path: "skills/common/x-skill/SKILL.md",
    description: "d",
    contributors: [{ team: "GA", date: "2026-10-16" }],
    date: "2026-10-16",
  });
  assert.match(entry, / {4}contributors: \["GA \/ 2026-10-16"\]\n/);
});
