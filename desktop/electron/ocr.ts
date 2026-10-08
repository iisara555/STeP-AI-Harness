import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { open } from 'node:fs/promises';
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
  private starting?: Promise<OcrStatus>;
  private generation = 0;
  // `python` points at the interpreter to run; by default the experiment folder's own .venv.
  constructor(
    private folder: () => string,
    private base = OCR_URL,
    private python: () => string = () => ocrPython(this.folder()),
    private env: () => NodeJS.ProcessEnv = () => process.env,
    private launch: typeof spawn = spawn,
  ) {}

  async health() {
    try {
      const response = await fetch(this.base + '/api/health', { signal: AbortSignal.timeout(4000), cache: 'no-store' });
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
    if (this.starting) return this.starting;
    const pending = this.startWorker(this.generation);
    this.starting = pending;
    try {
      return await pending;
    } finally {
      if (this.starting === pending) this.starting = undefined;
    }
  }

  private async startWorker(generation: number): Promise<OcrStatus> {
    const check = () => {
      if (generation !== this.generation) throw new Error('OCR_START_FAILED');
    };
    const current = await this.health();
    check();
    if (current.running) {
      const status = await this.status();
      check();
      return status;
    }
    const folder = this.folder();
    if (!isOcrFolder(folder) || !existsSync(this.python())) throw new Error('OCR_NOT_INSTALLED');
    // No shell, no console window; the service binds to 127.0.0.1 by default.
    const child = this.launch(this.python(), ['app.py', '--no-browser'], {
      cwd: folder,
      windowsHide: true,
      shell: false,
      stdio: 'ignore',
      env: this.env(),
    });
    this.child = child;
    const finished = () => {
      if (this.child === child) this.child = undefined;
    };
    child.once('exit', finished);
    child.once('error', finished);
    for (let waited = 0; waited < 90_000; waited += 1000) {
      const health = await this.health();
      check();
      if (this.child !== child) break;
      if (health.running) {
        const status = await this.status();
        check();
        return status;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    check();
    if (this.child === child) this.stop();
    throw new Error('OCR_START_FAILED');
  }

  async recognize(path: string, crosscheck: boolean, tesseract = false, handwriting = false, signal?: AbortSignal) {
    const extension = extname(path).slice(1).toLowerCase();
    if (!OCR_EXTENSIONS.includes(extension)) throw new Error('OCR_UNSUPPORTED_FILE');
    const handle = await open(path, 'r');
    let bytes: Buffer<ArrayBuffer>;
    try {
      const info = await handle.stat();
      if (!info.isFile() || !info.size || info.size > OCR_MAX_BYTES) throw new Error('OCR_FILE_TOO_LARGE');
      const buffer = Buffer.alloc(info.size + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (offset !== info.size) throw new Error('OCR_FILE_CHANGED');
      bytes = buffer.subarray(0, offset);
    } finally {
      await handle.close();
    }
    const url = `${this.base}/api/ocr?filename=${encodeURIComponent(basename(path))}&threshold=0.80&handwriting=${handwriting ? 'on' : 'off'}&crosscheck=${crosscheck ? 'on' : 'off'}&tesseract=${tesseract ? 'on' : 'off'}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        body: bytes,
        headers: { 'Content-Type': 'application/octet-stream' },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(600_000)]) : AbortSignal.timeout(600_000),
      });
    } catch {
      if (signal?.aborted) throw new Error('CANCELLED');
      throw new Error('OCR_UNAVAILABLE');
    }
    const body: any = await response.json().catch(() => null);
    if (!response.ok || !body?.ok || !body.result) throw new Error('OCR_FAILED');
    return { bytes, extension, result: body.result };
  }

  // Only a service this app started is stopped; a server the user runs themselves is left alone.
  stop() {
    this.generation++;
    this.starting = undefined;
    const child = this.child;
    this.child = undefined;
    if (!child?.pid || child.exitCode !== null) return;
    if (process.platform === 'win32')
      this.launch('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' }).once(
        'error',
        () => {},
      );
    else child.kill();
  }
}
