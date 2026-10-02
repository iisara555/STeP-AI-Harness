import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
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
  for (const feature of ['shellByAi', 'mcp', 'autoMerge', 'autopilot', 'lineGateway', 'coordinator', 'cron'] as const)
    assert.equal(defaultValue.features[feature], false);
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
  }
  const parsed = parsePolicy({ hooks: [{ event: 'pre_tool_use', type: 'prompt', prompt: 'Check metadata', block_on_failure: true }] });
  assert.equal(parsed.policy.hooks[0].type, 'prompt');
  assert.equal(parsed.policy.hooks[0].blockOnFailure, true);
});

test('organization rollout example enables both checks without enabling automatic routing or shell', async () => {
  const example = JSON.parse(await readFile(new URL('../policies/organization.json', import.meta.url), 'utf8'));
  const parsed = parsePolicy(example);
  assert.deepEqual(parsed.problems, []);
  assert.deepEqual(parsed.policy.checks, { authority: true, privacy: true });
  assert.equal(parsed.policy.features.autoRouting, false);
  assert.equal(parsed.policy.features.shellByAi, false);
});
