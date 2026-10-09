import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { WebContents } from 'electron';

/** HTML the AI wrote (a slide deck, a page) is previewed from a private copy, not from the workspace. */
export const PREVIEW_LIMIT = 5_000_000;

export const isHtmlPath = (path: string) => /\.html?$/i.test(path.trim());

/**
 * Shows an HTML file in the Web tab as the employee will see it when they open it: scripts run (slide navigation,
 * the inline editor), but the page is offline. Only its own copy, data: and blob: URLs load, so it cannot fetch
 * from the network or read other local files; it cannot navigate, open windows, download or ask for permissions.
 * The copy is removed when the tab closes. Fonts from the web fall back to the computer's own fonts.
 */
export async function openHtmlPreview(create: (partition: string) => WebContents, id: string, html: string) {
  if (Buffer.byteLength(html) > PREVIEW_LIMIT) throw new Error('FILE_TOO_LARGE');
  const folder = await mkdtemp(join(tmpdir(), 'step-preview-'));
  const file = join(folder, 'index.html');
  await writeFile(file, html, 'utf8');
  const own = pathToFileURL(file).href.toLowerCase();
  const contents = create('step-preview-' + id);
  contents.once('destroyed', () => void rm(folder, { recursive: true, force: true }).catch(() => {}));
  const network = contents.session;
  // Windows may change the drive letter's case, so compare without case. The hash part (#slide-3) is allowed.
  network.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url.toLowerCase();
    callback({ cancel: !(url.split('#')[0] === own || url.startsWith('data:') || url.startsWith('blob:')) });
  });
  network.setPermissionRequestHandler((_c, _p, callback) => callback(false));
  network.setPermissionCheckHandler(() => false);
  network.on('will-download', event => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', event => event.preventDefault());
  contents.on('will-redirect', event => event.preventDefault());
  await contents.loadFile(file);
  return { id, title: contents.getTitle() };
}
