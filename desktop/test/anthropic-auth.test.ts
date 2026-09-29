import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  anthropicEnv,
  anthropicLogin,
  anthropicLogout,
  anthropicStatus,
  resolveAnthropicCli,
} from '../electron/anthropic-auth';
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
      "const args = process.argv.slice(2);",
      "const dir = process.env.ANTHROPIC_CONFIG_DIR;",
      "const saved = path.join(dir, 'synthetic-oauth');",
      "fs.appendFileSync(path.join(dir, 'calls'), args.join(' ') + '\\n');",
      "if(args[0] === '--version') { console.log('ant " + version + "'); process.exit(0); }",
      "if(args[0] === 'auth' && args[1] === '--help') { console.log('login\\nprint-credentials\\nlogout'); process.exit(0); }",
      "if(args[0] === 'auth' && args[1] === 'print-credentials') {",
      " if(fs.existsSync(saved)) { console.log('sk-' + 'ant-oat01-synthetic-token-value'); process.exit(0); }",
      " process.exit(1);",
      "}",
      "if(args[0] === 'auth' && args[1] === 'login') { fs.writeFileSync(saved, 'oauth'); process.exit(0); }",
      "if(args[0] === 'auth' && args[1] === 'logout') { fs.rmSync(saved, {force:true}); process.exit(0); }",
      "process.exit(2);",
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
  await assert.rejects(resolveAnthropicCli(old.context, async () => old.executable), /ANTHROPIC_CLI_UPDATE_REQUIRED/);
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
