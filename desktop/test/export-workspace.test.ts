import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExportWorkspace } from '../electron/export-workspace';

test('export creates the selected folder and preserves settings changed while choosing it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-export-folder-'));
  try {
    let settings = { workspace: '', assistant: 'before' },
      release!: (path: string | null) => void,
      calls = 0,
      synchronized = '';
    const selector = new ExportWorkspace(
      () => settings,
      next => {
        settings = next;
      },
      () => {
        calls++;
        return new Promise(resolve => {
          release = resolve;
        });
      },
      async () => {
        synchronized = settings.workspace;
      },
    );
    const first = selector.resolve(),
      second = selector.resolve();
    settings = { ...settings, assistant: 'after' };
    const folder = join(root, 'new', 'documents');
    release(folder);
    assert.deepEqual(await Promise.all([first, second]), [folder, folder]);
    assert.equal(calls, 1);
    assert.equal(settings.assistant, 'after');
    assert.equal(settings.workspace, folder);
    assert.equal(synchronized, folder);
    assert.ok((await stat(folder)).isDirectory());
    assert.equal(await selector.resolve(), folder);
    assert.equal(calls, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cancelled folder choice preserves configuration and allows a later export to retry', async () => {
  let settings = { workspace: '' },
    calls = 0;
  const selector = new ExportWorkspace(
    () => settings,
    next => {
      settings = next;
    },
    async () => {
      calls++;
      return null;
    },
    async () => {
      assert.fail('cancel must not synchronize');
    },
  );
  assert.equal(await selector.resolve(), null);
  assert.equal(settings.workspace, '');
  assert.equal(await selector.resolve(), null);
  assert.equal(calls, 2);
});

test('a removed working folder triggers selection; a failed creation never changes configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-export-folder-'));
  try {
    let settings = { workspace: join(root, 'removed') };
    const selector = new ExportWorkspace(
      () => settings,
      next => {
        settings = next;
      },
      async () => join(root, 'replacement'),
      async () => {},
    );
    assert.equal(await selector.resolve(), join(root, 'replacement'));
    const previous = settings;
    const failed = new ExportWorkspace(
      () => settings,
      next => {
        settings = next;
      },
      async () => '\0',
      async () => {},
    );
    await assert.rejects(failed.choose());
    assert.deepEqual(settings, previous);
    await assert.rejects(failed.choose());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
