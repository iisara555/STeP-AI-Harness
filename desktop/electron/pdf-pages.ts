import { BrowserWindow, session } from 'electron';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { VisionInput } from '../src/types';

// A scanned PDF has no text layer, so its pages go to a vision model as pictures, as in other AI apps.
// pdf.js (the copy the document check already uses) draws each page in a hidden, sandboxed window that can
// load nothing but pdf.js itself; the PDF bytes are handed over in memory.
// A whole TOR (about 20 pages plus cover and annexes) fits in one attachment. Past 20 pages each page is drawn smaller,
// so the request stays inside the byte budget and within Claude's 2000 px limit for requests with many images.
export const SCANNED_PDF_PAGES = 30;
const LONGEST_SIDE = 1600;
const LONGEST_SIDE_MANY = 1280;
const TOTAL_BYTES = 15_000_000;
const TIME_LIMIT = 90_000;

export async function pdfPageImages(
  path: string,
  vendorDir: string,
  options: { bytes?: Buffer; maxPages?: number } = {},
): Promise<VisionInput[]> {
  const maxPages = options.maxPages ?? SCANNED_PDF_PAGES;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > SCANNED_PDF_PAGES) throw new Error('INVALID_INPUT');
  const bytes = options.bytes ?? (await readFile(path));
  const vendor = pathToFileURL(join(vendorDir, '/')).href;
  const partition = session.fromPartition('step-pdf-pages');
  // Windows may change the drive letter's case, so compare without case.
  partition.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: !details.url.toLowerCase().startsWith(vendor.toLowerCase()) }),
  );
  const window = new BrowserWindow({
    show: false,
    webPreferences: { session: partition, sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  let timer: NodeJS.Timeout | undefined;
  try {
    // Any small file beside pdf.js gives the page a home it can import pdf.js from.
    await window.loadURL(new URL('manifest.json', vendor).href);
    const render = window.webContents.executeJavaScript(`(async () => {
      const pdfjs = await import('./pdf.mjs');
      globalThis.pdfjsWorker = await import('./pdf.worker.mjs');
      const data = Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}), c => c.charCodeAt(0));
      const doc = await pdfjs.getDocument({ data, isEvalSupported: false, cMapUrl: './cmaps/', cMapPacked: true,
        standardFontDataUrl: './standard_fonts/' }).promise;
      if (doc.numPages > ${maxPages}) return { tooLong: true };
      const pages = [];
      const longest = doc.numPages > 20 ? ${LONGEST_SIDE_MANY} : ${LONGEST_SIDE};
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(2, longest / Math.max(base.width, base.height)) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;
        pages.push(canvas.toDataURL('image/jpeg', 0.82).split(',')[1]);
        page.cleanup();
      }
      await doc.destroy();
      return { pages };
    })()`);
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('ATTACH_TIMEOUT')), TIME_LIMIT);
    });
    const result = await Promise.race([render, timeout]).catch(error => {
      throw new Error(error?.message === 'ATTACH_TIMEOUT' ? 'ATTACH_TIMEOUT' : 'ATTACH_READ_FAILED');
    });
    if (result?.tooLong) throw new Error('ATTACH_SCANNED_TOO_LONG');
    const pages: string[] = Array.isArray(result?.pages) ? result.pages.filter((p: unknown) => typeof p === 'string' && p) : [];
    if (!pages.length) throw new Error('ATTACH_NO_TEXT');
    if (pages.reduce((sum, p) => sum + p.length, 0) > TOTAL_BYTES) throw new Error('ATTACH_TOO_LARGE');
    return pages.map(data => ({ mime: 'image/jpeg' as const, data }));
  } finally {
    clearTimeout(timer);
    window.destroy();
  }
}
