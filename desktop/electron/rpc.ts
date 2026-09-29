import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

export class Rpc {
  private child: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private stopped?: Error;
  private closeListeners = new Set<(error: Error) => void>();
  private pending = new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }>();
  onNotification: (method: string, params: any) => void = () => {};
  onRequest: (method: string, params: any) => Promise<any> = async () => { throw new Error('TOOL_DENIED'); };
  // Plain-text stdout lines, such as a CLI login prompt printed outside the JSON-RPC stream.
  onText: (line: string) => void = () => {};
  constructor(command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }) {
    this.child = spawn(command, args, { ...options, detached: process.platform !== 'win32', windowsHide: true, shell: false, stdio: 'pipe' });
    this.child.stderr.resume();
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', line => {
      if (line.length > 4_000_000) return this.close();
      let message: any; try { message = JSON.parse(line); } catch { this.onText(line.replace(/\x1b\[[0-9;?<>]*[A-Za-z]/g, '')); return; }
      if (message.method && message.id !== undefined) {
        void this.onRequest(message.method, message.params).then(
          result => this.write({ jsonrpc: '2.0', id: message.id, result }),
          () => this.write({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Tool unavailable in STeP draft mode' } }),
        );
      } else if (message.method) this.onNotification(message.method, message.params);
      else {
        const entry = this.pending.get(message.id); if (!entry) return;
        clearTimeout(entry.timer); this.pending.delete(message.id);
        if (message.error) entry.reject(new Error('PROVIDER_REQUEST_FAILED')); else entry.resolve(message.result);
      }
    });
    this.child.on('error', () => this.stop('RUNTIME_UNAVAILABLE'));
    this.child.on('exit', () => this.stop('RUNTIME_EXITED'));
    this.child.stdin.on('error', () => this.stop('RUNTIME_EXITED'));
  }
  onClose(listener: (error: Error) => void) {
    if (this.stopped) listener(this.stopped); else this.closeListeners.add(listener);
    return () => { this.closeListeners.delete(listener); };
  }
  private stop(reason: string) {
    if (this.stopped) return;
    this.stopped = new Error(reason); this.rejectAll(reason);
    for (const listener of this.closeListeners) listener(this.stopped);
    this.closeListeners.clear();
  }
  private rejectAll(reason: string) { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(reason)); } this.pending.clear(); }
  private write(message: unknown) { if (!this.child.stdin.destroyed) this.child.stdin.write(JSON.stringify(message) + '\n'); }
  request(method: string, params: unknown, timeout = 60_000): Promise<any> {
    if (this.stopped) return Promise.reject(this.stopped);
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('PROVIDER_TIMEOUT')); }, timeout);
      this.pending.set(id, { resolve, reject, timer }); this.write({ jsonrpc: '2.0', id, method, params });
    });
  }
  notify(method: string, params: unknown = {}) { this.write({ jsonrpc: '2.0', method, params }); }
  // Answer a plain-text prompt from the CLI; callers validate the content first.
  writeText(text: string) { if (!this.child.stdin.destroyed) this.child.stdin.write(text + '\n'); }
  close(reason = 'CANCELLED') {
    this.stop(reason);
    const pid = this.child.pid;
    if (!pid || this.child.exitCode !== null || this.child.signalCode !== null) return;
    if (process.platform === 'win32') {
      const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' });
      killer.on('error', () => this.child.kill());
    } else {
      try { process.kill(-pid, 'SIGKILL'); } catch { this.child.kill(); }
    }
  }
}
