import { constants } from 'node:fs';
import { searchWorkspace } from './file-search';
import { readdir, readFile, realpath, lstat, writeFile, open } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { StringDecoder } from 'node:string_decoder';
import type { BackgroundTask, FileChange } from '../src/tools';
import { taskAction } from '../src/tools';
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
    // Refuse every symlink/junction component, not just the final leaf.
    let ancestor = full === root ? root : dirname(full);
    while (ancestor !== root) {
      if ((await lstat(ancestor)).isSymbolicLink()) throw new Error('INVALID_PATH');
      permitted(ancestor);
      ancestor = dirname(ancestor);
    }
    try {
      const info = await lstat(full);
      if (info.isSymbolicLink() || (info.isFile() && info.nlink > 1)) throw new Error('INVALID_PATH');
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
  async searchFiles(
    input: string,
    args: Record<string, unknown> = {},
    review: (text: string) => string = text => text,
    check: () => Promise<void> = async () => {},
  ) {
    const root = await this.root();
    return searchWorkspace(root, input, args, {
      path: path => this.path(path),
      bytes: (path, limit) => this.bytes(path, limit),
      review,
      check: async () => {
        await check();
        if (root !== (await this.root())) throw new Error('WORKSPACE_CHANGED');
      },
    });
  }
  async patch(input: string, args: Record<string, unknown>) {
    const old = args.old_string,
      replacement = args.new_string,
      expected = args.expectedHash;
    if (
      typeof old !== 'string' ||
      !old ||
      old.length > 200000 ||
      typeof replacement !== 'string' ||
      replacement.length > 200000 ||
      old === replacement ||
      (expected !== undefined && (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)))
    )
      throw new Error('INVALID_INPUT');
    const root = await this.root(),
      bytes = await this.bytes(input, 200000),
      before = bytes.toString('utf8');
    if (bytes.includes(0) || !Buffer.from(before).equals(bytes)) throw new Error('FILE_BINARY');
    const hash = digest(bytes);
    if (expected !== undefined && expected !== hash) throw new Error('FILE_CONFLICT');
    const index = before.indexOf(old);
    if (index < 0) throw new Error('PATCH_NO_MATCH');
    if (before.indexOf(old, index + 1) >= 0) throw new Error('PATCH_AMBIGUOUS');
    const after = before.slice(0, index) + replacement + before.slice(index + old.length),
      output = Buffer.from(after);
    if (output.includes(0) || output.toString('utf8') !== after) throw new Error('FILE_BINARY');
    if (output.length > 200000) throw new Error('FILE_LIMIT');
    if (root !== (await this.root())) throw new Error('WORKSPACE_CHANGED');
    return this.stageBytes(input, output, before, after, hash);
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
    const before = await lstat(path);
    if (before.isSymbolicLink()) throw new Error('INVALID_PATH');
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const stat = await handle.stat();
      if (stat.dev !== before.dev || stat.ino !== before.ino) throw new Error('FILE_CONFLICT');
      if (!stat.isFile() || stat.size > limit) throw new Error('FILE_LIMIT');
      if (stat.nlink > 1) throw new Error('INVALID_PATH');
      const buffer = Buffer.alloc(stat.size + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (offset !== stat.size) throw new Error('FILE_CONFLICT');
      await this.path(path);
      const current = await lstat(path),
        after = await handle.stat();
      if (
        current.dev !== stat.dev ||
        current.ino !== stat.ino ||
        after.size !== stat.size ||
        after.mtimeMs !== stat.mtimeMs ||
        after.ctimeMs !== stat.ctimeMs
      )
        throw new Error('FILE_CONFLICT');
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
  async stageBytes(input: string, bytes: Buffer, before: string, after: string, expectedHash?: string, create = false) {
    if (bytes.length > 8_000_000) throw new Error('FILE_LIMIT');
    const root = await this.root(),
      path = await this.path(input, create);
    let existing: Buffer | undefined;
    try {
      existing = await this.bytes(input);
    } catch (e: any) {
      if (!create || e.code !== 'ENOENT') throw e;
    }
    if (create && existing) throw new Error('FILE_EXISTS');
    if (expectedHash && (!existing || digest(existing) !== expectedHash)) throw new Error('FILE_CONFLICT');
    if (root !== (await this.root())) throw new Error('WORKSPACE_CHANGED');
    const change: FileChange = {
      id: randomUUID(),
      root,
      path: relative(root, path),
      before,
      after,
      hash: existing ? digest(existing) : 'missing',
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
    if (hash === 'missing') {
      await writeFile(path, change.binary ? Buffer.from(change.binary, 'base64') : change.after, { flag: 'wx' });
    } else {
      // Open without truncation/following links. Verify the same handle before any byte mutation.
      const handle = await open(path, constants.O_RDWR | (constants.O_NOFOLLOW || 0));
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.nlink > 1) throw new Error('INVALID_PATH');
        if (stat.size > 8_000_000) throw new Error('FILE_LIMIT');
        if (hash !== 'missing') {
          const buffer = Buffer.alloc(stat.size + 1);
          let offset = 0;
          while (offset < buffer.length) {
            const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
            if (!bytesRead) break;
            offset += bytesRead;
          }
          if (offset !== stat.size || digest(buffer.subarray(0, offset)) !== hash) throw new Error('FILE_CONFLICT');
        }
        await this.path(change.path);
        const current = await lstat(path),
          latest = await handle.stat();
        if (
          current.dev !== stat.dev ||
          current.ino !== stat.ino ||
          latest.mtimeMs !== stat.mtimeMs ||
          latest.ctimeMs !== stat.ctimeMs ||
          latest.size !== stat.size
        )
          throw new Error('FILE_CONFLICT');
        if (change.root !== (await this.root())) throw new Error('WORKSPACE_CHANGED');
        const output = change.binary ? Buffer.from(change.binary, 'base64') : Buffer.from(change.after);
        // Explicit position avoids the read cursor and truncates only after preconditions hold.
        let written = 0;
        while (written < output.length) {
          const result = await handle.write(output, written, output.length - written, written);
          if (!result.bytesWritten) throw new Error('FILE_CONFLICT');
          written += result.bytesWritten;
        }
        await handle.truncate(output.length);
      } finally {
        await handle.close();
      }
    }
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
      const status = await execute('git', ['-C', root, '-c', 'core.fsmonitor=false', 'status', '--short', '-z'], {
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 500000,
      });
      const statusEntries = status.stdout.split('\0'),
        visibleStatus: string[] = [],
        hiddenDiffPaths = new Set<string>();
      for (let i = 0; i < statusEntries.length; i++) {
        const entry = statusEntries[i];
        if (entry.length < 4) continue;
        const code = entry.slice(0, 2),
          targets = [entry.slice(3)];
        // Porcelain -z gives the destination first, followed by the source for a rename/copy.
        if (/[RC]/.test(code)) {
          const source = statusEntries[++i];
          if (!source) continue;
          targets.push(source);
        }
        try {
          for (const target of targets) await this.path(target, true);
          visibleStatus.push(
            code +
              ' ' +
              targets
                .map(target => JSON.stringify(target))
                .reverse()
                .join(' -> '),
          );
        } catch {
          for (const target of targets) hiddenDiffPaths.add(target);
        }
      }
      const cleanStatus = this.scrub(visibleStatus.join('\n'));
      const names = await execute('git', ['-C', root, '-c', 'core.fsmonitor=false', 'diff', '--name-only', '-z', 'HEAD', '--'], {
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 500000,
      });
      const paths: string[] = [];
      for (const path of names.stdout.split('\0').filter(Boolean)) {
        if (hiddenDiffPaths.has(path)) continue;
        try {
          await this.path(path, true);
          paths.push(path);
        } catch {
          /* Hidden and inaccessible files never enter the diff. */
        }
      }
      if (!paths.length) return { status: cleanStatus, diff: '' };
      const diff = await execute(
        'git',
        [
          '-C',
          root,
          '--literal-pathspecs',
          '-c',
          'core.fsmonitor=false',
          '--no-pager',
          'diff',
          '--no-ext-diff',
          '--no-textconv',
          'HEAD',
          '--',
          ...paths,
        ],
        {
          windowsHide: true,
          timeout: 15000,
          maxBuffer: 500000,
        },
      );
      return { status: cleanStatus, diff: this.scrub(diff.stdout) };
    } catch {
      throw new Error('GIT_DIFF_UNAVAILABLE');
    }
  }
  async start(command: string, sessionId?: string) {
    if (typeof command !== 'string' || !command.trim() || command.length > 2000 || command.includes('\0'))
      throw new Error('INVALID_COMMAND');
    if (this.children.size >= 4) throw new Error('TASK_LIMIT');
    const cwd = await this.root(),
      id = randomUUID();
    const task: BackgroundTask = {
      id,
      sessionId,
      command: this.scrub(command),
      cwd,
      status: 'running',
      output: '',
      at: new Date().toISOString(),
    };
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
    // Output is masked in complete lines (LF or CR) and then only appended, so absolute poll cursors never move. An
    // unfinished line stays in an internal raw buffer until it ends or the process exits; only an unfinished line
    // over 8,000 characters is released early, at its last space so a token is not cut. Each chunk is masked together
    // with the raw tail already committed on its stream (`context`, never shown), so a credential whose key and value
    // fall on either side of a cut, or on consecutive lines, is still recognised. Only the masked continuation is
    // appended; when masking now reaches back into text already shown, the corrected end is shown again instead.
    const pending = { out: '', err: '' },
      context = { out: '', err: '' };
    const withheld = '[output withheld by the privacy check]\n';
    const keep = (text: string) => {
      if (text.length <= 1024) return text;
      const tail = text.slice(-1024),
        line = Math.max(tail.indexOf('\n'), tail.indexOf('\r'));
      return line >= 0 && line < 1023 ? tail.slice(line + 1) : tail;
    };
    const commit = (stream: 'out' | 'err', chunk: string) => {
      const raw = chunk.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      if (!raw) return;
      const prior = context[stream],
        shown = prior ? this.scrub(prior) : '',
        safe = this.scrub(prior + raw);
      let text: string;
      if (typeof safe !== 'string' || typeof shown !== 'string') {
        text = withheld;
        context[stream] = '';
      } else {
        let same = 0;
        while (same < shown.length && same < safe.length && shown[same] === safe[same]) same++;
        text = safe.slice(same);
        context[stream] = keep(prior + raw);
      }
      const merged = task.output + text;
      task.outputOffset = (task.outputOffset || 0) + Math.max(0, merged.length - 100000);
      task.output = merged.slice(-100000);
      if (!timer) timer = setTimeout(flush, 150);
    };
    const append = (stream: 'out' | 'err', text: string, end = false) => {
      const buffer = pending[stream] + text;
      let cut = end ? buffer.length : Math.max(buffer.lastIndexOf('\n'), buffer.lastIndexOf('\r')) + 1;
      if (!end && buffer.length - cut > 8000) {
        const space = Math.max(buffer.lastIndexOf(' '), buffer.lastIndexOf('\t'));
        cut = space >= cut && buffer.length - space <= 4000 ? space + 1 : buffer.length;
      }
      pending[stream] = buffer.slice(cut);
      commit(stream, buffer.slice(0, cut));
    };
    const stdout = new StringDecoder('utf8'),
      stderr = new StringDecoder('utf8');
    child.stdout?.on('data', (data: Buffer) => append('out', stdout.write(data)));
    child.stderr?.on('data', (data: Buffer) => append('err', stderr.write(data)));
    const finish = (code: number | null) => {
      append('out', stdout.end(), true);
      append('err', stderr.end(), true);
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
  /** Agent view uses the existing records/children, never OS process discovery. */
  async inspectTask(sessionId: string, id: string, args: Record<string, unknown> = {}) {
    const action = taskAction(id, args);
    if (!['list', 'status', 'poll'].includes(action)) throw new Error('INVALID_INPUT');
    const root = await this.root();
    const metadata = ({ output, ...task }: BackgroundTask) => task;
    const visible = (t: BackgroundTask) => t.sessionId === sessionId && t.cwd === root;
    if (action === 'list')
      return this.store
        .list<BackgroundTask>('background')
        .filter(visible)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 50)
        .map(metadata);
    const task = this.store.get<BackgroundTask>('background', id);
    if (!task || !visible(task)) throw new Error('TASK_NOT_FOUND');
    if (action === 'status') return metadata(task);
    const base = task.outputOffset || 0,
      total = base + task.output.length;
    const requested = args.offset ?? base,
      length = args.length ?? 4000;
    if (
      !Number.isSafeInteger(requested) ||
      Number(requested) < 0 ||
      Number(requested) > total ||
      !Number.isSafeInteger(length) ||
      Number(length) < 1 ||
      Number(length) > 40000
    )
      throw new Error('INVALID_INPUT');
    const offset = Math.max(base, Number(requested)),
      end = Math.min(total, offset + Number(length));
    const output = this.scrub(task.output.slice(offset - base, end - base));
    return {
      ...metadata(task),
      output: typeof output === 'string' ? output : '[output withheld by the privacy check]\n',
      offset,
      endOffset: end,
      total,
      // Without an offset the poll starts at the oldest retained character, so any loss means earlier output is gone.
      truncated: Number(requested) < base || (args.offset === undefined && base > 0),
      ...(end < total ? { nextOffset: end } : {}),
    };
  }
  async waitTask(sessionId: string, id: string, args: Record<string, unknown>, signal: AbortSignal, check: () => Promise<void>) {
    const timeout = args.timeoutMs ?? 1000;
    if (!Number.isSafeInteger(timeout) || Number(timeout) < 0 || Number(timeout) > 30000) throw new Error('INVALID_INPUT');
    // Recheck after inspection too: a workspace can switch between the scope check and canonical-root lookup.
    const poll = async () => {
      try {
        const result = await this.inspectTask(sessionId, id, { ...args, action: 'poll' });
        await check();
        if (signal.aborted) throw new Error('CANCELLED');
        return result;
      } catch (error) {
        await check();
        throw error;
      }
    };
    await check();
    await poll();
    const deadline = Date.now() + Number(timeout);
    while (true) {
      if (signal.aborted) throw new Error('CANCELLED');
      await check();
      const task = await poll();
      if (!Array.isArray(task) && 'status' in task && (task.status !== 'running' || Date.now() >= deadline))
        return { ...task, timedOut: task.status === 'running' };
      await new Promise<void>(resolve => setTimeout(resolve, Math.min(25, Math.max(1, deadline - Date.now()))));
    }
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
