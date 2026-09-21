import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { zipSync, strToU8 } from '../src/vendor/privacy/fflate.mjs';
import { evaluatePrivacyGate, scanPrivacyText, clearPrivacyScanCache, getPrivacyScanCacheSize,
  PRIVACY_CACHE_LIMIT, sanitizeRunData } from '../src/modules/privacy/index.js';
import { evaluateDocumentPrivacy, DOCUMENT_LIMITS } from '../src/modules/privacy/document.js';

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'step-privacy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
// Real compressed text-layer PDF, no native renderer/test dependency required.
function pdf(pages = ['Contact: synthetic@example.invalid']) {
  const unicode = pages.some((p) => /[^\x00-\x7f]/.test(p));
  const glyphs = [...new Set(pages.join(''))];
  const encoded = (text) => unicode ? `<${[...text].map((ch) => glyphs.indexOf(ch).toString(16).padStart(2, '0')).join('')}>` : `(${text})`;
  const objects = [null, '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica ${unicode ? `/ToUnicode ${4 + pages.length * 2} 0 R` : ''} >>`];
  for (let i = 0; i < pages.length; i++) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    const stream = deflateSync(Buffer.from(pages[i] ? `BT /F1 12 Tf 40 700 Td ${encoded(pages[i])} Tj ET` : ''));
    objects.push(Buffer.concat([Buffer.from(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`), stream, Buffer.from('\nendstream')]));
  }
  if (unicode) {
    const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Test def /CMapType 2 def 1 begincodespacerange <00> <FF> endcodespacerange ${glyphs.length} beginbfchar ${glyphs.map((ch, i) => `<${i.toString(16).padStart(2, '0')}> <${ch.charCodeAt(0).toString(16).padStart(4, '0')}>`).join('\n')} endbfchar endcmap CMapName currentdict /CMap defineresource pop end end`;
    objects.push(`<< /Length ${Buffer.byteLength(cmap)} >>\nstream\n${cmap}\nendstream`);
  }
  const chunks = [Buffer.from('%PDF-1.7\n')];
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets.push(chunks.reduce((sum, b) => sum + b.length, 0));
    chunks.push(Buffer.from(`${i} 0 obj\n`), Buffer.from(objects[i]), Buffer.from('\nendobj\n'));
  }
  const xref = chunks.reduce((sum, b) => sum + b.length, 0);
  chunks.push(Buffer.from(`xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return Buffer.concat(chunks);
}
function docx(body, extra = {}) {
  return zipSync({ 'word/document.xml': strToU8(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`), ...extra });
}

test('reported identifiers are masked; sensitive English and ambiguous labels never pass', () => {
  for (const [input, secrets] of [
    ['ผู้เข้าอบรม: สมชาย ใจดี อายุ 40 ปี', ['สมชาย', 'ใจดี']],
    ['ชื่อ: สมชาย, นามสกุล: ใจดี', ['สมชาย', 'ใจดี']],
    ['passport AA1234567', ['AA1234567']],
    ['ใบขับขี่: 12345678', ['12345678']],
    ['Line ID: synthetic.user', ['synthetic.user']],
    ['วันเกิด: 01/02/1990', ['01/02/1990']],
    ['credit card 4111 1111 1111 1111', ['4111']],
  ]) {
    const result = evaluatePrivacyGate(input);
    assert.notEqual(result.action, 'pass', input);
    assert.equal(result.canSendToExternalAI, false);
    for (const secret of secrets) assert.ok(!result.redactedText.includes(secret), input);
  }
  for (const input of ['John Smith, medical record, diabetes', 'HIV', 'depression', 'ใบขับขี่', 'Line ID', 'บัตรเครดิต', 'วันเกิด', 'ชื่อ สมชาย ใจดี']) {
    const result = evaluatePrivacyGate(input);
    assert.equal(result.action, 'human-confirm', input);
    assert.equal(result.canSendToExternalAI, false);
  }
  const names = 'นายทะเบียนบริษัท และ นายจ้าง นายก นายหน้า นายอำเภอ';
  assert.equal(evaluatePrivacyGate(names).redactedText, names);
  assert.equal(evaluatePrivacyGate('TOR public information').canSendToExternalAI, false);
  assert.equal(evaluatePrivacyGate('4111111111111112').findings.some((f) => f.type === 'credit-card'), false);
  assert.equal(evaluatePrivacyGate('4111111111111111').findings.some((f) => f.type === 'credit-card'), true);
  assert.equal(evaluatePrivacyGate('4111111111111111', { allowedIdentifiers: ['4111111111111111'] }).findings.some((f) => f.type === 'credit-card'), true);
});

test('name tables require human review and cannot persist unknown names', () => {
  for (const input of ['ชื่อ-สกุล,อายุ\nสมชาย ใจดี,40', '| ชื่อ-นามสกุล | อายุ |\n| สมชาย ใจดี | 40 |', 'ชื่อ สกุล\nสมชาย ใจดี', 'ชื่อ\tนามสกุล\nสมชาย\tใจดี']) {
    const result = evaluatePrivacyGate(input);
    assert.equal(result.action, 'human-confirm');
    assert.equal(result.classification, 'restricted');
    assert.equal(result.canSendToExternalAI, false);
    assert.equal(result.unresolvedIdentifiers, true);
    assert.ok(!sanitizeRunData(input).includes('สมชาย'));
  }
  assert.equal(evaluatePrivacyGate('ชื่อ-สกุล\nสมชาย ใจดี\npassword=synthetic-value').action, 'block-external');
});

test('birth-date masking preserves following fields and defers unknown formats', () => {
  for (const value of ['12/03/2530', '1990-03-12', '๑๒/๐๓/๒๕๓๐', '12 มีนาคม พ.ศ. 2530',
    '12 มี.ค. 2530', '12 March 1990', 'March 12, 1990']) {
    const result = evaluatePrivacyGate(`วันเกิด ${value} เงินเดือน 45,000 บาท`);
    assert.equal(result.redactedText, '[วันเกิดถูกปิดบัง] เงินเดือน 45,000 บาท', value);
    assert.ok(result.findings.some((f) => f.type === 'date-of-birth'));
  }
  assert.equal(evaluatePrivacyGate('DOB: 1990-03-12; salary 45,000').redactedText,
    '[วันเกิดถูกปิดบัง]; salary 45,000');
  for (const value of ['ไม่ทราบ', 'มีนาคม 2530', '12/03/253012', '12/03/30']) {
    const input = `วันเกิด ${value} เงินเดือน 45,000 บาท`;
    const result = evaluatePrivacyGate(input);
    assert.equal(result.action, 'human-confirm', value);
    assert.ok(result.redactedText.endsWith(' เงินเดือน 45,000 บาท'), value);
    assert.equal(result.canSendToExternalAI, false);
    assert.ok(!result.findings.some((f) => f.type === 'date-of-birth'), value);
  }
});

test('metadata cache is bounded LRU and returned results cannot mutate cached verdicts', () => {
  clearPrivacyScanCache();
  for (let i = 0; i < PRIVACY_CACHE_LIMIT; i++) scanPrivacyText(`synthetic entry ${i}`);
  const cached = scanPrivacyText('synthetic entry 0');
  cached.action = 'block-external';
  scanPrivacyText('synthetic new entry');
  assert.equal(getPrivacyScanCacheSize(), PRIVACY_CACHE_LIMIT);
  assert.equal(scanPrivacyText('synthetic entry 0').cacheHit, true);
  assert.equal(scanPrivacyText('synthetic entry 0').action, 'pass');
  assert.equal(scanPrivacyText('synthetic entry 1').cacheHit, false);
});

test('PDF compressed text is scanned locally without raw text in report or modifying original', async (t) => {
  const root = await workspace(t);
  const file = join(root, 'sample.pdf');
  const bytes = pdf();
  await writeFile(file, bytes);
  const report = await evaluateDocumentPrivacy(file);
  assert.equal(report.extractionStatus, 'text-extracted', JSON.stringify(report));
  assert.equal(report.extractionScope, 'pdf-text-layer-only');
  assert.ok(report.findings.some((f) => f.type === 'email'));
  assert.equal(report.action, 'human-confirm');
  assert.equal(report.canSendToExternalAI, false);
  assert.equal(report.sourceHash, createHash('sha256').update(bytes).digest('hex'));
  assert.ok(!JSON.stringify(report).includes('synthetic@example.invalid'));
  assert.deepEqual(await readFile(file), Buffer.from(bytes));
  assert.deepEqual(await readdir(root), ['sample.pdf']);
});

test('scanned, mixed, malformed, over-limit and unsupported files cannot pass or export text', async (t) => {
  const root = await workspace(t);
  for (const [name, bytes] of [
    ['image.pdf', pdf([''])], ['mixed.pdf', pdf(['synthetic@example.invalid', ''])],
    ['broken.pdf', Buffer.from('%PDF-broken')], ['sheet.xlsx', Buffer.from('unsupported')],
    ['image.png', Buffer.from('unsupported')], ['bad.txt', Buffer.from([0xff, 0xfe, 0])],
    ['empty.txt', Buffer.alloc(0)], ['large.txt', Buffer.alloc(DOCUMENT_LIMITS.bytes + 1)],
    ['pages.pdf', pdf(Array(201).fill('hello'))],
    ['bomb.docx', docx(`<w:p><w:r><w:t>${'a'.repeat(DOCUMENT_LIMITS.expandedBytes)}</w:t></w:r></w:p>`)],
    ['entities.docx', zipSync({ 'word/document.xml': strToU8('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///private">]><a>&x;</a>') })],
  ]) {
    const file = join(root, name);
    await writeFile(file, bytes);
    const report = await evaluateDocumentPrivacy(file, { includeRedacted: true });
    assert.equal(report.action, 'human-confirm', name);
    assert.equal(report.canSendToExternalAI, false, name);
    assert.equal(report.redactedText, undefined, name);
    assert.notEqual(report.extractionStatus, 'text-extracted', name);
  }
});

test('Thai PDF ToUnicode text reaches the name scanner', async (t) => {
  const root = await workspace(t);
  const file = join(root, 'thai.pdf');
  await writeFile(file, pdf(['ผู้เข้าอบรม: สมชาย ใจดี']));
  const result = await evaluateDocumentPrivacy(file, { includeRedacted: true });
  assert.equal(result.extractionStatus, 'text-extracted', JSON.stringify(result));
  assert.ok(result.findings.some((f) => f.type === 'person-name'));
  assert.ok(!result.redactedText.includes('สมชาย'));
  assert.equal(result.canSendToExternalAI, false);
});

for (const platform of ['windows', 'macos']) {
  test(`${platform} preflight helper invokes local scanner with a literal path containing spaces`, async (t) => {
    const root = await workspace(t);
    const file = join(root, 'synthetic & review.txt');
    await writeFile(file, 'synthetic@example.invalid');
    const shell = platform === 'windows' ? (process.platform === 'win32' ? 'powershell.exe' : 'pwsh')
      : process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
    const args = platform === 'windows'
      ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'install/privacy-windows.ps1', '-FilePath', file]
      : ['install/privacy-macos.sh', file];
    const result = spawnSync(shell, args, { encoding: 'utf8', windowsHide: true });
    if (result.error?.code === 'ENOENT') return t.skip(`${shell} not installed`);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stdout, /Privacy Gate/);
    assert.ok(!result.stdout.includes('synthetic@example.invalid'));
    assert.deepEqual(await readdir(root), ['synthetic & review.txt']);
  });
}

test('DOCX reads split runs, tables, headers and comments; no raw names in reports', async (t) => {
  const root = await workspace(t);
  const file = join(root, 'sample.docx');
  await writeFile(file, docx('<w:tbl><w:tr><w:tc><w:p><w:r><w:t>ชื่อ-</w:t></w:r><w:r><w:t>นามสกุล</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>สมชาย ใจดี</w:t></w:r></w:p></w:tc></w:tr></w:tbl>', {
    'word/header1.xml': strToU8('<w:hdr xmlns:w="w"><w:p><w:r><w:t>synthetic@example.invalid</w:t></w:r></w:p></w:hdr>'),
    'word/comments.xml': strToU8('<w:comments xmlns:w="w"><w:p><w:r><w:t>HIV</w:t></w:r></w:p></w:comments>'),
  }));
  const result = await evaluateDocumentPrivacy(file, { includeRedacted: true });
  assert.equal(result.extractionScope, 'docx-word-text-only');
  assert.ok(result.findings.some((f) => f.type === 'name-table-review'));
  assert.ok(result.findings.some((f) => f.type === 'email'));
  assert.equal(result.action, 'block-external');
  assert.equal(result.redactedText, undefined);
  assert.ok(!JSON.stringify(result).includes('สมชาย'));
  await writeFile(file, docx('<w:p><w:r><w:t>hello</w:t></w:r></w:p>', { 'word/media/image1.png': new Uint8Array([1]) }));
  const embedded = await evaluateDocumentPrivacy(file, { includeRedacted: true });
  assert.equal(embedded.extractionStatus, 'partial');
  assert.equal(embedded.redactedText, undefined);
});

test('CLI exports only explicit local review text, never overwrites, and JSON stays metadata-only', async (t) => {
  const root = await workspace(t);
  const file = join(root, 'sample.docx');
  const bytes = docx('<w:p><w:r><w:t>Contact: synthetic@example.invalid</w:t></w:r></w:p>');
  await writeFile(file, bytes);
  const run = (...extra) => spawnSync(process.execPath, ['bin/step-ai.js', 'privacy', '--file', file, '--json', ...extra], { encoding: 'utf8' });
  const first = run('--redact');
  assert.equal(first.status, 2, first.stderr);
  const report = JSON.parse(first.stdout);
  assert.equal(report.exportStatus, 'written-for-review');
  assert.equal(report.originalFileSanitized, false);
  assert.ok(!first.stdout.includes('synthetic@example.invalid'));
  const out = await readFile(join(root, 'sample.redacted.txt'), 'utf8');
  assert.ok(!out.includes('synthetic@example.invalid'));
  assert.equal(JSON.parse(run('--redact').stdout).exportStatus, 'write-failed-or-exists');
  assert.deepEqual(await readFile(file), Buffer.from(bytes));
  assert.equal(JSON.parse(run('--ocr').stdout).reviewReasons[0], 'ocr-not-supported');
});

test('offline vendor files match their pinned integrity manifest', async () => {
  const root = new URL('../src/vendor/privacy/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  for (const [name, expected] of Object.entries(manifest.files)) {
    assert.equal(createHash('sha256').update(await readFile(new URL(name, root))).digest('hex'), expected, name);
  }
});
