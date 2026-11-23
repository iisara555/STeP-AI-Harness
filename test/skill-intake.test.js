import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createHash, createHmac } from "node:crypto";

// Runs scripts/skill-intake/Code.gs against small stand-ins for the Apps Script services it uses.
const CLIENT = "991643024129-1gd4866dn064tm72kjtavsu6qpgpa1hp.apps.googleusercontent.com";
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
// A synthetic ID token. The stand-in for Google's tokeninfo accepts it unless its signature says "forged".
const idToken = (claims = {}, signature = "c2lnbmF0dXJlLXN5bnRoZXRpYw") =>
  b64({ alg: "RS256", kid: "synthetic" }) +
  "." +
  b64({
    iss: "https://accounts.google.com",
    aud: CLIENT,
    azp: CLIENT,
    sub: "100000000000000000001",
    email: "staff.one@step.cmu.ac.th",
    email_verified: true,
    hd: "step.cmu.ac.th",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  }) +
  "." +
  signature;
function intake() {
  const sheets = new Map(),
    props = new Map(),
    cache = new Map(),
    files = [],
    fetched = [];
  const sheetOf = (name) => {
    const rows = [];
    return {
      name,
      rows,
      appendRow: (r) => rows.push(r),
      setFrozenRows: () => {},
      getLastRow: () => rows.length,
      getLastColumn: () => Math.max(0, ...rows.map((r) => r.length)),
      getRange: (row, col, n, w) => ({
        getValues: () => rows.slice(row - 1, row - 1 + n).map((r) => r.slice(col - 1, col - 1 + w)),
        setValues: (values) => values.forEach((v, i) => rows[row - 1 + i].splice(col - 1, v.length, ...v)),
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
  const bytes = (buffer) => [...buffer].map((b) => (b > 127 ? b - 256 : b));
  const context = {
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: {
      formatDate: () => "20261016",
      getUuid: () => "abcdef12-0000-0000-0000-000000000000",
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest: (_a, v) => bytes(createHash("sha256").update(v).digest()),
      computeHmacSha256Signature: (v, key) => bytes(createHmac("sha256", key).update(v).digest()),
      base64DecodeWebSafe: (v) => [...Buffer.from(v, "base64url")],
      newBlob: (b) => ({ getDataAsString: () => Buffer.from(b).toString("utf8") }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => props.get(k) ?? null,
        setProperty: (k, v) => props.set(k, v),
        deleteProperty: (k) => props.delete(k),
        getKeys: () => [...props.keys()],
      }),
    },
    CacheService: {
      getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }),
    },
    UrlFetchApp: {
      fetch: (url) => {
        fetched.push(url);
        const token = decodeURIComponent(new URL(url).searchParams.get("id_token"));
        if (token.endsWith(".forged-signature-xx")) return { getResponseCode: () => 400, getContentText: () => "{}" };
        const c = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
        // tokeninfo answers with strings, as Google does.
        const info = { ...c, exp: String(c.exp), email_verified: String(c.email_verified) };
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(info) };
      },
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
  return { post, sheets, files, props, fetched, sheetOf };
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
  identity: idToken(),
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
  identity: idToken(),
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

test("only a verified organization Google account can send, and junk never reaches Google", () => {
  const { post, sheets, files, fetched } = intake();
  for (const identity of [
    undefined,
    "",
    "not-a-token",
    idToken({ aud: "123-other.apps.googleusercontent.com" }),
    idToken({ azp: "123-other.apps.googleusercontent.com" }),
    idToken({ iss: "https://evil.example" }),
    idToken({ hd: undefined, email: "someone@gmail.com" }),
    idToken({ hd: "example.com", email: "a@example.com" }),
    idToken({ email: "outsider@example.com" }),
    idToken({ email_verified: false }),
    idToken({ exp: Math.floor(Date.now() / 1000) - 10 }),
  ]) {
    assert.deepEqual(post(submission({ identity })), { ok: false, error: "IDENTITY" }, String(identity));
    assert.deepEqual(post(feedback({ identity })), { ok: false, error: "IDENTITY" });
  }
  assert.equal(fetched.length, 0, "claims that cannot pass are refused before asking Google");
  // Claims that look right but a signature Google refuses.
  assert.deepEqual(post(submission({ identity: idToken({}, "forged-signature-xx") })), { ok: false, error: "IDENTITY" });
  assert.equal(fetched.length, 1);
  assert.equal(sheets.size, 0);
  assert.equal(files.length, 0);
});

test("the verified account is recorded with a Skill, and with feedback only when the employee sent their name", () => {
  const { post, sheets, fetched, props } = intake();
  assert.equal(post(submission()).ok, true);
  const skillRow = sheets.get("Skill ที่เสนอ").rows;
  assert.equal(skillRow[0][16], "บัญชีที่ยืนยัน");
  assert.equal(skillRow[1][16], "staff.one@step.cmu.ac.th");
  assert.equal(post(feedback()).ok, true);
  assert.equal(post(feedback({ contributor: { name: "", team: "" } })).ok, true);
  const rows = sheets.get("ความเห็นจากพนักงาน").rows;
  assert.equal(rows[1][13], "staff.one@step.cmu.ac.th");
  assert.equal(rows[2][13], "", "an anonymous suggestion keeps no address");
  assert.equal(fetched.length, 1, "one token is checked with Google once while it is valid");
  const stored = JSON.stringify([...props]);
  assert.doesNotMatch(stored, /staff\.one|100000000000000000001/, "quota counters never hold who sent");
});

test("each verified account has its own daily quota, and resending the same Skill does not use it", () => {
  const { post } = intake();
  const pack = (n) => ({ id: "staff-pack", version: "1.0.0", digest: String(n).repeat(64), skills: ["meeting-room-booking"] });
  for (let n = 1; n <= 5; n++) assert.equal(post(submission({ pack: pack(n) })).ok, true);
  assert.equal(post(submission({ pack: pack(1) })).ok, true, "same digest returns the first reference");
  assert.deepEqual(post(submission({ pack: pack(6) })), { ok: false, error: "SENDER_LIMIT" });
  const other = idToken({ sub: "100000000000000000002", email: "staff.two@step.cmu.ac.th" });
  assert.equal(post(submission({ pack: pack(6), identity: other })).ok, true);
  for (let n = 0; n < 20; n++) assert.equal(post(feedback()).ok, true);
  assert.deepEqual(post(feedback()), { ok: false, error: "SENDER_LIMIT" });
  assert.equal(post(feedback({ identity: other })).ok, true);
});

test("earlier days' counters are removed so Script Properties do not fill up", () => {
  const { post, props } = intake();
  props.set("count-20261015", "150");
  props.set("q-20261015-skill-abc", "5");
  props.set("verify-20261015", "900");
  props.set("SKILL_FOLDER_ID", "folder-1");
  assert.equal(post(feedback()).ok, true);
  assert.deepEqual(
    [...props.keys()].filter((k) => /20261015/.test(k)),
    [],
  );
  assert.equal(props.get("SKILL_FOLDER_ID"), "folder-1");
  assert.equal(props.get("count-20261016"), "1");
});

test("every cell the intake writes stays text, and findings must be well formed", () => {
  const { post, sheets } = intake();
  assert.equal(
    post(
      submission({
        pack: { id: "staff-pack", version: "=1+1", digest: "b".repeat(64), skills: ["@SUM(A1)"] },
        contributor: { name: " =x", team: "-ทีม", uploadedAt: "2026-10-16T00:00:00.000Z" },
        appVersion: "+0.6",
      }),
    ).ok,
    true,
  );
  const row = sheets.get("Skill ที่เสนอ").rows[1];
  assert.equal(row[3], "'@SUM(A1)");
  assert.equal(row[4], "'=1+1");
  assert.equal(row[6], "' =x");
  assert.equal(row[7], "'-ทีม");
  assert.equal(row[12], "'+0.6");
  assert.equal(post(feedback({ os: "=cmd" })).ok, true);
  assert.equal(sheets.get("ความเห็นจากพนักงาน").rows[1][8], "'=cmd");
  for (const findings of [
    [{ level: "fail", code: "safety.injection" }],
    [{ level: "warn", code: '=HYPERLINK("https://evil.example")' }],
    [{ level: "warn", code: "safety.link", file: "../x.md" }],
    [{ level: "warn", code: "safety.link", line: "1" }],
    [null],
  ])
    assert.deepEqual(post(submission({ pack: { ...submission().pack, digest: "c".repeat(64) }, review: { status: "warn", findings } })), {
      ok: false,
      error: "INVALID",
    });
});

test("a tab made by the earlier script gets the new column title without moving its rows", () => {
  const { post, sheets, sheetOf } = intake();
  const old = sheetOf("Skill ที่เสนอ");
  old.appendRow(Array.from({ length: 16 }, (_, i) => "h" + i));
  sheets.set("Skill ที่เสนอ", old);
  assert.equal(post(submission()).ok, true);
  assert.equal(old.rows[0].length, 17);
  assert.equal(old.rows[0][15], "h15");
  assert.equal(old.rows[0][16], "บัญชีที่ยืนยัน");
});
