/**
 * STeP Skill intake: receives "เสนอให้องค์กรใช้" and "แจ้งปัญหา / เสนอแนะ" from STeP Desktop and records them for the
 * administrators.
 *
 * Deploy from the "Feedback & Skill Promoting" spreadsheet (Extensions > Apps Script), as a web app that executes as
 * the owner and that anyone can call; put the /exec URL in desktop-policy.json under skillPacks.submitUrl. See README.md.
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
];
var FEEDBACK_CATEGORIES = { problem: 'ปัญหาการใช้งาน', idea: 'ข้อเสนอแนะ', answer: 'คำตอบไม่ถูกต้อง' };
var DAILY_LIMIT = 200;
var ID = /^[a-z][a-z0-9-]{0,63}$/;
var PATH = /^[a-zA-Z0-9_. -]+(?:\/[a-zA-Z0-9_. -]+){0,7}$/;

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return reply({ ok: false, error: 'BUSY' });
  try {
    var feedback = parseFeedback(e);
    if (feedback) {
      if (!underDailyLimit()) return reply({ ok: false, error: 'LIMIT' });
      var ref = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd') + '-' + Utilities.getUuid().slice(0, 8);
      namedSheet(FEEDBACK_SHEET_NAME, FEEDBACK_HEADERS).appendRow([
        new Date(),
        ref,
        FEEDBACK_CATEGORIES[feedback.category],
        feedback.text,
        feedback.answer || '',
        feedback.contributor.name,
        feedback.contributor.team,
        feedback.errorCode || '',
        feedback.os,
        feedback.appVersion,
        'ใหม่',
        '',
        '',
      ]);
      return reply({ ok: true, id: ref });
    }
    var data = parse(e);
    if (!data) return reply({ ok: false, error: 'INVALID' });
    if (!underDailyLimit()) return reply({ ok: false, error: 'LIMIT' });
    var sheet = intakeSheet();
    var existing = findDigest(sheet, data.pack.digest);
    if (existing) return reply({ ok: true, id: existing });
    var id = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd') + '-' + Utilities.getUuid().slice(0, 8);
    var folder = filesFolder().createFolder(id + ' ' + data.pack.id);
    data.files.forEach(function (f) {
      folder.createFile(f.path.replace(/\//g, '__'), f.text, MimeType.PLAIN_TEXT);
    });
    sheet.appendRow([
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
    ]);
    return reply({ ok: true, id: id });
  } finally {
    lock.releaseLock();
  }
}

// The app validates before sending; this re-checks shape and size so a stray caller cannot fill the sheet or Drive.
function parse(e) {
  var raw = e && e.postData && e.postData.contents;
  if (typeof raw !== 'string' || raw.length > 2500000) return null;
  var d;
  try {
    d = JSON.parse(raw);
  } catch (err) {
    return null;
  }
  var text = function (v, max) {
    return typeof v === 'string' && v.length <= max;
  };
  if (!d || d.schema !== 1 || !d.pack || !d.review || !d.contributor || !d.usage || !Array.isArray(d.files)) return null;
  if (!ID.test(d.pack.id) || !/^[a-f0-9]{64}$/.test(d.pack.digest) || !text(d.pack.version, 40)) return null;
  if (!Array.isArray(d.pack.skills) || d.pack.skills.length > 50 || !d.pack.skills.every(function (s) { return text(s, 64); }))
    return null;
  if (['pass', 'warn'].indexOf(d.review.status) < 0 || !Array.isArray(d.review.findings) || d.review.findings.length > 200)
    return null;
  if (!text(d.contributor.name, 80) || !d.contributor.name.trim() || !text(d.contributor.team, 80)) return null;
  if (typeof d.usage.count !== 'number' || d.usage.count < 0 || !text(d.appVersion, 40)) return null;
  if (!d.files.length || d.files.length > 120) return null;
  for (var i = 0; i < d.files.length; i++)
    if (!PATH.test(d.files[i].path) || /(^|\/)\.\.?(\/|$)/.test(d.files[i].path) || !text(d.files[i].text, 200000)) return null;
  // Formulas typed into a name or team must stay text in the sheet.
  d.contributor.name = plainCell(d.contributor.name);
  d.contributor.team = plainCell(d.contributor.team);
  return d;
}
// A problem report or suggestion (kind "feedback"); anything else is left to parse() as a Skill.
function parseFeedback(e) {
  var raw = e && e.postData && e.postData.contents;
  if (typeof raw !== 'string' || raw.length > 20000) return null;
  var d;
  try {
    d = JSON.parse(raw);
  } catch (err) {
    return null;
  }
  var text = function (v, max) {
    return typeof v === 'string' && v.length <= max;
  };
  if (!d || d.schema !== 1 || d.kind !== 'feedback' || !FEEDBACK_CATEGORIES.hasOwnProperty(d.category) || !d.contributor) return null;
  if (!text(d.text, 2000) || !d.text.trim() || (d.answer !== undefined && !text(d.answer, 8000))) return null;
  if (!text(d.contributor.name, 80) || !text(d.contributor.team, 80) || !text(d.os, 40) || !text(d.appVersion, 40)) return null;
  if (d.errorCode !== undefined && !/^[A-Z][A-Z0-9_]{1,63}$/.test(d.errorCode)) return null;
  // Anything typed by the employee must stay text in the sheet, never a formula.
  d.text = plainCell(d.text);
  if (d.answer) d.answer = plainCell(d.answer);
  d.contributor.name = plainCell(d.contributor.name);
  d.contributor.team = plainCell(d.contributor.team);
  return d;
}
function plainCell(v) {
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
function underDailyLimit() {
  var props = PropertiesService.getScriptProperties();
  var key = 'count-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd');
  var count = Number(props.getProperty(key) || 0);
  if (count >= DAILY_LIMIT) return false;
  props.setProperty(key, String(count + 1));
  return true;
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
