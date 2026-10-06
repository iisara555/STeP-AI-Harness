// Updates on a Mac build without a Developer ID. macOS's own updater (Squirrel.Mac, used by electron-updater) installs
// a new version only when both carry the same Developer ID signature, so an ad-hoc signed STeP Desktop could only send
// people to the release page. Instead STeP downloads the new version's zip itself, checks it against the sha512 the
// update feed publishes, and after the app quits a small script swaps the app bundle and opens the new one. A file the
// app downloads itself carries no quarantine flag, so the new version opens without the "Move to Trash" warning.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** Where the update feed's files are downloaded from (package.json build.publish: the rolling desktop-latest release). */
export const FEED_DOWNLOAD_BASE = 'https://github.com/iisara555/STeP-AI-Harness/releases/download/desktop-latest/';

export type FeedFile = { url?: string; sha512?: string; size?: number };
export type MacUpdateAsset = { url: string; name: string; sha512: string; size?: number };

/** The zip for this processor from the feed's file list; never anything outside the feed's own release. */
export function macUpdateAsset(files: FeedFile[] | undefined, version: string, arch: string): MacUpdateAsset | null {
  const name = `STeP-Desktop-${version}-${arch}.zip`;
  const file = (files || []).find(entry => entry?.url === name);
  if (!file?.sha512 || !/^[\w.-]+$/.test(name)) return null;
  return { url: FEED_DOWNLOAD_BASE + name, name, sha512: file.sha512, size: file.size };
}

/** The .app bundle this process runs from, or null when it cannot be replaced in place (disk image, translocated copy). */
export function appBundlePath(execPath: string) {
  const bundle = dirname(dirname(dirname(execPath)));
  if (!bundle.endsWith('.app') || basename(dirname(execPath)) !== 'MacOS') return null;
  if (bundle.startsWith('/Volumes/') || bundle.includes('/AppTranslocation/')) return null;
  return bundle;
}

/** True when the person can replace the bundle (it sits in a folder they can write, such as /Applications). */
export async function canReplace(bundle: string) {
  try {
    await access(dirname(bundle), constants.W_OK);
    await access(bundle, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

/** Downloads `asset` to `dest`, reporting 0–100, and keeps it only when its sha512 matches the feed. */
export async function downloadVerified(
  asset: MacUpdateAsset,
  dest: string,
  onProgress: (percent: number) => void,
  fetchImpl: Fetch = fetch,
  signal?: AbortSignal,
) {
  await mkdir(dirname(dest), { recursive: true });
  const response = await fetchImpl(asset.url, { signal });
  if (!response.ok || !response.body) throw new Error('UPDATE_DOWNLOAD_FAILED');
  const total = asset.size || Number(response.headers.get('content-length')) || 0;
  const hash = createHash('sha512');
  const out = createWriteStream(dest, { mode: 0o600 });
  let received = 0,
    last = -1;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      received += value.length;
      if (!out.write(value)) await new Promise<void>(resolveDrain => out.once('drain', () => resolveDrain()));
      const percent = total ? Math.min(100, Math.floor((received / total) * 100)) : 0;
      if (percent !== last) onProgress((last = percent));
    }
  } finally {
    await new Promise<void>(resolveClose => out.end(resolveClose));
  }
  if (hash.digest('base64') !== asset.sha512) {
    await rm(dest, { force: true });
    throw new Error('UPDATE_CHECKSUM_MISMATCH');
  }
  return dest;
}

const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

/**
 * The script that runs after STeP quits: unpack the zip next to the app, check the new bundle's signature, swap it in,
 * and open it. Any failure before the swap leaves the old app untouched and opens it again.
 */
export function swapScript(bundle: string, zip: string, pid: number) {
  const app = quote(bundle),
    archive = quote(zip),
    stage = quote(join(dirname(bundle), `.step-desktop-update-${pid}`)),
    backup = quote(`${bundle}.previous-${pid}`);
  return `#!/bin/bash
# STeP Desktop update: written by the app, removes itself when done.
while /bin/kill -0 ${pid} 2>/dev/null; do /bin/sleep 0.5; done
fail() { /bin/rm -rf ${stage}; /usr/bin/open ${app}; exit 1; }
/bin/rm -rf ${stage} && /bin/mkdir -p ${stage} || fail
/usr/bin/ditto -x -k ${archive} ${stage} || fail
NEW=${stage}/${quote(basename(bundle))}
[ -d "$NEW" ] || fail
/usr/bin/codesign --verify --deep --strict "$NEW" || fail
/usr/bin/xattr -cr "$NEW" 2>/dev/null
/bin/mv ${app} ${backup} || fail
if ! /bin/mv "$NEW" ${app}; then /bin/mv ${backup} ${app}; fail; fi
/bin/rm -rf ${backup} ${stage} ${archive}
/usr/bin/open ${app}
/bin/rm -f "$0"
`;
}

/** Writes the swap script and starts it detached, so it outlives the app it replaces. */
export async function startSwap(bundle: string, zip: string, pid: number, dir: string) {
  await mkdir(dir, { recursive: true });
  const script = join(dir, `step-desktop-update-${pid}.sh`);
  await writeFile(script, swapScript(bundle, zip, pid), { mode: 0o700 });
  const child = spawn('/bin/bash', [script], { detached: true, stdio: 'ignore' });
  child.unref();
}
