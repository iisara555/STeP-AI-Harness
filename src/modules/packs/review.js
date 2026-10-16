// Automated review of a staff-made Skill Pack against STeP Skill Standard v2 and safety rules.
// The review is advice for the uploader and the admin; it never grants authority or approval.

export const STANDARD_HEADINGS = [
  "Purpose",
  "เมื่อควรใช้",
  "Inputs",
  "Source",
  "Workflow",
  "Output",
  "Authority",
  "Handoff",
  "Guardrails",
];
const FRONTMATTER_KEYS = ["name", "description", "standardVersion"];
// Staff Skills are text only: instructions, references and templates, never code that runs.
const TEXT_FILE = /\.(?:md|txt|json|csv|tsv|ya?ml)$/i;

const INJECTION = [
  /\b(?:ignore|disregard|forget|override)\b[^\n]{0,40}\b(?:previous|prior|above|earlier|all|system|other)\b[^\n]{0,20}\b(?:instructions?|rules?|prompts?|guidelines?)\b/i,
  /\byou are now\b|\bact as (?:an? )?(?:unrestricted|jailbroken|different)\b|\bjailbreak\b|\bDAN mode\b/i,
  /\b(?:reveal|print|show|repeat|output)\b[^\n]{0,30}\b(?:system prompt|hidden instructions?|developer message)\b/i,
  /(?:ลืม|เพิกเฉย|ไม่ต้อง(?:สนใจ|ทำตาม)|ข้าม|ยกเลิก)[^\n]{0,20}(?:คำสั่ง|กฎ|ข้อห้าม|กติกา)(?:ก่อนหน้า|เดิม|ทั้งหมด|อื่น|ของระบบ)?/,
  /(?:เปิดเผย|แสดง|บอก)[^\n]{0,20}(?:system prompt|คำสั่งระบบ|คำสั่งที่ซ่อน)/i,
];
const AUTHORITY = [
  /(?:อนุมัติ|ลงนาม|ลงชื่อ|เซ็น)แทน/,
  /ไม่ต้อง(?:ขอ|รอ)?(?:การ)?อนุมัติ/,
  /ข้าม(?:การ)?(?:อนุมัติ|ยืนยัน|ตรวจ|privacy|ความเป็นส่วนตัว)/i,
  /(?:ปิด|ปลด|หลบ)(?:การ)?(?:privacy|ตัวกรอง|การตรวจ|ระบบตรวจ)/i,
  /(?:ส่ง|เผยแพร่|โพสต์|ประกาศ)[^\n]{0,30}(?:โดยอัตโนมัติ|ได้เลยโดยไม่|ทันทีโดยไม่)/,
  /\b(?:without|no need for|skip|bypass)\s+(?:(?:the|any|asking for|waiting for|human|user|owner|manager)\s+){0,2}(?:approval|review|privacy)\b/i,
  /\b(?:auto(?:matically)?[- ]?(?:send|publish|submit|approve|sign))\b/i,
];
// Skipping a confirmation can be harmless (a fixed vocabulary), so it is advice for the admin, not a block.
const CONFIRMATION = [
  /ไม่ต้อง(?:ขอ|รอ|ถาม)?(?:การ)?(?:ยืนยัน|ให้(?:มนุษย์|ผู้ใช้|คน)ตรวจ)/,
  /\b(?:without|no need for|skip)\s+(?:(?:the|any|asking for|waiting for|user)\s+){0,2}confirmation\b/i,
];
const EXFILTRATION = [
  /!\[[^\]]*\]\(\s*https?:\/\//i,
  /\b(?:curl|wget|fetch\s*\(|XMLHttpRequest|Invoke-WebRequest)\b/i,
  /\bwebhook\b/i,
  /https?:\/\/[^\s)"'>]*(?:\{\{|\$\{|%7B%7B|<[A-Za-z_]+>)/i,
  /(?:ส่ง|อัปโหลด|แนบ|โพสต์)[^\n]{0,40}(?:ข้อมูล|เนื้อหา|ไฟล์|บทสนทนา|เอกสาร)[^\n]{0,30}(?:ไปที่|ไปยัง|ไป)\s*(?:https?:\/\/|เว็บ|ลิงก์|URL)/i,
];
const SECRETS = [
  /(?:ขอ|ให้ผู้ใช้(?:กรอก|ใส่|ส่ง)|ถาม)[^\n]{0,20}(?:รหัสผ่าน|password|API key|โทเค็น|token|OTP|เลขบัตร)/i,
  /\b(?:ask|request|collect)\b[^\n]{0,20}\b(?:password|api key|token|otp|credentials?)\b/i,
];
// Zero-width and bidirectional controls hide text from people while models still read it.
const HIDDEN = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]/;
const COMMENT = /<!--([\s\S]*?)-->/g;
// "ห้ามอนุมัติแทน" is a guardrail, not a breach: a prohibition before the match turns it off.
const NEGATED = /(?:ห้าม|ไม่(?!ต้อง)|อย่า|\bnever\b|\bdo not\b|\bdon't\b|\bmust not\b|\bnot allowed\b)/i;
const LINK = /https?:\/\/([a-z0-9.-]+)/gi;

export const REVIEW_MESSAGES = {
  "standard.frontmatter": "ไม่มีส่วนหัว (frontmatter) ที่มี name และ description",
  "standard.version": "ยังไม่ระบุ standardVersion: 2 ในส่วนหัว Skill ใหม่ต้องใช้มาตรฐาน v2",
  "standard.headings": "ขาดหัวข้อบังคับตามมาตรฐาน v2: {0}",
  "standard.description": "description สั้นเกินไป ควรบอกว่าใช้ Skill นี้เมื่อไรให้ชัด (อย่างน้อย 20 ตัวอักษร)",
  "standard.keys": "ส่วนหัวมีช่องที่มาตรฐานไม่รองรับ: {0}",
  "standard.source": "หัวข้อ Source ว่าง ถ้าไม่ต้องใช้แหล่งข้อมูลภายนอกให้เขียนบอกไว้ตรง ๆ",
  "standard.authority": "หัวข้อ Authority ต้องแยกว่าอะไร AI ช่วยได้ อะไรต้องยืนยัน และอะไรเป็นอำนาจของคน",
  "standard.length": "SKILL.md ยาว {0} บรรทัด ควรย้ายรายละเอียดไปไว้ในโฟลเดอร์ references หรือ templates",
  "safety.code": "มีไฟล์ที่ไม่ใช่ข้อความ ({0}) Skill ของพนักงานต้องเป็นข้อความเท่านั้น",
  "safety.hooks": "มี Hooks หรือ Agent templates ซึ่งพนักงานนำเข้าเองไม่ได้ ต้องให้ผู้ดูแลรับรอง",
  "safety.injection": "มีข้อความที่สั่งให้ AI ลืมหรือข้ามคำสั่งเดิม (prompt injection): “{0}”",
  "safety.authority": "มีข้อความที่ขัดกฎต้องให้คนอนุมัติก่อน: “{0}”",
  "safety.confirm": "มีข้อความให้ทำต่อโดยไม่ต้องให้ผู้ใช้ยืนยัน ผู้ดูแลควรตรวจว่าไม่ใช่งานที่มีผลจริง: “{0}”",
  "safety.exfiltration": "มีข้อความที่อาจส่งข้อมูลออกไปภายนอก: “{0}”",
  "safety.secrets": "มีข้อความที่ขอรหัสผ่านหรือข้อมูลลับจากผู้ใช้: “{0}”",
  "safety.hidden": "มีอักขระที่มองไม่เห็นซ่อนอยู่ ซึ่งอาจใช้ซ่อนคำสั่ง",
  "safety.comment": "มีคำสั่งซ่อนอยู่ในคอมเมนต์ HTML ที่คนอ่านไม่เห็น",
  "safety.links": "มีลิงก์ภายนอก ({0}) ผู้ดูแลควรตรวจว่าปลายทางน่าเชื่อถือ",
};
const format = (template, ...args) => template.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? ""));
const excerpt = (text) => text.replace(/\s+/g, " ").trim().slice(0, 80);

function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]{1,8000}?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  const values = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (pair) values[pair[1]] = pair[2].trim().replace(/^["']|["']$/g, "");
  }
  return { values, body: text.slice(match[0].length) };
}
function sections(body) {
  const found = new Map();
  let current = null;
  for (const line of body.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1].trim();
      found.set(current, "");
    } else if (current) found.set(current, found.get(current) + line + "\n");
  }
  return found;
}
function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

function checkStandard(path, text, add) {
  const parsed = frontmatter(text);
  if (!parsed || !parsed.values.name || !parsed.values.description) return add("fail", "standard", "standard.frontmatter", path);
  const { values, body } = parsed;
  const extra = Object.keys(values).filter((key) => !FRONTMATTER_KEYS.includes(key));
  if (extra.length) add("warn", "standard", "standard.keys", path, 1, extra.join(", "));
  if (values.description.length < 20) add("warn", "standard", "standard.description", path, 1);
  if (Number(values.standardVersion) !== 2) add("fail", "standard", "standard.version", path, 1);
  const found = sections(body);
  const missing = STANDARD_HEADINGS.filter((heading) => !found.has(heading));
  if (missing.length) add("fail", "standard", "standard.headings", path, undefined, missing.join(", "));
  if (found.has("Source") && !found.get("Source").trim()) add("fail", "standard", "standard.source", path);
  const authority = found.get("Authority") || "";
  if (found.has("Authority") && !/ยืนยัน|อนุมัติ|confirm|approv|มนุษย์|ผู้มีอำนาจ|human/i.test(authority))
    add("warn", "standard", "standard.authority", path);
  const lines = text.split("\n").length;
  if (lines > 500) add("warn", "standard", "standard.length", path, undefined, lines);
}

function checkSafety(path, text, add, domains) {
  if (HIDDEN.test(text)) add("fail", "safety", "safety.hidden", path, lineOf(text, text.search(HIDDEN)));
  for (const comment of text.matchAll(COMMENT))
    if (/[A-Za-z฀-๿]{3}/.test(comment[1])) add("fail", "safety", "safety.comment", path, lineOf(text, comment.index));
  const rules = [
    ["fail", "safety.injection", INJECTION],
    ["fail", "safety.authority", AUTHORITY],
    ["warn", "safety.confirm", CONFIRMATION],
    ["fail", "safety.exfiltration", EXFILTRATION],
    ["fail", "safety.secrets", SECRETS],
  ];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    for (const [level, code, patterns] of rules) {
      const hit = patterns.map((pattern) => line.match(pattern)).find(Boolean);
      if (hit && !NEGATED.test(line.slice(0, hit.index))) add(level, "safety", code, path, index + 1, excerpt(line));
    }
  });
  for (const match of text.matchAll(LINK)) domains.add(match[1].toLowerCase());
}

/**
 * Review a pack's files (Map of relative path → Buffer) and manifest. Returns findings in Thai with a status:
 * "fail" blocks personal use, "warn" is advice, "pass" means no finding. Credit and consent are not part of the review.
 */
export function reviewPack(manifest, files) {
  const findings = [];
  const add = (level, area, code, file, line, ...args) =>
    findings.push({
      level,
      area,
      code,
      file,
      ...(line ? { line } : {}),
      // Thai for the CLI; the app translates template + args itself.
      message: format(REVIEW_MESSAGES[code], ...args),
      template: REVIEW_MESSAGES[code],
      args: args.map(String),
    });
  const domains = new Set();
  const nonText = [...files.keys()].filter((path) => !TEXT_FILE.test(path));
  if (nonText.length) add("fail", "safety", "safety.code", undefined, undefined, nonText.slice(0, 5).join(", "));
  if ((manifest.hooks || []).length || (manifest.agents || []).length) add("fail", "safety", "safety.hooks");
  const skills = new Set((manifest.skills || []).map((skill) => skill.path));
  for (const [path, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    if (path === "pack.json" || !TEXT_FILE.test(path)) continue;
    const text = bytes.toString("utf8");
    if (skills.has(path)) checkStandard(path, text, add);
    checkSafety(path, text, add, domains);
  }
  if (domains.size) add("warn", "safety", "safety.links", undefined, undefined, [...domains].sort().slice(0, 8).join(", "));
  const status = findings.some((f) => f.level === "fail") ? "fail" : findings.length ? "warn" : "pass";
  return { status, findings: findings.slice(0, 60), skills: skills.size, checkedAt: new Date().toISOString() };
}
