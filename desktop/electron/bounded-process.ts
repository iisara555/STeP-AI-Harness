import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export async function killTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === 'win32')
    await exec('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }).catch(() => {});
  else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}
export async function killPidTree(pid: number) {
  if (process.platform === 'win32') {
    await exec('taskkill.exe', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }).catch(() => {});
    return;
  }
  const table = await exec('ps', ['-A', '-o', 'pid=,ppid='], { timeout: 5000, maxBuffer: 500_000 }).catch(() => ({ stdout: '' }));
  const rows = table.stdout
    .trim()
    .split('\n')
    .map(line => line.trim().split(/\s+/).map(Number));
  const descendants = new Set<number>([pid]);
  for (let changed = true; changed;) {
    changed = false;
    for (const [child, parent] of rows)
      if (descendants.has(parent) && !descendants.has(child)) {
        descendants.add(child);
        changed = true;
      }
  }
  for (const child of [...descendants].reverse())
    if (child > 1 && child !== process.pid) {
      try {
        process.kill(child, 'SIGKILL');
      } catch {}
    }
}
export function processResult(
  command: string,
  args: string[],
  options: { cwd?: string; signal?: AbortSignal; timeout?: number; limit?: number; env?: NodeJS.ProcessEnv } = {},
) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    if (options.signal?.aborted) return reject(new Error('CANCELLED'));
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '',
      size = 0,
      failure = '';
    const stop = (code: string) => {
      if (!failure) {
        failure = code;
        void killTree(child);
      }
    };
    const cancel = () => stop('CANCELLED');
    const timer = setTimeout(() => stop('PROCESS_TIMEOUT'), options.timeout || 60_000);
    options.signal?.addEventListener('abort', cancel, { once: true });
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > (options.limit || 200_000)) stop('OUTPUT_LIMIT');
      else output += chunk.toString('utf8');
    };
    child.stdout.on('data', data);
    child.stderr.on('data', data);
    const clean = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    };
    child.on('error', () => {
      clean();
      reject(new Error('PROCESS_UNAVAILABLE'));
    });
    child.on('close', code => {
      clean();
      if (failure) reject(new Error(failure));
      else resolve({ code, output });
    });
  });
}
