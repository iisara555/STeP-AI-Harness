import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const moduleUrl = new URL('../src/utils/user-config.js', import.meta.url).href;

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'step-config-concurrency-'));
  const preload = join(home, 'home.mjs');
  await writeFile(preload, `import os from 'node:os';\nimport { syncBuiltinESMExports } from 'node:module';\nos.homedir = () => ${JSON.stringify(home)};\nsyncBuiltinESMExports();\n`);
  t.after(() => rm(home, { recursive: true, force: true }));
  const directory = join(home, '.step-ai');
  const file = join(directory, 'config.json');
  const run = code => exec(process.execPath, ['--import', pathToFileURL(preload).href, '--input-type=module', '--eval',
    `import { saveUserConfig, loadUserConfig } from ${JSON.stringify(moduleUrl)};\n${code}`], { timeout: 15_000 });
  return { directory, file, run };
}

test('parallel configuration updates preserve every field in one process and across processes', async t => {
  const { file, run } = await fixture(t);
  await run(`await saveUserConfig({ existing: 'keep' });`);
  await Promise.all(Array.from({ length: 3 }, (_, worker) => run(`
    await Promise.all(Array.from({ length: 10 }, (_, index) => saveUserConfig({ ['field_${worker}_' + index]: index })));
  `)));
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.existing, 'keep');
  for (let worker = 0; worker < 3; worker++)
    for (let index = 0; index < 10; index++) assert.equal(saved[`field_${worker}_${index}`], index);
});

test('readers see complete configuration while updates replace the file', async t => {
  const { run } = await fixture(t);
  await run(`
    import { readFile } from 'node:fs/promises';
    import { USER_CONFIG_PATH } from ${JSON.stringify(moduleUrl)};
    await saveUserConfig({ marker: 'present', payload: 'x'.repeat(100_000) });
    let done = false;
    const writes = (async () => {
      for (let i = 0; i < 25; i++) await saveUserConfig({ generation: i });
    })().finally(() => { done = true; });
    while (!done) {
      const data = JSON.parse(await readFile(USER_CONFIG_PATH, 'utf8'));
      if (data.marker !== 'present') throw new Error('Configuration was lost');
      // Windows cannot replace a file while another handle has it open, and a 100 KB read under the CI virus scanner
      // takes milliseconds. A real reader (the app, the CLI, an editor) leaves gaps; one that never pauses would
      // block every writer, which is not the case this test covers.
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    await writes;
  `);
});

test('a temporary sharing lock retries atomic replacement; a persistent lock preserves the old configuration', async t => {
  const { directory, file, run } = await fixture(t);
  await run(`
    import fs from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    await saveUserConfig({ marker: 'keep' });
    const realRename = fs.rename;
    let transient = 2;
    fs.rename = async (...args) => {
      if (transient-- > 0) throw Object.assign(new Error('Synthetic sharing lock'), { code: 'EPERM' });
      return realRename(...args);
    };
    syncBuiltinESMExports();
    await saveUserConfig({ recovered: true });
    const saved = await loadUserConfig();
    if (saved.marker !== 'keep' || saved.recovered !== true) throw new Error('Atomic replacement lost fields');
    fs.rename = async () => { throw Object.assign(new Error('Synthetic persistent sharing lock'), { code: 'EPERM' }); };
    syncBuiltinESMExports();
    try {
      await saveUserConfig({ lost: true });
      throw new Error('Persistent lock was ignored');
    } catch (error) {
      if (error.code !== 'EPERM') throw error;
    }
    const after = await loadUserConfig();
    if (after.marker !== 'keep' || after.recovered !== true || after.lost) throw new Error('Failed replacement damaged configuration');
  `);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).recovered, true);
  assert.deepEqual(await readdir(directory), ['config.json']);
});

test('a failed configuration write releases its lock and leaves no temporary files', async t => {
  const { directory, file, run } = await fixture(t);
  await mkdir(file, { recursive: true });
  await assert.rejects(run(`await saveUserConfig({ team: 'cc' });`));
  assert.deepEqual(await readdir(directory), ['config.json']);
  await rm(file, { recursive: true });
  await run(`await saveUserConfig({ team: 'cc' });`);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).team, 'cc');
  assert.deepEqual(await readdir(directory), ['config.json']);
});
