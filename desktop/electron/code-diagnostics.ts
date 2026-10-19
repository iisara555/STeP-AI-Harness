import { Worker } from 'node:worker_threads';
export function codeDiagnostics(files: { path: string; text: string }[], target: string, signal: AbortSignal, workerPath: string) {
  if (signal.aborted) throw new Error('CANCELLED');
  return new Promise<any>((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: { files, target },
      execArgv: [],
      stdout: true,
      stderr: true,
      resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 },
    });
    worker.stdout.resume();
    worker.stderr.resume();
    let settled = false;
    const finish = (error?: Error, result?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      void worker.terminate();
      if (error) reject(error);
      else resolve(result);
    };
    const abort = () => finish(new Error('CANCELLED'));
    const timer = setTimeout(() => finish(new Error('CODE_DIAGNOSTICS_TIMEOUT')), 15000);
    signal.addEventListener('abort', abort, { once: true });
    worker.once('message', result => finish(result.error ? new Error('CODE_DIAGNOSTICS_FAILED') : undefined, result));
    worker.once('error', () => finish(new Error('CODE_DIAGNOSTICS_FAILED')));
    worker.once('exit', () => {
      if (!settled) finish(new Error('CODE_DIAGNOSTICS_FAILED'));
    });
  });
}
