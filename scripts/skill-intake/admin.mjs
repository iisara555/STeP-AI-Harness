#!/usr/bin/env node
// For administrators: the next steps after a staff member presses "เสนอให้องค์กรใช้" and the Skill lands in the intake
// sheet (README.md beside this file). Download the submission's Drive folder (unzip it if Drive gives a zip), then:
//
//   node scripts/skill-intake/admin.mjs check <folder> [--digest <Digest from the sheet>]
//   node scripts/skill-intake/admin.mjs pilot <folder> --digest <…> [--out <folder to give the team>] [--policy <desktop-policy.json>]
//   node scripts/skill-intake/admin.mjs add <folder> --digest <…> --owner <team id> [--contributor <name>] [--team <team>]
//                                       [--date YYYY-MM-DD] [--namespace common] [--dry-run]
//
// check  restores the folder (Drive keeps flat names, a/b.md is stored as a__b.md), re-runs the import checks the app
//        runs (file types, privacy and secrets, pack.json) and the Standard v2 + safety review, and compares the digest
//        with the sheet so a file edited in Drive is caught.
// pilot  additionally prints the policy for a team pilot: the same files must be imported on each computer, and the
//        digest goes in skillPacks.approvedDigests. It never writes a policy file.
// add    copies the Skill into skills/<namespace>/<name>/ and registers it in manifest/skills.yaml at stage draft with
//        its contributors, ready for a branch and a Pull Request. It never commits or pushes.
import {
  mkdtempSync,
  readdirSync,
  lstatSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { installPack, listPacks } from "../../src/modules/packs/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIGEST = /^[a-f0-9]{64}$/;
const NAME = /^[a-z][a-z0-9-]{0,63}$/;

const ERRORS = {
  PACK_PRIVACY_REVIEW_REQUIRED:
    "พบข้อมูลส่วนบุคคลหรือรหัสลับในไฟล์ ต้องให้ผู้เสนอแก้แล้วส่งใหม่",
  PACK_PRIVATE_FILE:
    "มีไฟล์ที่ห้ามอยู่ใน Skill (เช่น .env, credentials, MEMORY.md)",
  PACK_LINK_REJECTED: "มีชื่อไฟล์หรือ path ที่ไม่ปลอดภัย",
  PACK_LIMIT: "ไฟล์ใหญ่หรือมากเกินกำหนด",
  PACK_MANIFEST_INVALID: "pack.json ไม่ถูกต้อง",
  PACK_ASSET_INVALID: "รายการ Skill ใน pack.json ไม่ตรงกับไฟล์",
  PACK_SKILL_INVALID: "SKILL.md ไม่มี name หรือ description",
  PACK_AUTHORITY_REJECTED:
    "SKILL.md ขอสิทธิ์เครื่องมือหรือ hooks ซึ่ง Skill ของพนักงานใช้ไม่ได้",
  PACK_NAME_REQUIRED: "ไม่พบ pack.json ในโฟลเดอร์",
};
const fail = (message) => {
  throw Object.assign(new Error(message), { admin: true });
};

/** A downloaded Drive folder may be wrapped in one more folder by the unzip; use the folder that holds the files. */
function submissionRoot(folder) {
  let dir = resolve(folder);
  for (let i = 0; i < 2; i++) {
    const names = readdirSync(dir).filter(
      (n) => !n.startsWith(".") && n !== "__MACOSX",
    );
    if (names.length === 1 && lstatSync(join(dir, names[0])).isDirectory())
      dir = join(dir, names[0]);
    else break;
  }
  return dir;
}

/** Rebuild the pack's own layout from Drive's flat names (a__b.md → a/b.md) into a new private folder. */
export function restore(folder, out) {
  const from = submissionRoot(folder);
  const dest = out
    ? resolve(out)
    : join(mkdtempSync(join(tmpdir(), "step-skill-")), "pack");
  if (existsSync(dest) && readdirSync(dest).length)
    fail(`โฟลเดอร์ปลายทาง ${dest} ต้องว่าง`);
  mkdirSync(dest, { recursive: true, mode: 0o700 });
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith(".") || name === "desktop.ini") continue;
    const full = join(from, name);
    const s = lstatSync(full);
    if (!s.isFile())
      fail(`${name} ไม่ใช่ไฟล์ธรรมดา โฟลเดอร์จาก Drive ควรมีแต่ไฟล์`);
    const path = name.split("__").join("/");
    if (path.split("/").some((part) => !part || part === "." || part === ".."))
      fail(`ชื่อไฟล์ ${name} ไม่ปลอดภัย`);
    const target = join(dest, path);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(target, readFileSync(full), { flag: "wx", mode: 0o600 });
  }
  return dest;
}

/**
 * Re-run the app's import checks and review on a downloaded submission. Throws (with a Thai message) when the files
 * cannot be imported at all; otherwise returns the pack, its digest, the review and whether the digest matches.
 */
export function check(folder, { digest, out } = {}) {
  if (digest !== undefined && !DIGEST.test(digest))
    fail("Digest ต้องเป็นเลขฐานสิบหก 64 ตัว คัดลอกจากคอลัมน์ Digest ในชีต");
  const pack = restore(folder, out);
  const workspace = mkdtempSync(join(tmpdir(), "step-skill-check-"));
  try {
    let installed;
    try {
      installed = installPack(workspace, pack);
    } catch (error) {
      fail(ERRORS[error.message] || `นำเข้าไม่ได้: ${error.message}`);
    }
    const [listed] = listPacks(workspace, {});
    const manifest = JSON.parse(readFileSync(join(pack, "pack.json"), "utf8"));
    return {
      folder: pack,
      id: installed.id,
      version: manifest.version,
      skills: installed.skills,
      digest: installed.digest,
      matches: digest === undefined ? undefined : digest === installed.digest,
      review: listed.review,
      hooks: installed.hooks,
      agents: installed.agents.length,
    };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

/** Thai report for the administrator. */
export function report(result) {
  const lines = [
    `Skill: ${result.id} รุ่น ${result.version} (${result.skills.map((s) => s.id).join(", ")})`,
    `ไฟล์ที่กู้คืน: ${result.folder}`,
    `Digest: ${result.digest}`,
  ];
  if (result.matches === true)
    lines.push("✓ Digest ตรงกับชีต ไฟล์ไม่ถูกแก้หลังส่ง");
  if (result.matches === false)
    lines.push(
      "✗ Digest ไม่ตรงกับชีต ไฟล์ใน Drive ถูกแก้หรือดาวน์โหลดผิดแถว ห้ามใช้ชุดนี้",
    );
  if (result.hooks || result.agents)
    lines.push("✗ มี Hooks หรือ Agent ซึ่ง Skill ของพนักงานใช้ไม่ได้");
  const label = {
    pass: "✓ ผ่าน",
    warn: "! ผ่านแบบมีข้อแนะนำ",
    fail: "✗ ไม่ผ่าน",
  }[result.review.status];
  lines.push(`ผลตรวจมาตรฐาน v2 และความปลอดภัย: ${label}`);
  for (const f of result.review.findings)
    lines.push(
      `  ${f.level === "fail" ? "✗" : "!"} ${f.file ? f.file + (f.line ? ":" + f.line : "") + " " : ""}${f.message}`,
    );
  return lines.join("\n");
}

const usable = (result) =>
  result.matches === true &&
  result.review.status !== "fail" &&
  !result.hooks &&
  !result.agents;

/** The policy that lets one team use this exact pack: merged into an existing policy when one is given. */
export function pilotPolicy(digest, existing = {}) {
  if (!DIGEST.test(digest)) fail("Digest ไม่ถูกต้อง");
  const policy = structuredClone(existing);
  policy.features = { ...(policy.features || {}), skillPacks: true };
  const digests = Array.isArray(policy.skillPacks?.approvedDigests)
    ? policy.skillPacks.approvedDigests
    : [];
  policy.skillPacks = {
    ...(policy.skillPacks || {}),
    approvedDigests: [...new Set([...digests, digest])],
  };
  return policy;
}

// manifest/skills.yaml is read by small line parsers (scripts/validate_repo.py lints the subset): one-line values, and a
// quoted list item may not hold , [ ] { } or a backslash.
const scalar = (value, limit) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f"\\,[\]{}<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);

/** The manifest/skills.yaml entry for a staff Skill entering the organization at stage draft. */
export function manifestEntry({
  name,
  owner,
  version,
  path,
  description,
  contributors = [],
  date,
}) {
  const credits = contributors.map(
    (c) =>
      `"${[scalar(c.name, 80), scalar(c.team, 80), c.date].filter(Boolean).join(" / ")}"`,
  );
  return [
    `  ${name}:`,
    `    owner: ${owner}`,
    `    version: ${version}`,
    `    domain: [staff-contributed]`,
    `    process: []`,
    `    path: ${path}`,
    `    description: "${scalar(description, 300)}"`,
    `    contributors: [${credits.join(", ")}]`,
    `    governance:`,
    `      owner: ${owner}`,
    `      reviewer: [qs, ai-admin]`,
    `      approvedBy: [ai-admin]`,
    `      reviewedAt: "${date}"`,
    `      reviewCycle: { months: 6 }`,
    `      lifecycle:`,
    `        stage: draft`,
    `    references:`,
    `      mandatory: []`,
    `      optional: []`,
  ].join("\n");
}

function frontmatterKeys(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const values = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (m) values[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

/**
 * Copy a checked pack's Skills into the repository and register them at stage draft. Each Skill takes the files under
 * its own folder in the pack; files outside every Skill folder are reported and left out. Returns what it wrote.
 */
export function addToRepo(
  result,
  {
    root = ROOT,
    owner,
    namespace = "common",
    contributor,
    team,
    date,
    dryRun = false,
  } = {},
) {
  if (!usable(result))
    fail(
      'ยังเพิ่มเข้า repository ไม่ได้: Digest ต้องตรงกับชีต ผลตรวจต้องไม่ "ไม่ผ่าน" และต้องไม่มี Hooks หรือ Agent',
    );
  if (
    !/^[a-z0-9_-]+$/.test(namespace) ||
    !existsSync(join(root, "skills", namespace))
  )
    fail(`ไม่มีหมวด skills/${namespace} ใน repository`);
  const teams = readFileSync(join(root, "manifest/teams.yaml"), "utf8");
  const owners = new Set(
    [...teams.matchAll(/^ {6}- id:\s*([a-z0-9_-]+)/gm)]
      .map((m) => m[1])
      .concat(["developer", "pm", "ai-admin"]),
  );
  if (!owners.has(owner))
    fail(
      `--owner ต้องเป็นรหัสทีมใน manifest/teams.yaml เช่น ${[...owners].slice(0, 6).join(", ")}`,
    );
  const day = date || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail("--date ต้องเป็น YYYY-MM-DD");
  const manifestPath = join(root, "manifest/skills.yaml");
  let manifest = readFileSync(manifestPath, "utf8");
  const files = new Map();
  const walk = (dir, prefix = "") => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (lstatSync(full).isDirectory()) walk(full, prefix + name + "/");
      else files.set(prefix + name, readFileSync(full));
    }
  };
  walk(result.folder);
  const folders = result.skills
    .map((s) => ({
      ...s,
      dir:
        s.path === "SKILL.md" ? "" : s.path.slice(0, -"/SKILL.md".length) + "/",
    }))
    .sort((a, b) => b.dir.length - a.dir.length);
  const plan = folders.map((s) => ({ ...s, files: [] }));
  const leftOut = [];
  for (const [path, bytes] of files) {
    if (path === "pack.json") continue;
    const owning = plan.find((s) => path.startsWith(s.dir));
    if (owning) owning.files.push([path.slice(owning.dir.length), bytes]);
    else leftOut.push(path);
  }
  const written = [];
  const entries = [];
  for (const skill of plan) {
    const text = files.get(skill.path).toString("utf8");
    const front = frontmatterKeys(text);
    const extra = Object.keys(front).filter(
      (k) => !["name", "description", "standardVersion"].includes(k),
    );
    if (extra.length)
      fail(
        `${skill.path} มีหัวเรื่อง ${extra.join(", ")} ที่ repository ไม่รับ (รับเฉพาะ name, description, standardVersion)`,
      );
    if (!NAME.test(skill.id)) fail(`ชื่อ Skill ${skill.id} ไม่ถูกต้อง`);
    const target = join(root, "skills", namespace, skill.id);
    if (
      existsSync(target) ||
      new RegExp(`^  ${skill.id}:\\s*$`, "m").test(manifest) ||
      [...readdirSync(join(root, "skills"))].some((ns) =>
        existsSync(join(root, "skills", ns, skill.id)),
      )
    )
      fail(
        `มี Skill ชื่อ ${skill.id} ใน repository แล้ว ให้ผู้เสนอเปลี่ยนชื่อ หรือรวมเข้ากับ Skill เดิมด้วยมือ`,
      );
    const path = `skills/${namespace}/${skill.id}/SKILL.md`;
    entries.push(
      manifestEntry({
        name: skill.id,
        owner,
        version: result.version,
        path,
        description: front.description,
        contributors:
          contributor || team ? [{ name: contributor, team, date: day }] : [],
        date: day,
      }),
    );
    for (const [relative, bytes] of skill.files) {
      const out = join(target, relative);
      written.push(`skills/${namespace}/${skill.id}/${relative}`);
      if (!dryRun) {
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, bytes, { flag: "wx" });
      }
    }
  }
  manifest = manifest.replace(/\n*$/, "\n\n") + entries.join("\n\n") + "\n";
  if (!dryRun) writeFileSync(manifestPath, manifest);
  return { written, leftOut, entries, skills: plan.map((s) => s.id) };
}

function parseArgs(argv) {
  const [command, folder, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === "--dry-run") options.dryRun = true;
    else if (/^--[a-z]+$/.test(flag) && rest[i + 1] !== undefined)
      options[flag.slice(2)] = rest[++i];
    else fail(`ไม่รู้จัก ${flag}`);
  }
  return { command, folder, options };
}

function main(argv) {
  const { command, folder, options } = parseArgs(argv);
  if (!["check", "pilot", "add"].includes(command) || !folder)
    fail(
      "วิธีใช้: node scripts/skill-intake/admin.mjs check|pilot|add <โฟลเดอร์ที่ดาวน์โหลดจาก Drive> --digest <Digest จากชีต>",
    );
  if (command !== "check" && !options.digest)
    fail("ต้องใส่ --digest จากคอลัมน์ Digest ในชีต");
  const result = check(folder, {
    digest: options.digest,
    out: command === "pilot" ? options.out : undefined,
  });
  console.log(report(result));
  if (command === "check")
    return result.review.status === "fail" || result.matches === false ? 1 : 0;
  if (!usable(result)) {
    console.error(
      '\nหยุดก่อน: ใช้ชุดนี้ไม่ได้จนกว่า Digest ตรงกับชีตและผลตรวจไม่ "ไม่ผ่าน"',
    );
    return 1;
  }
  if (command === "pilot") {
    const existing = options.policy
      ? JSON.parse(readFileSync(resolve(options.policy), "utf8"))
      : {};
    console.log("\nนำร่องกับทีม:");
    console.log(
      `1. ให้ทุกเครื่องในทีมนำเข้าโฟลเดอร์ ${result.folder} ในหน้า Skill Packs (ไฟล์ต้องตรงทุกไบต์ digest จึงตรง${options.out ? "" : " ใช้ --out เพื่อเก็บโฟลเดอร์ไว้ที่อื่นแทนโฟลเดอร์ชั่วคราว"})`,
    );
    console.log(
      "2. ใส่นโยบายนี้ใน desktop-policy.json ของเครื่องในทีม แล้วเปิดแอปใหม่:\n",
    );
    console.log(JSON.stringify(pilotPolicy(result.digest, existing), null, 2));
    console.log(
      '\n3. เปลี่ยนสถานะในชีตเป็น "นำร่อง" และจดชื่อทีม เมื่อเลิกนำร่องให้ลบ digest ออกจากนโยบาย',
    );
    return 0;
  }
  const added = addToRepo(result, {
    owner: options.owner,
    namespace: options.namespace,
    contributor: options.contributor,
    team: options.team,
    date: options.date,
    dryRun: options.dryRun,
  });
  console.log(`\n${options.dryRun ? "จะเพิ่ม" : "เพิ่มแล้ว"}:`);
  for (const path of added.written) console.log("  " + path);
  console.log("  manifest/skills.yaml (stage: draft)");
  if (added.leftOut.length)
    console.log(
      `ไม่ได้คัดลอก (อยู่นอกโฟลเดอร์ Skill): ${added.leftOut.join(", ")}`,
    );
  if (!options.dryRun) {
    try {
      execFileSync("python3", ["scripts/validate_repo.py"], {
        cwd: ROOT,
        stdio: "inherit",
      });
    } catch {
      console.error("validate_repo.py ยังไม่ผ่าน ดูข้อความด้านบน");
    }
  }
  console.log(`\nก่อนเปิด Pull Request ยังต้องทำเอง เหมือนเพิ่ม Skill ใหม่ทุกตัว (ข้อมูลสังเคราะห์เท่านั้น):
1. รายการใน manifest/router-index.yaml ให้ Router หา ${added.skills.join(", ")} เจอ (ทีมหลัก ทีมที่ใช้ คำกระตุ้น)
2. evals/skills/<ชื่อ>.json ตาม manifest/skill-evals.json (positive, anti-trigger, collision, missing source)
3. จำนวน Skills ในเอกสาร (docs/developer-guide.md และเอกสารที่ npm test ชี้) และ node scripts/build-claude-plugin.mjs
4. รัน npm test และ python3 scripts/validate_repo.py จนผ่าน แล้วเปิด PR
5. ใส่ลิงก์ PR ในคอลัมน์หมายเหตุผู้ตรวจของชีต`);
  return 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error("✗ " + (error.admin ? error.message : error.stack));
    process.exitCode = 1;
  }
}
