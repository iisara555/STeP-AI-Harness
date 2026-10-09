// The loading window shown while the app prepares its data, AI services and organization knowledge, so the main
// window opens once, fully drawn, instead of showing a half-loaded workspace.
import { BrowserWindow, nativeTheme } from 'electron';
import { tm } from './i18n';
import { sketchLogo } from './sketch-logo';

const escape = (text: string) => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function page(dark: boolean, step: string) {
  const logo = sketchLogo(dark);
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>STeP Desktop</title><style>
html,body{margin:0;height:100%;background:${dark ? '#1b1819' : '#fafaf8'};-webkit-user-select:none;user-select:none;cursor:default}
main{height:100%;display:grid;place-items:center;-webkit-app-region:drag}
svg{width:190px;height:auto}
${logo.css}
.status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
</style></head><body><main>${logo.svg}<p id="step" class="status" role="status">${escape(step)}</p></main></body></html>`;
}

export class Splash {
  private window?: BrowserWindow;
  /** When the loading window opened, so it can stay up for a minimum time. */
  readonly openedAt = Date.now();
  /** Opens the loading window; the theme and language come from the person's saved settings. */
  constructor() {
    const dark = nativeTheme.shouldUseDarkColors;
    this.window = new BrowserWindow({
      width: 420,
      height: 280,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      frame: false,
      center: true,
      show: false,
      title: 'STeP Desktop',
      backgroundColor: dark ? '#1b1819' : '#fafaf8',
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    const window = this.window;
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.once('ready-to-show', () => window.isDestroyed() || window.show());
    window.on('closed', () => (this.window = undefined));
    void window
      .loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page(dark, tm('กำลังเตรียมพื้นที่ทำงาน…'))))
      .catch(() => undefined);
  }
  /** Tells screen readers what is loading now, in the person's language; the window itself shows only the logo. */
  step(text: string) {
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    void window.webContents.executeJavaScript(`document.getElementById('step').textContent=${JSON.stringify(text)}`).catch(() => undefined);
  }
  close() {
    const window = this.window;
    this.window = undefined;
    if (window && !window.isDestroyed()) window.destroy();
  }
}
