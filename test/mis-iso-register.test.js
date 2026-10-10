import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// docs/knowledge/mis-iso-document-register.md is generated from a private STeP MIS extract (metadata only: number, REV,
// effective date, title, team). The extract and its MIS links never enter this public repository, so these tests use a
// synthetic fixture for the generator and check the committed register for the properties the app relies on.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts', 'generate-mis-iso-register.mjs');
const FIXTURE = join(ROOT, 'test', 'fixtures', 'mis-iso-register', 'extract.json');
const REGISTER = join(ROOT, 'docs', 'knowledge', 'mis-iso-document-register.md');
// Desktop search hands the model at most 4,000 characters of a matched section (SECTION_CHARS in
// desktop/electron/knowledge.ts) and indexes at most 20,000. A register section must fit the smaller one whole, or a
// row near its end is never seen.
const SECTION_LIMIT = 4000;
const URLISH = /https?:\/\/|www\.|viewdoc|script\.google|example\.invalid|mis\.step\.cmu/i;

const { renderRegister } = await import('../scripts/generate-mis-iso-register.mjs');
const fixture = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));
const sections = (md) => md.split(/\n(?=## )/).slice(1);
const rowOf = (md, number) => md.split(/\r?\n/).find((line) => line.startsWith(`| ${number} |`));

test('the test root uses a native filesystem path including Windows drive and escaped characters', () => {
  assert.equal(ROOT, fileURLToPath(new URL('..', import.meta.url)));
});

test('generator output is deterministic and independent of the extract order', () => {
  const a = renderRegister(fixture(), { captured: '2026-10-10' });
  const shuffled = fixture();
  shuffled.isoform.rows.reverse();
  const reordered = Object.fromEntries(Object.entries(shuffled).reverse());
  assert.equal(renderRegister(reordered, { captured: '2026-10-10' }), a);
  assert.ok(a.endsWith('\n') && !a.includes('\r'));
});

test('generator writes the Thai source header, counts and MIS-first rules', () => {
  const md = renderRegister(fixture(), { captured: '2026-10-10' });
  const head = md.split(/\n## /)[0];
  assert.match(head, /^# /);
  assert.ok(head.includes('STeP MIS'));
  assert.ok(head.includes('เอกสารระบบคุณภาพ (ISO)'));
  assert.ok(head.includes('2026-10-10'), 'captured date');
  for (const count of ['Master List 2', 'QM 1', 'QP 2', 'WI 1', 'FM 4', 'SD 0', 'รวม 10', 'ใช้อยู่ 9', 'ยกเลิก 1']) {
    assert.ok(head.includes(count), `header count ${count}`);
  }
  assert.match(md, /ยึด(ตาม)? ?STeP MIS|ให้ยึด MIS|ยึด MIS/);
  assert.match(md, /เปิด[^\n]*จาก STeP MIS|ดาวน์โหลด[^\n]*จาก STeP MIS/);
  assert.match(md, /QS/, 'enacting and cancelling controlled documents stays with QS');
});

test('generator renders one table row per document with the agreed columns and status', () => {
  const md = renderRegister(fixture(), { captured: '2026-10-10' });
  assert.ok(md.includes('| เลขที่ | ประเภท | REV | วันที่บังคับใช้ | ชื่อ | สถานะ |'));
  assert.equal(rowOf(md, 'FM-ZZ-010'), '| FM-ZZ-010 | FM | V.00 | 2026-09-01 | แบบฟอร์มลำดับที่สิบ | ใช้อยู่ |');
  // The cancellation marker becomes the status column instead of staying in the title.
  assert.equal(rowOf(md, 'FM-ZZ-001'), '| FM-ZZ-001 | FM | - | 2025-06-01 | แบบฟอร์มทดสอบเก่า | ยกเลิก |');
  // MIS lists SD-ZZ-001 under QP; the row says so instead of silently re-filing it.
  assert.match(rowOf(md, 'SD-ZZ-001'), /^\| SD-ZZ-001 \| QP \(ทะเบียน QP ใน MIS · เลขขึ้นต้น SD\) \| V\.00 \|/);
  // A pipe inside a title must not break the table.
  assert.equal(rowOf(md, 'FM-ZZ-002').split('|').length, 8);
  // Rows are in natural document-number order inside a team.
  assert.ok(md.indexOf('| FM-ZZ-001 |') < md.indexOf('| FM-ZZ-002 |'));
  assert.ok(md.indexOf('| FM-ZZ-002 |') < md.indexOf('| FM-ZZ-010 |'));
  // One section per team, named by team code and the MIS team name (whitespace normalised).
  // (Headings carry the team code; the full MIS team name is the first body line, see the generator comment.)
  assert.ok(sections(md).some((s) => s.startsWith('## ทีม ZZ ·') && s.includes('\nทีมทดสอบตัวอย่าง (ZZ) · ')));
  assert.ok(sections(md).some((s) => s.startsWith('## ทีม AA ·') && s.includes('\nทีมเอทดสอบ (AA) · ')));
  // QM and every team's Master List are also listed together, so "คู่มือคุณภาพ" and "Master List" questions find them.
  const overview = sections(md).find((s) => s.startsWith('## คู่มือคุณภาพ (QM) และ Master List'));
  assert.ok(overview && overview.includes('QM-ZZ-001') && overview.includes('Masterlist-AA'));
});

test('generator output carries no URLs, even when titles or links contain them', () => {
  const md = renderRegister(fixture(), { captured: '2026-10-10' });
  assert.doesNotMatch(md, URLISH);
});

test('generator splits a large team by register type and part so every section stays under the search limit', () => {
  const big = fixture();
  for (let i = 100; i < 400; i++) {
    big.isoform.rows.push({
      cells: [String(i), `FM-ZZ-${i}`, 'V.01', '2026-10-01', `แบบฟอร์มทดสอบขนาดใหญ่สำหรับตรวจการแบ่งส่วนเอกสาร ลำดับที่ ${i}`, 'ทีมทดสอบตัวอย่าง (ZZ)', 'ดาวน์โหลด'],
      links: [],
    });
  }
  big.isoform.n = big.isoform.rows.length;
  const md = renderRegister(big, { captured: '2026-10-10' });
  const zz = sections(md).filter((s) => s.startsWith('## ทีม ZZ'));
  assert.ok(zz.length > 2, `expected the large team split, got ${zz.length} sections`);
  for (const s of sections(md)) assert.ok(s.length < SECTION_LIMIT, `${s.split('\n')[0]} is ${s.length} chars`);
  // Split headings name the type and the number range so a question with a document number lands on the right part.
  assert.ok(zz.some((s) => /^## ทีม ZZ · แบบฟอร์ม \(FM\)[^\n]*FM-ZZ-\d+ ถึง FM-ZZ-\d+/.test(s)));
  // Every row survives the split exactly once.
  for (let i = 100; i < 400; i++) assert.equal(md.split(`| FM-ZZ-${i} |`).length - 1, 1, `FM-ZZ-${i}`);
});

test('generator refuses an extract whose row count disagrees with the MIS menu count', () => {
  const bad = fixture();
  bad.isowi.n = 5;
  assert.throws(() => renderRegister(bad, { captured: '2026-10-10' }), /isowi/);
  assert.throws(() => renderRegister(fixture(), {}), /captured/);
});

test('CLI takes the extract path as an argument and writes the register file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mis-register-'));
  try {
    const out = join(dir, 'register.md');
    execFileSync(process.execPath, [SCRIPT, FIXTURE, '--captured', '2026-10-10', '--out', out], { stdio: 'pipe' });
    assert.equal(readFileSync(out, 'utf8'), renderRegister(fixture(), { captured: '2026-10-10' }));
    // --check passes on an up-to-date file and fails on a stale one.
    execFileSync(process.execPath, [SCRIPT, FIXTURE, '--captured', '2026-10-10', '--out', out, '--check'], { stdio: 'pipe' });
    assert.throws(() => execFileSync(process.execPath, [SCRIPT, FIXTURE, '--captured', '2026-10-11', '--out', out, '--check'], { stdio: 'pipe' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the committed MIS register is safe to publish and fits the knowledge search', () => {
  const md = readFileSync(REGISTER, 'utf8');
  assert.doesNotMatch(md, URLISH);
  assert.ok(md.includes('STeP MIS') && md.includes('2026-10-10'));
  // 344 rows carry the MIS marker (ยกเลิกการใช้งาน). A substring count of "ยกเลิก" gives 345 because FM-LE-221
  // "ใบคำขอยกเลิกค่าบริการ (งานภายใน)" is an active form whose title merely contains the word.
  for (const count of ['Master List 25', 'QM 7', 'QP 134', 'WI 317', 'FM 652', 'SD 82', 'รวม 1,217', 'ใช้อยู่ 873', 'ยกเลิก 344']) {
    assert.ok(md.includes(count), `header count ${count}`);
  }
  assert.match(rowOf(md, 'FM-LE-221'), /ใบคำขอยกเลิกค่าบริการ[^|]*\| ใช้อยู่ \|$/);
  for (const s of sections(md)) assert.ok(s.length < SECTION_LIMIT, `${s.split('\n')[0]} is ${s.length} chars`);
  // Facts the reconciliation of 2026-10-10 found, read straight from MIS.
  assert.match(rowOf(md, 'QM-QM-001'), /\| QM \| V\.03 \| 2025-07-16 \| คู่มือคุณภาพ \| ใช้อยู่ \|$/);
  assert.match(rowOf(md, 'FM-CC-005'), /\| V\.03 \| 2026-10-01 \|/);
  assert.match(rowOf(md, 'FM-CC-010'), /\| V\.01 \| 2026-10-01 \|/);
  assert.match(rowOf(md, 'QP-AF-001'), /\| V\.02 \| 2026-10-01 \|/);
  assert.match(rowOf(md, 'FM-AF-002'), /ใบขออนุมัติจัดโครงการและเดินทางไปปฏิบัติงาน/);
  assert.match(rowOf(md, 'FM-CC-008'), /\| ยกเลิก \|$/);
  // 25 team Master Lists, one per team section.
  assert.equal((md.match(/^\| - \| Master List \|/gm) || []).length, 25);
});

test('the committed register matches a regeneration from the private extract when it is available', { skip: !process.env.MIS_ISO_EXTRACT && 'set MIS_ISO_EXTRACT to the private extract to check' }, () => {
  execFileSync(process.execPath, [SCRIPT, process.env.MIS_ISO_EXTRACT, '--captured', '2026-10-10', '--out', REGISTER, '--check'], { stdio: 'pipe' });
});

test('the MIS register is registered and shipped everywhere a knowledge document must be', () => {
  const documents = readFileSync(join(ROOT, 'manifest', 'documents.yaml'), 'utf8').replace(/\r\n/g, '\n');
  const block = documents.split(/\n(?=  [a-z0-9_-]+:\n)/).find((b) => b.startsWith('  mis-iso-document-register:'));
  assert.ok(block, 'registered in manifest/documents.yaml');
  assert.match(block, /^    path: docs\/knowledge\/mis-iso-document-register\.md$/m);
  assert.match(block, /^    owner: qs$/m);
  assert.match(block, /^    status: active-reference$/m);
  const keywords = block.match(/^    keywords: \[(.*)\]$/m)?.[1] || '';
  for (const word of ['แบบฟอร์ม', 'เลขเอกสาร', 'รุ่นล่าสุด', 'REV', 'Master List', 'WI', 'QP', 'FM']) {
    assert.ok(keywords.split(',').map((k) => k.trim()).includes(word), `keyword ${word}`);
  }
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.files.includes('docs/knowledge/mis-iso-document-register.md'), 'package.json files');
  assert.ok(pkg.scripts.test.includes('test/mis-iso-register.test.js'), 'registered in npm test');
  const resolver = readFileSync(join(ROOT, 'src', 'modules', 'role-resolver.js'), 'utf8');
  const lists = [...resolver.matchAll(/const safeDocs = \[([\s\S]*?)\];/g)].map((m) => m[1]);
  assert.equal(lists.length, 2);
  for (const list of lists) assert.ok(list.includes("'knowledge/mis-iso-document-register.md'"), 'both safeDocs lists');
  assert.ok(existsSync(join(ROOT, 'plugins', 'step', 'docs', 'knowledge', 'mis-iso-document-register.md')), 'Claude plugin copy');
});

test('working list and quality docs point at the MIS register instead of saying QS has no QM or Master List', () => {
  const working = readFileSync(join(ROOT, 'docs', 'knowledge', 'qms-working-master-list.md'), 'utf8');
  assert.ok(working.includes('mis-iso-document-register.md'));
  assert.match(working, /QM-QM-001[^\n]*V\.03/);
  assert.match(working, /FM-CC-005[^\n]*V\.03/);
  assert.match(working, /FM-CC-010[^\n]*V\.01/);
  const cc = readFileSync(join(ROOT, 'docs', 'knowledge', 'cc-iso-document-register.md'), 'utf8');
  assert.match(cc, /FM-CC-005 \| V\.03/);
  assert.match(cc, /FM-CC-010 \| V\.01/);
  assert.ok(cc.includes('mis-iso-document-register.md'));
  const stale = /QS (แจ้งว่า)?(ไม่มีหรือ)?ไม่ให้|QS ไม่ให้|ไม่มีหรือไม่ให้/;
  for (const file of [
    'docs/knowledge/qms-working-master-list.md',
    'docs/knowledge/qms-working-reference.md',
    'docs/knowledge/cc-iso-document-register.md',
    'docs/quality-layer.md',
    'docs/architecture.md',
    'docs/harness-foundation.md',
    'skills/common/document-record-control/SKILL.md',
  ]) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    assert.doesNotMatch(text, stale, `${file} still says QS provides no QM/Master List`);
  }
  // Authority stays with QS.
  assert.match(working, /ประกาศใช้[^\n]*ยกเลิก[^\n]*QS/);
});
