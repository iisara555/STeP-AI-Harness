import type { App } from 'electron';

export const STARTUP_ITEM_NAME = 'th.ac.cmu.step.desktop';
export type StartupState = { supported: boolean; enabled: boolean };

/** Read the OS setting rather than storing a preference that can disagree with Windows Settings. */
export class Startup {
  constructor(
    private app: Pick<App, 'getLoginItemSettings' | 'setLoginItemSettings'>,
    private platform: NodeJS.Platform,
    private packaged: boolean,
    private executable: string,
    private isolated = false,
  ) {}

  state(): StartupState {
    if (this.platform !== 'win32' || !this.packaged || this.isolated) return { supported: false, enabled: false };
    // Electron 44 parses this lookup as a command line; quote paths containing spaces.
    const settings = this.app.getLoginItemSettings({ path: `"${this.executable}"`, args: [] });
    return { supported: true, enabled: settings.openAtLogin && settings.executableWillLaunchAtLogin };
  }

  set(enabled: unknown) {
    if (typeof enabled !== 'boolean') throw new Error('INVALID_SETTINGS');
    if (!this.state().supported) throw new Error('STARTUP_UNAVAILABLE');
    // NSIS installs have a stable executable path. Never register the development Electron executable.
    this.app.setLoginItemSettings({ name: STARTUP_ITEM_NAME, path: this.executable, args: [], openAtLogin: enabled, enabled });
    const state = this.state();
    if (state.enabled !== enabled) throw new Error('STARTUP_UPDATE_FAILED');
    return state;
  }
}
