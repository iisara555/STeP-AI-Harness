import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  agyComponentPath,
  agyComponentSpec,
  antigravitySignIn,
  antigravitySignedIn,
  googleSignInUrl,
  installAntigravityCli,
  openAntigravityBrowserSignIn,
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

const SIGN_IN =
  'https://accounts.google.com/o/oauth2/auth?access_type=offline&client_id=synthetic.apps.googleusercontent.com&code_challenge=x&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback&response_type=code&state=s';

test('only a Google sign-in page from the CLI output is opened', () => {
  assert.equal(googleSignInUrl(`Authentication required. Please visit the URL to log in:\n  ${SIGN_IN}\n\nWaiting`), SIGN_IN);
  assert.equal(googleSignInUrl('http://accounts.google.com/o/oauth2/auth?x=1'), null);
  assert.equal(googleSignInUrl('https://accounts.google.com.evil.example/o/oauth2/auth'), null);
  assert.equal(googleSignInUrl('https://evil.example/?next=https://accounts.google.com/o/oauth2/auth'), null);
  assert.equal(googleSignInUrl('https://accounts.google.com/ServiceLogin'), null);
});

// A stand-in for `agy -p` that prints what the signed-out CLI prints (checked with agy 1.2.17), then waits.
async function fakeHeadlessAgy(body: string) {
  const dir = await mkdtemp(join(tmpdir(), 'step-agy-browser-'));
  const executable = join(dir, 'agy');
  await writeFile(executable, `#!/usr/bin/env node\n${body}`);
  await chmod(executable, 0o755);
  return { dir, executable };
}

test(
  'browser sign-in opens the printed Google page with no terminal and stops the CLI after',
  { skip: process.platform === 'win32' },
  async () => {
    const printing = await fakeHeadlessAgy(
      `console.error('Authentication required. Please visit the URL to log in:\\n  ${SIGN_IN}\\n\\nWaiting for authentication (timeout 60s)...'); setTimeout(() => {}, 60000);`,
    );
    const opened: string[] = [];
    const handle = await openAntigravityBrowserSignIn(printing.executable, join(printing.dir, 'cwd'), async url => {
      opened.push(url);
    });
    assert.ok(handle);
    assert.deepEqual(opened, [SIGN_IN]);
    await handle!.close();
    await handle!.exited;

    // agy reads the code from a terminal only; STeP types it in through the pseudo-terminal.
    const reading = await fakeHeadlessAgy(
      `if (!process.stdin.isTTY) { console.error('stdin is not a terminal'); process.exit(2); }
console.error('Authentication required. Please visit the URL to log in:\\n  ${SIGN_IN}\\n\\nOr, paste the authorization code here and press Enter:');
process.stdin.once('data', d => { require('fs').writeFileSync(__dirname + '/code.txt', String(d).trim()); process.exit(0); });`,
    );
    const typed = await openAntigravityBrowserSignIn(reading.executable, join(reading.dir, 'cwd'), async () => {});
    assert.ok(typed?.sendCode, 'the pasted code has a way in');
    typed!.sendCode!('4/0Ab-synthetic_code');
    typed!.sendCode!('bad code; rm -rf ~');
    await typed!.exited;
    assert.equal(await readFile(join(reading.dir, 'code.txt'), 'utf8'), '4/0Ab-synthetic_code');
    assert.equal(await openAntigravityBrowserSignIn(reading.executable, join(reading.dir, 'cwd'), async () => {}, 1000, 'win32'), null);

    const silent = await fakeHeadlessAgy("console.error('Error: authentication required.'); process.exit(1);");
    assert.equal(
      await openAntigravityBrowserSignIn(silent.executable, join(silent.dir, 'cwd'), async () => assert.fail('nothing to open')),
      null,
    );
    assert.equal(await openAntigravityBrowserSignIn(join(silent.dir, 'missing'), join(silent.dir, 'cwd'), async () => {}), null);
  },
);

test('the browser sign-in comes first and the terminal is only the fallback', async () => {
  const context = { cwd: tmpdir(), env: {} };
  const answers =
    (...values: boolean[]) =>
    async () =>
      values.shift() ?? false;
  let terminal = 0,
    browserClosed = 0;
  const openSignIn = async () => {
    terminal++;
    return () => {};
  };
  const browser = (exited: Promise<void>) => async () => ({
    close: () => {
      browserClosed++;
    },
    exited,
  });
  const progress: string[] = [];

  await antigravitySignIn(
    'agy',
    context,
    {
      progress: t => progress.push(t),
      openSignIn,
      openBrowserSignIn: browser(new Promise(() => {})),
      signedIn: answers(false, false, true),
      pollMs: 1,
    },
    new AbortController().signal,
  );
  assert.deepEqual([terminal, browserClosed], [0, 1], 'signed in through the browser, no terminal window');
  assert.ok(progress.some(t => /Allow/.test(t)));

  await antigravitySignIn(
    'agy',
    context,
    {
      progress: t => progress.push(t),
      openSignIn,
      openBrowserSignIn: browser(Promise.resolve()),
      signedIn: answers(false, false, false, true),
      browserAttempts: 1,
      pollMs: 1,
    },
    new AbortController().signal,
  );
  assert.deepEqual([terminal, browserClosed], [1, 2], 'the CLI gave up waiting, so the terminal opens');
  assert.ok(
    progress.some(t => /Enter/.test(t)),
    'the terminal step says to press Enter',
  );

  await antigravitySignIn(
    'agy',
    context,
    { progress: () => {}, openSignIn, openBrowserSignIn: async () => null, signedIn: answers(false, true), pollMs: 1 },
    new AbortController().signal,
  );
  assert.equal(terminal, 2, 'no sign-in page printed: straight to the terminal');
});

test('browser timeout closes the pending code prompt without becoming user cancellation', async () => {
  let resolveCode: ((code: string | null) => void) | undefined;
  let opened = 0,
    terminal = 0;
  await assert.rejects(
    antigravitySignIn(
      'agy',
      { cwd: tmpdir(), env: {} },
      {
        progress: () => {},
        signedIn: async () => false,
        openBrowserSignIn: async () => {
          opened++;
          return { close: () => {}, exited: new Promise(() => {}), sendCode: () => {} };
        },
        askForCode: () =>
          new Promise(resolve => {
            resolveCode = resolve;
          }),
        dropCode: () => {
          resolveCode?.(null);
          resolveCode = undefined;
        },
        openSignIn: async () => {
          terminal++;
          return () => {};
        },
        browserAttempts: 3,
        browserTimeoutMs: 5,
        timeoutMs: 5,
        pollMs: 1,
      },
      new AbortController().signal,
    ),
    /LOGIN_TIMEOUT/,
  );
  assert.deepEqual([opened, terminal], [3, 1], 'retry all browser attempts then use the terminal');
});

test('a late exit from an earlier browser attempt does not close the next code prompt', async () => {
  let resolveCode: ((code: string | null) => void) | undefined;
  let firstExit!: () => void;
  let opened = 0,
    ready = false;
  const sent: string[] = [];
  await antigravitySignIn(
    'agy',
    { cwd: tmpdir(), env: {} },
    {
      progress: () => {},
      signedIn: async () => ready,
      openBrowserSignIn: async () => {
        const attempt = ++opened;
        return {
          close: () => {},
          exited: new Promise<void>(resolve => {
            if (attempt === 1) firstExit = resolve;
          }),
          sendCode: code => {
            sent.push(code);
            if (attempt === 2) ready = true;
          },
        };
      },
      askForCode: () =>
        new Promise(resolve => {
          resolveCode = resolve;
          if (opened === 1) resolve('synthetic-wrong');
          if (opened === 2) {
            firstExit();
            setTimeout(() => resolveCode?.('synthetic-code'), 2);
          }
        }),
      dropCode: () => {
        resolveCode?.(null);
        resolveCode = undefined;
      },
      openSignIn: async () => assert.fail('the second browser attempt should succeed'),
      browserAttempts: 2,
      browserTimeoutMs: 30,
      timeoutMs: 5,
      pollMs: 1,
    },
    new AbortController().signal,
  );
  assert.deepEqual(sent, ['synthetic-wrong', 'synthetic-code']);
});

test('the code Google shows is asked for and typed into the waiting CLI, with a fresh page when it fails', async () => {
  const context = { cwd: tmpdir(), env: {} };
  const sent: string[] = [];
  let opened = 0,
    dropped = 0,
    signedInNow = false;
  const progress: string[] = [];
  await antigravitySignIn(
    'agy',
    context,
    {
      progress: t => progress.push(t),
      openSignIn: async () => assert.fail('no terminal needed'),
      openBrowserSignIn: async () => {
        opened++;
        let exit!: () => void;
        const exited = new Promise<void>(done => (exit = done));
        return {
          close: () => exit(),
          exited,
          sendCode: code => {
            sent.push(code);
            // The first code is wrong: agy gives up; the second signs in.
            if (sent.length === 1) exit();
            else signedInNow = true;
          },
        };
      },
      askForCode: async () => (opened === 1 ? 'wrong' : 'right'),
      dropCode: () => {
        dropped++;
      },
      signedIn: async () => signedInNow,
      pollMs: 1,
    },
    new AbortController().signal,
  );
  assert.deepEqual(sent, ['wrong', 'right']);
  assert.equal(opened, 2, 'a new Google page for the second try');
  assert.ok(dropped >= 2, 'the code box closes after each try');
  assert.ok(progress.some(t => /คัดลอกรหัส/.test(t)));

  await assert.rejects(
    antigravitySignIn(
      'agy',
      context,
      {
        progress: () => {},
        openSignIn: async () => assert.fail('cancel stops, no terminal'),
        openBrowserSignIn: async () => ({ close: () => {}, exited: new Promise(() => {}), sendCode: () => {} }),
        askForCode: async () => null,
        signedIn: async () => false,
        pollMs: 1,
      },
      new AbortController().signal,
    ),
    /CANCELLED/,
  );
});

test('stops waiting when only the real profile sees the sign-in', async () => {
  let profileChecks = 0;
  await assert.rejects(
    antigravitySignIn(
      'agy',
      { cwd: tmpdir(), env: {} },
      {
        progress: () => {},
        openSignIn: async () => () => {},
        openBrowserSignIn: async () => null,
        signedIn: async () => false,
        signedInWithProfile: async () => {
          profileChecks++;
          return true;
        },
        pollMs: 1,
        timeoutMs: 60_000,
      },
      new AbortController().signal,
    ),
    /ANTIGRAVITY_SIGNIN_HIDDEN/,
  );
  assert.equal(profileChecks, 2, 'checked twice, every third poll');
});
