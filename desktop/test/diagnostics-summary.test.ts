import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultLogPath, parseRuns, percentile, report, summarize } from '../eval/diagnostics-summary';

const line = (entry: Record<string, unknown>) => JSON.stringify(entry);
const call = (run: string, at: string, kind: string, ms: number, extra: Record<string, unknown> = {}) =>
  line({
    at,
    event: 'provider-call',
    run,
    step: 0,
    provider: 'antigravity',
    model: 'gemini-3.8-flash-medium',
    kind,
    outcome: 'completed',
    ms,
    ...extra,
  });

test('joins provider calls to their run, by run id and for logs written before the id was logged', () => {
  const log = [
    line({ at: '2026-10-31T01:00:00.000Z', event: 'app-started' }),
    // Old format: the run-trace line has no run id; its calls are the ones logged just before it.
    call('a', '2026-10-31T01:00:30.000Z', 'selection', 30_000),
    call('a', '2026-10-31T01:00:42.000Z', 'answer', 12_000, { input: 8000, output: 400, total: 8400 }),
    call('a', '2026-10-31T01:01:28.000Z', 'check', 46_000, { input: 3000, output: 100, total: 3100 }),
    line({ at: '2026-10-31T01:01:28.100Z', event: 'run-trace', outcome: 'review', mode: 'chat', route: 'knowledge', ms: '88000' }),
    'not json',
    // New format: the trace names its run, provider and model.
    call('b', '2026-11-01T02:00:10.000Z', 'answer', 9_000, {
      provider: 'claude',
      model: 'claude-sonnet',
      input: 9000,
      cachedInput: 6000,
      total: 9500,
    }),
    line({
      at: '2026-11-01T02:00:10.100Z',
      event: 'run-trace',
      run: 'b',
      provider: 'claude',
      model: 'claude-sonnet',
      selection: 'router',
      outcome: 'review',
      ms: '10000',
    }),
    line({
      at: '2026-11-01T02:05:00.000Z',
      event: 'run-trace',
      run: 'c',
      provider: 'claude',
      model: 'claude-sonnet',
      outcome: 'error',
      ms: '2000',
    }),
  ].join('\n');
  const runs = parseRuns(log);
  assert.equal(runs.length, 3);
  assert.deepEqual(
    runs[0].calls.map(c => c.kind),
    ['selection', 'answer', 'check'],
  );
  assert.equal(runs[0].provider, 'antigravity');
  assert.equal(runs[0].ms, 88_000);
  assert.equal(runs[1].selection, 'router');
  assert.equal(runs[1].calls.length, 1);
  assert.equal(runs[2].calls.length, 0);

  const rows = summarize(runs);
  const gemini = rows.find(r => r.provider === 'antigravity')!;
  assert.equal(gemini.p50Ms, 88_000);
  assert.equal(gemini.callsPerRun, 3);
  assert.equal(gemini.tokensPerRun, 11_500);
  assert.equal(gemini.kinds.check.p50Ms, 46_000);
  const claude = rows.find(r => r.provider === 'claude')!;
  assert.equal(claude.runs, 2);
  assert.equal(claude.failed, 1);
  // Times count answered runs only.
  assert.equal(claude.p50Ms, 10_000);
  assert.equal(claude.cachedShare, 6000 / 9000);

  // Dates filter on the run's time.
  assert.deepEqual(
    summarize(runs, { since: '2026-11-01' }).map(r => r.provider),
    ['claude'],
  );
  const table = report(rows);
  assert.match(table, /\| antigravity \| gemini-3\.8-flash-medium \| 1 \| 0 \| 0 \| 88\.0 s \| 88\.0 s \| 3 \| 11,500 \| 0% \|/);
  assert.match(table, /\| antigravity \| gemini-3\.8-flash-medium \| check \| 1 \| 0 \| 46\.0 s \|/);
  assert.match(report([]), /No run-trace lines/);
});

test('percentile uses the nearest rank', () => {
  assert.equal(percentile([], 50), undefined);
  assert.equal(percentile([5], 90), 5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50), 5);
  assert.equal(percentile([10, 1, 9, 2, 8, 3, 7, 4, 6, 5], 90), 9);
});

test('finds the installed app log on each platform', () => {
  assert.equal(
    defaultLogPath('win32', { APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, 'C:\\Users\\a'),
    'C:\\Users\\a\\AppData\\Roaming\\@step-cmu\\desktop\\logs\\diagnostics.jsonl',
  );
  assert.equal(defaultLogPath('darwin', {}, '/Users/a'), '/Users/a/Library/Application Support/@step-cmu/desktop/logs/diagnostics.jsonl');
  assert.equal(defaultLogPath('linux', {}, '/home/a'), '/home/a/.config/@step-cmu/desktop/logs/diagnostics.jsonl');
});
