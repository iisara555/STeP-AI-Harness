import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RunTransmission, TRANSMISSION_LIMITS } from '../electron/transmission';
import { Approvals } from '../electron/approvals';
import { Store } from '../electron/store';
import { parsePolicy } from '../electron/policy';

const source = { key: 'files:fixture', label: 'Synthetic folder' };
test('three concurrent reads share one explicit run consent; once never grants a scope', async () => {
  let asks = 0;
  const run = new RunTransmission(
    's',
    'test',
    async () => {},
    () => {},
  );
  const ask = async () => {
    asks++;
    return 'run' as const;
  };
  await Promise.all([1, 2, 3].map(n => run.authorize(n, source, ask)));
  assert.equal(asks, 1);
  assert.equal(run.list()[0].remainingChars, TRANSMISSION_LIMITS.chars - 6);
  assert.equal(run.list()[0].remainingResults, 21);
  const once = new RunTransmission(
    's',
    'test',
    async () => {},
    () => {},
  );
  for (let i = 0; i < 2; i++)
    await once.authorize(1, source, async () => {
      asks++;
      return 'once';
    });
  assert.equal(asks, 3);
  assert.deepEqual(once.list(), []);
});
test('new sources, risk changes, expired or exhausted grants require fresh consent', async () => {
  let now = 0,
    asks = 0;
  const run = new RunTransmission(
    's',
    'test',
    async () => {},
    () => {},
    () => now,
  );
  const ask = async () => {
    asks++;
    return 'run' as const;
  };
  await run.authorize(TRANSMISSION_LIMITS.chars, source, ask);
  await run.authorize(1, source, ask);
  await run.authorize(1, { ...source, key: 'new' }, ask);
  await run.authorize(1, undefined, async scope => {
    assert.equal(scope, undefined);
    asks++;
    return 'once';
  });
  now += TRANSMISSION_LIMITS.ms;
  await run.authorize(1, source, ask);
  assert.equal(asks, 5);
  for (let i = 0; i < 24; i++) await run.authorize(1, source, ask);
  assert.equal(asks, 6);
  run.close();
  await assert.rejects(run.authorize(1, source, ask), /CANCELLED/);
  assert.deepEqual(run.list(), []);
});
test('state changes during a dialog cannot grant or transmit; invalid run answers cannot authorize effects', async () => {
  let changed = false;
  const run = new RunTransmission(
    's',
    'test',
    async () => {
      if (changed) throw new Error('POLICY_CHANGED');
    },
    () => {},
  );
  await assert.rejects(
    run.authorize(1, source, async () => {
      changed = true;
      return 'run';
    }),
    /POLICY_CHANGED/,
  );
  assert.deepEqual(run.list(), []);
  const store = new Store(':memory:');
  let id = '';
  const approvals = new Approvals(store, request => {
    if (request) id = request.id;
  });
  const pending = approvals.request(approvals.rule('', 'terminal', 'x'), {
    title: '',
    body: '',
    allowRemember: true,
    privacyClass: 'internal',
  });
  assert.throws(() => approvals.respond(id, 'run'), /INVALID_INPUT/);
  approvals.respond(id, 'cancel');
  assert.equal(await pending, false);
  assert.equal(store.list('approval').length, 0);
  store.close();
});
test('administrators can force one-time consent; malformed policies fail closed', () => {
  assert.equal(parsePolicy({ transmissionConsent: { allowRunScope: false } }).policy.transmissionConsent?.allowRunScope, false);
  assert.equal(parsePolicy({ transmissionConsent: { allowRunScope: 'yes' } }).problems.length, 1);
});
