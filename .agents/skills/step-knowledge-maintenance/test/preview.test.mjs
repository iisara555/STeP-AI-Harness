import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../scripts/preview.mjs', import.meta.url));
const batch = (records = [], status = 'complete') => ({ status, records });
const snapshot = (mis = batch(), gmail = batch(), sheets = batch()) => ({ schema: 1, sources: { mis, gmail, sheets } });
const record = (id, revision = '01', digest = 'a', state = 'active') => ({
  id,
  revision,
  effectiveDate: '2026-11-23',
  sha256: digest.repeat(64),
  state,
});

function run(current, previous) {
  const dir = mkdtempSync(join(tmpdir(), 'step-knowledge-preview-'));
  try {
    const args = [cli];
    for (const [name, value] of [
      ['current', current],
      ['previous', previous],
    ]) {
      if (value === undefined) continue;
      const path = join(dir, name + '.json');
      writeFileSync(path, JSON.stringify(value));
      args.push(path);
    }
    return spawnSync(process.execPath, args, { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true });
  }
}

test('stages review of changes, withdrawals and missing records without choosing a version', () => {
  const previous = snapshot(
    batch([record('QP-DEMO-001'), record('QP-DEMO-002'), record('QP-DEMO-003')]),
    batch([record('QP-DEMO-001')]),
  );
  const current = snapshot(
    batch([record('QP-DEMO-001', '02', 'b'), record('QP-DEMO-003', '02', 'a', 'withdrawn')]),
    batch([record('QP-DEMO-001')]),
    batch([record('FM-DEMO-001')]),
  );
  const result = run(current, previous);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, 'preview');
  assert.equal(report.reviewRequired, true);
  assert.deepEqual(
    report.changes.map((change) => [change.id, change.action]),
    [
      ['QP-DEMO-001', 'review-change'],
      ['QP-DEMO-002', 'verify-missing'],
      ['QP-DEMO-003', 'verify-withdrawal'],
      ['FM-DEMO-001', 'review-new'],
    ],
  );
  assert.deepEqual(
    report.disagreements.map((item) => item.id),
    ['QP-DEMO-001'],
  );
  assert.equal(result.stdout.includes('b'.repeat(64)), false);
});

test('partial or unavailable sources cannot clear a previously reviewed item', () => {
  const previous = snapshot(batch([record('QP-DEMO-001')]), batch([record('QP-DEMO-002')]));
  const current = snapshot(batch([record('QP-DEMO-003')], 'partial'), batch([], 'unavailable'));
  const result = run(current, previous);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.reviewRequired, true);
  assert.deepEqual(report.sourceStatus, { mis: 'partial', gmail: 'unavailable', sheets: 'complete' });
  assert.deepEqual(
    report.changes.map((change) => [change.id, change.partial]),
    [['QP-DEMO-003', true]],
  );
  assert.deepEqual(report.disagreements, []);
});

test('the same reviewed batch is stable and asks for no additional review', () => {
  const reviewed = snapshot(batch([record('FM-DEMO-003'), record('FM-DEMO-001')]));
  const rearranged = snapshot(batch([record('FM-DEMO-001'), record('FM-DEMO-003')]));
  const first = run(rearranged, reviewed);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, run(reviewed, reviewed).stdout);
  assert.equal(JSON.parse(first.stdout).reviewRequired, false);
});

test('rejects raw content, duplicates, invalid dates and unavailable sources with records', () => {
  const raw = { ...record('FM-DEMO-001'), body: 'SYNTHETIC_PRIVATE_BODY' };
  const invalidDate = { ...record('FM-DEMO-001'), effectiveDate: '2026-02-30' };
  for (const input of [
    snapshot(batch([raw])),
    snapshot(batch([record('FM-DEMO-001'), record('FM-DEMO-001')])),
    snapshot(batch([invalidDate])),
    snapshot(batch([record('FM-DEMO-001')], 'unavailable')),
  ]) {
    const result = run(input);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^INVALID_SNAPSHOT/);
    assert.equal(result.stderr.includes('SYNTHETIC_PRIVATE_BODY'), false);
    assert.equal(result.stdout, '');
  }
});

test('a source without a reader asks for review only when it used to hold reviewed records', () => {
  const unconnected = batch([], 'not-configured');
  const reviewed = snapshot(batch([record('QP-DEMO-001')]), unconnected, unconnected);
  const same = run(reviewed, reviewed);
  assert.equal(same.status, 0, same.stderr);
  assert.equal(JSON.parse(same.stdout).reviewRequired, false);

  const switchedOff = run(
    snapshot(batch([record('QP-DEMO-001')]), unconnected),
    snapshot(batch([record('QP-DEMO-001')]), batch([record('QP-DEMO-002')])),
  );
  assert.equal(switchedOff.status, 0, switchedOff.stderr);
  const report = JSON.parse(switchedOff.stdout);
  assert.equal(report.reviewRequired, true);
  assert.deepEqual(report.changes, []);

  const withRecords = run(snapshot(batch(), batch([record('QP-DEMO-001')], 'not-configured')));
  assert.equal(withRecords.status, 2);
});
