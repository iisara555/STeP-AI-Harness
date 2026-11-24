import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const { version } = require('../package.json');
const windowsInstaller = `STeP-Desktop-Setup-${version}.exe`;
const macDmg = `STeP-Desktop-${version}-arm64.dmg`;
const macZip = `STeP-Desktop-${version}-arm64.zip`;
const packages = {
  'windows-x64': { feed: 'latest.yml', installers: [windowsInstaller], update: windowsInstaller },
  'macos-arm64': { feed: 'latest-mac.yml', installers: [macDmg, macZip], update: macZip },
};

async function digest(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size === 0) throw new Error(`Expected a nonempty regular file: ${path}`);
  const sha256 = createHash('sha256');
  const sha512 = createHash('sha512');
  for await (const chunk of createReadStream(path)) {
    sha256.update(chunk);
    sha512.update(chunk);
  }
  return { size: stat.size, sha256: sha256.digest('hex'), sha512: sha512.digest('base64') };
}

export async function releaseManifest(platform, directory, commit, exact = false) {
  const spec = packages[platform];
  if (!spec || !/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('An expected platform and commit hash are required');
  const names = [spec.feed, ...spec.installers, ...spec.installers.map(name => name + '.blockmap')].sort();
  if (exact && JSON.stringify((await readdir(directory)).sort()) !== JSON.stringify(names))
    throw new Error(`Unexpected files in the ${platform} release artifact`);

  const hashes = new Map();
  for (const name of names) hashes.set(name, await digest(join(directory, name)));
  const feed = yaml.load(await readFile(join(directory, spec.feed), 'utf8'));
  if (feed?.version !== version || feed.path !== spec.update || feed.sha512 !== hashes.get(spec.update).sha512)
    throw new Error(`${spec.feed} has the wrong version, update target or legacy checksum`);
  const entries = Array.isArray(feed.files) ? new Map(feed.files.map(file => [file.url, file])) : new Map();
  if (entries.size !== spec.installers.length || entries.size !== feed.files.length)
    throw new Error(`${spec.feed} lists unexpected or duplicate installers`);
  for (const name of spec.installers) {
    const file = entries.get(name);
    const expected = hashes.get(name);
    if (file?.size !== expected.size || file.sha512 !== expected.sha512) throw new Error(`${spec.feed} does not match ${name}`);
  }
  return { platform, version, commit, files: names.map(name => ({ name, size: hashes.get(name).size, sha256: hashes.get(name).sha256 })) };
}

export async function verifyReleaseManifest(platform, directory, commit, recorded) {
  const current = await releaseManifest(platform, directory, commit, true);
  if (JSON.stringify(current) !== JSON.stringify(recorded)) throw new Error(`The ${platform} files differ from the checked artifact`);
}

// Stapling changes the downloaded DMG. Refresh its differential update data with the same builder used during packaging.
export async function refreshStapledDmg(directory) {
  const feedPath = join(directory, packages['macos-arm64'].feed);
  const feed = yaml.load(await readFile(feedPath, 'utf8'));
  const entry = feed?.files?.find(file => file.url === macDmg);
  if (feed?.version !== version || !entry) throw new Error('Cannot refresh the DMG entry in latest-mac.yml');
  const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap');
  const dmgPath = join(directory, macDmg);
  const { size, sha512 } = await buildBlockMap(dmgPath, 'gzip', dmgPath + '.blockmap');
  Object.assign(entry, { size, sha512 });
  if (feed.path === macDmg) feed.sha512 = sha512;
  await writeFile(feedPath, yaml.dump(feed, { lineWidth: -1 }));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [mode, platform, directory, report] = process.argv.slice(2);
  const commit = process.env.GITHUB_SHA;
  if (mode === 'refresh-dmg' && platform === 'macos-arm64' && directory) {
    await refreshStapledDmg(directory);
  } else if (mode === 'record' && directory && report) {
    const manifest = await releaseManifest(platform, directory, commit);
    await writeFile(report, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Verified ${manifest.files.length} ${platform} release files against the update feed`);
  } else if (mode === 'verify' && directory && report) {
    await verifyReleaseManifest(platform, directory, commit, JSON.parse(await readFile(report, 'utf8')));
    console.log(`The ${platform} files match the preflight manifest`);
  } else {
    throw new Error('Usage: release-artifacts.mjs <record|verify|refresh-dmg> <platform> <artifact-directory> [manifest.json]');
  }
}
