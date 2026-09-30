import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { scrub } from './diagnostics';

export class Rpc {
  private child: ChildProcessWithoutNullStreams;
  private childClosed: Promise<void>;
  private termination?: Promise<void>;
  private closing = false;
  private sequence = 0;
  private stopped?: Error;
  private tail: string[] = [];
  private closeListeners = new Set<(error: Error) => void>();
  private pending = new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }>();
  onNotification: (method: string, params: any) => void = () => {};
  onRequest: (method: string, params: any) => Promise<any> = async () => {
    throw new Error('TOOL_DENIED');
  };
  // Plain-text stdout lines, such as a CLI login prompt printed outside the JSON-RPC stream.
  onText: (line: string) => void = () => {};
  constructor(command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }) {
    this.child = spawn(command, args, {
      ...options,
      detached: process.platform !== 'win32',
      windowsHide: true,
      shell: false,
      stdio: 'pipe',
    });
    // 'exit' rejects requests immediately; 'close' also waits for stdio handles.
    this.childClosed = new Promise(resolve => this.child.once('close', () => resolve()));
    createInterface({ input: this.child.stderr }).on('line', line => this.remember(line));
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', line => {
      if (line.length > 4_000_000) return this.close();
      let message: any;
      try {
        message = JSON.parse(line);
      } catch {
        const text = line.replace(/\x1b\[[0-9;?<>]*[A-Za-z]/g, '');
        this.remember(text);
        this.onText(text);
        return;
      }
      if (message.method && message.id !== undefined) {
        void this.onRequest(message.method, message.params).then(
          result => this.write({ jsonrpc: '2.0', id: message.id, result }),
          () => this.write({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Tool unavailable in STeP draft mode' } }),
        );
      } else if (message.method) this.onNotification(message.method, message.params);
      else {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        clearTimeout(entry.timer);
        this.pending.delete(message.id);
        // The provider's own reason is kept (scrubbed) so the failure can be explained.
        if (message.error) {
          this.note(`error: ${message.error.message || ''} ${message.error.data ? JSON.stringify(message.error.data).slice(0, 400) : ''}`);
          entry.reject(new Error('PROVIDER_REQUEST_FAILED'));
        } else entry.resolve(message.result);
      }
    });
    this.child.on('error', () => this.stop('RUNTIME_UNAVAILABLE'));
    this.child.on('exit', () => this.stop('RUNTIME_EXITED'));
    this.child.stdin.on('error', () => this.stop('RUNTIME_EXITED'));
  }
  /** Adds a provider-reported message (scrubbed) to the tail used to explain failures. */
  note(line: string) {
    this.remember(line);
  }
  private remember(line: string) {
    const clean = scrub(line);
    if (!clean) return;
    this.tail.push(clean);
    if (this.tail.length > 30) this.tail.shift();
  }
  /** Last scrubbed runtime messages, for explaining a failure. */
  stderrTail() {
    return this.tail.slice();
  }
  onClose(listener: (error: Error) => void) {
    if (this.stopped) listener(this.stopped);
    else this.closeListeners.add(listener);
    return () => {
      this.closeListeners.delete(listener);
    };
  }
  private stop(reason: string) {
    if (this.stopped) return;
    this.stopped = new Error(reason);
    this.rejectAll(reason);
    for (const listener of this.closeListeners) listener(this.stopped);
    this.closeListeners.clear();
  }
  private rejectAll(reason: string) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }
  private write(message: unknown) {
    if (!this.child.stdin.destroyed) this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  request(method: string, params: unknown, timeout = 60_000): Promise<any> {
    if (this.stopped) return Promise.reject(this.stopped);
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('PROVIDER_TIMEOUT'));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ jsonrpc: '2.0', id, method, params });
    });
  }
  notify(method: string, params: unknown = {}) {
    this.write({ jsonrpc: '2.0', method, params });
  }
  // Answer a plain-text prompt from the CLI; callers validate the content first.
  writeText(text: string) {
    if (!this.child.stdin.destroyed) this.child.stdin.write(text + '\n');
  }
  close(reason = 'CANCELLED') {
    this.stop(reason);
    if (this.closing) return;
    this.closing = true;
    const pid = this.child.pid;
    if (!pid || this.child.exitCode !== null || this.child.signalCode !== null) return;
    if (process.platform === 'win32') {
      this.termination = new Promise(resolve => {
        const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' });
        killer.on('error', () => {
          this.child.kill();
          resolve();
        });
        killer.on('close', code => {
          if (code !== 0 && this.child.exitCode === null && this.child.signalCode === null) this.child.kill();
          resolve();
        });
      });
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        this.child.kill();
      }
    }
  }
  /** Terminate once and wait for the process tree and stdio to release their handles. */
  async closeAndWait(reason = 'CANCELLED', timeoutMs = 5000): Promise<void> {
    this.close(reason);
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.all([this.childClosed, this.termination]),
        new Promise<void>((_, reject) => {
          timer = setTimeout(() => reject(new Error('RUNTIME_SHUTDOWN_TIMEOUT')), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
