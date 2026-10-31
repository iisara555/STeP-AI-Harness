import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile, link, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertPrivateTrialPath } from '../electron/receipt-trial-path';

/**
 * Creates a symlink, or skips the calling test (reported as skipped, not passed) where the account may not create
 * one: Windows allows file symlinks only with Developer Mode or administrator rights.
 */
async function linkOrSkip(t: { skip: (reason: string) => void }, target: string, path: string, type?: 'dir' | 'junction') {
  try {
    await symlink(target, path, type);
    return true;
  } catch (error: any) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('this Windows account cannot create symlinks (needs Developer Mode or administrator rights)');
      return false;
    }
    throw error;
  }
}

test('private trial export rejects Git checkout ancestors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-trial-path-'));
  try {
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
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a folder link or junction into a Git checkout cannot hold a private report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-trial-folder-link-'));
  try {
    const repo = join(root, 'repo');
    await mkdir(join(repo, 'ignored'), { recursive: true });
    await writeFile(join(repo, '.git'), 'gitdir: elsewhere');
    // A junction needs no special rights on Windows; elsewhere this is an ordinary folder symlink.
    await symlink(join(repo, 'ignored'), join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(assertPrivateTrialPath(join(root, 'linked', 'report.json')), /OCR_TRIAL_REPO_PATH/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a file symlink into a Git checkout cannot hold a private report', async t => {
  const root = await mkdtemp(join(tmpdir(), 'step-trial-file-link-'));
  try {
    const repo = join(root, 'repo');
    await mkdir(join(repo, 'ignored'), { recursive: true });
    await writeFile(join(repo, '.git'), 'gitdir: elsewhere');
    await writeFile(join(repo, 'ignored', 'existing.json'), '{}');
    if (!(await linkOrSkip(t, join(repo, 'ignored', 'existing.json'), join(root, 'existing.json')))) return;
    await assert.rejects(assertPrivateTrialPath(join(root, 'existing.json')), /OCR_TRIAL_(REPO_PATH|UNSAFE_PATH)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a dangling export symlink cannot write a private report inside Git', async t => {
  const root = await mkdtemp(join(tmpdir(), 'step-trial-alias-'));
  try {
    const repo = join(root, 'repo'),
      outside = join(root, 'outside');
    await mkdir(repo);
    await mkdir(outside);
    await writeFile(join(repo, '.git'), 'gitdir: elsewhere');
    if (!(await linkOrSkip(t, join(repo, 'new-report.json'), join(outside, 'dangling.json')))) return;
    await assert.rejects(assertPrivateTrialPath(join(outside, 'dangling.json')), /OCR_TRIAL_(REPO_PATH|UNSAFE_PATH)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a hard link cannot write a private report inside Git, and a new file outside resolves to its real path', async () => {
  // Hard links need no special rights on NTFS, so this runs on Windows too.
  const root = await mkdtemp(join(tmpdir(), 'step-trial-hardlink-'));
  try {
    const repo = join(root, 'repo'),
      outside = join(root, 'outside');
    await mkdir(repo);
    await mkdir(outside);
    await writeFile(join(repo, '.git'), 'gitdir: elsewhere');
    await writeFile(join(repo, 'existing.json'), '{"synthetic":true}');
    await link(join(repo, 'existing.json'), join(outside, 'hard-linked.json'));
    await assert.rejects(assertPrivateTrialPath(join(outside, 'hard-linked.json')), /OCR_TRIAL_UNSAFE_PATH/);
    // macOS temporary paths may have symlinked ancestors. Exports must use the resolved destination.
    assert.equal(await assertPrivateTrialPath(join(outside, 'safe-new.json')), join(await realpath(outside), 'safe-new.json'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
