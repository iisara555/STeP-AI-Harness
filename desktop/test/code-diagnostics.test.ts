import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../electron/store';
import { Workbench } from '../electron/workbench';
import { defaultPolicy } from '../electron/policy';
import { codeDiagnostics } from '../electron/code-diagnostics';
const worker = resolve('electron/code-worker.cjs');

test('local language service detects a semantic error and clears it after the exact fix', async () => {
  const broken = await codeDiagnostics(
    [{ path: 'main.ts', text: 'const value: string = 123; export { value };' }],
    'main.ts',
    new AbortController().signal,
    worker,
  );
  assert.ok(broken.diagnostics.some((d: any) => d.code === 2322 && d.line === 1));
  const fixed = await codeDiagnostics(
    [{ path: 'main.ts', text: 'const value: string = "123"; export { value };' }],
    'main.ts',
    new AbortController().signal,
    worker,
  );
  assert.equal(fixed.diagnostics.length, 0);
  assert.equal(fixed.scope, 'bounded-snapshot');
});

test('workspace diagnostics resolve local imports, never execute project code and refuse outside paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-code-diagnostics-'));
  const store = new Store(':memory:');
  store.put('settings', 'main', { workspace: root });
  const workbench = new Workbench(store, undefined, () => defaultPolicy());
  try {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'types.ts'), 'export const count: number = 1;');
    const code = 'import {count} from "./types";\nconst text: string = count;\nthrow new Error("PROJECT_CODE_MUST_NOT_EXECUTE");';
    await writeFile(join(root, 'src', 'main.ts'), code);
    const result = await workbench.diagnostics('src/main.ts', new AbortController().signal, worker);
    assert.equal(result.files, 2);
    assert.ok(result.diagnostics.some((d: any) => d.code === 2322 && d.line === 2));
    assert.equal(await readFile(join(root, 'src', 'main.ts'), 'utf8'), code);
    await assert.rejects(workbench.diagnostics('../outside.ts', new AbortController().signal, worker), /INVALID_PATH/);
    await assert.rejects(workbench.diagnostics('script.py', new AbortController().signal, worker), /CODE_LANGUAGE_UNSUPPORTED/);
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(workbench.diagnostics('src/main.ts', abort.signal, worker), /CANCELLED/);
  } finally {
    await workbench.close();
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
