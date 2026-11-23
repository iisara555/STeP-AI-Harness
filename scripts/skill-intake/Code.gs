/**
 * STeP Skill intake: receives "เสนอให้องค์กรใช้" and "แจ้งปัญหา / เสนอแนะ" from STeP Desktop and records them for the
 * administrators.
 *
 * Deploy from the "Feedback & Skill Promoting" spreadsheet (Extensions > Apps Script), as a web app that executes as
 * the owner. The web app is reachable by anyone (the app cannot hold a Google browser session), so every request must
 * carry the sender's Google ID token from their organization sign-in in STeP Desktop; it is verified with Google, and
 * each verified account has its own daily quota. Put the /exec URL in desktop-policy.json under skillPacks.submitUrl.
 * See README.md.
 *
 * Each submission becomes one row in the "Skill ที่เสนอ" tab and one Drive folder holding the Skill's text files; the
 * sheet only links to them. Nothing here publishes a Skill: an administrator reviews the row and decides.
 * Each problem report or suggestion becomes one row in the "ความเห็นจากพนักงาน" tab (no Drive files).
 */
var SHEET_NAME = 'Skill ที่เสนอ';
var HEADERS = [
  'ส่งเมื่อ',
  'เลขที่',
  'ชื่อ Skill',
  'Skill ในชุด',
  'เวอร์ชัน',
  'Digest',
  'ผู้เสนอ',
  'ทีม',
  'ผลตรวจอัตโนมัติ',
  'ข้อที่พบ',
  'ใช้แล้ว (ครั้ง)',
  'โฟลเดอร์ไฟล์',
  'รุ่นแอป',
  'สถานะ',
  'ผู้ตรวจ',
  'หมายเหตุผู้ตรวจ',
  'บัญชีที่ยืนยัน',
];
var FEEDBACK_SHEET_NAME = 'ความเห็นจากพนักงาน';
var FEEDBACK_HEADERS = [
  'ส่งเมื่อ',
  'เลขที่',
  'ประเภท',
  'ข้อความ',
  'คำตอบของ AI ที่แนบ',
  'ผู้ส่ง',
  'ทีม',
  'รหัสข้อผิดพลาดล่าสุด',
  'ระบบ',
  'รุ่นแอป',
  'สถานะ',
  'ผู้ดูแล',
  'หมายเหตุผู้ดูแล',
  'บัญชีที่ยืนยัน',
];
var FEEDBACK_CATEGORIES = { problem: 'ปัญหาการใช้งาน', idea: 'ข้อเสนอแนะ', answer: 'คำตอบไม่ถูกต้อง' };
// Every request must carry the Google ID token of the employee's organization sign-in in STeP Desktop ("identity").
// The client ID and domain are public (they are in the app); Script Properties ALLOWED_CLIENT_IDS / ALLOWED_DOMAINS
// (comma-separated) replace them for another organization or OAuth client.
var DEFAULT_CLIENT_IDS = ['991643024129-1gd4866dn064tm72kjtavsu6qpgpa1hp.apps.googleusercontent.com'];
var DEFAULT_DOMAINS = ['step.cmu.ac.th'];
var DAILY_LIMIT = 200; // all accepted requests in one Bangkok day
var SENDER_LIMITS = { skill: 5, feedback: 20 }; // accepted requests per verified account per day
var VERIFY_LIMIT = 2000; // calls to Google's token check per day, so forged tokens cannot use up UrlFetch quota
var SKILL_MAX = 2500000;
var FEEDBACK_MAX = 20000;
var ID = /^[a-z][a-z0-9-]{0,63}$/;
var PATH = /^[a-zA-Z0-9_. -]+(?:\/[a-zA-Z0-9_. -]+){0,7}$/;
var TOKEN = /^[A-Za-z0-9_-]{10,2000}\.[A-Za-z0-9_-]{10,4000}\.[A-Za-z0-9_-]{10,1000}$/;

function doPost(e) {
  var raw = e && e.postData && e.postData.contents;
  if (typeof raw !== 'string' || raw.length > SKILL_MAX) return reply({ ok: false, error: 'INVALID' });
  var d;
  try {
    d = JSON.parse(raw);
  } catch (err) {
    return reply({ ok: false, error: 'INVALID' });
  }
  var kind = d && d.kind === 'feedback' ? 'feedback' : 'skill';
  var data = kind === 'feedback' ? (raw.length <= FEEDBACK_MAX ? checkFeedback(d) : null) : checkSkill(d);
  if (!data) return reply({ ok: false, error: 'INVALID' });
  // Shape first (free), then who is sending (one call to Google, outside the lock). Unverified callers never touch the
  // quota, the sheet or Drive.
  var who = verifiedSender(d.identity);
  if (who === 'BUSY') return reply({ ok: false, error: 'BUSY' });
  if (!who) return reply({ ok: false, error: 'IDENTITY' });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return reply({ ok: false, error: 'BUSY' });
  try {
    if (kind === 'feedback') return reply(recordFeedback(data, who));
    return reply(recordSkill(data, who));
  } finally {
    lock.releaseLock();
  }
}

function recordFeedback(data, who) {
  var limit = takeQuota('feedback', who);
  if (limit) return { ok: false, error: limit };
  var ref = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd') + '-' + Utilities.getUuid().slice(0, 8);
  appendText(namedSheet(FEEDBACK_SHEET_NAME, FEEDBACK_HEADERS), [
    new Date(),
    ref,
    FEEDBACK_CATEGORIES[data.category],
    data.text,
    data.answer || '',
    data.contributor.name,
    data.contributor.team,
    data.errorCode || '',
    data.os,
    data.appVersion,
    'ใหม่',
    '',
    '',
    // The account is recorded only when the employee chose to send their name; it was still verified and counted.
    data.contributor.name ? who.email : '',
  ]);
  return { ok: true, id: ref };
}

function recordSkill(data, who) {
  var sheet = intakeSheet();
  var existing = findDigest(sheet, data.pack.digest);
  if (existing) return { ok: true, id: existing };
  var limit = takeQuota('skill', who);
  if (limit) return { ok: false, error: limit };
  var id = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd') + '-' + Utilities.getUuid().slice(0, 8);
  var folder = filesFolder().createFolder(id + ' ' + data.pack.id);
  data.files.forEach(function (f) {
    folder.createFile(f.path.replace(/\//g, '__'), f.text, MimeType.PLAIN_TEXT);
  });
  appendText(sheet, [
    new Date(),
    id,
    data.pack.id,
    data.pack.skills.join(', '),
    data.pack.version,
    data.pack.digest,
    data.contributor.name,
    data.contributor.team,
    data.review.status,
    data.review.findings
      .map(function (f) {
        return f.level + ' ' + f.code + (f.file ? ' ' + f.file + (f.line ? ':' + f.line : '') : '');
      })
      .join('\n'),
    data.usage.count,
    folder.getUrl(),
    data.appVersion,
    'รอตรวจ',
    '',
    '',
    who.email,
  ]);
  return { ok: true, id: id };
}

function text(v, max) {
  return typeof v === 'string' && v.length <= max;
}
// The app validates before sending; this re-checks shape and size so a stray caller cannot fill the sheet or Drive.
function checkSkill(d) {
  if (!d || d.schema !== 1 || !d.pack || !d.review || !d.contributor || !d.usage || !Array.isArray(d.files)) return null;
  if (!ID.test(d.pack.id) || !/^[a-f0-9]{64}$/.test(d.pack.digest) || !text(d.pack.version, 40)) return null;
  if (!Array.isArray(d.pack.skills) || d.pack.skills.length > 50 || !d.pack.skills.every(function (s) { return text(s, 64); }))
    return null;
  if (['pass', 'warn'].indexOf(d.review.status) < 0 || !Array.isArray(d.review.findings) || d.review.findings.length > 200)
    return null;
  for (var j = 0; j < d.review.findings.length; j++) {
    var f = d.review.findings[j];
    if (!f || !/^[a-z]{1,10}$/.test(f.level) || f.level === 'fail' || !/^[a-z][a-z0-9.-]{0,63}$/.test(f.code)) return null;
    if (f.file !== undefined && f.file !== null && (!PATH.test(f.file) || /(^|\/)\.\.?(\/|$)/.test(f.file))) return null;
    if (f.line !== undefined && f.line !== null && !(Number.isInteger(f.line) && f.line > 0 && f.line < 1000000)) return null;
  }
  if (!text(d.contributor.name, 80) || !d.contributor.name.trim() || !text(d.contributor.team, 80)) return null;
  if (typeof d.usage.count !== 'number' || !(d.usage.count >= 0) || d.usage.count > 1e9 || !text(d.appVersion, 40)) return null;
  if (!d.files.length || d.files.length > 120) return null;
  var total = 0;
  for (var i = 0; i < d.files.length; i++) {
    if (!d.files[i] || !PATH.test(d.files[i].path) || /(^|\/)\.\.?(\/|$)/.test(d.files[i].path) || !text(d.files[i].text, 200000))
      return null;
    total += d.files[i].text.length;
  }
  if (total > 2000000) return null;
  return d;
}
// A problem report or suggestion (kind "feedback").
function checkFeedback(d) {
  if (!d || d.schema !== 1 || d.kind !== 'feedback' || !FEEDBACK_CATEGORIES.hasOwnProperty(d.category) || !d.contributor) return null;
  if (!text(d.text, 2000) || !d.text.trim() || (d.answer !== undefined && !text(d.answer, 8000))) return null;
  if (!text(d.contributor.name, 80) || !text(d.contributor.team, 80) || !text(d.os, 40) || !text(d.appVersion, 40)) return null;
  if (d.errorCode !== undefined && !/^[A-Z][A-Z0-9_]{1,63}$/.test(d.errorCode)) return null;
  return d;
}

// The employee's organization Google account, from the ID token the app sent, or null. Google checks the signature
// (tokeninfo); this checks that the token was issued to STeP Desktop, for a verified address in an allowed domain, and
// has not expired. A verified token is remembered until it expires so a burst of requests asks Google once.
function verifiedSender(token) {
  if (typeof token !== 'string' || !TOKEN.test(token)) return null;
  var now = Date.now() / 1000;
  var claims = jwtClaims(token);
  if (!claims || !acceptable(claims, now)) return null; // junk and other clients never cost a call to Google
  var cache = CacheService.getScriptCache();
  var key = 'id-' + hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8));
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  if (!underCounter('verify', VERIFY_LIMIT)) return 'BUSY';
  var response;
  try {
    response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), {
      muteHttpExceptions: true,
      followRedirects: false,
    });
  } catch (err) {
    return 'BUSY';
  }
  if (response.getResponseCode() !== 200) return null;
  var info;
  try {
    info = JSON.parse(response.getContentText());
  } catch (err) {
    return null;
  }
  if (!acceptable(info, now) || info.sub !== claims.sub) return null;
  var who = { sub: String(info.sub), email: String(info.email).toLowerCase() };
  var ttl = Math.floor(Number(info.exp) - now);
  if (ttl > 0) cache.put(key, JSON.stringify(who), Math.min(ttl, 21600));
  return who;
}
function acceptable(c, now) {
  var clients = listProperty('ALLOWED_CLIENT_IDS', DEFAULT_CLIENT_IDS),
    domains = listProperty('ALLOWED_DOMAINS', DEFAULT_DOMAINS);
  if (!c || ['https://accounts.google.com', 'accounts.google.com'].indexOf(c.iss) < 0) return false;
  if (clients.indexOf(c.aud) < 0 || (c.azp !== undefined && clients.indexOf(c.azp) < 0)) return false;
  if (!(Number(c.exp) > now)) return false;
  if (c.email_verified !== true && c.email_verified !== 'true') return false;
  if (typeof c.sub !== 'string' || !/^\d{1,100}$/.test(c.sub)) return false;
  if (typeof c.email !== 'string' || c.email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(c.email)) return false;
  var hd = typeof c.hd === 'string' ? c.hd.toLowerCase() : '';
  return domains.indexOf(hd) >= 0 && c.email.toLowerCase().slice(-(hd.length + 1)) === '@' + hd;
}
function jwtClaims(token) {
  try {
    var part = token.split('.')[1];
    while (part.length % 4) part += '=';
    return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(part)).getDataAsString('UTF-8'));
  } catch (err) {
    return null;
  }
}
function listProperty(name, fallback) {
  var value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) return fallback;
  return value
    .split(',')
    .map(function (v) {
      return v.trim().toLowerCase();
    })
    .filter(Boolean);
}
function hex(bytes) {
  return bytes
    .map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    })
    .join('');
}

// The per-account quota first, then the shared one. Counters are kept per Bangkok day under a keyed hash of the
// account, so Script Properties never hold who sent an anonymous suggestion; earlier days are removed.
function takeQuota(kind, who) {
  var props = PropertiesService.getScriptProperties();
  var day = today();
  sweep(props, day);
  var salt = props.getProperty('SENDER_SALT');
  if (!salt) {
    salt = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SENDER_SALT', salt);
  }
  var sender = 'q-' + day + '-' + kind + '-' + hex(Utilities.computeHmacSha256Signature(who.sub, salt)).slice(0, 24);
  var mine = Number(props.getProperty(sender) || 0);
  if (mine >= SENDER_LIMITS[kind]) return 'SENDER_LIMIT';
  var all = 'count-' + day;
  var count = Number(props.getProperty(all) || 0);
  if (count >= DAILY_LIMIT) return 'LIMIT';
  props.setProperty(sender, String(mine + 1));
  props.setProperty(all, String(count + 1));
  return '';
}
// Approximate (no lock): only guards the daily UrlFetch budget.
function underCounter(name, limit) {
  var props = PropertiesService.getScriptProperties();
  var key = name + '-' + today();
  var count = Number(props.getProperty(key) || 0);
  if (count >= limit) return false;
  props.setProperty(key, String(count + 1));
  return true;
}
function sweep(props, day) {
  if (props.getProperty('QUOTA_DAY') === day) return;
  props.getKeys().forEach(function (k) {
    if (/^(?:q|count|verify)-\d{8}/.test(k) && k.indexOf(day) < 0) props.deleteProperty(k);
  });
  props.setProperty('QUOTA_DAY', day);
}
function today() {
  return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd');
}
// Every cell the script writes is text the sheet shows as typed: a leading = + - @ (after any spaces) never runs.
function appendText(sheet, row) {
  sheet.appendRow(
    row.map(function (v) {
      return typeof v === 'string' ? plainCell(v) : v;
    }),
  );
}
function plainCell(v) {
  return /^[\s]*[=+\-@]/.test(v) ? "'" + v : v;
}
function intakeSheet() {
  return namedSheet(SHEET_NAME, HEADERS);
}
function namedSheet(name, headers) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(name);
  if (!sheet) {
    sheet = book.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < headers.length) {
    // A tab made by an earlier version: name the columns added since, after the administrators' own.
    var from = sheet.getLastColumn() + 1;
    sheet.getRange(1, from, 1, headers.length - from + 1).setValues([headers.slice(from - 1)]);
  }
  return sheet;
}
// The same files sent twice (same digest) keep their first row and reference.
function findDigest(sheet, digest) {
  var rows = sheet.getLastRow();
  if (rows < 2) return '';
  var values = sheet.getRange(2, 2, rows - 1, 5).getValues();
  for (var i = 0; i < values.length; i++) if (values[i][4] === digest) return String(values[i][0]);
  return '';
}
function filesFolder() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SKILL_FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  var folder = DriveApp.createFolder('STeP Skill ที่เสนอ');
  props.setProperty('SKILL_FOLDER_ID', folder.getId());
  return folder;
}
function reply(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
