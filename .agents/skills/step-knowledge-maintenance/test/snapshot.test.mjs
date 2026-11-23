import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderRegister } from '../../../../scripts/generate-mis-iso-register.mjs';

// Synthetic MIS extract shared with test/mis-iso-register.test.js: invented numbers and titles, fixture URLs.
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const FIXTURE = join(ROOT, 'test', 'fixtures', 'mis-iso-register', 'extract.json');
const script = (name) => fileURLToPath(new URL(`../scripts/${name}`, import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'step-knowledge-snapshot-'));
after(() => rmSync(dir, { recursive: true }));

let files = 0;
const write = (name, text) => {
  const path = join(dir, `${files++}-${name}`);
  writeFileSync(path, text);
  return path;
};
const fixture = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));
const extractFile = (extract) => write('extract.json', JSON.stringify(extract));
const registerFile = (extract) => write('register.md', renderRegister(extract, { captured: '2026-11-23' }));
const run = (name, ...args) => spawnSync(process.execPath, [script(name), ...args], { encoding: 'utf8' });
const snapshotOf = (path) => {
  const result = run('snapshot.mjs', '--mis', path);
  assert.equal(result.status, 0, result.stderr);
  return result;
};
const rowOf = (extract, number) =>
  Object.values(extract)
    .flatMap((register) => register?.rows ?? [])
    .find((row) => row.cells.includes(number));

test('an MIS extract and the register published from it give the same snapshot', () => {
  const fromExtract = snapshotOf(extractFile(fixture()));
  const fromRegister = snapshotOf(registerFile(fixture()));
  assert.equal(fromExtract.stdout, fromRegister.stdout);

  const { sources } = JSON.parse(fromExtract.stdout);
  assert.equal(sources.mis.status, 'complete');
  assert.deepEqual(sources.gmail, { status: 'not-configured', records: [] });
  assert.deepEqual(sources.sheets, { status: 'not-configured', records: [] });
  const byId = Object.fromEntries(sources.mis.records.map((record) => [record.id, record]));
  assert.deepEqual(Object.keys(byId), [
    'FM-AA-001',
    'FM-ZZ-001',
    'FM-ZZ-002',
    'FM-ZZ-010',
    'ML-AA',
    'ML-ZZ',
    'QM-ZZ-001',
    'QP-ZZ-001',
    'SD-ZZ-001',
    'WI-ZZ-001',
  ]);
  assert.equal(byId['FM-ZZ-001'].state, 'withdrawn');
  assert.equal(byId['FM-ZZ-001'].revision, 'none');
  assert.equal(byId['QP-ZZ-001'].revision, 'V.02');
  // Metadata only: no titles, team names or links reach the snapshot.
  assert.doesNotMatch(fromExtract.stdout, /แบบฟอร์ม|ทีม|https?:|example\.invalid/);
});

test('a new extract against the published register stages each kind of change for review', () => {
  const baseline = write('baseline.json', snapshotOf(registerFile(fixture())).stdout);
  const changed = fixture();
  rowOf(changed, 'QP-ZZ-001').cells[2] = 'V.03';
  rowOf(changed, 'FM-ZZ-010').cells[4] = '(ยกเลิกการใช้งาน)แบบฟอร์มลำดับที่สิบ';
  changed.isowi.rows = [];
  changed.isowi.n = 0;
  const current = write('current.json', snapshotOf(extractFile(changed)).stdout);

  const result = run('preview.mjs', current, baseline);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.reviewRequired, true);
  assert.deepEqual(
    report.changes.map((change) => [change.id, change.action]),
    [
      ['FM-ZZ-010', 'verify-withdrawal'],
      ['QP-ZZ-001', 'review-change'],
      ['WI-ZZ-001', 'verify-missing'],
    ],
  );

  const same = run('preview.mjs', baseline, baseline);
  assert.equal(JSON.parse(same.stdout).reviewRequired, false, 'unconnected Gmail/Sheets alone ask for no review');
});

test('one number with two different rows is left out and makes MIS partial', () => {
  const extract = fixture();
  extract.isoform.rows.push({ cells: ['5', 'FM-AA-001', 'V.03', '2026-02-01', 'แบบฟอร์มทีมเอ ฉบับซ้ำ', 'ทีมเอทดสอบ (AA)'] });
  extract.isoform.n += 1;
  const result = snapshotOf(extractFile(extract));
  const { mis } = JSON.parse(result.stdout).sources;
  assert.equal(mis.status, 'partial');
  assert.equal(
    mis.records.some((record) => record.id === 'FM-AA-001'),
    false,
  );
  assert.match(result.stderr, /conflicting-rows: FM-AA-001/);
  assert.doesNotMatch(result.stderr, /แบบฟอร์ม/);
});

test('the library check names transcribed documents that MIS has revised, withdrawn or no longer lists', () => {
  const manifest = write(
    'documents.yaml',
    [
      'version: 1',
      'documents:',
      '  zz-procedure:',
      '    title: "QP-ZZ-001 ขั้นตอนทดสอบ"',
      '    path: docs/knowledge/qp-zz-001.md',
      '    version: "02"',
      '    effectiveDate: "2026-10-01"',
      '    status: active',
      '  zz-old-form:',
      '    title: "FM-ZZ-001 แบบฟอร์มทดสอบเก่า"',
      '    path: docs/knowledge/fm-zz-001.md',
      '    status: active',
      '  zz-gone:',
      '    title: "QP-ZZ-099 ขั้นตอนที่ไม่มีใน MIS"',
      '    path: docs/knowledge/qp-zz-099.md',
      '    status: active',
      '  zz-not-in-repo:',
      '    title: "QP-ZZ-098 ไม่มีไฟล์ในคลัง"',
      '    status: not-provided',
      '  zz-index:',
      '    title: "ทะเบียนทดสอบ"',
      '    path: docs/knowledge/index.md',
      '    status: active',
      '',
    ].join('\n'),
  );
  const check = (path) => {
    const result = run('library-check.mjs', '--mis', path, '--manifest', manifest);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };

  const current = check(registerFile(fixture()));
  assert.equal(current.checked, 3);
  assert.deepEqual(
    current.findings.map((finding) => [finding.id, finding.action]),
    [
      ['FM-ZZ-001', 'withdrawn-in-mis'],
      ['QP-ZZ-099', 'not-in-mis'],
    ],
  );

  const revised = fixture();
  rowOf(revised, 'QP-ZZ-001').cells[2] = 'V.03';
  const later = check(extractFile(revised));
  const finding = later.findings.find((item) => item.id === 'QP-ZZ-001');
  assert.equal(finding.action, 'update-library');
  assert.deepEqual(finding.library, { revision: '02', effectiveDate: '2026-10-01' });
  assert.equal(finding.mis.revision, 'V.03');
});

test('the committed library matches the committed MIS register', () => {
  const register = join(ROOT, 'docs', 'knowledge', 'mis-iso-document-register.md');
  const result = run('library-check.mjs', '--mis', register);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.misStatus, 'complete');
  assert.ok(report.checked >= 13, `checked ${report.checked}`);
  assert.deepEqual(report.findings, []);
});
