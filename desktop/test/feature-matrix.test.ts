import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { runFeatureMatrix, matrixReport } from '../eval/feature-matrix';
import { evaluationHarness } from '../eval/golden';
import { evaluationRuntime } from '../eval/runtime';
import { claudeLauncherExecutable } from '../electron/claude-auth';

test('feature matrix runs actual routing and host features with synthetic generation', async () => {
  const harness = await evaluationHarness(resolve('..'));
  const connection = {
    id: 'test',
    provider: 'claude' as const,
    mode: 'api' as const,
    model: 'test',
    executable: '',
    ready: true,
    note: '',
  };
  let coordinatorCalls = 0;
  let releaseCoordinator!: () => void;
  const coordinatorReady = new Promise<void>(resolve => {
    releaseCoordinator = resolve;
  });
  const results = await runFeatureMatrix({
    harness,
    connection,
    live: false,
    runtime: async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async prompt => {
          // Hold the first child until the second actually starts, rather than assuming 5 ms of fake work overlaps.
          if (prompt.includes('EVAL_COORDINATOR_12')) {
            if (++coordinatorCalls === 2) releaseCoordinator();
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
              await Promise.race([
                coordinatorReady,
                new Promise<never>((_, reject) => {
                  timer = setTimeout(() => reject(new Error('COORDINATOR_OVERLAP_TIMEOUT')), 10_000);
                }),
              ]);
            } finally {
              clearTimeout(timer);
            }
          }
          return 'Synthetic draft EVAL_ORCHID_42';
        },
      },
    }),
  });
  assert.equal(results.length, 5);
  assert.ok(
    results.every(r => r.passed && r.evidence === 'local'),
    JSON.stringify(results.map(({ output, ...r }) => r)),
  );
  assert.match(matrixReport(results, { mode: 'synthetic' }), /Three clean reads: 3 transmission prompts become 1/);
});
test('live evaluation requires explicit approval and a supported named auth source', async () => {
  await assert.rejects(evaluationRuntime({}), /EVAL_LIVE_APPROVAL_REQUIRED/);
  await assert.rejects(
    evaluationRuntime({ STEP_EVAL_APPROVE_LIVE: '1', STEP_EVAL_PROVIDER: 'openai', STEP_EVAL_AUTH: 'subscription' }),
    /EVAL_PROVIDER_INVALID/,
  );
  await assert.rejects(
    evaluationRuntime({ STEP_EVAL_APPROVE_LIVE: '1', STEP_EVAL_PROVIDER: 'claude', STEP_EVAL_AUTH: 'subscription' }),
    /CLAUDE_PROFILE_REQUIRED/,
  );
});
test('npm Claude launcher resolves its native binary or legacy script without invoking a shell wrapper', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-launcher-'));
  try {
    const packageRoot = join(root, 'node_modules/@anthropic-ai/claude-code');
    await mkdir(join(packageRoot, 'bin'), { recursive: true });
    assert.equal(claudeLauncherExecutable(join(root, 'claude.cmd')), null);
    await writeFile(join(packageRoot, 'cli.js'), 'Synthetic legacy entry');
    assert.equal(claudeLauncherExecutable(join(root, 'claude.cmd')), join(packageRoot, 'cli.js'));
    await writeFile(join(packageRoot, 'bin/claude.exe'), 'Synthetic native entry');
    assert.equal(claudeLauncherExecutable(join(root, 'claude.cmd')), join(packageRoot, 'bin/claude.exe'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
