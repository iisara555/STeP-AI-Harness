import { BrowserWindow, nativeImage } from 'electron';
import { receiptAlternateImageMime } from './receipt-image-input';

/** Decode WebP and BMP in a sandbox instead of relying on the native PNG/JPEG loader. */
export async function decodeReceiptImage(bytes: Buffer, extension: string) {
  if (['png', 'jpg', 'jpeg'].includes(extension)) return nativeImage.createFromBuffer(bytes);
  const mime = receiptAlternateImageMime(bytes, extension);
  const page = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true },
  });
  page.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  page.webContents.on('will-navigate', event => event.preventDefault());
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await page.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src blob:">'),
    );
    const converting = page.webContents.executeJavaScript(`(async () => {
      const bytes = Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}), c => c.charCodeAt(0));
      const image = await createImageBitmap(new Blob([bytes], { type: ${JSON.stringify(mime)} }));
      try {
        if (image.width * image.height > 40_000_000) throw new Error('Image dimensions exceed limit');
        const scale = Math.min(1, 2600 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d', { alpha: false });
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.95).slice('data:image/jpeg;base64,'.length);
      } finally {
        image.close();
      }
    })()`);
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('RECEIPT_VISION_IMAGE_UNSUPPORTED')), 15_000);
    });
    const result = await Promise.race([converting, timeout]);
    if (typeof result !== 'string' || !result || result.length > 12_000_000) throw new Error('RECEIPT_VISION_IMAGE_UNSUPPORTED');
    const image = nativeImage.createFromBuffer(Buffer.from(result, 'base64'));
    if (image.isEmpty()) throw new Error('RECEIPT_VISION_IMAGE_UNSUPPORTED');
    return image;
  } catch {
    throw new Error('RECEIPT_VISION_IMAGE_UNSUPPORTED');
  } finally {
    clearTimeout(timer);
    if (!page.isDestroyed()) page.destroy();
  }
}
