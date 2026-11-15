import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  WINDOWS_LAUNCHER_HANDOVER,
  applyDistributionUpgrade,
  compareVersions,
  parseVersion,
} from '../src/modules/distribution-upgrade.js';
import { readManifest, writeManifest } from '../src/modules/manifest.js';
import { calculateFileSha256 } from '../src/utils/checksum.js';
import { pathExists } from '../src/utils/file-ops.js';
import { runRollback } from '../src/cli/commands/rollback.js';
import { createSnapshot, listSnapshots } from '../src/modules/recovery.js';

const execFileAsync = promisify(execFile);

async function trackedEntry(path) {
  const data = await readFile(path);
  return {
    sha256: await calculateFileSha256(path),
    size: data.length,
  };
}

test('Version Upgrade Core', async (t) => {
  await t.test('compares semantic versions safely', () => {
    assert.deepEqual(parseVersion('v0.4.0'), [0, 4, 0]);
    assert.equal(compareVersions('0.4.0', '0.3.0'), 1);
    assert.equal(compareVersions('0.3.0', '0.3.0'), 0);
    assert.equal(compareVersions('0.2.9', '0.3.0'), -1);
  });

  await t.test('upgrades distribution while preserving private and locally modified files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'step-version-upgrade-'));
    const source = join(root, 'source');
    const dest = join(root, 'dest');

    try {
      await mkdir(join(source, 'skills', 'common', 'demo'), { recursive: true });
      await mkdir(join(source, 'src'), { recursive: true });
      await mkdir(join(dest, 'skills', 'common', 'demo'), { recursive: true });
      await mkdir(join(dest, 'src'), { recursive: true });
      await mkdir(join(dest, 'output'), { recursive: true });

      await writeFile(join(source, 'package.json'), JSON.stringify({ version: '0.4.0' }), 'utf-8');
      await writeFile(join(source, 'src', 'runtime.js'), 'new runtime', 'utf-8');
      await writeFile(join(source, 'skills', 'common', 'demo', 'SKILL.md'), 'new upstream skill', 'utf-8');
      await writeFile(join(source, 'README.md'), 'new readme', 'utf-8');
      await writeFile(join(source, 'SUPPORT.md'), 'new pilot support', 'utf-8');
      await writeFile(join(source, '.env.example'), 'STEP_BROWSER_CREDENTIAL_REF=step:new', 'utf-8');

      await writeFile(join(dest, 'package.json'), JSON.stringify({ version: '0.3.0' }), 'utf-8');
      await writeFile(join(dest, 'src', 'runtime.js'), 'old runtime', 'utf-8');
      await writeFile(join(dest, 'src', 'obsolete.js'), 'retired runtime', 'utf-8');
      await writeFile(join(dest, 'skills', 'common', 'demo', 'SKILL.md'), 'old upstream skill', 'utf-8');
      await writeFile(join(dest, 'README.md'), 'old readme', 'utf-8');
      await writeFile(join(dest, 'USER.md'), 'private user memory', 'utf-8');
      await writeFile(join(dest, 'MEMORY.md'), 'private working memory', 'utf-8');
      await writeFile(join(dest, 'output', 'work.txt'), 'employee output', 'utf-8');
      await writeFile(join(dest, '.env'), 'STEP_BROWSER_CREDENTIAL_REF=step:local-user', 'utf-8');
      await writeFile(join(dest, '.env.example'), 'STEP_BROWSER_CREDENTIAL_REF=step:old', 'utf-8');

      const skillPath = join(dest, 'skills', 'common', 'demo', 'SKILL.md');
      const manifestFiles = {
        'skills/common/demo/SKILL.md': await trackedEntry(skillPath),
        'src/obsolete.js': await trackedEntry(join(dest, 'src', 'obsolete.js')),
      };
      await writeManifest(dest, {
        package: '@step-cmu/ai-harness',
        version: '0.3.0',
        role: 'all',
        tool: 'codex',
        files: manifestFiles,
      });

      // Local edit after manifest creation must survive the version upgrade.
      await writeFile(skillPath, 'employee local edit', 'utf-8');

      const result = await applyDistributionUpgrade({
        sourceDir: source,
        destDir: dest,
        targetVersion: '0.4.0',
      });

      assert.equal(result.currentVersion, '0.3.0');
      assert.equal(result.targetVersion, '0.4.0');
      assert.ok(result.preserved.includes('skills/common/demo/SKILL.md'));

      assert.equal(JSON.parse(await readFile(join(dest, 'package.json'), 'utf-8')).version, '0.4.0');
      assert.equal(await readFile(join(dest, 'src', 'runtime.js'), 'utf-8'), 'new runtime');
      assert.equal(await readFile(skillPath, 'utf-8'), 'employee local edit');
      assert.equal(await readFile(join(dest, 'USER.md'), 'utf-8'), 'private user memory');
      assert.equal(await readFile(join(dest, 'MEMORY.md'), 'utf-8'), 'private working memory');
      assert.equal(await readFile(join(dest, 'output', 'work.txt'), 'utf-8'), 'employee output');
      assert.equal(await readFile(join(dest, '.env'), 'utf-8'), 'STEP_BROWSER_CREDENTIAL_REF=step:local-user');
      assert.equal(await readFile(join(dest, '.env.example'), 'utf-8'), 'STEP_BROWSER_CREDENTIAL_REF=step:new');
      assert.equal(await pathExists(join(dest, 'src', 'obsolete.js')), false);
      const upgradedManifest = await readManifest(dest);
      assert.equal(upgradedManifest.version, '0.4.0');
      assert.ok(upgradedManifest.files['src/runtime.js']);
      assert.equal(Object.hasOwn(upgradedManifest.files, 'src/obsolete.js'), false);
      assert.ok(await pathExists(join(dest, '.step-ai', 'version-backups', result.versionBackupId)));
      assert.equal(await readFile(join(dest, 'SUPPORT.md'), 'utf-8'), 'new pilot support');

      const snapshot = (await listSnapshots(dest)).find((entry) => entry.snapshotId === result.snapshotId);
      assert.equal(snapshot.versionBackupId, result.versionBackupId);
      await runRollback({ dest, snapshot: result.snapshotId });
      assert.equal(JSON.parse(await readFile(join(dest, 'package.json'), 'utf-8')).version, '0.3.0');
      assert.equal((await readManifest(dest)).version, '0.3.0');
      assert.equal(await readFile(join(dest, 'src/runtime.js'), 'utf-8'), 'old runtime');
      assert.equal(await readFile(join(dest, 'src/obsolete.js'), 'utf-8'), 'retired runtime');
      assert.equal(await pathExists(join(dest, 'SUPPORT.md')), false, 'remove files introduced by the upgrade');
      assert.equal(await readFile(skillPath, 'utf-8'), 'employee local edit');
      assert.equal(await readFile(join(dest, 'USER.md'), 'utf-8'), 'private user memory');
      assert.equal(await readFile(join(dest, 'MEMORY.md'), 'utf-8'), 'private working memory');
      assert.equal(await readFile(join(dest, 'output/work.txt'), 'utf-8'), 'employee output');
      assert.equal(await readFile(join(dest, '.env'), 'utf-8'), 'STEP_BROWSER_CREDENTIAL_REF=step:local-user');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test('moves the update, feedback and privacy launchers into Tools and rolls the move back', async () => {
    const root = await mkdtemp(join(tmpdir(), 'step-version-tools-'));
    const source = join(root, 'source');
    const dest = join(root, 'dest');
    const launchers = ['Update-STeP-AI', 'Feedback-STeP-AI', 'Check-Privacy-STeP-AI'].flatMap((name) => [`${name}.bat`, `${name}.command`]);

    try {
      await mkdir(join(source, 'Tools'), { recursive: true });
      await mkdir(dest, { recursive: true });
      await writeFile(join(source, 'package.json'), JSON.stringify({ version: '0.4.0' }), 'utf-8');
      await writeFile(join(source, 'Install-STeP-AI.bat'), 'new install', 'utf-8');
      for (const name of launchers) await writeFile(join(source, 'Tools', name), `new ${name}`, 'utf-8');

      await writeFile(join(dest, 'package.json'), JSON.stringify({ version: '0.3.0' }), 'utf-8');
      await writeFile(join(dest, 'Install-STeP-AI.bat'), 'old install', 'utf-8');
      for (const name of launchers) await writeFile(join(dest, name), `old ${name}`, 'utf-8');
      // A first install tracks Skills and instructions, not the launchers beside the installer.
      await writeManifest(dest, { package: '@step-cmu/ai-harness', version: '0.3.0', role: 'all', tool: 'codex', files: {} });

      // Windows keeps a hand-over for the launcher that is running (next test); every other system removes all six.
      const result = await applyDistributionUpgrade({ sourceDir: source, destDir: dest, targetVersion: '0.4.0', platform: 'linux' });
      assert.equal(result.removed, launchers.length);
      for (const name of launchers) {
        assert.equal(await pathExists(join(dest, name)), false, `${name} left beside the installer`);
        assert.equal(await readFile(join(dest, 'Tools', name), 'utf-8'), `new ${name}`);
      }
      assert.equal(await readFile(join(dest, 'Install-STeP-AI.bat'), 'utf-8'), 'new install');

      await runRollback({ dest, snapshot: result.snapshotId });
      for (const name of launchers) {
        assert.equal(await readFile(join(dest, name), 'utf-8'), `old ${name}`);
        assert.equal(await pathExists(join(dest, 'Tools', name)), false);
      }
      assert.equal(await readFile(join(dest, 'Install-STeP-AI.bat'), 'utf-8'), 'old install');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test('on Windows the running update launcher becomes a hand-over, removed once Tools starts the update', async () => {
    const root = await mkdtemp(join(tmpdir(), 'step-version-handover-'));
    const dest = join(root, 'dest');
    const release = async (version) => {
      const dir = join(root, `source-${version}`);
      await mkdir(join(dir, 'Tools'), { recursive: true });
      await writeFile(join(dir, 'package.json'), JSON.stringify({ version }), 'utf-8');
      await writeFile(join(dir, 'Tools', 'Update-STeP-AI.bat'), `update ${version}`, 'utf-8');
      await writeFile(join(dir, 'Tools', 'Feedback-STeP-AI.bat'), `feedback ${version}`, 'utf-8');
      return dir;
    };

    try {
      await mkdir(dest, { recursive: true });
      await writeFile(join(dest, 'package.json'), JSON.stringify({ version: '0.3.0' }), 'utf-8');
      await writeFile(join(dest, 'Update-STeP-AI.bat'), 'old update launcher, much longer than the hand-over that replaces it'.repeat(4), 'utf-8');
      await writeFile(join(dest, 'Feedback-STeP-AI.bat'), 'old feedback', 'utf-8');
      await writeManifest(dest, { package: '@step-cmu/ai-harness', version: '0.3.0', role: 'all', tool: 'codex', files: {} });

      // Started by the old launcher beside the installer: it must not disappear under cmd.
      const first = await applyDistributionUpgrade({
        sourceDir: await release('0.4.0'),
        destDir: dest,
        targetVersion: '0.4.0',
        platform: 'win32',
        env: {},
      });
      assert.equal(await readFile(join(dest, 'Update-STeP-AI.bat'), 'utf-8'), WINDOWS_LAUNCHER_HANDOVER);
      assert.equal(await pathExists(join(dest, 'Feedback-STeP-AI.bat')), false, 'a launcher that is not running is removed');
      assert.equal(first.removed, 1);
      assert.match(WINDOWS_LAUNCHER_HANDOVER, /^@"%~dp0Tools\\Update-STeP-AI\.bat"\r\n$/, 'starts the Tools launcher without call');

      // A rollback still brings the old launcher back.
      await runRollback({ dest, snapshot: first.snapshotId });
      assert.match(await readFile(join(dest, 'Update-STeP-AI.bat'), 'utf-8'), /^old update launcher/);

      await applyDistributionUpgrade({ sourceDir: await release('0.4.0'), destDir: dest, targetVersion: '0.4.0', platform: 'win32', env: {} });
      // The next update is started from Tools (directly or through the hand-over), so the hand-over can go.
      const second = await applyDistributionUpgrade({
        sourceDir: await release('0.5.0'),
        destDir: dest,
        targetVersion: '0.5.0',
        platform: 'win32',
        env: { STEP_AI_LAUNCHER: 'tools' },
      });
      assert.equal(await pathExists(join(dest, 'Update-STeP-AI.bat')), false);
      assert.equal(second.removed, 1);
      assert.equal(await readFile(join(dest, 'Tools', 'Update-STeP-AI.bat'), 'utf-8'), 'update 0.5.0');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test('cmd ends quietly when the running launcher is replaced by the hand-over', { skip: process.platform !== 'win32' }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'step-version-cmd-'));
    const launcher = join(root, 'Update-STeP-AI.bat');
    const run = async (script) => {
      // The same shape as the real launcher: lines before, one long-running command, lines after.
      const lines = ['@echo off', ...Array.from({ length: 20 }, (_, i) => `rem padding line ${i} so the file is longer than the hand-over`)];
      await writeFile(launcher, [...lines, `node "${join(root, script)}"`, 'echo AFTER-UPDATE', ''].join('\r\n'), 'utf-8');
      return execFileAsync('cmd.exe', ['/d', '/c', launcher], { cwd: root }).catch((error) => error);
    };

    try {
      await writeFile(join(root, 'handover.js'), `require('fs').writeFileSync(${JSON.stringify(launcher)}, ${JSON.stringify(WINDOWS_LAUNCHER_HANDOVER)});`, 'utf-8');
      await writeFile(join(root, 'remove.js'), `require('fs').rmSync(${JSON.stringify(launcher)});`, 'utf-8');

      const kept = await run('handover.js');
      assert.doesNotMatch(`${kept.stdout}${kept.stderr}`, /cannot be found|AFTER-UPDATE/);
      // The reason for the hand-over: removing the running launcher is what prints the message.
      const removed = await run('remove.js');
      assert.match(`${removed.stdout}${removed.stderr}`, /cannot be found/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test('rejects same or older release package', async () => {
    const root = await mkdtemp(join(tmpdir(), 'step-version-reject-'));
    const source = join(root, 'source');
    const dest = join(root, 'dest');
    try {
      await mkdir(source, { recursive: true });
      await mkdir(dest, { recursive: true });
      await writeFile(join(source, 'package.json'), JSON.stringify({ version: '0.3.0' }), 'utf-8');
      await writeFile(join(dest, 'package.json'), JSON.stringify({ version: '0.3.0' }), 'utf-8');

      await assert.rejects(
        applyDistributionUpgrade({ sourceDir: source, destDir: dest }),
        /requires a newer version/
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test('real upgrade-apply --version upgrades, refreshes support and supports CLI rollback', async () => {
    const dest = await mkdtemp(join(tmpdir(), 'step-upgrade-cli-'));
    const cli = resolve('bin/step-ai.js');
    const version = JSON.parse(await readFile('package.json', 'utf-8')).version;
    try {
      await writeFile(join(dest, 'package.json'), JSON.stringify({version:'0.1.0'}));
      await writeFile(join(dest, 'SUPPORT.md'), 'previous support');
      await writeFile(join(dest, 'USER.md'), 'private CLI user');
      await writeManifest(dest, {version:'0.1.0',role:'all',tool:'codex',files:{
        'SUPPORT.md': await trackedEntry(join(dest, 'SUPPORT.md')),
      }});
      const { stdout } = await execFileAsync(process.execPath, [cli, 'upgrade-apply', '--dest', dest, '--version', version]);
      assert.ok(stdout.includes('Apply Version Upgrade'));
      assert.equal(JSON.parse(await readFile(join(dest, 'package.json'))).version, version);
      assert.equal((await readManifest(dest)).version, version);
      assert.equal(await readFile(join(dest, 'SUPPORT.md'), 'utf-8'), await readFile('SUPPORT.md', 'utf-8'));
      const [snapshot] = await listSnapshots(dest);
      await execFileAsync(process.execPath, [cli, 'rollback', '--dest', dest, '--snapshot', snapshot.snapshotId]);
      assert.equal(JSON.parse(await readFile(join(dest, 'package.json'))).version, '0.1.0');
      assert.equal((await readManifest(dest)).version, '0.1.0');
      assert.equal(await readFile(join(dest, 'SUPPORT.md'), 'utf-8'), 'previous support');
      assert.equal(await readFile(join(dest, 'USER.md'), 'utf-8'), 'private CLI user');
    } finally {
      await rm(dest, {recursive:true,force:true});
    }
  });

  await t.test('legacy cross-version snapshot refuses partial rollback and snapshots do not overwrite each other', async () => {
    const dest = await mkdtemp(join(tmpdir(), 'step-rollback-legacy-'));
    try {
      await writeFile(join(dest, 'package.json'), JSON.stringify({version:'0.7.3'}));
      await writeFile(join(dest, 'README.md'), 'original');
      await writeManifest(dest, {version:'0.7.2',files:{'README.md':await trackedEntry(join(dest, 'README.md'))}});
      const first = await createSnapshot(dest, 'pre-version-upgrade-v0.7.3');
      await writeFile(join(dest, 'README.md'), 'second');
      const second = await createSnapshot(dest, 'manual');
      assert.notEqual(first, second);
      assert.equal(await readFile(join(dest, '.step-ai/backups', first, 'files/README.md'), 'utf-8'), 'original');
      await assert.rejects(runRollback({dest,snapshot:first}), /cannot restore/);
      await assert.rejects(runRollback({dest,snapshot:second}), /cannot restore/);
      assert.equal(await readFile(join(dest, 'README.md'), 'utf-8'), 'second');
      assert.equal(JSON.parse(await readFile(join(dest, 'package.json'))).version, '0.7.3');
    } finally {
      await rm(dest, {recursive:true,force:true});
    }
  });
});
