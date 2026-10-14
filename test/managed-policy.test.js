import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trustedManagedPolicyPath, readManagedPolicy } from '../src/utils/managed-policy.js';

test('Windows policy checking runs the complete ACL script with system modules and retains trust denials', {
  skip: process.platform !== 'win32',
}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'step-managed-policy-'));
  const file = join(root, "desktop ' policy.json");
  const poisonedModules = join(root, 'incompatible-modules');
  const moduleFolder = join(poisonedModules, 'Microsoft.PowerShell.Security');
  await mkdir(moduleFolder, { recursive: true });
  await writeFile(join(moduleFolder, 'Microsoft.PowerShell.Security.psd1'), "@{ ModuleVersion='1.0'; PowerShellVersion='99.0'; RootModule='incompatible.psm1'; FunctionsToExport=@('Get-Acl') }");
  await writeFile(join(moduleFolder, 'incompatible.psm1'), "function Get-Acl { throw 'incompatible module must not load' }");
  await writeFile(file, JSON.stringify({ marker: 'synthetic-policy' }));
  const secure = 'O:BAG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FRFX;;;BU)';
  let fileAcl = secure;
  let directoryAcl = secure;
  let fixtureAcls = false;
  let nativeError = '';
  const execute = childProcess.execFileSync;
  const previousModules = process.env.PSModulePath;
  process.env.PSModulePath = [poisonedModules, previousModules].filter(Boolean).join(';');
  // Exercise the production script in real Windows PowerShell. Only ACL data is synthetic:
  // a non-elevated test cannot assign an administrator owner to its temporary directory.
  t.mock.method(childProcess, 'execFileSync', (executable, args, options) => {
    if (executable !== 'powershell.exe') return execute(executable, args, options);
    if (!fixtureAcls) {
      try {
        return execute(executable, args, options);
      } catch (error) {
        nativeError = error.stderr?.toString().trim() || '';
        throw error;
      }
    }
    const prefix = `$ErrorActionPreference = 'Stop'
# Force actual built-in module loading before substituting controlled ACL metadata.
Get-Acl -LiteralPath $env:STEP_POLICY_CHECK_PATH | Out-Null
function Get-Acl {
  param([string]$LiteralPath)
  $acl = New-Object System.Security.AccessControl.DirectorySecurity
  $descriptor = if ($LiteralPath -eq $env:STEP_POLICY_FIXTURE_FILE) { $env:STEP_POLICY_FIXTURE_FILE_ACL } else { $env:STEP_POLICY_FIXTURE_DIR_ACL }
  $acl.SetSecurityDescriptorSddlForm($descriptor)
  return $acl
}

`;
    const nextArgs = [...args];
    const nextOptions = {
      ...options,
      env: {
        ...options.env,
        STEP_POLICY_FIXTURE_FILE: file,
        STEP_POLICY_FIXTURE_FILE_ACL: fileAcl,
        STEP_POLICY_FIXTURE_DIR_ACL: directoryAcl,
      },
    };
    const command = nextArgs.indexOf('-Command') + 1;
    if (nextArgs[command] === '-') nextOptions.input = prefix + options.input;
    else nextArgs[command] = prefix + nextArgs[command];
    return execute(executable, nextArgs, nextOptions);
  });
  syncBuiltinESMExports();
  try {
    assert.equal(trustedManagedPolicyPath(file), false, 'a real user-owned temporary policy is denied');
    assert.equal(nativeError, '', 'the native ACL check must not fail to load its Windows module');
    fixtureAcls = true;
    assert.equal(trustedManagedPolicyPath(file), true, 'a protected policy must not lock employee login');
    assert.deepEqual(readManagedPolicy(file), { marker: 'synthetic-policy' });
    fileAcl = 'O:BUG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FRFX;;;BU)';
    assert.equal(trustedManagedPolicyPath(file), false, 'ordinary-user file ownership remains denied');
    fileAcl = secure;
    directoryAcl = 'O:BUG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FRFX;;;BU)';
    assert.equal(trustedManagedPolicyPath(file), false, 'ordinary-user directory ownership remains denied');
    directoryAcl = secure;
    fileAcl = 'O:BAG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FA;;;BU)';
    assert.equal(trustedManagedPolicyPath(file), false, 'ordinary-user file writes remain denied');
    assert.deepEqual(readManagedPolicy(file), {}, 'an untrusted document is not loaded');
    fileAcl = secure;
    directoryAcl = 'O:BAG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FA;;;BU)';
    assert.equal(trustedManagedPolicyPath(file), false, 'replaceable policy directories remain denied');
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    if (previousModules === undefined) delete process.env.PSModulePath;
    else process.env.PSModulePath = previousModules;
    await rm(root, { recursive: true, force: true });
  }
});
