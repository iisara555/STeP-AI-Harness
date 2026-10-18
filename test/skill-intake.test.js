import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Runs scripts/skill-intake/Code.gs against small stand-ins for the Apps Script services it uses.
function intake() {
  const sheets = new Map(),
    props = new Map(),
    files = [];
  const sheetOf = (name) => {
    const rows = [];
    return {
      name,
      rows,
      appendRow: (r) => rows.push(r),
      setFrozenRows: () => {},
      getLastRow: () => rows.length,
      getRange: (row, col, n, w) => ({
        getValues: () => rows.slice(row - 1, row - 1 + n).map((r) => r.slice(col - 1, col - 1 + w)),
      }),
    };
  };
  const folder = (name) => ({
    name,
    getId: () => "folder-1",
    getUrl: () => "https://drive.google.com/drive/folders/" + encodeURIComponent(name),
    createFolder: (n) => folder(n),
    createFile: (n, text) => files.push({ folder: name, n, text }),
  });
  const context = {
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: {
      formatDate: () => "20261016",
      getUuid: () => "abcdef12-0000-0000-0000-000000000000",
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => props.get(k) ?? null,
        setProperty: (k, v) => props.set(k, v),
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n) => sheets.get(n) || null,
        insertSheet: (n) => (sheets.set(n, sheetOf(n)), sheets.get(n)),
      }),
    },
    DriveApp: { getFolderById: () => folder("root"), createFolder: (n) => folder(n) },
    MimeType: { PLAIN_TEXT: "text/plain" },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text) => ({ setMimeType: () => JSON.parse(text) }),
    },
  };
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../scripts/skill-intake/Code.gs", import.meta.url), "utf8"), context);
  const post = (body) =>
    context.doPost({ postData: { contents: typeof body === "string" ? body : JSON.stringify(body) } });
  return { post, sheets, files, props };
}
const submission = (extra = {}) => ({
  schema: 1,
  pack: { id: "staff-pack", version: "1.0.0", digest: "a".repeat(64), skills: ["meeting-room-booking"] },
  review: { status: "warn", findings: [{ level: "warn", code: "safety.link", file: "SKILL.md", line: 4 }] },
  usage: { count: 3 },
  contributor: { name: "=พนักงานสังเคราะห์", team: "ทีมทดสอบ", uploadedAt: "2026-10-16T00:00:00.000Z" },
  files: [
    { path: "SKILL.md", text: "# จองห้องประชุม" },
    { path: "references/form.md", text: "แบบฟอร์ม" },
  ],
  appVersion: "0.6.10",
  ...extra,
});

test("the Skill intake records one row and one folder per submission, and the same digest only once", () => {
  const { post, sheets, files } = intake();
  const first = post(submission());
  assert.deepEqual(first, { ok: true, id: "20261016-abcdef12" });
  const sheet = sheets.get("Skill ที่เสนอ");
  assert.equal(sheet.rows[0][0], "ส่งเมื่อ");
  const row = sheet.rows[1];
  assert.equal(row[2], "staff-pack");
  assert.equal(row[6], "'=พนักงานสังเคราะห์", "a name never becomes a formula");
  assert.equal(row[9], "warn safety.link SKILL.md:4");
  assert.equal(row[10], 3);
  assert.equal(row[13], "รอตรวจ");
  assert.deepEqual(files.map((f) => f.n), ["SKILL.md", "references__form.md"]);
  assert.deepEqual(post(submission()), first);
  assert.equal(sheet.rows.length, 2);
});

test("the Skill intake refuses malformed, failing, oversized and unsafe submissions", () => {
  const { post, sheets } = intake();
  for (const bad of [
    "not json",
    submission({ schema: 2 }),
    submission({ review: { status: "fail", findings: [] } }),
    submission({ pack: { id: "../x", version: "1", digest: "a".repeat(64), skills: [] } }),
    submission({ files: [{ path: "../secret.md", text: "x" }] }),
    submission({ files: [{ path: "a/./b.md", text: "x" }] }),
    submission({ files: [] }),
    submission({ contributor: { name: " ", team: "" } }),
    "x".repeat(2_500_001),
  ])
    assert.deepEqual(post(bad), { ok: false, error: "INVALID" });
  assert.equal(sheets.size, 0);
});

test("the Skill intake stops after its daily limit", () => {
  const { post, props } = intake();
  props.set("count-20261016", "200");
  assert.deepEqual(post(submission()), { ok: false, error: "LIMIT" });
});

const feedback = (extra = {}) => ({
  schema: 1,
  kind: "feedback",
  category: "answer",
  text: "+คำตอบเรื่องวันลาไม่ตรงกับประกาศ",
  answer: "=ลาพักร้อนได้ 30 วัน",
  contributor: { name: "พนักงานสังเคราะห์", team: "ทีมทดสอบ" },
  errorCode: "PROVIDER_NETWORK",
  os: "win32 x64",
  appVersion: "0.6.14",
  ...extra,
});

test("a problem report or suggestion becomes one row in its own tab, with no Drive files", () => {
  const { post, sheets, files } = intake();
  assert.deepEqual(post(feedback()), { ok: true, id: "20261016-abcdef12" });
  const sheet = sheets.get("ความเห็นจากพนักงาน");
  assert.equal(sheet.rows[0][2], "ประเภท");
  const row = sheet.rows[1];
  assert.equal(row[2], "คำตอบไม่ถูกต้อง");
  assert.equal(row[3], "'+คำตอบเรื่องวันลาไม่ตรงกับประกาศ", "employee text never becomes a formula");
  assert.equal(row[4], "'=ลาพักร้อนได้ 30 วัน");
  assert.equal(row[7], "PROVIDER_NETWORK");
  assert.equal(row[10], "ใหม่");
  assert.equal(files.length, 0);
  assert.equal(sheets.has("Skill ที่เสนอ"), false);
  // Anonymous and without an answer is fine.
  assert.equal(post(feedback({ category: "idea", answer: undefined, errorCode: undefined, contributor: { name: "", team: "" } })).ok, true);
  assert.equal(sheet.rows[2][2], "ข้อเสนอแนะ");
});

test("malformed feedback is refused and counts toward the shared daily limit", () => {
  const { post, sheets, props } = intake();
  for (const bad of [
    feedback({ category: "other" }),
    feedback({ text: " " }),
    feedback({ text: "x".repeat(2001) }),
    feedback({ errorCode: "<script>" }),
    feedback({ contributor: undefined }),
    feedback({ schema: 2 }),
  ])
    assert.deepEqual(post(bad), { ok: false, error: "INVALID" });
  assert.equal(sheets.size, 0);
  props.set("count-20261016", "200");
  assert.deepEqual(post(feedback()), { ok: false, error: "LIMIT" });
});
