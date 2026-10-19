import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaultPolicy, parsePolicy, loadPolicy, policyPath, trustedPolicyPath } from '../electron/policy';

test('managed policy is optional, administrator-only and fail closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-policy-'));
  const path = join(root, 'desktop-policy.json');
  try {
    assert.equal(loadPolicy(path).policy.source, 'default');
    await writeFile(path, JSON.stringify({ features: { shellByAi: true }, permission: { modes: ['ask', 'auto'] } }));
    // A file an administrator does not own is ignored: the defaults apply and nothing it asks for is enabled.
    assert.equal(loadPolicy(path, () => false).policy.source, 'default');
    assert.equal(loadPolicy(path, () => false).policy.features.shellByAi, false);
    if (process.platform === 'win32') assert.equal(trustedPolicyPath(path), false);
    assert.equal(loadPolicy(path, () => true).policy.features.shellByAi, true);
    await writeFile(path, '{broken');
    assert.equal(loadPolicy(path, () => true).policy.source, 'default');
    assert.equal(loadPolicy(path, () => true).policy.features.shellByAi, false);
    assert.equal(loadPolicy(path, () => true).problems.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('auto mode needs both organization feature and allowed mode', () => {
  const defaultValue = defaultPolicy();
  for (const feature of ['shellByAi', 'mcp', 'autoMerge', 'autopilot', 'lineGateway', 'coordinator'] as const)
    assert.equal(defaultValue.features[feature], false);
  assert.equal(defaultValue.features.cron, true);
  assert.equal(defaultValue.features.hybridSkillSelection, true);
  assert.equal(parsePolicy({ features: { hybridSkillSelection: false } }).policy.features.hybridSkillSelection, false);
  // Images reach vision models and Full auto is offered by default, as in other AI apps; commands still need shellByAi.
  assert.equal(defaultValue.features.vision, true);
  assert.equal(defaultValue.features.autoMode, true);
  assert.ok(defaultValue.permission.modes.includes('auto'));
  assert.deepEqual(
    parsePolicy({ features: { autoMode: false }, permission: { modes: ['auto'], defaultMode: 'auto' } }).policy.permission.modes,
    ['ask'],
  );
  const p = parsePolicy({ features: { autoMode: true }, permission: { modes: ['ask', 'plan', 'auto'], defaultMode: 'auto' } });
  assert.equal(p.policy.permission.defaultMode, 'auto');
  assert.deepEqual(p.problems, []);
  assert.equal(policyPath('win32', { ProgramData: 'D:\\Managed' }), 'D:\\Managed\\STeP\\desktop-policy.json');
  assert.equal(policyPath('darwin'), '/Library/Application Support/STeP/desktop-policy.json');
});

test('the release offers Claude developer opt-in while organization policy can disable it', () => {
  assert.equal(defaultPolicy().features.claudeSubscription, false);
  assert.equal(defaultPolicy().features.developmentMode, true);
  assert.equal(parsePolicy({ features: { developmentMode: false } }).policy.features.developmentMode, false);
  const enabled = parsePolicy({ features: { developmentMode: true } });
  assert.deepEqual(enabled.problems, []);
  assert.equal(enabled.policy.features.developmentMode, true);
  assert.equal(enabled.policy.features.claudeSubscription, false);
  const invalid = parsePolicy({ features: { developmentMode: 'true' } });
  assert.ok(invalid.problems.length);
  assert.equal(invalid.policy.features.developmentMode, false);
});

test('release Workspace configuration is public, isolated per load and replaceable by managed policy', () => {
  const first = defaultPolicy();
  assert.equal(first.features.vault, true);
  assert.equal(first.features.googleWorkspace, true);
  assert.deepEqual(first.googleWorkspace?.domains, ['step.cmu.ac.th']);
  assert.deepEqual(first.googleWorkspace?.services, [
    'documents',
    'docs',
    'sheets',
    'slides',
    'drive-read',
    'drive',
    'gmail-read',
    'gmail-draft',
    'gmail-send',
    'gmail-manage',
    'forms',
    'appscript',
    'calendar-read',
    'tasks',
    'calendar',
    'chat',
    'meet',
  ]);
  assert.match(first.googleWorkspace!.clientId, /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/);
  assert.deepEqual(Object.keys(first.googleWorkspace!).sort(), ['clientId', 'domains', 'services']);
  first.googleWorkspace!.domains.push('changed.test');
  first.googleWorkspace!.services.pop();
  assert.deepEqual(defaultPolicy().googleWorkspace?.domains, ['step.cmu.ac.th']);
  assert.equal(defaultPolicy().googleWorkspace?.services.length, 17);
  const replacement = { clientId: 'replacement-client.apps.googleusercontent.com', domains: ['example.test'], services: ['tasks'] };
  assert.deepEqual(parsePolicy({ googleWorkspace: replacement }).policy.googleWorkspace, replacement);
  assert.equal(parsePolicy({ googleWorkspace: null }).policy.googleWorkspace, undefined);
  const disabled = parsePolicy({ features: { vault: false, googleWorkspace: false, developmentMode: false } });
  assert.deepEqual(disabled.problems, []);
  for (const flag of ['vault', 'googleWorkspace', 'developmentMode'] as const) assert.equal(disabled.policy.features[flag], false);
});

test('the Dev mode passcode is stored as a SHA-256 digest only', () => {
  const digest = '03AC674216F3E15C761EE1A5E255F067953623C8B388B4459E13F978D7C846F4';
  const ok = parsePolicy({ developmentPasscodeSha256: digest, features: { developmentMode: true } });
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.policy.developmentPasscodeSha256, digest.toLowerCase());
  assert.equal(defaultPolicy().developmentPasscodeSha256, undefined);
  for (const bad of ['1234', 1234, digest.slice(1)]) assert.ok(parsePolicy({ developmentPasscodeSha256: bad }).problems.length);
});

test('invalid blocking definitions cannot silently enable risky features', () => {
  const cases = [
    null,
    [],
    { permission: { modes: ['ask', 'typo'] } },
    { permission: { pathRules: [{ pattern: '**', allow: 'false' }] } },
    { hooks: [{ event: 'pre_tool_use', type: 'command', command: 'echo ok', blockOnFailure: 'false' }] },
    { features: { shellByAi: 'true' } },
    { prices: { model: { input: Infinity, output: 1 } } },
  ];
  for (const raw of cases) {
    const parsed = parsePolicy(raw && !Array.isArray(raw) ? { ...raw, features: { autoMode: true, ...(raw as any).features } } : raw);
    assert.ok(parsed.problems.length);
    assert.equal(parsed.policy.source, 'default');
    assert.equal(parsed.policy.features.shellByAi, false);
    for (const flag of ['vault', 'googleWorkspace', 'developmentMode'] as const) assert.equal(parsed.policy.features[flag], false);
    assert.equal(parsed.policy.googleWorkspace, undefined);
  }
  const parsed = parsePolicy({ hooks: [{ event: 'pre_tool_use', type: 'prompt', prompt: 'Check metadata', block_on_failure: true }] });
  assert.equal(parsed.policy.hooks[0].type, 'prompt');
  assert.equal(parsed.policy.hooks[0].blockOnFailure, true);
});
