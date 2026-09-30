import { readdir, readFile, realpath, lstat, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { StringDecoder } from 'node:string_decoder';
import type { BackgroundTask, FileChange } from '../src/tools';
import { Store } from './store';
const execute = promisify(execFile);
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const privateFile = (path: string) =>
  path.split(/[/\\]/).some(part => /^(?:\.env(?:\..*)?|\.ssh|\.aws|\.git|\.codex|credentials.*|.*\.(?:pem|p12|key))$/i.test(part));
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
  constructor(
    private store: Store,
    private scrub: (text: string) => string = text => text,
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
    if (typeof input !== 'string' || input.length > 2000 || input.includes('\0') || privateFile(input)) throw new Error('INVALID_PATH');
    const root = await this.root(),
      full = resolve(root, input || '.');
    const within = (path: string) => {
      const r = relative(root, path);
      if (r.startsWith('..') || isAbsolute(r)) throw new Error('INVALID_PATH');
    };
    within(full);
    try {
      const info = await lstat(full);
      if (info.isSymbolicLink()) throw new Error('INVALID_PATH');
      within(await realpath(full));
    } catch (e: any) {
      if (missing && e.code === 'ENOENT') within(await realpath(dirname(full)));
      else throw e;
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
        .filter(e => !e.isSymbolicLink() && !privateFile(e.name) && !['node_modules', 'release'].includes(e.name))
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
  async stage(input: string, content: string) {
    if (typeof content !== 'string' || content.length > 200000) throw new Error('FILE_LIMIT');
    const path = await this.path(input, true);
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
      root: await this.root(),
      path: relative(await this.root(), path),
      before,
      after: content,
      hash: exists ? digest(before) : 'missing',
      at: new Date().toISOString(),
    };
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
      hash = digest((await this.read(change.path)).text);
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (hash !== change.hash) throw new Error('FILE_CONFLICT');
    // Recheck real paths after the approval dialog; never follow a replaced junction.
    await this.path(change.path, true);
    await writeFile(path, change.after, { flag: hash === 'missing' ? 'wx' : 'w' });
    this.store.remove('change', id);
    return { path: change.path };
  }
  changes() {
    return this.store.list<FileChange>('change');
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
      const diff = await execute(
        'git',
        ['-C', root, '-c', 'core.fsmonitor=false', '--no-pager', 'diff', '--no-ext-diff', '--no-textconv', 'HEAD', '--'],
        {
          windowsHide: true,
          timeout: 15000,
          maxBuffer: 500000,
        },
      );
      return { status: status.stdout, diff: diff.stdout };
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
    const task: BackgroundTask = { id, command, cwd, status: 'running', output: '', at: new Date().toISOString() };
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
