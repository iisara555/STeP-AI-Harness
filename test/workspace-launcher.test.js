import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DISTRIBUTION_FILES } from '../src/modules/distribution-upgrade.js';
import { PACKAGE_ROOT } from '../src/modules/role-resolver.js';

// AI apps run the Router through these launchers. Employee machines usually
// have no Node.js on PATH: the installer puts it under .step-ai/runtime, so a
// bare `step-ai` fails and every task would run outside the Router.

const POSIX = process.platform !== 'win32';
const NO_NODE_PATH = '/usr/bin:/bin';

async function fakeWorkspace() {
  const root = await mkdtemp(join(tmpdir(), 'step-launcher-'));
  await copyFile(join(PACKAGE_ROOT, 'step-ai'), join(root, 'step-ai'));
  await mkdir(join(root, 'bin'));
  // A stand-in CLI that reports which interpreter ran it and with what.
  await writeFile(join(root, 'bin', 'step-ai.js'),
    'console.log(JSON.stringify({ runtime: process.env.STEP_TEST_RUNTIME || "other", args: process.argv.slice(2) }));\n');
  return root;
}

test('sh launcher prefers the Node.js runtime installed with the bundle', { skip: !POSIX }, async () => {
  const root = await fakeWorkspace();
  try {
    const runtimeBin = join(root, '.step-ai', 'runtime', 'node', 'bin');
    await mkdir(runtimeBin, { recursive: true });
    // A wrapper that marks itself, so the test proves which interpreter ran.
    await writeFile(join(runtimeBin, 'node'), `#!/bin/sh\nSTEP_TEST_RUNTIME=bundled exec "${process.execPath}" "$@"\n`);
    await chmod(join(runtimeBin, 'node'), 0o755);
    const out = execFileSync('sh', ['./step-ai', 'ask', 'ช่วยแปลเป็นภาษาอังกฤษ', '--json'], {
      cwd: root, encoding: 'utf8', env: { PATH: NO_NODE_PATH },
    });
    const report = JSON.parse(out);
    assert.equal(report.runtime, 'bundled');
    assert.deepEqual(report.args, ['ask', 'ช่วยแปลเป็นภาษาอังกฤษ', '--json'], 'Thai arguments must pass through intact');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('sh launcher falls back to Node.js on PATH and runs without an exec bit', { skip: !POSIX }, async () => {
  const root = await fakeWorkspace();
  try {
    // An update that copies files may drop the exec bit; `sh ./step-ai` must not care.
    await chmod(join(root, 'step-ai'), 0o644);
    const out = execFileSync('sh', ['./step-ai', '--version'], {
      cwd: root, encoding: 'utf8', env: { PATH: `${dirname(process.execPath)}:${NO_NODE_PATH}` },
    });
    assert.deepEqual(JSON.parse(out).args, ['--version']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('sh launcher explains itself when no runtime exists', { skip: !POSIX || ['/opt/homebrew/bin/node', '/usr/local/bin/node'].some(existsSync) }, async () => {
  const root = await fakeWorkspace();
  try {
    const run = spawnSync('sh', ['./step-ai', 'ask', 'x'], { cwd: root, encoding: 'utf8', env: { PATH: NO_NODE_PATH } });
    assert.equal(run.status, 127);
    assert.match(run.stderr, /Install-STeP-AI|Update-STeP-AI/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the real launcher routes a request end to end', { skip: !POSIX }, () => {
  const out = execFileSync('sh', ['./step-ai', 'ask', 'ช่วยแปลเป็นภาษาอังกฤษ', '--json'], {
    cwd: PACKAGE_ROOT, encoding: 'utf8', env: { ...process.env, PATH: `${dirname(process.execPath)}:${NO_NODE_PATH}` },
  });
  assert.equal(JSON.parse(out).routing.mode, 'GENERAL');
});

test('Windows launcher resolves the bundled runtime first and keeps CRLF', async () => {
  const raw = await readFile(join(PACKAGE_ROOT, 'step-ai.cmd'), 'utf8');
  assert.ok(!/[^\r]\n/.test(raw), 'every line must end in CRLF for cmd.exe');
  const bundled = raw.indexOf('.step-ai\\runtime\\node\\node.exe');
  const onPath = raw.indexOf('where node');
  assert.ok(bundled > 0 && onPath > bundled, 'bundled runtime must be tried before PATH');
  assert.match(raw, /"%STEP_NODE%" "%STEP_ROOT%bin\\step-ai\.js" %\*/);
  assert.match(raw, /exit \/b %ERRORLEVEL%/);
});

test('launchers ship in the package, the ZIP and version upgrades', async () => {
  const pkg = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  const bundler = await readFile(join(PACKAGE_ROOT, 'scripts', 'build_pilot_bundle.py'), 'utf8');
  for (const name of ['step-ai', 'step-ai.cmd']) {
    assert.ok(pkg.files.includes(name), `package.json files omits ${name}`);
    assert.ok(bundler.includes(`"${name}"`), `Pilot bundle omits ${name}`);
    assert.ok(DISTRIBUTION_FILES.includes(name), `version upgrade omits ${name}`);
  }
  assert.match(bundler, /str_arc == 'step-ai'/, 'the sh launcher must be packed executable');
});
