import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { antigravityHome, checkAntigravity, runAntigravity } from './antigravity';
import { tm } from './i18n';
import type { ProviderContext } from './providers';

// Google's official Antigravity CLI, pinned with the sha512 its release manifest publishes
// (storage.googleapis.com/antigravity-public/antigravity-cli/1.3.2/manifest.json).
export const AGY_VERSION = '1.3.2';
const AGY_BASE = 'https://storage.googleapis.com/antigravity-public/antigravity-cli/1.3.2-6492374831071232';
const AGY_BUILDS: Record<string, { asset: string; sha512: string }> = {
  'win32-x64': {
    asset: 'windows-x64/cli_windows_x64.exe',
    sha512:
      '7ede77453b10f68fd88d2c2976ab44ff467ab5de2d155d0da61b4da2b0f7400ab0430d977fb21b9464d084e2f61750515d8326e2436e2c6109ae44ffa3d8138b',
  },
  'win32-arm64': {
    asset: 'windows-arm/cli_windows_arm64.exe',
    sha512:
      '9595b3ffeb7aad210df57830cbdd23166a97e47ce53c66e1aa3e5235cc4116dd5f04ce3e757a59c52f3edb8ebb6afc3d3e319800240797fe9b3f9b1f0f5516a3',
  },
  'darwin-arm64': {
    asset: 'darwin-arm/cli_mac_arm64.tar.gz',
    sha512:
      'fd3474333e679b90369c4a041e2eea42cf74e0d931d2e9d16b54ea01278c5299605a6f704c20adcef0d48f14b790f42f3f557d6be03335fb79a445d1c568ba5b',
  },
  'darwin-x64': {
    asset: 'darwin-x64/cli_mac_x64.tar.gz',
    sha512:
      '6fada8a1732146f332e3407fce6390efbef3a8e31d5d35eabb55bdbe2ae9c507747e85679828ffdbcba68afe6bb0462fe7cfaa23bae38617e4200b6f84a4c655',
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

/** The same check with the employee's real profile: what the sign-in window itself would see. */
export async function antigravitySignedInWithProfile(executable: string, cwd: string, signal?: AbortSignal) {
  await mkdir(cwd, { recursive: true });
  try {
    await runAntigravity(executable, ['models'], { cwd, env: process.env }, { timeoutMs: 30_000, signal });
    return true;
  } catch (error) {
    if (errorCodeOf(error) === 'CANCELLED') throw error;
    return false;
  }
}

export type AgyBrowserSignIn = {
  close: () => Promise<void> | void;
  exited: Promise<void>;
  /** Types the authorization code Google's page shows into the waiting CLI. */
  sendCode?: (code: string) => void;
};
export type AgySignInDeps = {
  progress: (text: string) => void;
  /**
   * Opens Google's own Antigravity sign-in (the CLI in a terminal window, which opens the browser) and
   * returns a function that closes it again where the OS allows.
   */
  openSignIn: () => Promise<() => Promise<void> | void>;
  /**
   * Tried first: the CLI's non-interactive sign-in, with Google's page opened straight in the browser and no terminal
   * window. Resolves null when the CLI printed no sign-in page, and the terminal is used instead.
   */
  openBrowserSignIn?: () => Promise<AgyBrowserSignIn | null>;
  signedIn?: typeof antigravitySignedIn;
  /**
   * Whether the real profile is signed in. When it is but STeP's isolated check still is not, waiting longer cannot
   * help, so the sign-in stops with a clear message instead of spinning until the timeout.
   */
  signedInWithProfile?: () => Promise<boolean>;
  pollMs?: number;
  timeoutMs?: number;
  /** How long the browser sign-in may take; agy itself waits about a minute. */
  browserTimeoutMs?: number;
  /** Asks the person for the code Google's page shows after Allow; null when they cancel. */
  askForCode?: () => Promise<string | null>;
  /** Closes the code prompt again. */
  dropCode?: () => void;
  /** Browser attempts before the terminal; each new attempt is quick once the browser is signed in to Google. */
  browserAttempts?: number;
};

/** Signs in through Google's own flow when needed, then returns once the sign-in is usable. */
export async function antigravitySignIn(
  executable: string,
  context: Pick<ProviderContext, 'cwd' | 'env'>,
  deps: AgySignInDeps,
  signal: AbortSignal,
) {
  const signedIn = deps.signedIn || antigravitySignedIn;
  // Polls until the sign-in is usable; false once `stop` says the flow ended (after one last check) or time is up.
  async function waitUntilSignedIn(timeoutMs: number, stop: () => boolean) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ended = stop();
      await new Promise<void>((resolveWait, reject) => {
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', cancel);
          resolveWait();
        }, deps.pollMs ?? 3000);
        const cancel = () => {
          clearTimeout(timer);
          reject(new Error('CANCELLED'));
        };
        if (signal.aborted) return cancel();
        signal.addEventListener('abort', cancel, { once: true });
      });
      if (await signedIn(executable, context, signal)) return true;
      if (deps.signedInWithProfile && ++polls % 3 === 0 && (await deps.signedInWithProfile())) {
        if (++hidden >= 2) throw new Error('ANTIGRAVITY_SIGNIN_HIDDEN');
      } else if (polls % 3 === 0) hidden = 0;
      if (ended) return false;
    }
    return false;
  }
  let polls = 0,
    hidden = 0;
  deps.progress(tm('กำลังตรวจการลงชื่อบัญชี Google ใน Antigravity'));
  if (await signedIn(executable, context, signal)) return;
  // Google sends the browser to antigravity.google/oauth-callback, which shows an authorization code to paste into
  // the CLI. STeP asks for that code and types it into the hidden CLI, so nobody has to find a terminal window.
  for (let attempt = 0; deps.openBrowserSignIn && attempt < (deps.browserAttempts ?? 3); attempt++) {
    const browser = await deps.openBrowserSignIn();
    if (!browser) break;
    let ended = false,
      cancelled = false,
      finished = false;
    void browser.exited.then(() => {
      if (finished) return;
      ended = true;
      deps.dropCode?.();
    });
    const canPaste = Boolean(browser.sendCode && deps.askForCode);
    deps.progress(
      canPaste
        ? tm(
            'เปิดหน้าลงชื่อ Google ในเบราว์เซอร์แล้ว เลือกบัญชี กด "อนุญาต" (Allow) แล้วคัดลอกรหัสที่หน้าเว็บแสดง มาวางในช่องของ STeP ภายใน 1 นาที',
          )
        : tm('เปิดหน้าลงชื่อ Google ในเบราว์เซอร์แล้ว เลือกบัญชี แล้วกด "อนุญาต" (Allow) ภายใน 1 นาที เสร็จแล้ว STeP จะทดสอบให้เอง'),
    );
    if (canPaste)
      void deps.askForCode!().then(
        code => {
          if (ended || finished) return;
          if (code) {
            browser.sendCode!(code);
            deps.progress(tm('ได้รับรหัสแล้ว กำลังตรวจการลงชื่อ'));
          } else cancelled = true;
        },
        () => {
          if (!ended && !finished) cancelled = true;
        },
      );
    try {
      if (await waitUntilSignedIn(deps.browserTimeoutMs ?? 90_000, () => ended || cancelled)) return;
    } finally {
      // Closing a prompt resolves it with null, but cleanup is not a user cancellation. A late exit from this
      // attempt must also leave the next attempt's prompt alone.
      finished = true;
      deps.dropCode?.();
      await browser.close();
    }
    if (cancelled) throw new Error('CANCELLED');
    deps.progress(tm('ยังลงชื่อไม่สำเร็จ STeP จะเปิดหน้าลงชื่อ Google ให้อีกครั้ง'));
  }
  deps.progress(
    tm(
      'หน้าต่างลงชื่อของ Antigravity จะเปิดขึ้น กด Enter หนึ่งครั้ง (เลือก Google OAuth) แล้วลงชื่อ Google ในเบราว์เซอร์ ถ้าหน้าเว็บแสดงรหัส ให้คัดลอกมาวางในหน้าต่างนั้น (คลิกขวาหรือ Ctrl+V บน Windows, Command+V บน Mac) แล้วกด Enter เสร็จแล้ว STeP จะทดสอบให้เอง',
    ),
  );
  const close = await deps.openSignIn();
  try {
    if (await waitUntilSignedIn(deps.timeoutMs ?? 300_000, () => false)) return;
    throw new Error('LOGIN_TIMEOUT');
  } finally {
    await close();
  }
}

/** Google's sign-in page as agy prints it; nothing else is ever opened in the browser. */
export function googleSignInUrl(text: string) {
  // Only an address on its own, never one embedded in another address.
  for (const match of text.matchAll(/(?:^|\s)(https:\/\/accounts\.google\.com\/[^\s"'<>]+)/g)) {
    try {
      const url = new URL(match[1]);
      if (url.protocol === 'https:' && url.hostname === 'accounts.google.com' && url.pathname.startsWith('/o/oauth2/'))
        return url.toString();
    } catch {
      /* Not a URL. */
    }
  }
  return null;
}

function stopTree(pid: number | undefined, child: { kill: (signal?: NodeJS.Signals) => boolean; exitCode: number | null }) {
  return new Promise<void>(done => {
    if (!pid || child.exitCode !== null) return done();
    if (process.platform !== 'win32') {
      child.kill('SIGTERM');
      return done();
    }
    const kill = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' });
    kill.once('error', () => done());
    kill.once('close', () => done());
  });
}

/** The command that runs `agy -p` behind a pseudo-terminal, since agy reads the pasted code only from a terminal. */
export function agyPtyCommand(executable: string, args: string[], platform = process.platform): [string, string[]] | null {
  // macOS `script` refuses a socket as its input (Node's pipes are sockets there), so `cat` turns it into a real pipe.
  // `cat` keeps no other stream open, so the process ends as soon as `script` does.
  if (platform === 'darwin')
    return ['/bin/bash', ['-c', 'exec /usr/bin/script -q /dev/null "$@" < <(exec cat 2>/dev/null)', 'agy-sign-in', executable, ...args]];
  if (platform === 'linux') {
    const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
    return ['script', ['-qfec', [executable, ...args].map(quote).join(' '), '/dev/null']];
  }
  return null;
}

/**
 * Starts agy's non-interactive sign-in with the employee's real profile, hidden behind a pseudo-terminal, and opens the
 * Google page it prints in the browser. Signed out, `agy -p` prints that page and waits about a minute for the code
 * Google's page shows; once signed in it would answer a one-word prompt, which `--print-timeout` cuts short and STeP
 * stops as soon as it sees the sign-in. Windows has no pseudo-terminal to borrow, so it returns null there and the
 * terminal window is used, where the person pastes the code themselves.
 */
export async function openAntigravityBrowserSignIn(
  executable: string,
  cwd: string,
  openUrl: (url: string) => Promise<void>,
  waitMs = 20_000,
  platform = process.platform,
): Promise<AgyBrowserSignIn | null> {
  const command = agyPtyCommand(executable, ['-p', 'Reply with OK only.', '--print-timeout', '1s'], platform);
  if (!command || !existsSync(executable)) return null;
  await mkdir(cwd, { recursive: true });
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(command[0], command[1], {
      cwd,
      env: { ...process.env, TERM: 'dumb' },
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
  child.stdin?.on('error', () => {});
  const exited = new Promise<void>(done => {
    child.once('close', () => done());
    child.once('error', () => done());
  });
  // Ending the input also ends the helper that feeds it on macOS.
  void exited.then(() => child.stdin?.end());
  const close = async () => {
    child.stdin?.end();
    await stopTree(child.pid, child);
  };
  const url = await new Promise<string | null>(resolveUrl => {
    let text = '';
    const timer = setTimeout(() => resolveUrl(null), waitMs);
    const read = (chunk: Buffer) => {
      if (text.length > 65_536) return;
      // The terminal wraps long lines; the address itself never contains a carriage return.
      text += chunk.toString('utf8').replace(/\r/g, '');
      const found = googleSignInUrl(text);
      if (found) {
        clearTimeout(timer);
        resolveUrl(found);
      }
    };
    child.stdout?.on('data', read);
    child.stderr?.on('data', read);
    void exited.then(() => {
      clearTimeout(timer);
      resolveUrl(googleSignInUrl(text));
    });
  });
  if (!url) {
    await close();
    return null;
  }
  try {
    await openUrl(url);
  } catch {
    await close();
    return null;
  }
  const sendCode = (code: string) => {
    if (/^[\w\-/.~%#]+$/.test(code) && code.length <= 4096 && child.exitCode === null) child.stdin?.write(`${code}\n`);
  };
  return { close, exited, sendCode };
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
