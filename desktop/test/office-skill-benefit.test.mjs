import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, cp, readdir, copyFile, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  selectProfile,
  listProfiles,
  outsideRepo,
  runtimeEnv,
  containsPath,
  resolvedDestination,
  parseArgs,
  parsePriorCalls,
} from '../eval/office-skill-benefit/config.mjs';
import { Budget } from '../eval/office-skill-benefit/budget.mjs';
import { safeSummary } from '../eval/office-skill-benefit/summary.mjs';

test('reads only subscription connection metadata without altering Desktop database', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-profile-test-'));
  try {
    const dbPath = join(dir, 'workspace.sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec('CREATE TABLE records(kind TEXT,id TEXT,value TEXT)');
    const insert = db.prepare('INSERT INTO records VALUES(?,?,?)');
    insert.run(
      'connection',
      'account-1',
      JSON.stringify({ id: 'account-1', provider: 'openai', mode: 'subscription', name: 'Private account name' }),
    );
    insert.run('connection', 'api-account', JSON.stringify({ id: 'api-account', provider: 'openai', mode: 'api' }));
    insert.run('secret', 'secret-test', JSON.stringify('DO_NOT_READ_THIS_TEST_SECRET'));
    db.close();
    await mkdir(join(dir, 'runtimes', 'account-1'), { recursive: true });
    const before = await readFile(dbPath);
    const rows = listProfiles(dir);
    assert.deepEqual(rows, [{ number: 1, id: 'account-1', profile: join(dir, 'runtimes', 'account-1') }]);
    assert.deepEqual(await readFile(dbPath), before);
    assert.equal(JSON.stringify(rows).includes('Private account name'), false);
    assert.equal(JSON.stringify(rows).includes('DO_NOT_READ_THIS_TEST_SECRET'), false);
    assert.equal(selectProfile(rows, '1'), rows[0].profile);
    assert.throws(() => selectProfile(rows, '2'), /CONNECTION_NOT_FOUND/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('rejects a connection id that escapes its runtime directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-profile-test-'));
  try {
    const db = new DatabaseSync(join(dir, 'workspace.sqlite'));
    db.exec('CREATE TABLE records(kind TEXT,id TEXT,value TEXT)');
    db.prepare('INSERT INTO records VALUES(?,?,?)').run(
      'connection',
      '../../escape',
      JSON.stringify({ provider: 'openai', mode: 'subscription' }),
    );
    db.close();
    assert.throws(() => listProfiles(dir), /INVALID_CONNECTION_ID/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('rejects outputs in source checkout and permits a sibling with a similar name', () => {
  const repo = join(tmpdir(), 'step-output-fixture');
  const sibling = join(tmpdir(), 'step-output-fixture-results');
  assert.throws(() => outsideRepo(join(repo, 'results'), repo), /OUTPUT_MUST_BE_OUTSIDE_REPO/);
  assert.throws(() => outsideRepo(repo, repo), /OUTPUT_MUST_BE_OUTSIDE_REPO/);
  assert.equal(outsideRepo(sibling, repo), sibling);
});
test('runtime uses the selected Desktop OAuth profile and excludes inherited API keys', () => {
  const env = runtimeEnv('/tmp/selected-profile', {
    PATH: '/bin',
    OPENAI_API_KEY: 'private-test-key',
    CODEX_HOME: '/tmp/other',
    HOME: '/tmp/personal',
    HTTPS_PROXY: 'http://test-proxy',
  });
  assert.equal(env.CODEX_HOME, '/tmp/selected-profile');
  assert.equal(env.HOME, '/tmp/selected-profile');
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.HTTPS_PROXY, 'http://test-proxy');
});
test('resolves an aliased output before writing and recognizes dot-prefixed children', async () => {
  // macOS temporary directories can be aliases under /var of /private/var.
  // The runner canonicalizes its repo before comparing it with the output.
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'step-destination-test-')));
  try {
    await mkdir(join(dir, 'repo'));
    await symlink(join(dir, 'repo'), join(dir, 'alias'), 'junction');
    const destination = resolvedDestination(join(dir, 'alias', 'new', 'result'));
    assert.throws(() => outsideRepo(destination, join(dir, 'repo')), /OUTPUT_MUST_BE_OUTSIDE_REPO/);
    assert.throws(() => outsideRepo(resolvedDestination(join(dir, 'alias')), join(dir, 'repo')), /OUTPUT_MUST_BE_OUTSIDE_REPO/);
    assert.equal(outsideRepo(resolvedDestination(join(dir, 'repo-results')), join(dir, 'repo')), join(dir, 'repo-results'));
    assert.equal(containsPath(join(dir, 'repo'), join(dir, 'repo', '..hidden')), true);
    assert.equal(containsPath(join(dir, 'repo'), join(dir, 'repo-results')), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('persists reserved calls before execution and blocks the nineteenth call after reopening', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-budget-test-'));
  try {
    let b = await Budget.open(dir, { 'gpt-6-astra': 2 });
    assert.equal(b.calls('gpt-6-astra'), 2);
    for (let n = 0; n < 16; n++) await b.reserve('gpt-6-astra', 'trial-' + n);
    b = await Budget.open(dir);
    assert.equal(b.calls('gpt-6-astra'), 18);
    await assert.rejects(b.reserve('gpt-6-astra', 'extra'), /EVAL_QUOTA_BOUND/);
    assert.equal(b.data.inFlight.trial, 'trial-15');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('usage admission threshold persists and finished trials are not silently rerun', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-budget-test-'));
  try {
    let b = await Budget.open(dir);
    await b.reserve('example-model', 'paired-case');
    await b.usage('example-model', 120000);
    await b.finish('paired-case', { status: 'review' });
    b = await Budget.open(dir);
    assert.equal(b.hasTrial('paired-case'), true);
    assert.equal(b.data.inFlight, undefined);
    await assert.rejects(b.reserve('example-model', 'next'), /EVAL_QUOTA_BOUND/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('serializes simultaneous usage writes without losing reserved calls', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-budget-test-'));
  try {
    const b = await Budget.open(dir);
    await b.reserve('example-model', 'one');
    await Promise.all(Array.from({ length: 20 }, () => b.usage('example-model', 100)));
    const restored = await Budget.open(dir);
    assert.equal(restored.tokens('example-model'), 2000);
    assert.equal(restored.calls('example-model'), 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('shareable summary excludes outputs, file paths, identity fields and tool results', () => {
  const report = {
    source: { head: 'a'.repeat(40), trackedChanges: false },
    totalModelCalls: 1,
    cumulativeAdmittedCalls: { 'example-model': 1 },
    trials: [
      {
        model: 'example-model',
        task: 'xlsx',
        arm: 'with-skill',
        status: 'review',
        modelCalls: 1,
        verified: { artifactVerified: true },
        output: 'private-example-output',
        workspace: '/Users/private-test-user/results',
        requests: [{ result: 'private-test-result' }],
        email: 'private-test@example.invalid',
      },
    ],
  };
  const text = JSON.stringify(safeSummary(report));
  for (const hidden of ['private-example-output', 'private-test-user', 'private-test-result', 'private-test@example.invalid'])
    assert.equal(text.includes(hidden), false);
  assert.equal(safeSummary(report).trials[0].artifactVerified, true);
  assert.equal(safeSummary(report).modelBenefitEstablished, false);
});

test('fresh users have zero reserved calls, and an existing budget cannot be reseeded', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-budget-test-'));
  try {
    const b = await Budget.open(dir);
    assert.equal(b.calls('gpt-6-astra'), 0);
    await assert.rejects(Budget.open(dir, { 'gpt-6-astra': 2 }), /PRIOR_CALLS_MUST_MATCH_EXISTING_LEDGER/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('parses explicit prior calls without accepting malformed counts or duplicate models', () => {
  assert.deepEqual(parsePriorCalls('gpt-6-astra=2,another-model=1'), { 'gpt-6-astra': 2, 'another-model': 1 });
  for (const value of ['gpt-6-astra=-1', 'gpt-6-astra=2.5', 'gpt-6-astra=19', 'gpt-6-astra=1,gpt-6-astra=2', 'bad/path=1'])
    assert.throws(() => parsePriorCalls(value), /INVALID_PRIOR_CALLS/);
  assert.throws(() => parseArgs(['--probe', '--live']), /CHOOSE_ONE_MODE/);
  assert.equal(parseArgs(['--prior-calls', 'gpt-6-astra=2'])['--prior-calls'], 'gpt-6-astra=2');
});
test('controlled RPC runs both arms through real Office tools and resumes without new model turns', { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-office-loop-test-'));
  try {
    const repo = fileURLToPath(new URL('../..', import.meta.url));
    const kit = join(dir, 'kit'),
      profile = join(dir, 'profile'),
      output = join(dir, 'output');
    await cp(new URL('../eval/office-skill-benefit/', import.meta.url), kit, { recursive: true });
    await mkdir(profile);
    await copyFile(new URL('./fixtures/office-eval-rpc.mjs', import.meta.url), join(kit, 'guarded-codex.mjs'));
    const run = () =>
      spawnSync(process.execPath, [join(kit, 'eval.mjs'), '--repo', repo, '--profile', profile, '--output', output, '--live'], {
        encoding: 'utf8',
        timeout: 45000,
      });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const folders = (await readdir(output)).filter(name => name.startsWith('live-'));
    const report = JSON.parse(await readFile(join(output, folders[0], 'report.json'), 'utf8'));
    assert.equal(report.trials.length, 6);
    assert.equal(
      report.totalModelCalls,
      12,
      JSON.stringify(
        report.trials.map(t => ({
          task: t.task,
          arm: t.arm,
          status: t.status,
          code: t.code,
          calls: t.modelCalls,
          verified: t.verified,
          tools: t.requests.map(r => ({ tool: r.tool, error: r.error })),
        })),
      ),
    );
    assert.equal(report.trials.filter(t => t.verified.artifactVerified === true).length, 4);
    assert.ok(report.trials.every(t => t.status === 'review'));
    assert.equal(report.modelBenefitEstablished, false);
    const second = run();
    assert.equal(second.status, 0, second.stderr);
    const ledger = JSON.parse(await readFile(join(output, 'budget.json'), 'utf8'));
    assert.equal(ledger.modelCalls['mock-office'], 12);
    assert.equal(Object.keys(ledger.trials).length, 6);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('host review consent still blocks credential-shaped data before model execution', async () => {
  const { Store } = await import('../electron/store.ts');
  const { WorkService } = await import('../electron/service.ts');
  const { evaluatePrivacyGate } = await import('../../src/modules/privacy/index.js');
  const store = new Store(':memory:');
  let modelCalls = 0;
  try {
    const session = store.create('synthetic-connection', 'cc');
    const service = new WorkService(
      store,
      { privacy: evaluatePrivacyGate },
      async () => {
        modelCalls++;
        throw new Error('RUNTIME_SHOULD_NOT_START');
      },
      () => {},
    );
    await assert.rejects(
      service.run(session.id, 'password: synthetic-credential-fixture', '', true, undefined, 'chat'),
      /PRIVACY_REVIEW_REQUIRED/,
    );
    assert.equal(modelCalls, 0);
  } finally {
    store.close();
  }
});
