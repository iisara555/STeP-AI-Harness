import { mkdtemp, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { createRequire } from 'node:module';
import { adapter } from '../electron/providers';
import { isolatedRuntimeHome } from '../electron/runtime-home';
import { claudeStatus, resolveClaudeRuntime } from '../electron/claude-auth';
import { resolveRuntime } from '../electron/runtimes';
import type { Connection, Provider } from '../src/types';

/** Explicit live opt-in and a named auth source; never discover or copy employee credentials. */
export async function evaluationRuntime(env: NodeJS.ProcessEnv = process.env) {
  if (env.STEP_EVAL_APPROVE_LIVE !== '1') throw new Error('EVAL_LIVE_APPROVAL_REQUIRED');
  const provider = env.STEP_EVAL_PROVIDER as Provider;
  const subscription = env.STEP_EVAL_AUTH === 'subscription';
  // Antigravity runs only on its own sign-in (agy keeps it in the OS keyring of this PC), so it is subscription-only.
  if (
    !['claude', 'openai', 'gemini', 'antigravity'].includes(provider) ||
    (subscription && !['claude', 'antigravity'].includes(provider)) ||
    (provider === 'antigravity' && !subscription)
  )
    throw new Error('EVAL_PROVIDER_INVALID');
  if (provider === 'antigravity' && !/^gemini-[\w.-]{1,93}$/.test(env.STEP_EVAL_MODEL || '')) throw new Error('INVALID_MODEL');
  const key = subscription ? undefined : env.STEP_EVAL_API_KEY;
  if (!subscription && !key) throw new Error('API_KEY_REQUIRED');
  const profile = env.STEP_EVAL_CLAUDE_PROFILE;
  if (
    subscription &&
    provider === 'claude' &&
    (!profile || !isAbsolute(profile) || !(await lstat(profile)).isDirectory() || (await lstat(profile)).isSymbolicLink())
  )
    throw new Error('CLAUDE_PROFILE_REQUIRED');
  const requireModule = createRequire(import.meta.url);
  const connection: Connection = {
    id: 'eval',
    provider,
    mode: subscription ? 'subscription' : 'api',
    model: env.STEP_EVAL_MODEL || '',
    executable:
      provider === 'antigravity'
        ? resolveRuntime(
            {
              provider: 'antigravity',
              executable: env.STEP_EVAL_EXECUTABLE || '',
              customRuntime: Boolean(env.STEP_EVAL_EXECUTABLE),
            } as Connection,
            env.APPDATA
              ? join(env.APPDATA, '@step-cmu', 'desktop', 'components', 'agy', process.platform === 'win32' ? 'agy.exe' : 'agy')
              : undefined,
          )
        : provider === 'openai'
          ? requireModule.resolve('@openai/codex/bin/codex.js')
          : provider === 'gemini'
            ? requireModule.resolve('@google/gemini-cli/bundle/gemini.js')
            : '',
    ready: true,
    note: '',
  };
  const home = await mkdtemp(join(tmpdir(), 'step-live-eval-'));
  try {
    const { cwd, env: isolated } = await isolatedRuntimeHome(home, connection);
    if (subscription && provider === 'claude') {
      isolated.CLAUDE_CONFIG_DIR = profile;
      connection.executable = await resolveClaudeRuntime(
        { cwd, env: isolated },
        env.STEP_EVAL_CLAUDE_EXECUTABLE ? async () => env.STEP_EVAL_CLAUDE_EXECUTABLE! : undefined,
      );
      if (!(await claudeStatus(connection.executable, { cwd, env: isolated }))) throw new Error('LOGIN_REQUIRED');
    }
    let calls = 0,
      total = 0,
      stopped = '';
    const maxCalls = Number(env.STEP_EVAL_MAX_CALLS || 20);
    if (!Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > 50) throw new Error('EVAL_CALL_LIMIT_INVALID');
    const selected = adapter(provider);
    const runtime = async () => ({
      context: { cwd, env: isolated, key },
      adapter: {
        run: async (...args: Parameters<typeof selected.run>) => {
          if (stopped) throw new Error(stopped);
          if (calls >= maxCalls || total >= 200_000) throw new Error('EVAL_QUOTA_BOUND');
          calls++;
          const context = args[2];
          try {
            return await selected.run(args[0], args[1], {
              ...context,
              onUsage: count => {
                total += count.total || 0;
                context.onUsage?.(count);
              },
            });
          } catch (error) {
            const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'PROVIDER_REQUEST_FAILED';
            if (
              subscription &&
              provider === 'claude' &&
              !(await claudeStatus(connection.executable, { cwd, env: isolated }).catch(() => false))
            )
              stopped = 'LOGIN_REQUIRED';
            else if (['LOGIN_REQUIRED', 'PROVIDER_PERMISSION_DENIED', 'PROVIDER_QUOTA', 'EVAL_QUOTA_BOUND'].includes(code)) stopped = code;
            throw new Error(stopped || code);
          }
        },
      },
    });
    return {
      connection,
      runtime,
      stats: () => ({ calls, tokens: total, maxCalls }),
      close: () => rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
    };
  } catch (error) {
    await rm(home, { recursive: true, force: true });
    throw error;
  }
}
