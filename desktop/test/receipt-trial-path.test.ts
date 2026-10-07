import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile, link, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertPrivateTrialPath } from '../electron/receipt-trial-path';

test('private trial export rejects Git checkout ancestors and symlinks into them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-trial-path-'));
  const repo = join(root, 'repo');
  await mkdir(join(repo, 'ignored'), { recursive: true });
  // .git can be a file in a worktree.
  await writeFile(join(repo, '.git'), 'gitdir: elsewhere');
  await assert.rejects(assertPrivateTrialPath(join(repo, 'ignored', 'report.json')), /OCR_TRIAL_REPO_PATH/);
  await assertPrivateTrialPath(join(root, 'report.json'));
  const regular = join(root, 'regular');
  await mkdir(join(regular, '.git'), { recursive: true });
  await writeFile(join(regular, '.git', 'HEAD'), 'ref: refs/heads/main');
  await assert.rejects(assertPrivateTrialPath(join(regular, 'report.json')), /OCR_TRIAL_REPO_PATH/);
  if (process.platform !== 'win32') {
    await symlink(join(repo, 'ignored'), join(root, 'linked'));
    await assert.rejects(assertPrivateTrialPath(join(root, 'linked', 'report.json')), /OCR_TRIAL_REPO_PATH/);
    await writeFile(join(repo, 'ignored', 'existing.json'), '{}');
    await symlink(join(repo, 'ignored', 'existing.json'), join(root, 'existing.json'));
    await assert.rejects(assertPrivateTrialPath(join(root, 'existing.json')), /OCR_TRIAL_(REPO_PATH|UNSAFE_PATH)/);
  }
});

test('a dangling export alias or hard link cannot write a private report inside Git', async () => {
  if (process.platform === 'win32') return;
  const root = await mkdtemp(join(tmpdir(), 'step-trial-alias-'));
  try {
    const repo = join(root, 'repo'),
      outside = join(root, 'outside');
    await mkdir(repo);
    await mkdir(outside);
    await writeFile(join(repo, '.git'), 'gitdir: elsewhere');
    await symlink(join(repo, 'new-report.json'), join(outside, 'dangling.json'));
    await assert.rejects(assertPrivateTrialPath(join(outside, 'dangling.json')), /OCR_TRIAL_(REPO_PATH|UNSAFE_PATH)/);
    await writeFile(join(repo, 'existing.json'), '{"synthetic":true}');
    await link(join(repo, 'existing.json'), join(outside, 'hard-linked.json'));
    await assert.rejects(assertPrivateTrialPath(join(outside, 'hard-linked.json')), /OCR_TRIAL_UNSAFE_PATH/);
    // macOS temporary paths may have symlinked ancestors. Exports must use the resolved destination.
    assert.equal(await assertPrivateTrialPath(join(outside, 'safe-new.json')), join(await realpath(outside), 'safe-new.json'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
