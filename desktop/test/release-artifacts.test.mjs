import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { refreshStapledDmg, releaseManifest, verifyReleaseManifest } from '../scripts/release-artifacts.mjs';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const { version } = require('../package.json');
const commit = 'a'.repeat(40);
const windowsInstaller = `STeP-Desktop-Setup-${version}.exe`;
const macDmg = `STeP-Desktop-${version}-arm64.dmg`;
const macZip = `STeP-Desktop-${version}-arm64.zip`;

async function writeFeed(directory, feed, installers) {
  const files = await Promise.all(
    installers.map(async url => {
      const data = await readFile(join(directory, url));
      return { url, size: data.length, sha512: createHash('sha512').update(data).digest('base64') };
    }),
  );
  await writeFile(join(directory, feed), yaml.dump({ version, files, path: files[0].url, sha512: files[0].sha512 }));
}

async function fixture(feed, installers) {
  const directory = await mkdtemp(join(tmpdir(), 'step-release-artifacts-'));
  for (const filename of installers) {
    await writeFile(join(directory, filename), 'synthetic installer ' + filename);
    await writeFile(join(directory, filename + '.blockmap'), 'synthetic blockmap');
  }
  await writeFeed(directory, feed, installers);
  return directory;
}

test('publisher accepts the checked Windows artifact and rejects a replaced installer even if its feed is rewritten', async t => {
  const directory = await fixture('latest.yml', [windowsInstaller]);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = await releaseManifest('windows-x64', directory, commit);
  await verifyReleaseManifest('windows-x64', directory, commit, manifest);
  await appendFile(join(directory, windowsInstaller), 'different content');
  await assert.rejects(releaseManifest('windows-x64', directory, commit), /checksum|does not match/);
  await writeFeed(directory, 'latest.yml', [windowsInstaller]);
  await assert.rejects(verifyReleaseManifest('windows-x64', directory, commit, manifest), /differ from the checked artifact/);
});

test('publisher rejects a changed blockmap, a different commit, and unexpected files', async t => {
  const directory = await fixture('latest.yml', [windowsInstaller]);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = await releaseManifest('windows-x64', directory, commit);
  await assert.rejects(verifyReleaseManifest('windows-x64', directory, 'b'.repeat(40), manifest), /differ from the checked artifact/);
  await appendFile(join(directory, windowsInstaller + '.blockmap'), 'changed');
  await assert.rejects(verifyReleaseManifest('windows-x64', directory, commit, manifest), /differ from the checked artifact/);
  await writeFile(join(directory, 'extra.exe'), 'extra file');
  await assert.rejects(verifyReleaseManifest('windows-x64', directory, commit, manifest), /Unexpected files/);
});

test('refreshing the stapled Mac DMG updates its blockmap and leaves the ZIP update target intact', async t => {
  const directory = await fixture('latest-mac.yml', [macZip, macDmg]);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const before = await releaseManifest('macos-arm64', directory, commit);
  await appendFile(join(directory, macDmg), 'synthetic notarization ticket');
  await assert.rejects(releaseManifest('macos-arm64', directory, commit), /does not match/);
  await refreshStapledDmg(directory);
  const after = await releaseManifest('macos-arm64', directory, commit);
  assert.notEqual(before.files.find(file => file.name === macDmg)?.sha256, after.files.find(file => file.name === macDmg)?.sha256);
  assert.notEqual(
    before.files.find(file => file.name === macDmg + '.blockmap')?.sha256,
    after.files.find(file => file.name === macDmg + '.blockmap')?.sha256,
  );
  assert.deepEqual(
    before.files.filter(file => file.name.startsWith(macZip)),
    after.files.filter(file => file.name.startsWith(macZip)),
  );
  await verifyReleaseManifest('macos-arm64', directory, commit, after);
});
