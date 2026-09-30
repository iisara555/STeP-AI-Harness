import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateFileSha256 } from '../src/utils/checksum.js';
import { pathExists } from '../src/utils/file-ops.js';
import { findUntrackedManagedConflicts, reconcileManagedFiles } from '../src/modules/managed-files.js';
import { writeManifest, readManifest } from '../src/modules/manifest.js';
import { createSnapshot, restoreSnapshot } from '../src/modules/recovery.js';
import { copyRoleFiles } from '../src/modules/adapters/base.js';
import { loadUserMemory, saveUserMemory } from '../src/modules/user-memory.js';
import { resolveRoutingIdentity } from '../src/modules/routing-identity.js';

async function tracked(path) {
  return { sha256: await calculateFileSha256(path), size: (await readFile(path)).length };
}

test('managed-file reconciliation removes clean stale files and quarantines edited stale files', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'step-managed-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, 'skills', 'old-clean'), { recursive: true });
  await mkdir(join(root, 'skills', 'old-edited'), { recursive: true });
  await mkdir(join(root, 'skills', 'active'), { recursive: true });
  const clean = join(root, 'skills', 'old-clean', 'SKILL.md');
  const edited = join(root, 'skills', 'old-edited', 'SKILL.md');
  const active = join(root, 'skills', 'active', 'SKILL.md');
  await writeFile(clean, 'old clean');
  await writeFile(edited, 'old baseline');
  await writeFile(active, 'active');
  const manifest = {
    files: {
      'skills/old-clean/SKILL.md': await tracked(clean),
      'skills/old-edited/SKILL.md': await tracked(edited),
      'skills/active/SKILL.md': await tracked(active),
    },
  };
  await writeFile(edited, 'employee edit');

  const result = await reconcileManagedFiles(root, manifest, ['skills/active/SKILL.md']);
  assert.equal(await pathExists(clean), false);
  assert.equal(await pathExists(edited), false);
  assert.equal(await readFile(join(root, result.quarantined[0].preservedAt), 'utf8'), 'employee edit');
  assert.equal(await readFile(active, 'utf8'), 'active');
  assert.deepEqual(result.removed, ['skills/old-clean/SKILL.md']);
  assert.equal(result.quarantined[0].path, 'skills/old-edited/SKILL.md');
});

test('rollback reconciles files introduced after the snapshot instead of leaving stale scope active', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'step-rollback-scope-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, 'skills', 'qs'), { recursive: true });
  const qs = join(root, 'skills', 'qs', 'SKILL.md');
  await writeFile(qs, 'qs baseline');
  await writeManifest(root, { version: '1', role: 'qs', files: { 'skills/qs/SKILL.md': await tracked(qs) } });
  const snapshotId = await createSnapshot(root, 'before-team-switch');

  await rm(qs);
  await mkdir(join(root, 'skills', 'cc'), { recursive: true });
  const cc = join(root, 'skills', 'cc', 'SKILL.md');
  await writeFile(cc, 'cc baseline');
  await writeManifest(root, { version: '1', role: 'cc', files: { 'skills/cc/SKILL.md': await tracked(cc) } });

  const restored = await restoreSnapshot(root, snapshotId);
  assert.equal(await pathExists(cc), false);
  assert.equal(await readFile(qs, 'utf8'), 'qs baseline');
  assert.equal((await readManifest(root)).role, 'qs');
  assert.ok(restored.removedFiles.includes('skills/cc/SKILL.md'));
});

test('routing identity prefers current workspace USER.md, then manifest, and explicit flags win', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'step-routing-identity-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  await writeManifest(root, { team: 'qs', cluster: 'governance-operations', files: {} });
  assert.deepEqual(await resolveRoutingIdentity(root), {
    team: 'qs',
    cluster: 'governance-operations',
    source: 'manifest',
  });

  await saveUserMemory(
    root,
    '# STeP User Memory\n\n## 1. ข้อมูลผู้ใช้งาน (User Profile)\n- **ทีมหลัก (Primary Team)**: CC\n- **กลุ่มงานสำหรับ Routing (Routing Cluster)**: market-creative\n',
  );
  assert.deepEqual(await resolveRoutingIdentity(root), {
    team: 'cc',
    cluster: 'market-creative',
    source: 'USER.md',
  });
  assert.deepEqual(await resolveRoutingIdentity(root, { cluster: 'facilities-labs' }), {
    team: '',
    cluster: 'facilities-labs',
    source: 'explicit',
  });
  assert.deepEqual(await resolveRoutingIdentity(root, { team: 'afp' }), {
    team: 'afp',
    cluster: '',
    source: 'explicit',
  });
});

test('managed workspace writes reject symlink and junction-style escape paths', { skip: process.platform === 'win32' }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'step-linked-write-'));
  const outside = await mkdtemp(join(tmpdir(), 'step-linked-outside-'));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  await symlink(outside, join(root, 'skills'));
  const source = join(outside, 'source.md');
  await writeFile(source, 'safe source');
  await assert.rejects(
    copyRoleFiles(root, [{ relativePath: 'skills/demo/SKILL.md', sourcePath: source, type: 'skill' }]),
    /Linked workspace path/,
  );

  await rm(join(root, 'skills'));
  await symlink(outside, join(root, 'USER.md'));
  await assert.rejects(loadUserMemory(root), /Linked workspace path/);

  await rm(join(root, 'USER.md'));
  await symlink(outside, join(root, '.step-ai'));
  await assert.rejects(writeManifest(root, { files: {} }), /Linked workspace path/);
});


test('initial managed install detects conflicting untracked user files but allows identical packaged copies', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'step-install-conflict-'));
  const sourceRoot = await mkdtemp(join(tmpdir(), 'step-install-source-'));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(sourceRoot, { recursive: true, force: true });
  });

  await mkdir(join(root, 'skills', 'demo'), { recursive: true });
  await mkdir(join(sourceRoot, 'skills', 'demo'), { recursive: true });
  const source = join(sourceRoot, 'skills', 'demo', 'SKILL.md');
  const target = join(root, 'skills', 'demo', 'SKILL.md');
  await writeFile(source, 'approved');
  await writeFile(target, 'employee custom content');
  await writeFile(join(root, 'AGENTS.md'), 'existing project instructions');

  const files = [{ relativePath: 'skills/demo/SKILL.md', sourcePath: source, type: 'skill' }];
  const instructions = [{ filename: 'AGENTS.md', content: 'STeP instructions' }];
  assert.deepEqual(await findUntrackedManagedConflicts(root, null, files, instructions), [
    'AGENTS.md',
    'skills/demo/SKILL.md',
  ]);

  await writeFile(target, 'approved');
  await writeFile(join(root, 'AGENTS.md'), 'STeP instructions');
  assert.deepEqual(await findUntrackedManagedConflicts(root, null, files, instructions), []);
});
