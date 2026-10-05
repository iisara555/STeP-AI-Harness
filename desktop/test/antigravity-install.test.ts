import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  agyComponentPath,
  agyComponentSpec,
  antigravitySignIn,
  antigravitySignedIn,
  installAntigravityCli,
} from '../electron/antigravity-install';

test('Antigravity CLI builds are pinned for Windows and macOS', () => {
  for (const [platform, arch, ext] of [
    ['win32', 'x64', '.exe'],
    ['win32', 'arm64', '.exe'],
    ['darwin', 'arm64', '.tar.gz'],
    ['darwin', 'x64', '.tar.gz'],
  ] as const) {
    const spec = agyComponentSpec(platform, arch);
    assert.ok(spec && spec.asset.endsWith(ext), `${platform}-${arch}`);
    assert.match(spec!.sha512, /^[0-9a-f]{128}$/);
  }
  assert.equal(agyComponentSpec('linux', 'x64'), null);
  assert.equal(agyComponentPath('/c', 'win32').endsWith('agy.exe'), true);
});

test('installs the Antigravity CLI only after the checksum and version check pass', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-agy-install-'));
  const bytes = Buffer.from('synthetic agy release');
  const sha512 = createHash('sha512').update(bytes).digest('hex');
  const urls: string[] = [];
  const download = async (url: string, file: string, progress: (percent: number) => void) => {
    urls.push(url);
    await writeFile(file, bytes);
    progress(100);
    return createHash('sha512').update(bytes).digest('hex');
  };
  const target = agyComponentPath(dir);

  await assert.rejects(
    installAntigravityCli(dir, () => {}, { spec: { asset: 'test/agy.exe', sha512: '0'.repeat(128) }, download, verify: async () => {} }),
    /ANTIGRAVITY_CHECKSUM_FAILED/,
  );
  assert.equal(existsSync(target), false);
  assert.match(urls[0], /^https:\/\/storage\.googleapis\.com\/antigravity-public\/antigravity-cli\/[\d.-]+\/test\/agy\.exe$/);

  // macOS archives hold a binary named `antigravity`; it is installed as agy.
  let checked = '';
  const lines: string[] = [];
  const installed = await installAntigravityCli(dir, line => lines.push(line), {
    spec: { asset: 'test/cli.tar.gz', sha512 },
    download,
    extract: async (_archive, into) => {
      await mkdir(join(into, 'cli'));
      await writeFile(join(into, 'cli', 'antigravity'), 'synthetic agy binary');
      return true;
    },
    verify: async (executable, context) => {
      checked = executable;
      assert.ok(!context.cwd.startsWith(dir), 'checked in a throwaway home');
      assert.ok(existsSync(join(context.env.HOME!, '.gemini', 'antigravity-cli', 'settings.json')), 'with the isolated settings');
    },
  });
  assert.equal(installed, target);
  assert.equal(await readFile(target, 'utf8'), 'synthetic agy binary');
  assert.notEqual(checked, target, 'the staged copy is checked before it replaces the installed one');
  assert.ok(lines.some(line => /100%/.test(line)));

  await writeFile(target, 'working earlier copy');
  await assert.rejects(
    installAntigravityCli(dir, () => {}, {
      spec: { asset: 'test/agy.exe', sha512 },
      download,
      verify: async () => {
        throw new Error('RUNTIME_EXITED');
      },
    }),
    /ANTIGRAVITY_INSTALL_FAILED/,
  );
  assert.equal(await readFile(target, 'utf8'), 'working earlier copy', 'a failed check keeps the earlier copy');
  assert.deepEqual((await readdir(dir)).sort(), [process.platform === 'win32' ? 'agy.exe' : 'agy']);
});

async function fakeAgy(script: string) {
  const dir = await mkdtemp(join(tmpdir(), 'step-agy-signed-'));
  const executable = join(dir, 'agy.cjs');
  await writeFile(executable, script);
  return { executable, context: { cwd: dir, env: { PATH: process.env.PATH } } };
}

test('reads the native sign-in state from `agy models`', async () => {
  const signedIn = await fakeAgy("console.log('gemini-3.8-flash-medium  Gemini Flash'); process.exit(0);");
  assert.equal(await antigravitySignedIn(signedIn.executable, signedIn.context), true);
  const signedOut = await fakeAgy(
    "console.error('Error: Please sign in to view available models. Launch the CLI without arguments to sign in.'); process.exit(1);",
  );
  assert.equal(await antigravitySignedIn(signedOut.executable, signedOut.context), false);
  const broken = await fakeAgy("console.error('Error: something else'); process.exit(1);");
  await assert.rejects(antigravitySignedIn(broken.executable, broken.context), /RUNTIME_EXITED/);
  assert.deepEqual(
    (await readdir(signedOut.context.cwd)).filter(name => name.startsWith('antigravity-')),
    [],
    'each check removes its home',
  );
});

test('opens Google sign-in only when needed and waits until it is usable', async () => {
  const context = { cwd: tmpdir(), env: {} };
  let opened = 0,
    closed = 0;
  const openSignIn = async () => {
    opened++;
    return () => {
      closed++;
    };
  };
  const answers =
    (...values: boolean[]) =>
    async () =>
      values.shift() ?? false;

  await antigravitySignIn('agy', context, { progress: () => {}, openSignIn, signedIn: answers(true) }, new AbortController().signal);
  assert.deepEqual([opened, closed], [0, 0], 'an existing sign-in is used as is');

  await antigravitySignIn(
    'agy',
    context,
    { progress: () => {}, openSignIn, signedIn: answers(false, false, true), pollMs: 1 },
    new AbortController().signal,
  );
  assert.deepEqual([opened, closed], [1, 1], 'the sign-in window is opened once and closed after');

  await assert.rejects(
    antigravitySignIn(
      'agy',
      context,
      { progress: () => {}, openSignIn, signedIn: answers(false), pollMs: 1, timeoutMs: 20 },
      new AbortController().signal,
    ),
    /LOGIN_TIMEOUT/,
  );
  assert.equal(closed, 2);

  const controller = new AbortController();
  const pending = antigravitySignIn(
    'agy',
    context,
    { progress: () => {}, openSignIn, signedIn: answers(false), pollMs: 10_000 },
    controller.signal,
  );
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(pending, /CANCELLED/);
  assert.equal(closed, 3);
});
