// The loading window shown while the app prepares its data, AI services and organization knowledge, so the main
// window opens once, fully drawn, instead of showing a half-loaded workspace.
import { BrowserWindow, nativeTheme } from 'electron';
import { tm } from './i18n';

const escape = (text: string) => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The STeP symbol's three bars (src/assets/step-symbol-colour.svg): yellow on top, two dark bars below. */
const BARS = [
  '73.24 6.82 78.67 0 33.99 0 28.55 6.82',
  '20.4 17.05 14.28 24.72 72.56 24.72 78.67 17.05',
  '6.83 34.1 0 42.63 71.85 42.63 78.65 34.1',
];
/** Animations offered in the loading-window design review (2026-10-09); WAVE is the chosen one. */
const ANIMATIONS = {
  assemble: `.bar{opacity:0;animation:a 2.6s cubic-bezier(.2,.8,.2,1) infinite}.b2{animation-delay:.12s}.b3{animation-delay:.24s}
@keyframes a{0%{transform:translateX(28px);opacity:0}22%,72%{transform:none;opacity:1}92%,100%{transform:translateX(-10px);opacity:0}}`,
  wave: `.bar{animation:w 1.5s ease-in-out infinite}.b2{animation-delay:.18s}.b3{animation-delay:.36s}
@keyframes w{0%,100%{opacity:.28}35%{opacity:1}70%{opacity:.28}}`,
  glide: `.b1{animation:g 1.8s cubic-bezier(.45,0,.55,1) infinite alternate}@keyframes g{from{transform:translateX(-22px)}to{transform:translateX(6px)}}`,
};
const ANIMATION: keyof typeof ANIMATIONS = 'wave';

function page(dark: boolean, step: string) {
  const [surface, bar] = dark ? ['#1b1819', '#f4f1ea'] : ['#fafaf8', '#231f20'];
  const bars = BARS.map((points, i) => `<polygon class="bar b${i + 1}" fill="${i ? bar : '#ffc609'}" points="${points}"/>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>STeP Desktop</title><style>
html,body{margin:0;height:100%;background:${surface};-webkit-user-select:none;user-select:none;cursor:default}
main{height:100%;display:grid;place-items:center;-webkit-app-region:drag}
svg{width:112px;height:auto;overflow:visible}.bar{transform-box:view-box}
${ANIMATIONS[ANIMATION]}
@media (prefers-reduced-motion:reduce){.bar{animation:none!important;opacity:1!important;transform:none!important}}
.status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
</style></head><body><main><svg role="img" aria-label="STeP Desktop" viewBox="0 0 78.67 42.63">${bars}</svg>
<p id="step" class="status" role="status">${escape(step)}</p></main></body></html>`;
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
