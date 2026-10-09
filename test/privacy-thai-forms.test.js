import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluatePrivacyGate, clearPrivacyScanCache, privacySafeText, WITHHELD_TEXT } from '../src/modules/privacy/index.js';

// M1 from the 2026-09-27 harness audit: identifiers written the way Thai
// documents often write them passed the gate as `pass`, and the file written as
// "redacted" still held the original value. All values below are synthetic.
const ID_ASCII = '1234567890121';

const MUST_MASK = [
  ['thai-digit national ID', `เลขประจำตัว ๑๒๓๔๕๖๗๘๙๐๑๒๑`, 'id-13-digit'],
  ['thai-digit national ID with dashes', `เลขบัตร ๑-๒๓๔๕-๖๗๘๙๐-๑๒-๑`, 'id-13-digit'],
  ['full-width national ID', `ID １２３４５６７８９０１２１`, 'id-13-digit'],
  ['national ID with dots', `เลขบัตร 1.2345.67890.12.1`, 'id-13-digit'],
  ['national ID with zero-width spaces', `เลขบัตร 1\u200B2345\u200B67890\u200B12\u200B1`, 'id-13-digit'],
  ['national ID with word joiner', `เลขบัตร 1\u20602345\u206067890\u206012\u20601`, 'id-13-digit'],
  ['mobile 2-4-4', 'โทร 08-1234-5678', 'thai-phone'],
  ['mobile with dots', 'โทร 081.234.5678', 'thai-phone'],
  ['mobile in thai digits', 'โทร ๐๘๑-๒๓๔-๕๖๗๘', 'thai-phone'],
  ['mobile in full-width digits', 'โทร ０８１２３４５６７８', 'thai-phone'],
  ['mobile with +66 and 2-4-4 grouping', 'tel +66 8 1234 5678', 'thai-phone'],
  ['email with full-width at sign', 'อีเมล somchai＠example.com', 'email'],
  ['email with zero-width space inside', 'mail somchai\u200B@example.com', 'email'],
];

for (const [name, input, type] of MUST_MASK) {
  test(`privacy gate masks ${name}`, () => {
    clearPrivacyScanCache();
    const result = evaluatePrivacyGate(input);
    assert.notEqual(result.action, 'pass', `${name}: ${JSON.stringify(result.findings)}`);
    assert.equal(result.containsPersonalData, true);
    assert.ok(result.findings.some((f) => f.type === type), `${name}: expected ${type}, got ${JSON.stringify(result.findings)}`);
    assert.equal(result.redactionApplied, true);
    // No digit of the identifier, in any script, survives the redaction.
    const leftover = result.redactedText.normalize('NFKC')
      .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
      .replace(/[^0-9a-z@]/gi, '');
    assert.ok(!/\d{7,}|somchai/.test(leftover), `${name}: redacted text still holds the value: ${result.redactedText}`);
  });
}

test('address placeholder survives rescan without withholding safely masked text', () => {
  clearPrivacyScanCache();
  const result = evaluatePrivacyGate('ที่อยู่: 123 ถนนสุขุมวิท กรุงเทพฯ 10110');
  assert.equal(result.action, 'auto-mask');
  assert.equal(result.redactedText, 'ที่อยู่: [ถูกปิดบัง]');
  assert.equal(result.redactionApplied, true);
  assert.equal(evaluatePrivacyGate(result.redactedText).action, 'pass');
});

test('redaction keeps the surrounding Thai text byte-for-byte', () => {
  clearPrivacyScanCache();
  const input = 'ผู้ติดต่อประจำโครงการ โทร ๐๘๑-๒๓๔-๕๖๗๘ ขอบคุณค่ะ';
  const result = evaluatePrivacyGate(input);
  assert.equal(result.redactedText, 'ผู้ติดต่อประจำโครงการ โทร [หมายเลขโทรศัพท์ถูกปิดบัง] ขอบคุณค่ะ');
});

test('organization allowlist also matches the Thai-digit form of the same ID', () => {
  clearPrivacyScanCache();
  const result = evaluatePrivacyGate('เลขผู้เสียภาษีของ สวท. ๑๒๓๔๕๖๗๘๙๐๑๒๑', { allowedIdentifiers: [ID_ASCII] });
  assert.equal(result.action, 'pass');
});

const MUST_PASS = [
  'TOR งานจ้างออกแบบบูธ งบประมาณ ๕๐๐,๐๐๐ บาท',
  'ประกาศ ณ วันที่ ๒๗ กันยายน ๒๕๖๙',
  'เวอร์ชัน 0.7.6 ออกเมื่อ 2026.09.27',
  'ค่าเฉลี่ย 0.1234 และ 0.5678 จากตัวอย่าง 12 ชุด',
  'อ้างอิง 0.123456789012',
  'รหัสโครงการ STeP-2569-0012',
];

for (const input of MUST_PASS) {
  test(`ordinary text still passes: ${input}`, () => {
    clearPrivacyScanCache();
    const result = evaluatePrivacyGate(input);
    assert.equal(result.action, 'pass', JSON.stringify(result.findings));
    assert.equal(result.redactedText, input);
  });
}

test('downstream consumers never receive original text when a redacted copy is withheld', () => {
  const result = { action: 'human-confirm', redactedText: null, original: 'สมมติข้อมูลลับ' };
  assert.equal(privacySafeText(result), WITHHELD_TEXT);
  assert.ok(!privacySafeText(result).includes(result.original));
});

test('privacy gate leaves UUIDs and hex ids alone even when their digits look like a phone number', () => {
  for (const id of ['e2927bb6-b132-4881-a21f-027766844efc', 'e2927bb6-b132-4881-a21f-a0812345678c', '0812345678ab1234']) {
    clearPrivacyScanCache();
    const result = evaluatePrivacyGate(`{"id":"${id}"}`);
    assert.ok(!result.findings.some((f) => f.type === 'thai-phone'), `${id}: ${JSON.stringify(result.findings)}`);
    assert.ok(result.redactedText.includes(id), `${id}: ${result.redactedText}`);
  }
  clearPrivacyScanCache();
  assert.ok(evaluatePrivacyGate('{"phone":"0812345678"}').findings.some((f) => f.type === 'thai-phone'));
});
