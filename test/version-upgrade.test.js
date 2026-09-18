import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyDistributionUpgrade,
  compareVersions,
  parseVersion,
} from '../src/modules/distribution-upgrade.js';
import { writeManifest } from '../src/modules/manifest.js';
import { calculateFileSha256 } from '../src/utils/checksum.js';
import { pathExists } from '../src/utils/file-ops.js';

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
      await writeFile(join(source, '.env.example'), 'STEP_BROWSER_CREDENTIAL_REF=step:new', 'utf-8');

      await writeFile(join(dest, 'package.json'), JSON.stringify({ version: '0.3.0' }), 'utf-8');
      await writeFile(join(dest, 'src', 'runtime.js'), 'old runtime', 'utf-8');
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
      assert.ok(await pathExists(join(dest, '.step-ai', 'version-backups', result.versionBackupId)));
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
});
