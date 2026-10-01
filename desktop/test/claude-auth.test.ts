import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  claudeEnv,
  claudeLogin,
  claudeLoginUrl,
  claudeLogout,
  claudeStatus,
  resolveClaudeRuntime,
  runClaude,
} from '../electron/claude-auth';
import { ClaudeAdapter, claudeSdkOptions } from '../electron/providers';
import { signInAndTest } from '../electron/connect';
import type { Connection } from '../src/types';

const oauthTestUrl =
  'https://claude.com/oauth/authorize?response_type=code&client_id=synthetic&state=synthetic&code_challenge=synthetic&redirect_uri=http%3A%2F%2Flocalhost%2Fcallback';

async function fixture(mode = 'code', version = '2.1.268') {
  const cwd = await mkdtemp(join(tmpdir(), 'step-claude-test-'));
  const profile = join(cwd, 'profile');
  await mkdir(profile);
  await writeFile(join(cwd, 'fixture.json'), JSON.stringify({ mode, version }));
  const executable = join(cwd, 'claude.cjs');
  await writeFile(
    executable,
    [
      "const fs = require('node:fs'), path = require('node:path');",
      "const {mode, version} = JSON.parse(fs.readFileSync('fixture.json','utf8'));",
      'const profile = process.env.CLAUDE_CONFIG_DIR;',
      "const saved = path.join(profile, 'synthetic-login');",
      'const args = process.argv.slice(2);',
      "if(args[0] === '--version') { console.log(version + ' (Claude Code)'); process.exit(0); }",
      "fs.appendFileSync(path.join(profile, 'calls'), args.join(' ') + '\\n');",
      'if(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_BASE_URL) process.exit(19);',
      "if(args[1] === 'status') {",
      ' const loggedIn = fs.existsSync(saved);',
      " console.log(JSON.stringify({loggedIn, authMethod:'claude.ai', configDirectory:mode === 'mismatch' ? '/wrong-profile' : profile}));",
      ' process.exit(loggedIn ? 0 : 1);',
      '}',
      "if(args[1] === 'logout') { fs.rmSync(saved, {force:true}); process.exit(0); }",
      "if(args[1] === 'login') {",
      " if(mode === 'hang') { setInterval(()=>{},1000); }",
      " else if(mode === 'failure') { console.error('403 not authorized sk-secret-test'); process.exit(1); }",
      " else if(mode === 'browser') { fs.writeFileSync(saved, 'synthetic'); process.exit(0); }",
      ' else {',
      `  if(mode === 'url') console.log(${JSON.stringify(oauthTestUrl)});`,
      "  process.stdout.write('Paste code here if prompted: ');",
      "  require('node:readline').createInterface({input:process.stdin}).once('line',code=>{",
      "   if(code !== 'example#state') process.exit(2);",
      "   fs.writeFileSync(saved, 'synthetic'); process.exit(0);",
      '  });',
      ' }',
      '}',
    ].join('\n'),
  );
  const env = {
    ...process.env,
    CLAUDE_CONFIG_DIR: profile,
    ANTHROPIC_API_KEY: 'must-not-inherit',
    ANTHROPIC_BASE_URL: 'https://wrong.invalid',
  };
  return { executable, context: { cwd, env }, profile };
}

test('discovery checks version; missing and old runtimes are actionable', async () => {
  const f = await fixture();
  assert.equal(await resolveClaudeRuntime(f.context, async () => f.executable), f.executable);
  await assert.rejects(
    resolveClaudeRuntime(f.context, async () => null),
    /CLAUDE_CODE_NOT_FOUND/,
  );
  const old = await fixture('code', '2.1.267');
  await assert.rejects(
    resolveClaudeRuntime(old.context, async () => old.executable),
    /CLAUDE_CODE_UPDATE_REQUIRED/,
  );
});

test('Claude browser links require a complete URL on an exact official HTTPS authorization endpoint', () => {
  assert.equal(claudeLoginUrl(oauthTestUrl + '\n'), oauthTestUrl);
  assert.equal(claudeLoginUrl(oauthTestUrl.replace('claude.com', 'claude.ai') + '\n'), oauthTestUrl.replace('claude.com', 'claude.ai'));
  assert.equal(claudeLoginUrl(oauthTestUrl), undefined);
  for (const invalid of [
    oauthTestUrl.replace('https:', 'http:'),
    oauthTestUrl.replace('claude.com', 'claude.com.evil.invalid'),
    oauthTestUrl.replace('claude.com', 'evil.invalid@claude.com'),
    oauthTestUrl.replace('claude.com', 'claude.com:8443'),
    oauthTestUrl.replace('/oauth/authorize', '/other'),
    oauthTestUrl.replace('state=synthetic', 'state='),
    oauthTestUrl.replace('response_type=code', 'response_type=token'),
    oauthTestUrl + '#unexpected',
  ])
    assert.equal(claudeLoginUrl(invalid + '\n'), undefined, invalid);
  const cut = oauthTestUrl.indexOf('code_challenge');
  assert.equal(claudeLoginUrl(oauthTestUrl.slice(0, cut)), undefined);
  assert.equal(claudeLoginUrl(oauthTestUrl.slice(0, cut) + oauthTestUrl.slice(cut) + '\n'), oauthTestUrl);
});

test('piped CLI login opens its official link once and keeps auth details out of progress', async () => {
  const f = await fixture('url');
  const opened: string[] = [],
    progress: string[] = [];
  const deps = {
    progress: (text: string) => progress.push(text),
    openExternal: async (url: string) => {
      opened.push(url);
    },
    askForCode: async () => {
      await new Promise(r => setTimeout(r, 20));
      return 'example#state';
    },
    dropCode: () => {},
  };
  await claudeLogin(f.executable, f.context, deps, new AbortController().signal);
  await claudeLogin(f.executable, f.context, deps, new AbortController().signal);
  assert.deepEqual(opened, [oauthTestUrl]);
  assert.equal(await claudeStatus(f.executable, f.context), true);
  assert.doesNotMatch(progress.join('\n'), /https:|state=|example#state/);
});

test('browser launch failure cancels the native login and closes the code dialog with a typed error', async () => {
  for (const synchronous of [false, true]) {
    const f = await fixture('url');
    let dropped = 0;
    await assert.rejects(
      claudeLogin(
        f.executable,
        f.context,
        {
          progress: () => {},
          openExternal: synchronous
            ? () => {
                throw new Error('private browser error');
              }
            : async () => {
                throw new Error('private browser error');
              },
          askForCode: () => new Promise<string | null>(() => {}),
          dropCode: () => {
            dropped++;
          },
        },
        new AbortController().signal,
      ),
      /^Error: LOGIN_BROWSER_FAILED$/,
    );
    assert.equal(dropped, 1);
    assert.equal(await claudeStatus(f.executable, f.context), false);
  }
});

test('manual login, reuse across runs, and logout affect only the isolated profile', async () => {
  const f = await fixture();
  const personal = join(f.context.cwd, 'personal');
  await writeFile(personal, 'untouched');
  let prompts = 0,
    drops = 0;
  const deps = {
    progress: () => {},
    askForCode: async () => {
      prompts++;
      return 'example#state';
    },
    dropCode: () => {
      drops++;
    },
  };
  assert.equal(await claudeStatus(f.executable, f.context), false);
  await claudeLogin(f.executable, f.context, deps, new AbortController().signal);
  assert.equal(await claudeStatus(f.executable, f.context), true);
  await claudeLogin(f.executable, f.context, deps, new AbortController().signal);
  assert.equal(prompts, 1);
  assert.equal(drops, 1);
  await claudeLogout(f.executable, f.context);
  assert.equal(await claudeStatus(f.executable, f.context), false);
  assert.equal(await readFile(personal, 'utf8'), 'untouched');
  const calls = await readFile(join(f.profile, 'calls'), 'utf8');
  assert.equal(calls.match(/auth login --claudeai/g)?.length, 1);
  assert.match(calls, /auth status --json/);
});

test('browser callback needs no manual code', async () => {
  const f = await fixture('browser');
  await claudeLogin(
    f.executable,
    f.context,
    {
      progress: () => {},
      askForCode: async () => {
        throw new Error('unexpected prompt');
      },
      dropCode: () => {},
    },
    new AbortController().signal,
  );
  assert.equal(await claudeStatus(f.executable, f.context), true);
});

test('mismatched profile prevents login and logout', async () => {
  const f = await fixture('mismatch');
  await assert.rejects(
    claudeLogin(
      f.executable,
      f.context,
      {
        progress: () => {},
        askForCode: async () => null,
        dropCode: () => {},
      },
      new AbortController().signal,
    ),
    /CLAUDE_PROFILE_MISMATCH/,
  );
  await assert.rejects(claudeLogout(f.executable, f.context), /CLAUDE_PROFILE_MISMATCH/);
  assert.doesNotMatch(await readFile(join(f.profile, 'calls'), 'utf8'), /auth (login|logout)/);
});

test('auth errors expose a typed code, never raw secrets', async () => {
  const f = await fixture('failure');
  await assert.rejects(
    claudeLogin(
      f.executable,
      f.context,
      {
        progress: () => {},
        askForCode: async () => null,
        dropCode: () => {},
      },
      new AbortController().signal,
    ),
    error => {
      assert.equal((error as Error).message, 'PROVIDER_PERMISSION_DENIED');
      assert.doesNotMatch(JSON.stringify(error), /sk-secret/);
      return true;
    },
  );
});

test('code dialog cancellation terminates login and closes dialog', async () => {
  const f = await fixture();
  let closed = false;
  await assert.rejects(
    claudeLogin(
      f.executable,
      f.context,
      {
        progress: () => {},
        askForCode: async () => null,
        dropCode: () => {
          closed = true;
        },
      },
      new AbortController().signal,
    ),
    /CANCELLED/,
  );
  assert.ok(closed);
  assert.equal(await claudeStatus(f.executable, f.context), false);
});

test('runtime cancellation and timeout are bounded', async () => {
  const f = await fixture('hang');
  const controller = new AbortController();
  const pending = runClaude(f.executable, ['auth', 'login'], f.context, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /CANCELLED/);
  await assert.rejects(runClaude(f.executable, ['auth', 'login'], f.context, { timeout: 150 }), /CLAUDE_AUTH_TIMEOUT/);
  await assert.rejects(runClaude(f.executable, ['auth', 'login'], f.context, { signal: controller.signal }), /CANCELLED/);
});

test('SDK shares the runtime/profile and excludes ambient provider credentials', async () => {
  const f = await fixture();
  const connection = { executable: f.executable, mode: 'subscription' } as Connection;
  const options = claudeSdkOptions(connection, { env: f.context.env, key: 'ignored' });
  assert.equal(options.pathToClaudeCodeExecutable, f.executable);
  assert.equal(options.env.CLAUDE_CONFIG_DIR, f.profile);
  assert.equal(options.env.ANTHROPIC_API_KEY, undefined);
  assert.equal(options.env.ANTHROPIC_BASE_URL, undefined);
  assert.equal(claudeEnv({ ...f.context.env, CLAUDE_CODE_USE_VERTEX: '1' }).CLAUDE_CODE_USE_VERTEX, undefined);
  assert.throws(() => claudeEnv({}), /CLAUDE_PROFILE_REQUIRED/);
  const api = claudeSdkOptions({ mode: 'api' } as Connection, { env: {}, key: 'explicit-key' });
  assert.equal(api.env.ANTHROPIC_API_KEY, 'explicit-key');
  assert.equal(api.pathToClaudeCodeExecutable, undefined);
});

test('Claude subscription streams text and usage with tools disabled through the chosen runtime', async () => {
  const f = await fixture();
  let captured: any;
  const provider = new ClaudeAdapter(
    async () =>
      ({
        query: (input: any) => {
          captured = input;
          return (async function* () {
            yield { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'สวัสดี' } } };
            yield {
              type: 'result',
              subtype: 'success',
              is_error: false,
              result: 'สวัสดี',
              usage: { input_tokens: 3, cache_read_input_tokens: 2, output_tokens: 4 },
            };
          })();
        },
      }) as any,
  );
  const deltas: string[] = [],
    usage: unknown[] = [];
  const answer = await provider.run('hello', { mode: 'subscription', executable: f.executable } as Connection, {
    ...f.context,
    signal: new AbortController().signal,
    emit: t => deltas.push(t),
    onUsage: u => usage.push(u),
  });
  assert.equal(answer, 'สวัสดี');
  assert.deepEqual(deltas, ['สวัสดี']);
  assert.deepEqual(usage, [{ input: 5, output: 4, total: 9 }]);
  assert.equal(captured.options.pathToClaudeCodeExecutable, f.executable);
  assert.deepEqual(captured.options.tools, []);
  assert.deepEqual(captured.options.settingSources, []);
  assert.equal(captured.options.strictMcpConfig, true);
  assert.equal((await captured.options.canUseTool()).behavior, 'deny');
});

test('SDK errors are classified without exposing secrets and cancellation remains cancellation', async () => {
  const f = await fixture();
  for (const [reason, expected] of [
    ['401 unauthorized sk-secret', 'LOGIN_REQUIRED'],
    ['429 quota', 'PROVIDER_QUOTA'],
    ['403 not authorized', 'PROVIDER_PERMISSION_DENIED'],
  ]) {
    const provider = new ClaudeAdapter(
      async () =>
        ({
          query: () =>
            (async function* () {
              yield { type: 'result', is_error: true, errors: [reason] };
            })(),
        }) as any,
    );
    await assert.rejects(
      provider.run('hello', { mode: 'subscription', executable: f.executable } as Connection, {
        ...f.context,
        signal: new AbortController().signal,
        emit: () => {},
      }),
      (error: any) => error.message === expected,
    );
  }
  const controller = new AbortController();
  const provider = new ClaudeAdapter(async () => {
    controller.abort();
    return {
      query: () => {
        throw new Error('must not start');
      },
    } as any;
  });
  await assert.rejects(
    provider.run('hello', { mode: 'subscription', executable: f.executable } as Connection, {
      ...f.context,
      signal: controller.signal,
      emit: () => {},
    }),
    /CANCELLED/,
  );
});

test('sign-in status is kept apart from a failing test request', async () => {
  const f = await fixture('browser');
  let signedIn = false;
  const connection = { provider: 'claude', mode: 'subscription', executable: f.executable } as Connection;
  await assert.rejects(
    signInAndTest(
      connection,
      {
        runtime: {
          adapter: {
            run: async () => {
              throw new Error('PROVIDER_QUOTA');
            },
          },
          context: f.context,
        },
        progress: () => {},
        openExternal: async () => {},
        askForCode: async () => null,
        dropCode: () => {},
        signedIn: () => {
          signedIn = true;
        },
      },
      new AbortController().signal,
    ),
    /PROVIDER_QUOTA/,
  );
  assert.ok(signedIn);
});
