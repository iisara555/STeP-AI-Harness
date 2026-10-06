// In-app updates, as in Claude, Cursor and Codex: the installed app checks the update feed, downloads a newer version
// in the background, and offers "restart to update"; an update that is downloaded also installs when the app quits.
// The feed is the `desktop-latest` release of this repository (package.json build.publish), which holds only the newest
// desktop build, so the harness's own pilot releases never look like a desktop update.

export type UpdateStatus = 'disabled' | 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'manual' | 'error';
export type UpdateState = {
  status: UpdateStatus;
  current: string;
  version?: string;
  percent?: number;
  /** Why updates are off, or what failed (an error code, never a raw message with paths). */
  reason?: string;
  /** Where to download the new version by hand, when the app cannot install it itself (an unsigned Mac build). */
  url?: string;
  checkedAt?: string;
};

/** The part of electron-updater's autoUpdater this uses; tests pass a fake. */
export type AutoUpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  on(event: string, listener: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
};

/** A Mac build without a Developer ID installs updates itself (electron/mac-update.ts) instead of through macOS. */
export type SelfInstall = {
  /** Downloads and checks the version in `info`; resolves to the step that quits the app and swaps it in. */
  prepare: (
    info: { version?: string; files?: { url?: string; sha512?: string; size?: number }[] },
    onProgress: (percent: number) => void,
  ) => Promise<() => void>;
};

export const RELEASES_URL = 'https://github.com/iisara555/STeP-AI-Harness/releases/tag/desktop-latest';
const FOUR_HOURS = 4 * 60 * 60 * 1000;

export class Updater {
  private state: UpdateState;
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(
    private updater: AutoUpdaterLike | undefined,
    private options: {
      current: string;
      platform: NodeJS.Platform;
      /** Why updates are off (not packaged, policy, environment), or '' when they are on. */
      disabledReason: string;
      emit: (state: UpdateState) => void;
      log?: (event: string, detail?: Record<string, string>) => void;
      /** Mac only: STeP downloads and installs the update itself, since macOS would refuse an unsigned one. */
      selfInstall?: SelfInstall;
    },
  ) {
    this.state = { status: options.disabledReason || !updater ? 'disabled' : 'idle', current: options.current };
    if (options.disabledReason) this.state.reason = options.disabledReason;
    if (this.state.status === 'disabled' || !updater) return;
    const self = options.platform === 'darwin' ? options.selfInstall : undefined;
    // With its own installer, macOS's updater only reads the feed; it never downloads or installs anything.
    updater.autoDownload = !self;
    updater.autoInstallOnAppQuit = !self;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.on('checking-for-update', () => this.set({ status: 'checking' }));
    updater.on('update-not-available', () => this.set({ status: 'none', checkedAt: new Date().toISOString() }));
    updater.on('update-available', (info: { version?: string; files?: { url?: string; sha512?: string; size?: number }[] }) => {
      this.set({ status: 'downloading', version: String(info?.version || ''), percent: 0 });
      if (self) void this.selfDownload(self, info);
    });
    updater.on('download-progress', (progress: { percent?: number }) =>
      this.set({ status: 'downloading', percent: Math.max(0, Math.min(100, Math.round(Number(progress?.percent) || 0))) }),
    );
    updater.on('update-downloaded', (info: { version?: string }) =>
      this.set({ status: 'ready', version: String(info?.version || this.state.version || '') }),
    );
    updater.on('error', (error: unknown) => this.fail(error));
  }
  get snapshot(): UpdateState {
    return { ...this.state };
  }
  /** Check now and then every four hours; the first check waits so it never slows the app's start. */
  start(firstDelay = 15_000) {
    if (this.state.status === 'disabled') return;
    setTimeout(() => void this.check(), firstDelay).unref?.();
    this.timer = setInterval(() => void this.check(), FOUR_HOURS);
    this.timer.unref?.();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }
  async check() {
    if (!this.updater || this.state.status === 'disabled') return this.snapshot;
    // A downloaded update stays ready; checking again would only download it twice.
    if (this.state.status === 'ready' || this.state.status === 'downloading' || this.state.status === 'checking') return this.snapshot;
    try {
      this.set({ status: 'checking', reason: undefined });
      await this.updater.checkForUpdates();
    } catch (error) {
      this.fail(error);
    }
    return this.snapshot;
  }
  private selfInstaller: (() => void) | undefined;
  private async selfDownload(self: SelfInstall, info: Parameters<SelfInstall['prepare']>[0]) {
    try {
      this.selfInstaller = await self.prepare(info, percent => {
        if (this.state.status === 'downloading' && percent !== this.state.percent) this.set({ percent });
      });
      this.set({ status: 'ready' });
    } catch (error) {
      this.fail(error);
    }
  }
  /** Restart into the downloaded version. */
  install() {
    if (!this.updater || this.state.status !== 'ready') throw new Error('UPDATE_NOT_READY');
    this.options.log?.('update-install', { version: this.state.version || '' });
    if (this.selfInstaller) return this.selfInstaller();
    // isSilent: the Windows installer runs without its wizard; isForceRunAfter: the app opens again afterwards.
    this.updater.quitAndInstall(true, true);
  }
  private fail(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const code =
      /ERR_UPDATER_[A-Z_]+|UPDATE_[A-Z_]+/.exec(message)?.[0] ||
      (/ENOTFOUND|ECONN|ETIMEDOUT|net::/i.test(message) ? 'UPDATE_OFFLINE' : 'UPDATE_FAILED');
    this.options.log?.('update-failed', { code });
    // macOS installs an update only when both versions carry the same Developer ID signature. A build without one can
    // still learn that a new version exists; the person then downloads it from the release page.
    if (this.options.platform === 'darwin' && this.state.version)
      return this.set({ status: 'manual', reason: 'UPDATE_NEEDS_SIGNED_BUILD', url: RELEASES_URL });
    // Offline or no feed yet is not something the person must act on: say so quietly and try again on the next round.
    this.set({ status: 'error', reason: code, checkedAt: new Date().toISOString() });
  }
  private set(next: Partial<UpdateState>) {
    this.state = { ...this.state, ...next };
    if (this.state.status !== 'downloading') delete this.state.percent;
    for (const key of Object.keys(this.state) as (keyof UpdateState)[]) if (this.state[key] === undefined) delete this.state[key];
    this.options.emit(this.snapshot);
  }
}
