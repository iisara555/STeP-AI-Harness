import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPolicy, parsePolicy } from '../electron/policy';
import { evaluatePermission, sensitivePath, deniedCommand } from '../electron/permissions';

test('credential paths and policy files are denied in every mode, even with an allow rule', () => {
  const p = parsePolicy({
    features: { autoMode: true, shellByAi: true },
    permission: { modes: ['ask', 'plan', 'auto'], pathRules: [{ pattern: '*', allow: true }] },
  }).policy;
  const paths = [
    '.ssh',
    '.ssh/key',
    '.aws/config',
    '.config/gcloud/auth.db',
    '.azure/tokens',
    '.gnupg/key',
    '.docker/config.json',
    '.kube/config',
    '.claude/.credentials.json',
    '.codex/auth.json',
    '.gemini/oauth_creds.json',
    '.anthropic/token',
    '.env.local',
    'keys/a.pfx',
    'desktop-policy.json',
    'C:\\Users\\Employee\\AppData\\Roaming\\@step-cmu\\desktop\\runtimes\\auth.json',
    'C:\\Users\\Employee\\AppData\\Roaming\\STeP Desktop\\runtimes\\auth.json',
  ];
  for (const mode of ['ask', 'plan', 'auto'] as const)
    for (const path of paths)
      assert.match(evaluatePermission({ tool: 'read', readOnly: true, path }, mode, p).reason, /^SENSITIVE_PATH:/, `${mode}: ${path}`);
  assert.ok(sensitivePath('docs/../.ssh/id_rsa'));
});

test('plan permits previews and reads, ask requires consent and auto shell needs an independent flag', () => {
  const p = defaultPolicy();
  assert.equal(evaluatePermission({ tool: 'read', readOnly: true, path: 'notes.md' }, 'plan', p).allowed, true);
  assert.equal(evaluatePermission({ tool: 'write', readOnly: false, path: 'notes.md' }, 'plan', p).allowed, false);
  assert.equal(evaluatePermission({ tool: 'write', readOnly: false }, 'ask', p).requiresConfirmation, true);
  const managed = parsePolicy({ features: { autoMode: true }, permission: { modes: ['ask', 'plan', 'auto'] } }).policy;
  assert.equal(evaluatePermission({ tool: 'write', readOnly: false }, 'auto', managed).requiresConfirmation, false);
  assert.equal(
    evaluatePermission({ tool: 'terminal', readOnly: false, execute: true, command: 'echo ok' }, 'auto', managed).requiresConfirmation,
    true,
  );
  managed.features.shellByAi = true;
  assert.equal(
    evaluatePermission({ tool: 'terminal', readOnly: false, execute: true, command: 'echo ok' }, 'auto', managed).requiresConfirmation,
    false,
  );
});

test('workspace-relative deny rules and denied shell segments take precedence', () => {
  const p = parsePolicy({ permission: { pathRules: [{ pattern: 'restricted/*', allow: false }], deniedCommands: ['deploy *'] } }).policy;
  assert.equal(
    evaluatePermission({ tool: 'read', readOnly: true, path: 'restricted/file.md' }, 'ask', p, { root: '/project' }).allowed,
    false,
  );
  assert.ok(deniedCommand('echo ok; deploy production', p.permission.deniedCommands));
  assert.ok(deniedCommand('echo ok && git push --force origin main', p.permission.deniedCommands));
  assert.equal(
    evaluatePermission({ tool: 'terminal', readOnly: false, execute: true, command: 'cat .ssh/id_rsa' }, 'ask', p).allowed,
    false,
  );
});

test('accept edits writes reviewed files without asking but still asks for commands and external tools', () => {
  const policy = defaultPolicy();
  assert.ok(policy.permission.modes.includes('acceptEdits'), 'available by default, like ask and plan');
  assert.ok(policy.permission.modes.includes('auto'), 'full auto is offered by default, as in other AI apps');
  const root = '/workspace';
  const write = evaluatePermission({ tool: 'write', readOnly: false, path: 'notes.md' }, 'acceptEdits', policy, { root });
  assert.deepEqual([write.allowed, write.requiresConfirmation], [true, false]);
  for (const request of [
    { tool: 'terminal', readOnly: false, execute: true, command: 'echo hi' },
    { tool: 'sandbox', readOnly: false, execute: true, command: 'echo hi' },
    { tool: 'mcp_call', readOnly: false },
  ])
    assert.equal(evaluatePermission(request, 'acceptEdits', policy, { root }).requiresConfirmation, true, request.tool);
  // Floors still apply: denied paths and secrets are refused, not accepted.
  assert.equal(evaluatePermission({ tool: 'write', readOnly: false, path: '.env' }, 'acceptEdits', policy, { root }).allowed, false);
  const denied = parsePolicy({ permission: { pathRules: [{ pattern: 'locked/*', allow: false }] } }).policy;
  assert.equal(evaluatePermission({ tool: 'write', readOnly: false, path: 'locked/a.md' }, 'acceptEdits', denied, { root }).allowed, false);
  // An organization that leaves the mode out falls back to asking.
  const askOnly = parsePolicy({ permission: { modes: ['ask', 'plan'] } }).policy;
  assert.equal(
    evaluatePermission({ tool: 'write', readOnly: false, path: 'notes.md' }, 'acceptEdits', askOnly, { root }).requiresConfirmation,
    true,
  );
});
