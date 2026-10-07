import { spawn, spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, open, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  parseArgs,
  outsideRepo,
  desktopData,
  listProfiles,
  selectProfile,
  runtimeEnv,
  containsPath,
  resolvedDestination,
  parsePriorCalls,
} from './config.mjs';

const kit = dirname(fileURLToPath(import.meta.url));
const help = `STeP Office OAuth eval (Node 24, source checkout and desktop dependencies required)
  node eval.mjs --repo PATH --list
  node eval.mjs --repo PATH --connection 1 --probe
  node eval.mjs --repo PATH --self-test
  node eval.mjs --repo PATH --connection 1 --live
Optional: --data-dir PATH, --profile PATH, --output PATH, --prior-calls MODEL=COUNT
Only --live sends model prompts. Results default to ~/STeP-Office-Eval.
Run live on ONE machine per account. Move the full results directory before switching machines.
Reuse an existing Desktop OAuth profile; no API keys or token copying. Close Desktop before live eval.
Three paired tasks/model; at most 18 admitted model calls/model, including failed calls and explicit prior-call reservations.
`;
let lock, lockPath, child;
try {
  const options = parseArgs(process.argv.slice(2));
  const priorCalls = parsePriorCalls(options['--prior-calls']);
  if (options['--help']) {
    console.log(help);
    process.exit(0);
  }
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('NODE_24_REQUIRED');
  const repo = realpathSync(resolve(options['--repo'] || join(kit, '../../..')));
  for (const file of ['desktop/electron/service.ts', 'desktop/electron/tools.ts', 'skills/common/spreadsheet-work/SKILL.md'])
    if (!existsSync(join(repo, file))) throw new Error('CURRENT_SOURCE_CHECKOUT_REQUIRED');
  let profile, rows;
  if (!options['--self-test']) {
    if (options['--profile']) {
      if (options['--list']) throw new Error('LIST_REQUIRES_DESKTOP_DATA_DIR');
      profile = realpathSync(resolve(options['--profile']));
    } else {
      rows = listProfiles(desktopData(options));
      if (options['--list']) {
        console.log(
          JSON.stringify(
            { connections: rows.map(r => ({ number: r.number, id: r.id, provider: 'openai', mode: 'subscription' })), modelPrompts: 0 },
            null,
            2,
          ),
        );
        process.exit(0);
      }
      profile = selectProfile(rows, options['--connection']);
    }
  }
  const mode = options['--live'] ? '--live' : options['--self-test'] ? '--self-test' : '--probe';
  const desired = outsideRepo(resolvedDestination(options['--output'] || join(homedir(), 'STeP-Office-Eval')), repo);
  if (profile && (containsPath(profile, desired) || containsPath(desired, profile))) throw new Error('OUTPUT_OVERLAPS_AUTH_PROFILE');
  await mkdir(desired, { recursive: true, mode: 0o700 });
  const output = outsideRepo(realpathSync(desired), repo);
  if (profile && (containsPath(profile, output) || containsPath(output, profile))) throw new Error('OUTPUT_OVERLAPS_AUTH_PROFILE');
  const loader = join(repo, 'desktop/node_modules/tsx/dist/loader.mjs');
  if (!existsSync(loader)) throw new Error('RUN_NPM_CI_IN_DESKTOP_FIRST');
  if (mode === '--live') {
    lockPath = join(output, 'eval.lock');
    lock = await open(lockPath, 'wx', 0o600);
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  }
  const env = profile ? runtimeEnv(profile) : { ...process.env };
  Object.assign(env, {
    STEP_EVAL_REPO: repo,
    STEP_EVAL_OUTPUT: output,
    STEP_EVAL_PROFILE: profile || '',
    STEP_EVAL_KIT: kit,
    STEP_EVAL_PRIOR_CALLS: JSON.stringify(priorCalls),
  });
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8', timeout: 5000, windowsHide: true });
  const head = revision.status === 0 ? revision.stdout.trim() : '';
  if (/^[a-f0-9]{40,64}$/.test(head)) env.STEP_EVAL_SOURCE_HEAD = head;
  const dirty = spawnSync('git', ['diff', 'HEAD', '--quiet'], { cwd: repo, timeout: 5000, windowsHide: true });
  if (dirty.status === 0 || dirty.status === 1) env.STEP_EVAL_SOURCE_DIRTY = String(dirty.status === 1);
  child = spawn(process.execPath, ['--import', pathToFileURL(loader).href, join(kit, 'run.mjs'), mode], {
    cwd: repo,
    env,
    shell: false,
    stdio: 'inherit',
    windowsHide: true,
  });
  process.on('SIGINT', () => {
    if (process.platform !== 'win32') child.kill('SIGINT');
  });
  process.on('SIGTERM', () => child.kill('SIGTERM'));
  process.exitCode = await new Promise(resolveCode => {
    child.on('error', () => resolveCode(1));
    child.on('exit', code => resolveCode(code ?? 1));
  });
} catch (error) {
  const code = error.code === 'EEXIST' ? 'EVAL_LOCK_EXISTS' : /^[A-Z_]+$/.test(error.message) ? error.message : 'SETUP_FAILED';
  console.error(
    JSON.stringify({
      error: code,
      modelPrompts: 0,
      help: 'Use --help or docs/cloud-model-eval-setup.md. Do not share credentials or raw CLI logs.',
    }),
  );
  process.exitCode = 1;
} finally {
  if (lock) {
    await lock.close();
    await unlink(lockPath).catch(() => {});
  }
}
