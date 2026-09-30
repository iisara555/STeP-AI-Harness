import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../electron/store';
import { defaultPolicy } from '../electron/policy';
import { CostLedger } from '../electron/cost';
import { retryDelay, RETRY_DELAYS_MS, retryAfterMs } from '../electron/retry';
import { runtimeError } from '../electron/providers';
import { Questions } from '../electron/questions';
import { Approvals } from '../electron/approvals';
import type { Connection, RunEvent } from '../src/types';
test('ledger preserves incurred prices, distinguishes missing prices and warns at 80 percent', () => {
  const store = new Store(':memory:'),
    policy = defaultPolicy();
  let date = new Date('2026-09-30T12:00:00Z');
  const ledger = new CostLedger(
      store,
      () => policy,
      () => date,
    ),
    connection = { provider: 'openai', model: 'test' } as Connection;
  policy.prices.test = { input: 1, output: 2 };
  policy.budgets = { dailyTokens: 125, monthlyCostUsd: 0.00025 };
  ledger.record(connection, { input: 50, output: 50, total: 100 });
  let report = ledger.report();
  assert.equal(report.monthlyUsd, 0.00015);
  assert.deepEqual(report.warnings, ['DAILY_TOKEN_BUDGET']);
  delete policy.prices.test;
  ledger.record(connection, { input: 20, output: 30, total: 50 });
  report = ledger.report();
  assert.equal(report.unpricedTokens, 50);
  assert.equal(report.monthlyUsd, 0.00015);
  policy.prices['openai:*'] = { input: 5, output: 5 };
  ledger.record(connection, { input: 10, output: 0, total: 10 });
  assert.equal(ledger.report().monthlyUsd, 0.0002);
  assert.equal(ledger.report().warnings.length, 2);
  date = new Date('2026-10-01T00:00:00Z');
  assert.equal(ledger.report().dailyTokens, 0);
  assert.equal(ledger.report().monthlyUsd, 0);
  store.close();
});
test('backoff has three retries, bounded jitter, retry-after priority and deterministic injection', () => {
  assert.equal(retryAfterMs('3'), 3000);
  assert.equal(retryAfterMs('Wed, 30 Sep 2026 12:00:03 GMT', Date.parse('2026-09-30T12:00:00Z')), 3000);
  assert.equal(retryAfterMs('invalid'), undefined);
  const error = runtimeError(Object.assign(new Error('PROVIDER_REQUEST_FAILED'), { retryAfterMs: 3000 }), {
    stderrTail: () => ['429 too many requests'],
  } as any);
  assert.equal(error.message, 'PROVIDER_BUSY');
  assert.equal((error as any).retryAfterMs, 3000);
  assert.equal(RETRY_DELAYS_MS.length, 3);
  assert.equal(
    retryDelay(1, {}, undefined, () => 0),
    1500,
  );
  assert.equal(
    retryDelay(3, {}, undefined, () => 1),
    10000,
  );
  assert.equal(
    retryDelay(1, { retryAfterMs: 9000 }, undefined, () => 0.5),
    9000,
  );
  assert.equal(
    retryDelay(1, {}, [0], () => 0.5),
    0,
  );
});
test('questions accept options or free text and expire on cancellation', async () => {
  const events: RunEvent[] = [];
  const questions = new Questions(e => events.push(e));
  const controller = new AbortController();
  const answer = questions.ask('s', 'question', ['a', 'b'], controller.signal);
  const id = events[0].question!.id;
  questions.respond(id, 'free text');
  assert.equal(await answer, 'free text');
  assert.throws(() => questions.respond(id, 'a'), /APPROVAL_EXPIRED/);
  const pending = questions.ask('s', 'next', [], controller.signal);
  controller.abort();
  assert.equal(await pending, null);
});
test('aborting an approval closes only that pending request', async () => {
  const store = new Store(':memory:');
  const ids: string[] = [];
  const approvals = new Approvals(store, r => {
    if (r) ids.push(r.id);
  });
  const controller = new AbortController();
  const detail = { title: 'test', body: '', privacyClass: 'internal', allowRemember: false };
  const a = approvals.request(approvals.rule('root', 'data', 'a'), detail, controller.signal);
  const b = approvals.request(approvals.rule('root', 'data', 'b'), detail);
  controller.abort();
  assert.equal(await a, false);
  approvals.respond(ids[1], 'once');
  assert.equal(await b, true);
  store.close();
});
