import { readdir, readFile, realpath, lstat, writeFile, open } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { StringDecoder } from 'node:string_decoder';
import type { BackgroundTask, FileChange } from '../src/tools';
import type { WorkPlan, WorkTask } from '../src/types';
import { Store } from './store';
import { sensitivePath, evaluatePermission } from './permissions';
import type { Policy } from './policy';
const execute = promisify(execFile);
const digest = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
export type FileSnapshot = { id: string; root: string; path: string; bytes: string; hash: string; at: string };
export function browserUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('INVALID_URL');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || input.length > 2000) throw new Error('INVALID_URL');
  return url.href;
}
export class Workbench {
  private children = new Map<string, ChildProcess>();
  private stopped = new Set<string>();
  private cancelling = new Set<string>();
  private disposed = false;
  rememberPlan(sessionId: string, text: string) {
    const session = this.store.session(sessionId);
    session.approvedPlan = text;
    this.store.save(session);
  }
  /** The plan approved in the native plan workflow, kept on the task for the execute workflow. */
  setWorkPlan(sessionId: string, plan: WorkPlan, text: string) {
    const session = this.store.session(sessionId);
    session.workPlan = plan;
    session.approvedPlan = text;
    this.store.save(session);
  }
  /** Ticks one task of the approved plan (1-based number); returns how many tasks are not done yet. */
  updateWorkTask(sessionId: string, number: number, status: WorkTask['status'], note: string) {
    const session = this.store.session(sessionId);
    const plan = session.workPlan;
    if (!plan || !Number.isSafeInteger(number) || !plan.tasks[number - 1]) throw new Error('PLAN_TASK_UNKNOWN');
    plan.tasks[number - 1] = { ...plan.tasks[number - 1], status, ...(note ? { note } : {}) };
    this.store.save(session);
    return plan.tasks.filter(t => t.status !== 'done').length;
  }
  constructor(
    private store: Store,
    private scrub: (text: string) => string = text => text,
    private policy?: () => Policy,
  ) {
    for (const task of this.store.list<BackgroundTask>('background'))
      if (task.status === 'running') {
        task.status = 'interrupted';
        this.store.put('background', task.id, task);
      }
  }
  async root() {
    const folder = this.store.settings().workspace;
    if (!folder) throw new Error('WORKSPACE_REQUIRED');
    return realpath(folder);
  }
  async path(input: string, missing = false) {
    if (typeof input !== 'string' || input.length > 2000 || input.includes('\0')) throw new Error('INVALID_PATH');
    const root = await this.root(),
      full = resolve(root, input || '.');
    const permitted = (path: string) => {
      if (sensitivePath(path, root)) throw new Error('INVALID_PATH');
      if (this.policy && !evaluatePermission({ tool: 'read', readOnly: true, path }, 'ask', this.policy(), { root }).allowed)
        throw new Error('PATH_RULE_DENIED');
    };
    permitted(full);
    const within = (path: string) => {
      const r = relative(root, path);
      if (r.startsWith('..') || isAbsolute(r)) throw new Error('INVALID_PATH');
    };
    within(full);
    try {
      const info = await lstat(full);
      if (info.isSymbolicLink()) throw new Error('INVALID_PATH');
      const actual = await realpath(full);
      within(actual);
      permitted(actual);
    } catch (e: any) {
      if (missing && e.code === 'ENOENT') {
        const parent = await realpath(dirname(full));
        within(parent);
        permitted(parent);
      } else throw e;
    }
    return full;
  }
  async files(input = '') {
    const directory = await this.path(input),
      root = await this.root();
    const entries = await readdir(directory, { withFileTypes: true });
    return {
      path: relative(root, directory),
      entries: entries
        .filter(
          e =>
            !e.isSymbolicLink() &&
            !sensitivePath(resolve(directory, e.name)) &&
            !['node_modules', 'release'].includes(e.name) &&
            (!this.policy ||
              evaluatePermission({ tool: 'files', readOnly: true, path: resolve(directory, e.name) }, 'ask', this.policy(), { root })
                .allowed),
        )
        .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
        .slice(0, 500)
        .map(e => ({ name: e.name, path: relative(root, resolve(directory, e.name)), directory: e.isDirectory() })),
    };
  }
  async read(input: string) {
    const path = await this.path(input),
      info = await lstat(path);
    if (!info.isFile() || info.size > 200000) throw new Error('FILE_LIMIT');
    const buffer = await readFile(path);
    if (buffer.includes(0)) throw new Error('FILE_BINARY');
    return { path: relative(await this.root(), path), text: buffer.toString('utf8') };
  }
  async bytes(input: string, limit = 8_000_000) {
    const path = await this.path(input);
    const handle = await open(path, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > limit) throw new Error('FILE_LIMIT');
      const buffer = Buffer.alloc(stat.size + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (offset !== stat.size) throw new Error('FILE_CONFLICT');
      return buffer.subarray(0, offset);
    } finally {
      await handle.close();
    }
  }
  async readChunk(input: string, offset = 0, length = 40_000) {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > 200_000)
      throw new Error('INVALID_INPUT');
    const buffer = await this.bytes(input, 8_000_000);
    if (buffer.includes(0)) throw new Error('FILE_BINARY');
    const text = buffer.toString('utf8');
    if (offset > text.length) throw new Error('INVALID_INPUT');
    const end = Math.min(text.length, offset + length);
    return {
      path: relative(await this.root(), await this.path(input)),
      text: text.slice(offset, end),
      offset,
      total: text.length,
      ...(end < text.length ? { nextOffset: end } : {}),
    };
  }
  async snapshot(input: string) {
    const root = await this.root(),
      bytes = await this.bytes(input);
    const snapshots = this.store.list<FileSnapshot>('file-snapshot');
    if (snapshots.length >= 30 || snapshots.reduce((sum, s) => sum + s.bytes.length, 0) + (bytes.length * 4) / 3 > 40_000_000)
      throw new Error('SNAPSHOT_LIMIT');
    const snap: FileSnapshot = {
      id: randomUUID(),
      root,
      path: relative(root, await this.path(input)),
      bytes: bytes.toString('base64'),
      hash: digest(bytes),
      at: new Date().toISOString(),
    };
    if (root !== (await this.root())) throw new Error('WORKSPACE_CHANGED');
    this.store.put('file-snapshot', snap.id, snap);
    return { id: snap.id, path: snap.path, at: snap.at };
  }
  async snapshots() {
    const root = await this.root();
    const visible = [];
    for (const s of this.store.list<FileSnapshot>('file-snapshot').filter(s => s.root === root)) {
      try {
        await this.path(s.path, true);
        visible.push({ id: s.id, path: s.path, at: s.at });
      } catch {
        /* Current policy also applies to old backups. */
      }
    }
    return visible;
  }
  async stageBytes(input: string, bytes: Buffer, before: string, after: string, expectedHash?: string) {
    if (bytes.length > 8_000_000) throw new Error('FILE_LIMIT');
    const root = await this.root(),
      path = await this.path(input),
      existing = await this.bytes(input);
    if (expectedHash && digest(existing) !== expectedHash) throw new Error('FILE_CONFLICT');
    if (root !== (await this.root())) throw new Error('WORKSPACE_CHANGED');
    const change: FileChange = {
      id: randomUUID(),
      root,
      path: relative(root, path),
      before,
      after,
      hash: digest(existing),
      binary: bytes.toString('base64'),
      at: new Date().toISOString(),
    };
    this.store.put('change', change.id, change);
    return { id: change.id, path: change.path, before, after };
  }
  async restoreSnapshot(id: string) {
    const snap = this.store.get<FileSnapshot>('file-snapshot', id);
    if (!snap || snap.root !== (await this.root())) throw new Error('SNAPSHOT_NOT_FOUND');
    await this.path(snap.path);
    const bytes = Buffer.from(snap.bytes, 'base64');
    if (digest(bytes) !== snap.hash) throw new Error('FILE_CONFLICT');
    const text = bytes.toString('utf8');
    if (!bytes.includes(0) && text.length <= 200_000 && Buffer.from(text).equals(bytes)) return this.stage(snap.path, text);
    const current = await this.bytes(snap.path);
    return this.stageBytes(
      snap.path,
      bytes,
      `Current file: ${current.length} bytes; SHA256 ${digest(current)}`,
      `Restore ${bytes.length} bytes from ${snap.at}; SHA256 ${snap.hash}`,
      digest(current),
    );
  }
  async forgetSnapshot(id: string) {
    const snap = this.store.get<FileSnapshot>('file-snapshot', id);
    if (!snap || snap.root !== (await this.root())) throw new Error('SNAPSHOT_NOT_FOUND');
    await this.path(snap.path, true);
    this.store.remove('file-snapshot', id);
    return true;
  }
  async stage(input: string, content: string) {
    if (typeof content !== 'string' || content.length > 200000) throw new Error('FILE_LIMIT');
    const root = await this.root(),
      path = await this.path(input, true);
    let before = '',
      exists = true;
    try {
      before = (await this.read(input)).text;
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
      exists = false;
    }
    const change: FileChange = {
      id: randomUUID(),
      root,
      path: relative(root, path),
      before,
      after: content,
      hash: exists ? digest(before) : 'missing',
      at: new Date().toISOString(),
    };
    if (root !== (await this.root())) throw new Error('WORKSPACE_CHANGED');
    this.store.put('change', change.id, change);
    return change;
  }
  change(id: string) {
    const c = this.store.get<FileChange>('change', id);
    if (!c) throw new Error('CHANGE_NOT_FOUND');
    return c;
  }
  async apply(id: string) {
    const change = this.change(id);
    if (change.root !== (await this.root())) throw new Error('WORKSPACE_CHANGED');
    const path = await this.path(change.path, true);
    let hash = 'missing';
    try {
      hash = change.binary ? digest(await this.bytes(change.path)) : digest((await this.read(change.path)).text);
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (hash !== change.hash) throw new Error('FILE_CONFLICT');
    // Recheck real paths after the approval dialog; never follow a replaced junction.
    await this.path(change.path, true);
    if (hash !== 'missing') {
      change.snapshotId = (await this.snapshot(change.path)).id;
      const backup = this.store.get<FileSnapshot>('file-snapshot', change.snapshotId)!;
      if (backup.hash !== hash) throw new Error('FILE_CONFLICT');
    }
    await this.path(change.path, true);
    if (change.root !== (await this.root())) throw new Error('WORKSPACE_CHANGED');
    await writeFile(path, change.binary ? Buffer.from(change.binary, 'base64') : change.after, { flag: hash === 'missing' ? 'wx' : 'w' });
    this.store.remove('change', id);
    return { path: change.path, snapshotId: change.snapshotId };
  }
  async changes() {
    const root = await this.root();
    const changes: Omit<FileChange, 'binary'>[] = [];
    for (const c of this.store.list<FileChange>('change').filter(c => c.root === root)) {
      try {
        await this.path(c.path, true);
        const { binary, ...preview } = c;
        changes.push(preview);
      } catch {
        /* Current policy hides old staged changes too. */
      }
    }
    return changes;
  }
  reject(id: string) {
    this.change(id);
    this.store.remove('change', id);
  }
  async diff() {
    const root = await this.root();
    try {
      const status = await execute('git', ['-C', root, '-c', 'core.fsmonitor=false', 'status', '--short'], {
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 500000,
      });
      const names = await execute('git', ['-C', root, '-c', 'core.fsmonitor=false', 'diff', '--name-only', '-z', 'HEAD', '--'], {
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 500000,
      });
      const paths: string[] = [];
      for (const path of names.stdout.split('\0').filter(Boolean)) {
        try {
          await this.path(path, true);
          paths.push(path);
        } catch {
          /* Hidden and inaccessible files never enter the diff. */
        }
      }
      if (!paths.length) return { status: this.scrub(status.stdout), diff: '' };
      const diff = await execute(
        'git',
        ['-C', root, '-c', 'core.fsmonitor=false', '--no-pager', 'diff', '--no-ext-diff', '--no-textconv', 'HEAD', '--', ...paths],
        {
          windowsHide: true,
          timeout: 15000,
          maxBuffer: 500000,
        },
      );
      return { status: this.scrub(status.stdout), diff: this.scrub(diff.stdout) };
    } catch {
      throw new Error('GIT_DIFF_UNAVAILABLE');
    }
  }
  async start(command: string) {
    if (typeof command !== 'string' || !command.trim() || command.length > 2000 || command.includes('\0'))
      throw new Error('INVALID_COMMAND');
    if (this.children.size >= 4) throw new Error('TASK_LIMIT');
    const cwd = await this.root(),
      id = randomUUID();
    const task: BackgroundTask = { id, command: this.scrub(command), cwd, status: 'running', output: '', at: new Date().toISOString() };
    this.store.put('background', id, task);
    // Credentials are not passed to a shell. The user may still run commands with their own OS permissions.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k, v]) => v !== undefined && !/token|secret|password|api.?key|authorization/i.test(k)),
    );
    const child =
      process.platform === 'win32'
        ? spawn(
            'powershell.exe',
            [
              '-NoLogo',
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              '$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); ' + command,
            ],
            { cwd, env, windowsHide: true },
          )
        : spawn('/bin/sh', ['-c', command], { cwd, env, detached: true });
    this.children.set(id, child);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (!this.disposed) this.store.put('background', id, task);
    };
    const append = (text: string) => {
      task.output = this.scrub((task.output + text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')).slice(-100000));
      if (!timer) timer = setTimeout(flush, 150);
    };
    const stdout = new StringDecoder('utf8'),
      stderr = new StringDecoder('utf8');
    child.stdout?.on('data', (data: Buffer) => append(stdout.write(data)));
    child.stderr?.on('data', (data: Buffer) => append(stderr.write(data)));
    const finish = (code: number | null) => {
      append(stdout.end() + stderr.end());
      task.status = this.stopped.has(id) ? 'cancelled' : code === 0 ? 'done' : 'failed';
      task.code = code;
      this.children.delete(id);
      this.stopped.delete(id);
      flush();
    };
    child.once('error', () => finish(null));
    child.once('close', finish);
    return task;
  }
  tasks() {
    return this.store
      .list<BackgroundTask>('background')
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 50);
  }
  async cancel(id: string) {
    const child = this.children.get(id);
    if (!child || this.cancelling.has(id)) return;
    this.cancelling.add(id);
    this.stopped.add(id);
    try {
      if (child.pid && process.platform === 'win32')
        await execute('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, timeout: 5000 }).catch(() => {});
      else if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          child.kill();
        }
      }
    } finally {
      this.cancelling.delete(id);
    }
  }
  async close() {
    const pending = [...this.children.values()].map(
      child =>
        new Promise<void>(resolve => {
          const timer = setTimeout(resolve, 5000);
          child.once('close', () => {
            clearTimeout(timer);
            resolve();
          });
        }),
    );
    await Promise.all([...this.children.keys()].map(id => this.cancel(id)));
    await Promise.all(pending);
    this.disposed = true;
  }
}
