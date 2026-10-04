import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSharedProfile, sharedProfilePath, writeSharedProfile } from '../electron/shared-profile';

test('shared profile: Desktop writes what Setup-STeP-Skills reads, and reads what it writes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-shared-'));
  try {
    const file = join(dir, '.step-ai', 'profile.json');
    assert.equal(sharedProfilePath({}, dir), file);
    assert.equal(sharedProfilePath({ STEP_SHARED_PROFILE: '/x/p.json' }, dir), '/x/p.json');
    assert.equal(await readSharedProfile(file), undefined, 'no file, no profile');

    await writeSharedProfile(file, {
      userName: 'ต้น',
      team: 'qs',
      assistant: 'น้องสเต็ป',
      personality: 'custom',
      assistantTone: 'สั้น\nกระชับ',
    });
    const written = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(
      { ...written, updatedAt: undefined },
      { version: 1, name: 'ต้น', team: 'qs', assistant: 'น้องสเต็ป', style: 'custom', tone: 'สั้น กระชับ', updatedAt: undefined },
    );
    if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.deepEqual(await readSharedProfile(file), {
      userName: 'ต้น',
      team: 'qs',
      assistant: 'น้องสเต็ป',
      personality: 'custom',
      assistantTone: 'สั้น กระชับ',
    });

    // The format Setup-STeP-Skills writes (scripts/install-agent-skills.mjs).
    await writeFile(file, JSON.stringify({ version: 1, name: 'เอ', team: 'CC', assistant: '', style: 'concise', tone: 'ignored' }));
    assert.deepEqual(await readSharedProfile(file), {
      userName: 'เอ',
      team: 'cc',
      assistant: '',
      personality: 'concise',
      assistantTone: '',
    });

    for (const bad of ['not json', JSON.stringify({ version: 2, name: 'x' }), JSON.stringify([1]), 'x'.repeat(70_000)]) {
      await writeFile(file, bad);
      assert.equal(await readSharedProfile(file), undefined);
    }
    await writeFile(file, JSON.stringify({ version: 1, name: 'n'.repeat(500), style: 'loud' }));
    const clipped = await readSharedProfile(file);
    assert.equal(clipped?.userName.length, 60);
    assert.equal(clipped?.personality, 'coworker');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
