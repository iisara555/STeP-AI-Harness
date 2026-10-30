import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPolicy, parsePolicy } from '../electron/policy';
import { evaluatePermission, sensitivePath, deniedCommand, allowedCommand, allowedDomain } from '../electron/permissions';

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

test('scoped allowedCommands and allowedDomains work only after sensitive/denied floors and reject shell chaining', () => {
  const parsed = parsePolicy({
    permission: {
      modes: ['ask', 'plan', 'auto'],
      allowedCommands: ['npm test', 'git status*', 'npx prettier *'],
      allowedDomains: ['docs.step.cmu.ac.th', 'example.org'],
      deniedCommands: ['npm test --watch*'],
    },
  });
  assert.deepEqual(parsed.problems, []);
  const policy = parsed.policy;
  assert.equal(allowedCommand('npm test', policy.permission.allowedCommands), 'npm test');
  assert.equal(allowedCommand('git status --short', policy.permission.allowedCommands), 'git status*');
  assert.equal(allowedCommand('git status -- "docs/สรุปผล.md"', policy.permission.allowedCommands), 'git status*');
  assert.equal(allowedCommand('npx prettier --check "src/**/*.ts"', policy.permission.allowedCommands), 'npx prettier *');
  // Any shell chaining, pipe, redirection, subexpression or grouping is rejected even if the prefix matches.
  // PowerShell, which runs terminal commands on Windows, evaluates `(...)` and `@(...)` inside an argument.
  for (const chained of [
    'npm test; whoami',
    'npm test && echo pwned',
    'npm test | cat',
    'npm test > out.txt',
    'npm test $(id)',
    'git status (Remove-Item -Recurse -Force src)',
    'git status @(whoami)',
    'git status {whoami}',
    'git status whoami',
  ])
    assert.equal(allowedCommand(chained, policy.permission.allowedCommands), undefined, chained);
  assert.deepEqual(
    evaluatePermission(
      { tool: 'terminal', readOnly: false, execute: true, command: 'git status (Remove-Item -Recurse -Force src)' },
      'ask',
      policy,
    ),
    { allowed: true, requiresConfirmation: true, reason: 'ask mode' },
  );
  assert.deepEqual(evaluatePermission({ tool: 'terminal', readOnly: false, execute: true, command: 'npm test' }, 'ask', policy), {
    allowed: true,
    requiresConfirmation: false,
    reason: 'allowed command',
  });
  // Plan mode still blocks execution even for allowedCommands.
  assert.equal(
    evaluatePermission({ tool: 'terminal', readOnly: false, execute: true, command: 'npm test' }, 'plan', policy).allowed,
    false,
  );
  // Denied commands and sensitive path tokens still take precedence over allowedCommands.
  assert.equal(
    evaluatePermission({ tool: 'terminal', readOnly: false, execute: true, command: 'npm test --watch' }, 'ask', policy).allowed,
    false,
  );
  assert.equal(
    evaluatePermission({ tool: 'terminal', readOnly: false, execute: true, command: 'npx prettier .env' }, 'ask', policy).allowed,
    false,
  );
  // Domain allowlist matches exact domain and subdomains, rejecting unrelated domains.
  assert.equal(allowedDomain('docs.step.cmu.ac.th', policy.permission.allowedDomains), 'docs.step.cmu.ac.th');
  assert.equal(allowedDomain('api.docs.step.cmu.ac.th:443', policy.permission.allowedDomains), 'docs.step.cmu.ac.th');
  assert.equal(allowedDomain('evilstep.cmu.ac.th', policy.permission.allowedDomains), undefined);
  // Policy parser rejects shell operators in allowedCommands and malformed domains in allowedDomains.
  assert.ok(parsePolicy({ permission: { allowedCommands: ['npm test; rm -rf /'] } }).problems.length > 0);
  assert.ok(parsePolicy({ permission: { allowedDomains: ['.invalid.com'] } }).problems.length > 0);
});
