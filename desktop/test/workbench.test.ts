import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../electron/store';
import { Workbench, browserUrl } from '../electron/workbench';
import { toolRequests } from '../src/tools';
import { defaultPolicy } from '../electron/policy';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'step-tools-'));
  const store = new Store(':memory:');
  store.put('settings', 'main', { workspace: root });
  const tools = new Workbench(store);
  return {
    root,
    store,
    tools,
    async close() {
      await tools.close();
      store.close();
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}
test('files stay inside the selected real workspace, including junctions and private paths', async () => {
  const f = await fixture(),
    outside = await mkdtemp(join(tmpdir(), 'step-outside-'));
  try {
    await writeFile(join(f.root, 'public.txt'), 'hello');
    await mkdir(join(f.root, '.ssh'));
    await writeFile(join(f.root, '.ssh', 'config'), 'private');
    await symlink(outside, join(f.root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal((await f.tools.read('public.txt')).text, 'hello');
    for (const path of ['../elsewhere', 'escape/file.txt', '.ssh/config', '.env', 'nested/credentials.json'])
      await assert.rejects(f.tools.path(path, true), /INVALID_PATH/);
    assert.deepEqual(
      (await f.tools.files()).entries.map(e => e.name),
      ['public.txt'],
    );
  } finally {
    await f.close();
    await rm(outside, { recursive: true, force: true });
  }
});
test('staging is inert and applying refuses stale content or a changed workspace', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'a.txt'), 'before');
    const c = await f.tools.stage('a.txt', 'after');
    assert.equal(await readFile(join(f.root, 'a.txt'), 'utf8'), 'before');
    await writeFile(join(f.root, 'a.txt'), 'human edit');
    await assert.rejects(f.tools.apply(c.id), /FILE_CONFLICT/);
    assert.equal(await readFile(join(f.root, 'a.txt'), 'utf8'), 'human edit');
    f.tools.reject(c.id);
    const fresh = await f.tools.stage('a.txt', 'accepted');
    await f.tools.apply(fresh.id);
    assert.equal(await readFile(join(f.root, 'a.txt'), 'utf8'), 'accepted');
    const newFile = await f.tools.stage('new.txt', 'new');
    await f.tools.apply(newFile.id);
    assert.equal(await readFile(join(f.root, 'new.txt'), 'utf8'), 'new');
    assert.equal(f.tools.changes().length, 0);
  } finally {
    await f.close();
  }
});

test('canonical credential paths and managed rules remain hidden in file listings and Git diff', async () => {
  const f = await fixture();
  const policy = defaultPolicy();
  const tools = new Workbench(
    f.store,
    text => text,
    () => policy,
  );
  const execute = promisify(execFile);
  const git = (...args: string[]) =>
    execute('git', ['-C', f.root, '-c', 'user.name=Synthetic', '-c', 'user.email=test@example.invalid', ...args], { windowsHide: true });
  try {
    await mkdir(join(f.root, '.aws'));
    await writeFile(join(f.root, '.aws', 'credentials'), 'synthetic excluded value');
    await symlink(join(f.root, '.aws'), join(f.root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(tools.read('alias/credentials'), /INVALID_PATH/);
    await writeFile(join(f.root, '.env'), 'SYNTHETIC=before');
    await writeFile(join(f.root, 'allowed.md'), 'before');
    await writeFile(join(f.root, 'blocked.md'), 'before');
    await git('init', '--quiet');
    await git('add', '.env', 'allowed.md', 'blocked.md');
    await git('commit', '--quiet', '-m', 'Synthetic fixture');
    await writeFile(join(f.root, '.env'), 'SYNTHETIC=excluded-credential-content');
    await writeFile(join(f.root, 'allowed.md'), 'allowed public content');
    await writeFile(join(f.root, 'blocked.md'), 'excluded managed content');
    policy.permission.pathRules = [{ pattern: 'blocked.md', allow: false }];
    assert.deepEqual(
      (await tools.files()).entries.map(e => e.name),
      ['allowed.md'],
    );
    await assert.rejects(tools.read('blocked.md'), /PATH_RULE_DENIED/);
    const diff = await tools.diff();
    assert.match(diff.diff, /allowed public content/);
    assert.doesNotMatch(diff.diff, /excluded-credential-content|excluded managed content|\.env/);
  } finally {
    await tools.close();
    await f.close();
  }
});
test('background commands capture real output, drop ambient secrets, and cancel before cleanup', async () => {
  const f = await fixture();
  process.env.STEP_TEST_TOKEN = 'synthetic-do-not-forward';
  try {
    const task = await f.tools.start(
      process.platform === 'win32'
        ? 'Write-Output "tool-ok"; Write-Output $env:STEP_TEST_TOKEN'
        : 'printf "tool-ok\\n%s" "$STEP_TEST_TOKEN"',
    );
    for (let i = 0; i < 100 && f.tools.tasks().find(t => t.id === task.id)?.status === 'running'; i++)
      await new Promise(r => setTimeout(r, 50));
    const done = f.tools.tasks().find(t => t.id === task.id)!;
    assert.equal(done.status, 'done');
    assert.match(done.output, /tool-ok/);
    assert.doesNotMatch(done.output, /synthetic-do-not-forward/);
    const running = await f.tools.start(process.platform === 'win32' ? 'Start-Sleep -Seconds 30' : 'sleep 30');
    await f.tools.cancel(running.id);
    await f.tools.close();
    assert.equal(f.tools.tasks().find(t => t.id === running.id)?.status, 'cancelled');
  } finally {
    delete process.env.STEP_TEST_TOKEN;
    await f.close();
  }
});
test('browser rejects local file and script schemes; model tool proposals remain validated data', () => {
  assert.equal(browserUrl('https://example.com'), 'https://example.com/');
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://user:secret@example.com'])
    assert.throws(() => browserUrl(url), /INVALID_URL/);
  assert.deepEqual(toolRequests('```step-tool\n{"tool":"terminal","input":"echo ok"}\n```'), [{ tool: 'terminal', input: 'echo ok' }]);
  assert.deepEqual(toolRequests('```step-tool\n{"tool":"eval","input":"evil"}\n```'), []);
  assert.deepEqual(toolRequests('```step-tool\nnot-json\n```'), []);
});
