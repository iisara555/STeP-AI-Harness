import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { antigravityHome, checkAntigravity, runAntigravity } from './antigravity';
import { tm } from './i18n';
import type { ProviderContext } from './providers';

// Google's official Antigravity CLI, pinned with the sha512 its release manifest publishes
// (storage.googleapis.com/antigravity-public/antigravity-cli/1.2.17/manifest.json).
export const AGY_VERSION = '1.2.17';
const AGY_BASE = 'https://storage.googleapis.com/antigravity-public/antigravity-cli/1.2.17-6683332533157888';
const AGY_BUILDS: Record<string, { asset: string; sha512: string }> = {
  'win32-x64': {
    asset: 'windows-x64/cli_windows_x64.exe',
    sha512:
      'fa3cbe2aa9f8ccc6dbf9333346cc5943020c6c71f112f9c221e573b49c39a073ad192bb8f59a0a526ff5471a72440bad87148158900edb689dc18db68d998a9a',
  },
  'win32-arm64': {
    asset: 'windows-arm/cli_windows_arm64.exe',
    sha512:
      '712acd49a7efd65c5a0425cb8402344534aeb5f17ddb35913ac47511d9c09297916058d258bd46a5984777f13a6a21006f925fc750fc295bb7a0550a35fb992b',
  },
  'darwin-arm64': {
    asset: 'darwin-arm/cli_mac_arm64.tar.gz',
    sha512:
      '9296703b3b79a7da9ff83ff3b138762639e850c71186b62beb5f5910a7b3799d95d85ec30320d55d4c98d92c5e65c7af75443cd51e32469dd1c2be5ee829ecfd',
  },
  'darwin-x64': {
    asset: 'darwin-x64/cli_mac_x64.tar.gz',
    sha512:
      'b17bd244385f51acb66d27764629cab293c1b37d9d69f59fd90421aaecb49ed224d5a4a5f2bdfd35958922e06ea2ce98909f10b03914f1dcb24e290f4e1ec629',
  },
};
export function agyComponentSpec(platform = process.platform, arch = process.arch) {
  return AGY_BUILDS[`${platform}-${arch}`] || null;
}
/** Where STeP keeps the agy it installed, inside the employee's app data. */
export function agyComponentPath(componentDir: string, platform = process.platform) {
  return join(componentDir, platform === 'win32' ? 'agy.exe' : 'agy');
}

const MAX_BYTES = 400 * 1024 * 1024;
// Streams to disk while hashing: the Windows build is about 190 MB.
async function downloadTo(url: string, file: string, progress: (percent: number) => void, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(15 * 60_000);
  const fail = () => new Error(signal?.aborted ? 'CANCELLED' : 'ANTIGRAVITY_DOWNLOAD_FAILED');
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout }).catch(() => {
    throw fail();
  });
  if (!response.ok || !response.body) throw new Error('ANTIGRAVITY_DOWNLOAD_FAILED');
  const total = Number(response.headers.get('content-length')) || 0;
  const hash = createHash('sha512');
  const out = createWriteStream(file);
  let received = 0,
    shown = -1;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > MAX_BYTES) throw new Error('ANTIGRAVITY_DOWNLOAD_FAILED');
      hash.update(value);
      if (!out.write(value)) await new Promise<void>(resolveDrain => out.once('drain', () => resolveDrain()));
      const percent = total ? Math.floor((received / total) * 10) * 10 : -1;
      if (percent > shown) progress((shown = percent));
    }
  } catch (error) {
    out.destroy();
    throw error instanceof Error && error.message === 'ANTIGRAVITY_DOWNLOAD_FAILED' ? error : fail();
  }
  await new Promise<void>((resolveClose, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolveClose())));
  return hash.digest('hex');
}
function extractArchive(archive: string, target: string) {
  return new Promise<boolean>(resolveExtract => {
    const child = spawn('/usr/bin/tar', ['-xzf', archive, '-C', target], { windowsHide: true, shell: false, stdio: 'ignore' });
    child.on('error', () => resolveExtract(false));
    child.on('close', code => resolveExtract(code === 0));
  });
}
async function findBinary(dir: string, name: string, depth = 3): Promise<string | null> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return path;
    if (entry.isDirectory() && depth > 0) {
      const found = await findBinary(path, name, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

export type AgyInstallDeps = {
  /** Release asset and checksum; tests substitute their own. */
  spec?: { asset: string; sha512: string } | null;
  /** Writes the download to `file` and returns its sha512 in hex. */
  download?: (url: string, file: string, progress: (percent: number) => void, signal?: AbortSignal) => Promise<string>;
  extract?: (archive: string, target: string) => Promise<boolean>;
  /** Proves the file is Antigravity 1.2.14+ before it replaces anything. */
  verify?: (executable: string, context: Pick<ProviderContext, 'cwd' | 'env'>, signal?: AbortSignal) => Promise<unknown>;
};

/**
 * Installs the pinned official Antigravity CLI into `componentDir` and returns its path. Nothing is
 * replaced unless the download matches the published sha512 and the binary answers as agy 1.2.14+.
 */
export async function installAntigravityCli(
  componentDir: string,
  log: (line: string) => void,
  deps: AgyInstallDeps = {},
  signal?: AbortSignal,
) {
  const spec = deps.spec === undefined ? agyComponentSpec() : deps.spec;
  if (!spec) throw new Error('ANTIGRAVITY_UNSUPPORTED');
  const work = await mkdtemp(join(tmpdir(), 'step-agy-'));
  try {
    const download = join(work, 'download');
    log(tm('กำลังดาวน์โหลด Antigravity CLI {0} ของ Google', AGY_VERSION));
    const digest = await (deps.download || downloadTo)(
      `${AGY_BASE}/${spec.asset}`,
      download,
      percent => percent >= 0 && log(tm('กำลังดาวน์โหลด Antigravity CLI {0}%', percent)),
      signal,
    );
    if (digest !== spec.sha512) throw new Error('ANTIGRAVITY_CHECKSUM_FAILED');
    log(tm('ตรวจ checksum ผ่านแล้ว กำลังติดตั้ง'));
    let found = download;
    // macOS builds are a tar.gz holding one `antigravity` binary; Windows builds are the bare exe.
    if (spec.asset.endsWith('.tar.gz')) {
      const unpacked = join(work, 'unpacked');
      await mkdir(unpacked);
      if (!(await (deps.extract || extractArchive)(download, unpacked))) throw new Error('ANTIGRAVITY_INSTALL_FAILED');
      const binary = await findBinary(unpacked, 'antigravity');
      if (!binary) throw new Error('ANTIGRAVITY_INSTALL_FAILED');
      found = binary;
    }
    await mkdir(componentDir, { recursive: true });
    const target = agyComponentPath(componentDir),
      staged = join(componentDir, process.platform === 'win32' ? 'agy-staged.exe' : 'agy-staged');
    await copyFile(found, staged);
    if (process.platform !== 'win32') await chmod(staged, 0o755);
    // Checked in a throwaway home with the isolated settings, so the check never touches a real profile.
    const home = await antigravityHome({ cwd: work, env: process.env });
    try {
      await (deps.verify || checkAntigravity)(staged, home, signal);
    } catch (error) {
      await rm(staged, { force: true });
      throw new Error(
        error instanceof Error && ['CANCELLED', 'ANTIGRAVITY_UPDATE_REQUIRED'].includes(error.message)
          ? error.message
          : 'ANTIGRAVITY_INSTALL_FAILED',
      );
    } finally {
      await home.close().catch(() => {});
    }
    await rm(target, { force: true });
    await rename(staged, target);
    log(tm('ติดตั้ง Antigravity CLI เรียบร้อย'));
    return target;
  } finally {
    await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

/**
 * Whether the native Google sign-in is usable, checked with `agy models` in an isolated home.
 * The credential lives in the OS keyring, so the throwaway home still sees it.
 */
export async function antigravitySignedIn(executable: string, context: Pick<ProviderContext, 'cwd' | 'env'>, signal?: AbortSignal) {
  const home = await antigravityHome(context);
  let clean = true;
  try {
    await runAntigravity(executable, ['models'], home, { timeoutMs: 30_000, signal });
    return true;
  } catch (error) {
    clean = !(error as any)?.shutdownIncomplete;
    const detail: string[] = (error as any)?.detail || [];
    if (errorCodeOf(error) === 'RUNTIME_EXITED' && detail.some(line => /sign in|log in|not logged in/i.test(line))) return false;
    throw error;
  } finally {
    if (clean) await home.close();
  }
}
const errorCodeOf = (error: unknown) => (error instanceof Error ? error.message : '');

export type AgySignInDeps = {
  progress: (text: string) => void;
  /**
   * Opens Google's own Antigravity sign-in (the CLI in a terminal window, which opens the browser) and
   * returns a function that closes it again where the OS allows.
   */
  openSignIn: () => Promise<() => Promise<void> | void>;
  signedIn?: typeof antigravitySignedIn;
  pollMs?: number;
  timeoutMs?: number;
};

/** Signs in through Google's own flow when needed, then returns once the sign-in is usable. */
export async function antigravitySignIn(
  executable: string,
  context: Pick<ProviderContext, 'cwd' | 'env'>,
  deps: AgySignInDeps,
  signal: AbortSignal,
) {
  const signedIn = deps.signedIn || antigravitySignedIn;
  deps.progress(tm('กำลังตรวจการลงชื่อบัญชี Google ใน Antigravity'));
  if (await signedIn(executable, context, signal)) return;
  deps.progress(tm('ลงชื่อด้วยบัญชี Google ในเบราว์เซอร์ที่เปิดขึ้น เสร็จแล้ว STeP จะทดสอบให้เอง'));
  const close = await deps.openSignIn();
  try {
    const deadline = Date.now() + (deps.timeoutMs ?? 300_000);
    while (Date.now() < deadline) {
      await new Promise<void>((resolveWait, reject) => {
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', stop);
          resolveWait();
        }, deps.pollMs ?? 3000);
        const stop = () => {
          clearTimeout(timer);
          reject(new Error('CANCELLED'));
        };
        if (signal.aborted) return stop();
        signal.addEventListener('abort', stop, { once: true });
      });
      if (await signedIn(executable, context, signal)) return;
    }
    throw new Error('LOGIN_TIMEOUT');
  } finally {
    await close();
  }
}

/**
 * Opens the CLI's own interactive sign-in in a terminal window with the employee's real profile; the CLI opens
 * Google's page in the browser. On Windows the window is closed again once STeP sees the sign-in.
 */
export async function openAntigravitySignIn(executable: string, cwd: string) {
  await mkdir(cwd, { recursive: true });
  if (process.platform === 'win32') {
    // cmd.exe expands % even inside quotes, so only plain paths are passed through it.
    if (/["%^&|<>\r\n]/.test(executable)) throw new Error('ANTIGRAVITY_RUNTIME_REQUIRED');
    const child = spawn(
      join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'),
      ['/d', '/s', '/c', `"start "Antigravity sign-in" /wait "${executable}""`],
      { cwd, windowsHide: true, windowsVerbatimArguments: true, shell: false, stdio: 'ignore' },
    );
    await new Promise<void>((resolveSpawn, reject) => {
      child.once('spawn', resolveSpawn);
      child.once('error', () => reject(new Error('LOGIN_BROWSER_FAILED')));
    });
    return () =>
      new Promise<void>(done => {
        if (!child.pid || child.exitCode !== null) return done();
        const kill = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' });
        kill.once('error', () => done());
        kill.once('close', () => done());
      });
  }
  if (process.platform !== 'darwin') throw new Error('ANTIGRAVITY_UNSUPPORTED');
  const code = await new Promise<number | null>(resolveOpen => {
    const child = spawn('/usr/bin/open', ['-a', 'Terminal', executable], { cwd, shell: false, stdio: 'ignore' });
    child.once('error', () => resolveOpen(-1));
    child.once('close', resolveOpen);
  });
  if (code !== 0) throw new Error('LOGIN_BROWSER_FAILED');
  // Terminal owns the window on macOS; the progress text tells the person they can close it.
  return () => {};
}

/** True when `executable` answers as Antigravity 1.2.14+ (checked in an isolated home so nothing else starts). */
export async function antigravityCurrent(executable: string, cwd: string, signal?: AbortSignal) {
  await mkdir(cwd, { recursive: true });
  const home = await antigravityHome({ cwd, env: process.env });
  try {
    await checkAntigravity(executable, home, signal);
    return true;
  } catch (error) {
    if (errorCodeOf(error) === 'CANCELLED') throw error;
    return false;
  } finally {
    await home.close().catch(() => {});
  }
}
