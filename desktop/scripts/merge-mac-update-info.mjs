// The Apple silicon and Intel Mac apps are built in separate jobs, and each writes its own latest-mac.yml. The update
// feed needs one file listing both, so the in-app updater picks the build for its own processor (electron-updater takes
// the file whose name has "arm64" on Apple silicon and the other one on Intel).
// Usage: node scripts/merge-mac-update-info.mjs <out.yml> <arm64 latest-mac.yml> <x64 latest-mac.yml>
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const yaml = createRequire(import.meta.url)('js-yaml');

export function mergeMacUpdateInfo(arm, intel) {
  if (!arm?.version || arm.version !== intel?.version) throw new Error('The two Mac builds must have the same version');
  const files = [...(arm.files || []), ...(intel.files || [])];
  const names = files.map(f => f.url);
  if (new Set(names).size !== names.length) throw new Error('Both Mac builds list the same file');
  if (!files.some(f => /arm64/.test(f.url)) || !files.some(f => !/arm64/.test(f.url) && /\.zip$/.test(f.url)))
    throw new Error('The update feed needs a zip for each Mac processor');
  // `path` and `sha512` at the top level are the legacy single-file fields; keep the Intel zip there for old updaters.
  const legacy = (intel.files || []).find(f => /\.zip$/.test(f.url));
  return { ...arm, files, path: legacy.url, sha512: legacy.sha512, releaseDate: arm.releaseDate || intel.releaseDate };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [out, armFile, intelFile] = process.argv.slice(2);
  if (!out || !armFile || !intelFile) throw new Error('Usage: merge-mac-update-info.mjs <out> <arm64.yml> <x64.yml>');
  const read = async file => yaml.load(await readFile(file, 'utf8'));
  const merged = mergeMacUpdateInfo(await read(armFile), await read(intelFile));
  await writeFile(out, yaml.dump(merged, { lineWidth: -1 }));
  console.log(`Merged ${merged.files.length} Mac update files for ${merged.version}`);
}
