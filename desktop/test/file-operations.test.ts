import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../electron/store';
import { Workbench } from '../electron/workbench';
import { defaultPolicy } from '../electron/policy';
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'step-file-operations-'));
  const store = new Store(':memory:');
  const policy = defaultPolicy();
  store.put('settings', 'main', { workspace: root });
  const workbench = new Workbench(store, undefined, () => policy);
  return {
    root,
    store,
    policy,
    workbench,
    async close() {
      await workbench.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
test('patch refuses invalid Unicode replacement instead of normalizing exact text', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'a.txt'), 'original');
    await assert.rejects(f.workbench.patch('a.txt', { old_string: 'original', new_string: '\ud800' }), /FILE_BINARY/);
    assert.equal((await f.workbench.changes()).length, 0);
    assert.equal(await readFile(join(f.root, 'a.txt'), 'utf8'), 'original');
  } finally {
    await f.close();
  }
});
test('search pages stay below the host output ceiling even for long matching lines', async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 10; i++)
      await writeFile(
        join(f.root, `file-${i}.txt`),
        Array(50)
          .fill('marker' + 'x'.repeat(3500))
          .join('\n'),
      );
    const args = { pattern: 'marker', maxResults: 500 };
    const first = await f.workbench.searchFiles('.', args);
    assert.ok(JSON.stringify(first).length < 1000000);
    assert.ok(first.nextCursor);
    let page = first,
      count = page.matches.length;
    while (page.nextCursor) {
      page = await f.workbench.searchFiles('.', { ...args, cursor: page.nextCursor });
      count += page.matches.length;
    }
    assert.equal(count, 500);
  } finally {
    await f.close();
  }
});
test('approved apply refuses a leaf replaced after the last path validation', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'a.txt'), 'before');
    await writeFile(join(f.root, 'other.txt'), 'must remain unchanged');
    const change = await f.workbench.patch('a.txt', { old_string: 'before', new_string: 'after' });
    const snapshot = f.workbench.snapshot.bind(f.workbench),
      path = f.workbench.path.bind(f.workbench);
    let sabotage = false;
    f.workbench.snapshot = async input => {
      const result = await snapshot(input);
      sabotage = true;
      return result;
    };
    f.workbench.path = async (...args) => {
      const full = await path(...args);
      if (sabotage && args[0] === 'a.txt') {
        sabotage = false;
        await rm(full);
        await symlink(join(f.root, 'other.txt'), full);
      }
      return full;
    };
    await assert.rejects(f.workbench.apply(change.id), /INVALID_PATH|FILE_CONFLICT|ELOOP/);
    assert.equal(await readFile(join(f.root, 'other.txt'), 'utf8'), 'must remain unchanged');
  } finally {
    await f.close();
  }
});
test('task wait reports a workspace race between scope check and record inspection deterministically', async () => {
  const f = await fixture();
  const alternate = await mkdtemp(join(tmpdir(), 'step-wait-alternate-'));
  try {
    const task = await f.workbench.start('printf synthetic', 'session');
    const inspect = f.workbench.inspectTask.bind(f.workbench);
    let calls = 0;
    f.workbench.inspectTask = async (...args) => {
      if (++calls === 2) f.store.put('settings', 'main', { workspace: alternate });
      return inspect(...args);
    };
    const check = async () => {
      if ((await f.workbench.root()) !== f.root) throw new Error('WORKSPACE_CHANGED');
    };
    await assert.rejects(
      f.workbench.waitTask('session', task.id, { timeoutMs: 10 }, new AbortController().signal, check),
      /WORKSPACE_CHANGED/,
    );
  } finally {
    await f.close();
    await rm(alternate, { recursive: true, force: true });
  }
});
test('file operations refuse same-workspace symlink ancestors and replaced handles', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.root, 'real'));
    await writeFile(join(f.root, 'real', 'a.txt'), 'needle');
    await symlink(join(f.root, 'real'), join(f.root, 'alias'));
    await assert.rejects(f.workbench.patch('alias/a.txt', { old_string: 'needle', new_string: 'x' }), /INVALID_PATH/);
    await assert.rejects(f.workbench.searchFiles('alias/a.txt', { pattern: 'needle' }), /INVALID_PATH/);
    const original = f.workbench.path.bind(f.workbench);
    await writeFile(join(f.root, 'a.txt'), 'safe');
    f.workbench.path = async (...args) => {
      const path = await original(...args);
      if (args[0] === 'a.txt') {
        await rm(path);
        await symlink(join(f.root, 'real', 'a.txt'), path);
      }
      return path;
    };
    await assert.rejects(f.workbench.bytes('a.txt'), /INVALID_PATH|ELOOP/);
  } finally {
    await f.close();
  }
});
test('exact patch stages only a unique match, rejects stale files and applies with snapshot', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'a.txt'), 'before\nunique\nafter');
    const change = await f.workbench.patch('a.txt', { old_string: 'unique', new_string: 'replacement' });
    assert.equal(await readFile(join(f.root, 'a.txt'), 'utf8'), 'before\nunique\nafter');
    await f.workbench.apply(change.id);
    assert.equal(await readFile(join(f.root, 'a.txt'), 'utf8'), 'before\nreplacement\nafter');
    assert.equal((await f.workbench.snapshots()).length, 1);
    for (const args of [
      { old_string: 'missing', new_string: 'x' },
      { old_string: 'a', new_string: 'x' },
      { old_string: '', new_string: 'x' },
      { old_string: 'replacement', new_string: 'replacement' },
    ])
      await assert.rejects(f.workbench.patch('a.txt', args), /PATCH_NO_MATCH|PATCH_AMBIGUOUS|INVALID_INPUT/);
    await writeFile(join(f.root, 'overlap.txt'), 'aaa');
    await assert.rejects(f.workbench.patch('overlap.txt', { old_string: 'aa', new_string: 'x' }), /PATCH_AMBIGUOUS/);
    const stale = await f.workbench.patch('a.txt', { old_string: 'replacement', new_string: 'x' });
    await writeFile(join(f.root, 'a.txt'), 'human edit');
    await assert.rejects(f.workbench.apply(stale.id), /FILE_CONFLICT/);
    await assert.rejects(
      f.workbench.patch('a.txt', { old_string: 'human', new_string: 'x', expectedHash: '0'.repeat(64) }),
      /FILE_CONFLICT/,
    );
    const stage = f.workbench.stageBytes.bind(f.workbench);
    f.workbench.stageBytes = async (...args) => {
      await writeFile(join(f.root, 'a.txt'), 'racing writer');
      return stage(...args);
    };
    await assert.rejects(f.workbench.patch('a.txt', { old_string: 'human', new_string: 'x' }), /FILE_CONFLICT/);
    await writeFile(join(f.root, 'binary.txt'), Buffer.from([0, 1]));
    await writeFile(join(f.root, 'invalid.txt'), Buffer.from([255]));
    await writeFile(join(f.root, 'large.txt'), 'x'.repeat(200001));
    for (const name of ['binary.txt', 'invalid.txt', 'large.txt'])
      await assert.rejects(f.workbench.patch(name, { old_string: 'x', new_string: 'y' }), /FILE_BINARY|FILE_LIMIT/);
    assert.equal(await readFile(join(f.root, 'a.txt'), 'utf8'), 'racing writer');
  } finally {
    await f.close();
  }
});
test('bounded search filters protected files, validates patterns and paginates deterministically', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.root, 'sub'));
    await writeFile(join(f.root, 'a.txt'), 'needle\nneedle');
    await writeFile(join(f.root, 'sub', 'b.txt'), 'needle');
    await writeFile(join(f.root, 'blocked.txt'), 'needle');
    await writeFile(join(f.root, '.env'), 'needle');
    await writeFile(join(f.root, 'binary.txt'), Buffer.from([0, 1]));
    await writeFile(join(f.root, 'large.txt'), 'x'.repeat(200001));
    await symlink(join(f.root, 'sub'), join(f.root, 'alias'));
    await link(join(f.root, 'blocked.txt'), join(f.root, 'hard.txt'));
    f.policy.permission.pathRules = [{ pattern: 'blocked.txt', allow: false }];
    const args = { pattern: '^needle$', regex: true, target: 'content', glob: '**/*.txt', maxResults: 1 };
    const first = await f.workbench.searchFiles('.', args);
    assert.deepEqual(first.matches, [{ path: 'a.txt', line: 1, text: 'needle' }]);
    assert.ok(first.nextCursor);
    const next = await f.workbench.searchFiles('.', {
      maxResults: 1,
      glob: '**/*.txt',
      target: 'content',
      regex: true,
      pattern: '^needle$',
      cursor: first.nextCursor,
    });
    assert.deepEqual(next.matches, [{ path: 'a.txt', line: 2, text: 'needle' }]);
    const names = await f.workbench.searchFiles('.', { pattern: '**/*.txt', target: 'files' });
    assert.deepEqual(
      names.matches.map(m => m.path),
      ['a.txt', 'binary.txt', 'large.txt', 'sub/b.txt'],
    );
    await writeFile(join(f.root, 'a.txt'), 'changed');
    await assert.rejects(f.workbench.searchFiles('.', { ...args, cursor: first.nextCursor }), /SEARCH_CHANGED/);
    for (const args of [
      { pattern: '(a+)+$', regex: true },
      { pattern: '[', regex: true },
      { pattern: 'x', maxFiles: 1001 },
      { pattern: 'x', maxBytes: 4000001 },
      { pattern: 'x', maxResults: 0 },
      { pattern: 'x', glob: '../*' },
    ])
      await assert.rejects(f.workbench.searchFiles('.', args), /INVALID_INPUT/);
    const bounded = await f.workbench.searchFiles('.', { pattern: 'needle', maxFiles: 1 });
    assert.equal(bounded.truncated, true);
    await assert.rejects(f.workbench.searchFiles('alias', { pattern: 'needle' }), /INVALID_PATH/);
  } finally {
    await f.close();
  }
});
test('recursive content search returns ordered workspace paths and original line numbers', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.root, 'nested'));
    await writeFile(join(f.root, 'nested', 'b.txt'), 'start\nneedle\n');
    await writeFile(join(f.root, 'a.txt'), 'needle\nother');
    const result = await f.workbench.searchFiles('.', { pattern: 'needle', target: 'content' });
    assert.deepEqual(result.matches, [
      { path: 'a.txt', line: 1, text: 'needle' },
      { path: 'nested/b.txt', line: 2, text: 'needle' },
    ]);
  } finally {
    await f.close();
  }
});
