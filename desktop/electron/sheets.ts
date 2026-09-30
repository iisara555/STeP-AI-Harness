import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
/** XLSX parsing is bounded in a disposable worker, without paths or network access. */
export function sheetWorker(
  bytes: Buffer,
  args: { sheet?: unknown; range?: unknown; edits?: unknown },
  signal: AbortSignal,
  workerPath = join(process.cwd(), 'electron/sheet-worker.cjs'),
) {
  if (signal.aborted) throw new Error('CANCELLED');
  return new Promise<any>((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: { bytes, ...args },
      execArgv: [],
      stdout: true,
      stderr: true,
      resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 },
    });
    worker.stdout.resume();
    worker.stderr.resume();
    let settled = false;
    const finish = (error?: Error, value?: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      void worker.terminate();
      if (error) reject(error);
      else resolve(value);
    };
    const stop = () => finish(new Error('CANCELLED'));
    const timer = setTimeout(() => finish(new Error('SHEET_TIMEOUT')), 20_000);
    signal.addEventListener('abort', stop, { once: true });
    worker.once('message', value => finish(value?.error ? new Error(value.error) : undefined, value));
    worker.once('error', () => finish(new Error('SHEET_READ_FAILED')));
    worker.once('exit', () => finish(new Error('SHEET_READ_FAILED')));
  });
}
