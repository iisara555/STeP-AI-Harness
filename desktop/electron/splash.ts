// The loading window shown while the app prepares its data, AI services and organization knowledge, so the main
// window opens once, fully drawn, instead of showing a half-loaded workspace.
import { BrowserWindow, nativeTheme } from 'electron';
import { tm } from './i18n';

const escape = (text: string) => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function page(dark: boolean, step: string) {
  const [surface, text, muted, line] = dark ? ['#1b1819', '#f4f1ea', '#ada6a0', '#37312f'] : ['#fafaf8', '#231f20', '#645e5f', '#e7e4de'];
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>STeP Desktop</title><style>
html,body{margin:0;height:100%;background:${surface};color:${text};font:14px/1.5 system-ui,-apple-system,"Segoe UI","Noto Sans Thai","Leelawadee UI",sans-serif;-webkit-user-select:none;user-select:none;cursor:default}
main{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;-webkit-app-region:drag}
.mark{width:56px;height:56px;border-radius:14px;background:#ffc709;color:#231f20;display:grid;place-items:center;font-weight:700;font-size:20px;letter-spacing:.5px}
h1{margin:4px 0 0;font-size:18px;font-weight:600}
.bar{width:180px;height:4px;border-radius:2px;background:${line};overflow:hidden}
.bar i{display:block;width:40%;height:100%;border-radius:2px;background:#ffc709;animation:slide 1.2s ease-in-out infinite}
@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
@media (prefers-reduced-motion:reduce){.bar i{animation:none;width:100%;opacity:.6}}
p{margin:0;color:${muted};font-size:13px;min-height:20px}
</style></head><body><main><div class="mark">STeP</div><h1>STeP Desktop</h1><div class="bar"><i></i></div><p id="step" role="status">${escape(step)}</p></main></body></html>`;
}

export class Splash {
  private window?: BrowserWindow;
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
  /** Shows what is loading now, in the person's language. */
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
