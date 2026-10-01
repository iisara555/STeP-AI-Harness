import {
  lstatSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  rmSync,
  existsSync,
} from "node:fs";
import { resolve, join, relative, dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { evaluatePrivacyGate } from "../privacy/index.js";

const ID = /^[a-z][a-z0-9-]{0,63}$/;
const EVENTS = [
  "session_start",
  "session_end",
  "user_prompt_submit",
  "pre_tool_use",
  "post_tool_use",
  "pre_compact",
  "post_compact",
  "stop",
];
const plain = (v) => v && typeof v === "object" && !Array.isArray(v);
const keys = (v, allowed) =>
  plain(v) && Object.keys(v).every((k) => allowed.includes(k));
const safe = (p) =>
  typeof p === "string" &&
  p.length <= 250 &&
  !p.startsWith("/") &&
  !p.includes("\\") &&
  p
    .split("/")
    .every((s) => s && s !== "." && s !== ".." && /^[a-zA-Z0-9_. -]+$/.test(s));
function regular(path, folder = false) {
  const s = lstatSync(path);
  if (
    s.isSymbolicLink() ||
    (folder ? !s.isDirectory() : !s.isFile() || s.nlink !== 1)
  )
    throw new Error("PACK_LINK_REJECTED");
  return s;
}
function tree(root) {
  regular(root, true);
  const files = new Map();
  let total = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (
        !/^[a-zA-Z0-9_. -]{1,120}$/.test(name) ||
        /^(?:\.env|\.git|node_modules|credentials?|tokens?|secrets?|USER\.md|MEMORY\.md|AGENTS\.md)/i.test(
          name,
        )
      )
        throw new Error("PACK_PRIVATE_FILE");
      const full = join(dir, name),
        s = lstatSync(full),
        path = relative(root, full).replaceAll("\\", "/");
      if (!safe(path) || s.isSymbolicLink())
        throw new Error("PACK_LINK_REJECTED");
      if (s.isDirectory()) {
        if (path.split("/").length > 8) throw new Error("PACK_LIMIT");
        walk(full);
        continue;
      }
      regular(full);
      total += s.size;
      if (s.size > 200_000 || total > 2_000_000 || files.size >= 120)
        throw new Error("PACK_LIMIT");
      const bytes = readFileSync(full),
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        scan = evaluatePrivacyGate(text);
      if (
        scan.action !== "pass" ||
        scan.containsPersonalData ||
        scan.redactedText !== text
      )
        throw new Error("PACK_PRIVACY_REVIEW_REQUIRED");
      files.set(path, bytes);
    }
  };
  walk(root);
  return files;
}
function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]{1,8000}?)\r?\n---(?:\r?\n|$)/);
  if (
    !match ||
    /^(?:tools|permissions|authority|hooks|allowed-tools)\s*:/im.test(match[1])
  )
    throw new Error("PACK_AUTHORITY_REJECTED");
  const name = match[1].match(
    /^name:\s*["']?([a-z][a-z0-9-]{0,63})["']?\s*$/m,
  )?.[1];
  if (!name || !/^description:\s*\S/m.test(match[1]))
    throw new Error("PACK_SKILL_INVALID");
  return name;
}
export function validatePack(manifest, files) {
  if (
    !keys(manifest, [
      "schema_version",
      "name",
      "version",
      "skills",
      "hooks",
      "agents",
    ]) ||
    manifest.schema_version !== 1 ||
    !ID.test(manifest.name) ||
    !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
    !Array.isArray(manifest.skills) ||
    !manifest.skills.length ||
    manifest.skills.length > 40 ||
    !Array.isArray(manifest.hooks || []) ||
    (manifest.hooks || []).length > 20 ||
    !Array.isArray(manifest.agents || []) ||
    (manifest.agents || []).length > 20
  )
    throw new Error("PACK_MANIFEST_INVALID");
  const seen = new Set();
  for (const [kind, assets] of [
    ["skill", manifest.skills],
    ["agent", manifest.agents || []],
  ])
    for (const a of assets) {
      if (
        !keys(a, ["id", "path"]) ||
        !ID.test(a.id) ||
        !safe(a.path) ||
        !files.has(a.path) ||
        (kind === "skill"
          ? !a.path.endsWith("SKILL.md")
          : !a.path.endsWith(".md")) ||
        seen.has(kind + ":" + a.id)
      )
        throw new Error("PACK_ASSET_INVALID");
      seen.add(kind + ":" + a.id);
      if (frontmatter(files.get(a.path).toString("utf8")) !== a.id)
        throw new Error("PACK_ASSET_INVALID");
    }
  for (const h of manifest.hooks || []) {
    if (
      !keys(h, [
        "event",
        "type",
        "command",
        "url",
        "timeoutSeconds",
        "blockOnFailure",
        "priority",
      ]) ||
      !EVENTS.includes(h.event) ||
      !["command", "http"].includes(h.type) ||
      h.blockOnFailure !== true ||
      !Number.isInteger(h.timeoutSeconds) ||
      h.timeoutSeconds < 1 ||
      h.timeoutSeconds > 60 ||
      !Number.isInteger(h.priority || 0)
    )
      throw new Error("PACK_HOOK_INVALID");
    if (
      h.type === "command" &&
      (typeof h.command !== "string" ||
        !h.command.trim() ||
        h.command.length > 2000 ||
        h.url !== undefined)
    )
      throw new Error("PACK_HOOK_INVALID");
    if (h.type === "http") {
      const u = new URL(h.url);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.hash ||
        u.search ||
        h.command !== undefined
      )
        throw new Error("PACK_HOOK_INVALID");
    }
  }
  return manifest;
}
const digest = (files) => {
  const h = createHash("sha256");
  for (const [path, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b)))
    h.update(path + "\0" + bytes.length + "\0").update(bytes);
  return h.digest("hex");
};
function base(workspace) {
  const root = resolve(workspace);
  regular(root, true);
  let full = root;
  for (const dir of [".step", "packs"]) {
    full = join(full, dir);
    if (!existsSync(full)) mkdirSync(full, { mode: 0o700 });
    regular(full, true);
  }
  return full;
}
function read(workspace, id) {
  if (!ID.test(id)) throw new Error("PACK_ID_INVALID");
  const folder = join(base(workspace), id);
  regular(folder, true);
  const assets = join(folder, "assets"),
    files = tree(assets),
    manifest = validatePack(
      JSON.parse(files.get("pack.json")?.toString("utf8") || "{}"),
      files,
    );
  if (manifest.name !== id) throw new Error("PACK_ID_INVALID");
  const hash = digest(files);
  let state = {};
  try {
    regular(join(folder, "enabled.json"));
    state = JSON.parse(readFileSync(join(folder, "enabled.json"), "utf8"));
  } catch {}
  return { folder, assets, files, manifest, digest: hash, state };
}
function allowed(pack, policy) {
  return (
    policy?.features?.skillPacks === true &&
    Array.isArray(policy.skillPacks?.approvedDigests) &&
    policy.skillPacks.approvedDigests.includes(pack.digest) &&
    pack.state.digest === pack.digest &&
    pack.state.enabled === true
  );
}
export function installPack(workspace, source, { name } = {}) {
  const files = tree(resolve(source));
  let manifest;
  if (files.has("pack.json"))
    manifest = JSON.parse(files.get("pack.json").toString("utf8"));
  else {
    if (!ID.test(name)) throw new Error("PACK_NAME_REQUIRED");
    const skills = [...files]
      .filter(([p]) => p === "SKILL.md" || p.endsWith("/SKILL.md"))
      .map(([path, b]) => ({ id: frontmatter(b.toString("utf8")), path }));
    manifest = {
      schema_version: 1,
      name,
      version: "1.0.0",
      skills,
      hooks: [],
      agents: [],
    };
    files.set(
      "pack.json",
      Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
    );
  }
  validatePack(manifest, files);
  const dest = join(base(workspace), manifest.name);
  if (existsSync(dest)) throw new Error("PACK_ALREADY_INSTALLED");
  const stage = join(base(workspace), "stage-" + randomUUID());
  mkdirSync(stage, { mode: 0o700 });
  try {
    for (const [path, b] of files) {
      const out = join(stage, "assets", path);
      mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
      writeFileSync(out, b, { flag: "wx", mode: 0o600 });
    }
    writeFileSync(
      join(stage, "enabled.json"),
      JSON.stringify({ enabled: false, digest: digest(files) }),
      { flag: "wx", mode: 0o600 },
    );
    renameSync(stage, dest);
    return {
      id: manifest.name,
      digest: digest(files),
      enabled: false,
      skills: manifest.skills,
      agents: manifest.agents || [],
      hooks: (manifest.hooks || []).length,
    };
  } finally {
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  }
}
export function listPacks(workspace, policy = {}) {
  return readdirSync(base(workspace))
    .filter((id) => ID.test(id) && !id.startsWith("stage-"))
    .map((id) => {
      try {
        const p = read(workspace, id);
        return {
          id,
          digest: p.digest,
          enabled: allowed(p, policy),
          skills: p.manifest.skills,
          agents: p.manifest.agents || [],
          hooks: (p.manifest.hooks || []).length,
          hooksEnabled: allowed(p, policy) && p.state.hooks === true,
          agentsEnabled: allowed(p, policy) && p.state.agents === true,
        };
      } catch {
        return {
          id,
          enabled: false,
          invalid: true,
          skills: [],
          agents: [],
          hooks: 0,
        };
      }
    });
}
export function enablePack(
  workspace,
  id,
  policy,
  { approve = false, hooks = false, agents = false, disable = false } = {},
) {
  const p = read(workspace, id);
  if (
    !disable &&
    (!approve ||
      policy?.features?.skillPacks !== true ||
      !policy.skillPacks?.approvedDigests?.includes(p.digest))
  )
    throw new Error("PACK_APPROVAL_REQUIRED");
  const state = {
    digest: p.digest,
    enabled: !disable,
    hooks: hooks === true && !disable,
    agents: agents === true && !disable,
  };
  const temp = join(p.folder, "enabled-" + randomUUID() + ".tmp");
  writeFileSync(temp, JSON.stringify(state), { flag: "wx", mode: 0o600 });
  renameSync(temp, join(p.folder, "enabled.json"));
  return state;
}
export function packAsset(workspace, id, assetId, kind, policy) {
  const p = read(workspace, id);
  if (
    !allowed(p, policy) ||
    !["skill", "agent"].includes(kind) ||
    (kind === "agent" && p.state.agents !== true)
  )
    throw new Error("PACK_DISABLED");
  const asset = (
    kind === "skill" ? p.manifest.skills : p.manifest.agents || []
  ).find((a) => a.id === assetId);
  if (!asset) throw new Error("PACK_ASSET_INVALID");
  return {
    text: p.files.get(asset.path).toString("utf8"),
    label: id + "/" + assetId,
    digest: p.digest,
  };
}
export function enabledPackHooks(workspace, policy) {
  return listPacks(workspace, policy)
    .filter((p) => p.enabled && p.hooksEnabled)
    .flatMap((p) => read(workspace, p.id).manifest.hooks || []);
}
export function exportPack(
  workspace,
  id,
  destination,
  { approve = false } = {},
) {
  if (!approve) throw new Error("PACK_EXPORT_APPROVAL_REQUIRED");
  const p = read(workspace, id),
    out = resolve(destination);
  if (existsSync(out)) throw new Error("PACK_EXPORT_EXISTS");
  regular(dirname(out), true);
  mkdirSync(out, { mode: 0o700 });
  for (const a of p.manifest.skills) {
    const prefix = dirname(a.path).replaceAll("\\", "/");
    for (const [path, bytes] of p.files) {
      if (
        path === "pack.json" ||
        (prefix !== "." && !path.startsWith(prefix + "/"))
      )
        continue;
      const rel = prefix === "." ? path : path.slice(prefix.length + 1),
        target = join(out, a.id, rel);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
    }
  }
  return {
    skills: p.manifest.skills.length,
    destination: out,
    nativeExecutionAuthorized: false,
  };
}
