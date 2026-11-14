import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PACKAGE_ROOT } from '../src/modules/role-resolver.js';

const run = (...args) => promisify(execFile)(process.execPath, [join(PACKAGE_ROOT, 'bin', 'step-ai.js'), ...args], { env: { ...process.env, NO_COLOR: '1' } });

test('bare step-ai shows the staff commands only and points admins to help --all', async () => {
  for (const args of [[], ['--help'], ['help']]) {
    const { stdout } = await run(...args);
    assert.match(stdout, /สำหรับพนักงาน:/);
    for (const command of ['ask', 'privacy', 'output', 'config', 'update', 'doctor', 'feedback']) assert.match(stdout, new RegExp(`\\n  ${command} `));
    assert.doesNotMatch(stdout, /^สำหรับผู้ดูแลระบบ:/m);
    assert.doesNotMatch(stdout, /\n {2}autopilot /);
    assert.match(stdout, /step-ai help --all/);
    assert.ok(stdout.trim().split('\n').length <= 32, 'staff help fits one screen');
  }
});

test('help --all adds the admin commands and options', async () => {
  const { stdout } = await run('help', '--all');
  assert.match(stdout, /สำหรับพนักงาน:/);
  assert.match(stdout, /^สำหรับผู้ดูแลระบบ:/m);
  for (const command of ['init', 'teams', 'skills', 'status', 'sync', 'rollback', 'benchmark', 'run', 'autopilot']) assert.match(stdout, new RegExp(`\\n  ${command} `));
  assert.doesNotMatch(stdout, /คำสั่งสำหรับผู้ดูแลระบบ: step-ai help --all/);
});
