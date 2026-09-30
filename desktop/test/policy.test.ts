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
    await writeFile(path, JSON.stringify({ features: { autoMode: true }, permission: { modes: ['ask', 'auto'] } }));
    assert.equal(loadPolicy(path, () => false).policy.features.autoMode, false);
    if (process.platform === 'win32') assert.equal(trustedPolicyPath(path), false);
    assert.equal(loadPolicy(path, () => true).policy.features.autoMode, true);
    await writeFile(path, '{broken');
    assert.equal(loadPolicy(path, () => true).policy.features.autoMode, false);
    assert.equal(loadPolicy(path, () => true).problems.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('auto mode needs both organization feature and allowed mode', () => {
  const defaultValue = defaultPolicy();
  for (const feature of ['autoMode', 'shellByAi', 'mcp', 'autoMerge', 'lineGateway', 'vision', 'coordinator', 'cron'] as const)
    assert.equal(defaultValue.features[feature], false);
  assert.deepEqual(parsePolicy({ permission: { modes: ['auto'], defaultMode: 'auto' } }).policy.permission.modes, ['ask']);
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
    assert.equal(parsed.policy.features.autoMode, false);
  }
  const parsed = parsePolicy({ hooks: [{ event: 'pre_tool_use', type: 'prompt', prompt: 'Check metadata', block_on_failure: true }] });
  assert.equal(parsed.policy.hooks[0].type, 'prompt');
  assert.equal(parsed.policy.hooks[0].blockOnFailure, true);
});
