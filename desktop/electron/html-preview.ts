import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WebContents } from 'electron';

/** HTML the AI wrote (a slide deck, a page) is previewed from a private copy, not from the workspace. */
export const PREVIEW_LIMIT = 5_000_000;

export const isHtmlPath = (path: string) => /\.html?$/i.test(path.trim());

const PAGE_PERMISSIONS = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write']);
const web = (url: string) => /^https?:\/\//i.test(url);
/** The local path a file: URL points at, compared without case (Windows), or '' for anything else. */
const localPath = (url: string) => {
  try {
    return /^file:/i.test(url) ? resolve(fileURLToPath(url.split('#')[0].split('?')[0])).toLowerCase() : '';
  } catch {
    return '';
  }
};

/**
 * Shows an HTML file in the Web tab as it works in a browser, like the previews of Codex, Claude or Cursor: scripts
 * run (slide navigation, the inline editor), web fonts, libraries from a CDN (Three.js, Chart.js, GSAP, as scripts or
 * ES modules) and images load, WebGL works as in Chrome, links open, and the inline
 * editor's "save" downloads through the normal save dialog. Local files other than its own copy never load, and the
 * page may go full screen but cannot use the camera, microphone, location or other permissions. Pop-up links open in a new Web tab.
 * The copy is removed when the tab closes.
 */
export async function openHtmlPreview(
  create: (partition: string) => WebContents,
  id: string,
  html: string,
  openLink: (url: string) => void,
) {
  if (Buffer.byteLength(html) > PREVIEW_LIMIT) throw new Error('FILE_TOO_LARGE');
  const folder = await mkdtemp(join(tmpdir(), 'step-preview-'));
  const written = join(folder, 'index.html');
  await writeFile(written, html, 'utf8');
  // Windows temp folders can come as short 8.3 names (C:\Users\RUNNER~1) while Chromium requests the long name, so
  // the copy is loaded and recognised by its real path, compared as a path rather than as URL text.
  const file = await realpath(written).catch(() => written);
  const own = new Set([resolve(written).toLowerCase(), resolve(file).toLowerCase()]);
  const isOwn = (url: string) => own.has(localPath(url));
  const contents = create('step-preview-' + id);
  contents.once('destroyed', () => void rm(folder, { recursive: true, force: true }).catch(() => {}));
  const network = contents.session;
  network.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url.toLowerCase();
    callback({ cancel: !(isOwn(details.url) || web(url) || url.startsWith('data:') || url.startsWith('blob:')) });
  });
  // Full screen (a deck's F key), pointer lock (3D scenes) and copying are what pages like these use; camera,
  // microphone, location, notifications and the rest stay refused.
  network.setPermissionRequestHandler((_c, permission, callback) => callback(PAGE_PERMISSIONS.has(permission)));
  network.setPermissionCheckHandler((_c, permission) => PAGE_PERMISSIONS.has(permission));
  contents.setWindowOpenHandler(({ url }) => {
    if (web(url)) openLink(url);
    return { action: 'deny' };
  });
  const allowed = (url: string) => web(url) || isOwn(url);
  contents.on('will-navigate', (event, url) => allowed(url) || event.preventDefault());
  contents.on('will-redirect', (event, url) => allowed(url) || event.preventDefault());
  await contents.loadFile(file);
  return { id, title: contents.getTitle() };
}
