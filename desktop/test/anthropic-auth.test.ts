import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anthropicEnv, anthropicLogin, anthropicLogout, anthropicStatus, resolveAnthropicCli } from '../electron/anthropic-auth';
import { claudeSdkOptions } from '../electron/providers';
import { signInAndTest } from '../electron/connect';
import type { Connection } from '../src/types';

async function fixture(version = '1.35.0') {
  const cwd = await mkdtemp(join(tmpdir(), 'step-ant-test-'));
  const config = join(cwd, 'anthropic');
  await mkdir(config);
  const executable = join(cwd, 'ant.cjs');
  await writeFile(
    executable,
    [
      "const fs = require('node:fs'), path = require('node:path');",
      'const args = process.argv.slice(2);',
      'const dir = process.env.ANTHROPIC_CONFIG_DIR;',
      "const saved = path.join(dir, 'synthetic-oauth');",
      "fs.appendFileSync(path.join(dir, 'calls'), args.join(' ') + '\\n');",
      "if(args[0] === '--version') { console.log('ant " + version + "'); process.exit(0); }",
      "if(args[0] === 'auth' && args[1] === '--help') { console.log('login\\nprint-credentials\\nlogout'); process.exit(0); }",
      "if(args[0] === 'auth' && args[1] === 'print-credentials') {",
      " if(fs.existsSync(saved)) { console.log('sk-' + 'ant-oat01-synthetic-token-value'); process.exit(0); }",
      ' process.exit(1);',
      '}',
      "if(args[0] === 'auth' && args[1] === 'login') { fs.writeFileSync(saved, 'oauth'); process.exit(0); }",
      "if(args[0] === 'auth' && args[1] === 'logout') { fs.rmSync(saved, {force:true}); process.exit(0); }",
      'process.exit(2);',
    ].join('\n'),
  );
  const env = {
    ...process.env,
    HOME: cwd,
    USERPROFILE: cwd,
    ANTHROPIC_CONFIG_DIR: config,
    ANTHROPIC_API_KEY: 'must-not-inherit',
    ANTHROPIC_AUTH_TOKEN: 'must-not-inherit',
  };
  return { executable, context: { cwd, env }, config, cwd };
}

test('ant OAuth runtime is version-gated and isolated from ambient credentials', async t => {
  const f = await fixture();
  t.after(() => rm(f.cwd, { recursive: true, force: true }));
  assert.equal(await resolveAnthropicCli(f.context, async () => f.executable), f.executable);
  const env = anthropicEnv(f.context.env);
  assert.equal(env.ANTHROPIC_CONFIG_DIR, f.config);
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, undefined);

  const old = await fixture('1.4.9');
  t.after(() => rm(old.cwd, { recursive: true, force: true }));
  await assert.rejects(
    resolveAnthropicCli(old.context, async () => old.executable),
    /ANTHROPIC_CLI_UPDATE_REQUIRED/,
  );
});

test('official Console OAuth login, reuse and logout stay inside the STeP profile', async t => {
  const f = await fixture();
  t.after(() => rm(f.cwd, { recursive: true, force: true }));
  assert.equal(await anthropicStatus(f.executable, f.context), false);
  await anthropicLogin(f.executable, f.context, { progress: () => {} }, new AbortController().signal);
  assert.equal(await anthropicStatus(f.executable, f.context), true);
  await anthropicLogin(f.executable, f.context, { progress: () => {} }, new AbortController().signal);
  const calls = await readFile(join(f.config, 'calls'), 'utf8');
  assert.equal(calls.match(/auth login/g)?.length, 1);
  await anthropicLogout(f.executable, f.context);
  assert.equal(await anthropicStatus(f.executable, f.context), false);
});

test('Agent SDK uses the isolated Anthropic profile without API keys or Claude Code consumer auth', async t => {
  const f = await fixture();
  t.after(() => rm(f.cwd, { recursive: true, force: true }));
  const connection = { provider: 'claude', mode: 'oauth', executable: '' } as Connection;
  const options = claudeSdkOptions(connection, { env: f.context.env });
  assert.equal(options.env.ANTHROPIC_CONFIG_DIR, f.config);
  assert.equal(options.env.ANTHROPIC_API_KEY, undefined);
  assert.equal(options.env.ANTHROPIC_AUTH_TOKEN, undefined);
  assert.equal(options.env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
  assert.equal(options.pathToClaudeCodeExecutable, undefined);
});

test('connect flow completes Console OAuth before the test request without asking for a pasted code', async t => {
  const f = await fixture();
  t.after(() => rm(f.cwd, { recursive: true, force: true }));
  let signedIn = false,
    tested = false;
  const connection = { provider: 'claude', mode: 'oauth', executable: '' } as Connection;
  await signInAndTest(
    connection,
    {
      runtime: {
        authExecutable: f.executable,
        adapter: {
          run: async () => {
            tested = true;
            return 'OK';
          },
        },
        context: f.context,
      },
      progress: () => {},
      openExternal: async () => {},
      askForCode: async () => {
        throw new Error('OAuth is owned by ant CLI');
      },
      dropCode: () => {},
      signedIn: () => {
        signedIn = true;
      },
    },
    new AbortController().signal,
  );
  assert.equal(signedIn, true);
  assert.equal(tested, true);
  assert.equal(await anthropicStatus(f.executable, f.context), true);
});

// The in-app installer for Claude Console OAuth: nothing is installed unless the archive matches its
// pinned checksum and the binary proves to be Anthropic's ant; a failed check leaves any earlier copy alone.
test('ant installer verifies checksum and binary before replacing anything', async () => {
  const { createHash } = await import('node:crypto');
  const { existsSync } = await import('node:fs');
  const { installAnthropicCli, antComponentPath } = await import('../electron/anthropic-auth');
  const dir = await mkdtemp(join(tmpdir(), 'step-ant-install-'));
  const archive = Buffer.from('synthetic ant release archive');
  const spec = { asset: 'ant_test.zip', sha256: createHash('sha256').update(archive).digest('hex') };
  const name = process.platform === 'win32' ? 'ant.exe' : 'ant';
  const extract = async (_archive: string, target: string) => {
    await mkdir(join(target, 'ant_1.36.0'), { recursive: true });
    await writeFile(join(target, 'ant_1.36.0', name), 'synthetic ant binary');
    return true;
  };
  const target = antComponentPath(dir);
  const urls: string[] = [];
  const download = async (url: string) => {
    urls.push(url);
    return archive;
  };

  await assert.rejects(
    installAnthropicCli(dir, () => {}, { spec: { ...spec, sha256: '0'.repeat(64) }, download, extract, verify: async () => {} }),
    /ANTHROPIC_CLI_CHECKSUM_FAILED/,
  );
  assert.equal(existsSync(target), false);
  assert.match(urls[0], /^https:\/\/github\.com\/anthropics\/anthropic-cli\/releases\/download\/v\d+\.\d+\.\d+\/ant_test\.zip$/);

  let checked = '';
  const installed = await installAnthropicCli(dir, () => {}, {
    spec,
    download,
    extract,
    verify: async (executable, context) => {
      checked = executable;
      assert.ok(context.env.ANTHROPIC_CONFIG_DIR && !context.env.ANTHROPIC_CONFIG_DIR.startsWith(dir), 'checked in a throwaway profile');
    },
  });
  assert.equal(installed, target);
  assert.equal(await readFile(target, 'utf8'), 'synthetic ant binary');
  assert.notEqual(checked, target, 'the staged copy is checked before it replaces the installed one');

  await writeFile(target, 'working earlier copy');
  await assert.rejects(
    installAnthropicCli(dir, () => {}, {
      spec,
      download,
      extract,
      verify: async () => {
        throw new Error('ANTHROPIC_CLI_UPDATE_REQUIRED');
      },
    }),
    /ANTHROPIC_CLI_INSTALL_FAILED/,
  );
  assert.equal(await readFile(target, 'utf8'), 'working earlier copy');

  await assert.rejects(
    installAnthropicCli(dir, () => {}, { spec: null }),
    /ANTHROPIC_CLI_UNSUPPORTED/,
  );
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('the pinned ant release covers the desktop platforms with SHA-256 checksums', async () => {
  const { antComponentSpec } = await import('../electron/anthropic-auth');
  for (const [platform, arch] of [
    ['win32', 'x64'],
    ['win32', 'arm64'],
    ['darwin', 'arm64'],
    ['darwin', 'x64'],
  ] as const) {
    const spec = antComponentSpec(platform, arch);
    assert.ok(spec, `${platform}-${arch}`);
    assert.match(spec!.asset, /^ant_\d+\.\d+\.\d+_(windows|macos)_(amd64|arm64)\.zip$/);
    assert.match(spec!.sha256, /^[0-9a-f]{64}$/);
  }
  assert.equal(antComponentSpec('linux', 'x64'), null);
});
