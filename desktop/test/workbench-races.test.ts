import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile, rename, stat, chmod } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../electron/store';
import { Workbench } from '../electron/workbench';
import type { FileChange } from '../src/tools';

// Synthetic files only. The "outside" folder stands for any file outside the selected workspace.
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'step-races-')),
    outside = await mkdtemp(join(tmpdir(), 'step-races-outside-'));
  const store = new Store(':memory:');
  store.put('settings', 'main', { workspace: root });
  const tools = new Workbench(store);
  return {
    root: await fsp.realpath(root),
    outside,
    store,
    tools,
    async close() {
      await tools.close();
      store.close();
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      await rm(outside, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}

/**
 * Runs `swap` once, right before the first open or readFile of `target`: the exact moment between the workspace
 * check and the read. Patches the shared fs/promises object, so the Workbench's own imports see it.
 */
async function swapBeforeOpen<T>(target: string, swap: () => Promise<void>, run: () => Promise<T>) {
  const original = { open: fsp.open, readFile: fsp.readFile };
  let swapped = false;
  const hook =
    (fn: (...args: any[]) => Promise<any>) =>
    async (...args: any[]) => {
      if (!swapped && typeof args[0] === 'string' && resolve(args[0]) === resolve(target)) {
        swapped = true;
        await swap();
      }
      return fn(...args);
    };
  (fsp as any).open = hook(original.open);
  (fsp as any).readFile = hook(original.readFile);
  syncBuiltinESMExports();
  try {
    return await run();
  } finally {
    (fsp as any).open = original.open;
    (fsp as any).readFile = original.readFile;
    syncBuiltinESMExports();
    assert.ok(swapped, 'the swap point was reached');
  }
}

const SECRET = 'SYNTHETIC-OUTSIDE-SECRET-0042';
const symlinks = process.platform === 'win32' ? 'Windows needs Developer Mode or admin rights for file symlinks' : false;

test('staging never reads a file swapped for a symlink between the workspace check and the read', { skip: symlinks }, async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.outside, 'secret.txt'), SECRET);
    await writeFile(join(f.root, 'note.txt'), 'workspace text');
    const target = join(f.root, 'note.txt');
    const result = await swapBeforeOpen(
      target,
      async () => {
        await rename(target, join(f.root, 'note.moved'));
        await symlink(join(f.outside, 'secret.txt'), target);
      },
      () =>
        f.tools.stage('note.txt', 'new text').then(
          () => 'staged',
          (e: Error) => e.message,
        ),
    );
    assert.match(result, /^(?:INVALID_PATH|FILE_CONFLICT|ELOOP.*)$/);
    // Nothing from outside the workspace reaches a staged change (the Changes list and its approval).
    const stored = f.store.list<FileChange>('change');
    assert.equal(stored.length, 0);
    assert.doesNotMatch(JSON.stringify(stored), new RegExp(SECRET));
    assert.doesNotMatch(JSON.stringify(await f.tools.changes()), new RegExp(SECRET));
  } finally {
    await f.close();
  }
});

test('staging never reads through a parent folder swapped for a link to outside the workspace', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.outside, 'note.txt'), SECRET);
    await mkdir(join(f.root, 'docs'));
    await writeFile(join(f.root, 'docs', 'note.txt'), 'workspace text');
    const target = join(f.root, 'docs', 'note.txt');
    const result = await swapBeforeOpen(
      target,
      async () => {
        await rename(join(f.root, 'docs'), join(f.root, 'docs.moved'));
        await symlink(f.outside, join(f.root, 'docs'), process.platform === 'win32' ? 'junction' : 'dir');
      },
      () =>
        f.tools.stage('docs/note.txt', 'new text').then(
          () => 'staged',
          (e: Error) => e.message,
        ),
    );
    assert.match(result, /^(?:INVALID_PATH|FILE_CONFLICT)$/);
    assert.equal(f.store.list<FileChange>('change').length, 0);
  } finally {
    await f.close();
  }
});

test('read refuses a symlink swapped in after the workspace check', { skip: symlinks }, async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.outside, 'secret.txt'), SECRET);
    await writeFile(join(f.root, 'a.txt'), 'inside');
    const target = join(f.root, 'a.txt');
    for (let i = 0; i < 20; i++) {
      await rm(target, { force: true });
      await writeFile(target, 'inside');
      const text = await swapBeforeOpen(
        target,
        async () => {
          await rm(target);
          await symlink(join(f.outside, 'secret.txt'), target);
        },
        () =>
          f.tools.read('a.txt').then(
            r => r.text,
            (e: Error) => e.message,
          ),
      );
      assert.notEqual(text, SECRET);
    }
  } finally {
    await f.close();
  }
});

test('two changes to the same file applied at once: one is saved whole, the other reports FILE_CONFLICT', async () => {
  const f = await fixture();
  try {
    const a = 'A'.repeat(170_000),
      b = 'B'.repeat(150_000);
    for (let round = 0; round < 15; round++) {
      await writeFile(join(f.root, 'shared.txt'), 'original ' + round);
      const first = await f.tools.stage('shared.txt', a),
        second = await f.tools.stage('shared.txt', b);
      const results = await Promise.allSettled([f.tools.apply(first.id), f.tools.apply(second.id)]);
      const saved = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      assert.equal(saved.length, 1, `round ${round}: exactly one change is saved`);
      assert.equal(failed.length, 1);
      assert.equal(failed[0].reason.message, 'FILE_CONFLICT');
      const content = await readFile(join(f.root, 'shared.txt'), 'utf8');
      assert.ok(content === a || content === b, `round ${round}: the file is exactly one of the two changes`);
      assert.equal(content, results[0].status === 'fulfilled' ? a : b);
      for (const r of results) if (r.status === 'rejected') f.tools.reject(r === results[0] ? first.id : second.id);
    }
    // No temporary file is left behind next to the saved file.
    assert.deepEqual(
      (await readdir(f.root)).filter(name => name.endsWith('.step-tmp')),
      [],
    );
  } finally {
    await f.close();
  }
});

test('the same change applied twice at once is saved once', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'once.txt'), 'before');
    const change = await f.tools.stage('once.txt', 'after');
    const results = await Promise.allSettled([f.tools.apply(change.id), f.tools.apply(change.id)]);
    assert.deepEqual(
      results.map(r => (r.status === 'fulfilled' ? 'ok' : r.reason.message)),
      ['ok', 'CHANGE_NOT_FOUND'],
    );
    assert.equal(await readFile(join(f.root, 'once.txt'), 'utf8'), 'after');
  } finally {
    await f.close();
  }
});

test('a reader during a save sees the old or the new file, never a mix', async () => {
  const f = await fixture();
  try {
    const target = join(f.root, 'live.txt'),
      versions = ['1'.repeat(190_000), '2'.repeat(120_000), '3'.repeat(180_000), '4'.repeat(100_000)];
    await writeFile(target, versions[0]);
    let saving = true;
    const seen = new Set<string>();
    const reader = (async () => {
      while (saving) {
        const text = await readFile(target, 'utf8').catch((e: NodeJS.ErrnoException) =>
          e.code === 'ENOENT' ? 'ENOENT' : Promise.reject(e),
        );
        seen.add(text === 'ENOENT' ? text : text[0] + ':' + text.length);
        await new Promise(r => setImmediate(r));
      }
    })();
    for (const next of [...versions.slice(1), ...versions]) {
      const change = await f.tools.stage('live.txt', next);
      await f.tools.apply(change.id);
    }
    saving = false;
    await reader;
    const whole = new Set(versions.map(v => v[0] + ':' + v.length));
    for (const value of seen) assert.ok(whole.has(value), `read ${value} is one complete version`);
  } finally {
    await f.close();
  }
});

test(
  'saving keeps the file permission bits and a backup of the old content',
  { skip: process.platform === 'win32' && 'POSIX modes only' },
  async () => {
    const f = await fixture();
    try {
      const target = join(f.root, 'script.sh');
      await writeFile(target, 'echo old\n');
      await chmod(target, 0o750);
      const change = await f.tools.stage('script.sh', 'echo new\n');
      const { snapshotId } = await f.tools.apply(change.id);
      assert.equal((await stat(target)).mode & 0o777, 0o750);
      assert.equal(await readFile(target, 'utf8'), 'echo new\n');
      assert.ok(snapshotId);
      const restore = await f.tools.restoreSnapshot(snapshotId!);
      assert.equal((restore as FileChange).after, 'echo old\n');
    } finally {
      await f.close();
    }
  },
);
