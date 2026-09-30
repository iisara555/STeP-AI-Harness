import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

// Client for the standalone local Thai OCR trial (experiments/local-thai-ocr).
// Receipts go only to the service on this computer; the address is fixed to loopback.
export const OCR_URL = 'http://127.0.0.1:8765';
export const OCR_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'];
export const OCR_MAX_BYTES = 25 * 1024 * 1024;

export type OcrStatus = {
  running: boolean;
  crosscheck: boolean;
  handwriting: boolean;
  tesseract: boolean;
  installed: boolean;
  folder: string;
};

export function ocrPython(folder: string) {
  return process.platform === 'win32' ? join(folder, '.venv', 'Scripts', 'python.exe') : join(folder, '.venv', 'bin', 'python');
}
export const isOcrFolder = (folder: string) =>
  Boolean(folder) && existsSync(join(folder, 'app.py')) && existsSync(join(folder, 'web', 'receipt-review.js'));

export class OcrService {
  private child?: ChildProcess;
  // `python` points at the interpreter to run; by default the experiment folder's own .venv.
  constructor(
    private folder: () => string,
    private base = OCR_URL,
    private python: () => string = () => ocrPython(this.folder()),
    private env: () => NodeJS.ProcessEnv = () => process.env,
  ) {}

  async health() {
    try {
      const response = await fetch(this.base + '/api/health', { signal: AbortSignal.timeout(1500), cache: 'no-store' });
      const body: any = await response.json();
      // Only accept the STeP service, not whatever else happens to listen on the port.
      return response.ok && body?.ok === true && body.service === 'STeP Local Thai OCR'
        ? {
            running: true,
            crosscheck: body.crosscheck_installed === true,
            handwriting: body.handwriting_installed === true,
            tesseract: body.tesseract_installed === true,
          }
        : { running: false, crosscheck: false, handwriting: false, tesseract: false };
    } catch {
      return { running: false, crosscheck: false, handwriting: false, tesseract: false };
    }
  }

  async status(): Promise<OcrStatus> {
    const folder = this.folder(),
      health = await this.health();
    return { ...health, installed: isOcrFolder(folder) && existsSync(this.python()), folder };
  }

  async start() {
    if ((await this.health()).running) return this.status();
    const folder = this.folder();
    if (!isOcrFolder(folder) || !existsSync(this.python())) throw new Error('OCR_NOT_INSTALLED');
    // No shell, no console window; the service binds to 127.0.0.1 by default.
    this.child = spawn(this.python(), ['app.py', '--no-browser'], {
      cwd: folder,
      windowsHide: true,
      shell: false,
      stdio: 'ignore',
      env: this.env(),
    });
    this.child.on('exit', () => {
      this.child = undefined;
    });
    for (let waited = 0; waited < 90_000; waited += 1000) {
      if ((await this.health()).running) return this.status();
      if (!this.child) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    this.stop();
    throw new Error('OCR_START_FAILED');
  }

  async recognize(path: string, crosscheck: boolean, tesseract = false, handwriting = false) {
    const extension = extname(path).slice(1).toLowerCase();
    if (!OCR_EXTENSIONS.includes(extension)) throw new Error('OCR_UNSUPPORTED_FILE');
    const size = (await stat(path)).size;
    if (!size || size > OCR_MAX_BYTES) throw new Error('OCR_FILE_TOO_LARGE');
    const bytes = await readFile(path);
    const url = `${this.base}/api/ocr?filename=${encodeURIComponent(basename(path))}&threshold=0.80&handwriting=${handwriting ? 'on' : 'off'}&crosscheck=${crosscheck ? 'on' : 'off'}&tesseract=${tesseract ? 'on' : 'off'}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        body: bytes,
        headers: { 'Content-Type': 'application/octet-stream' },
        signal: AbortSignal.timeout(600_000),
      });
    } catch {
      throw new Error('OCR_UNAVAILABLE');
    }
    const body: any = await response.json().catch(() => null);
    if (!response.ok || !body?.ok || !body.result) throw new Error('OCR_FAILED');
    return { bytes, extension, result: body.result };
  }

  // Only a service this app started is stopped; a server the user runs themselves is left alone.
  stop() {
    const child = this.child;
    this.child = undefined;
    if (!child?.pid || child.exitCode !== null) return;
    if (process.platform === 'win32')
      spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' });
    else child.kill();
  }
}
