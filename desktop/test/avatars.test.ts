import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { AVATAR_IDS, RETIRED_AVATAR_IDS, isAvatarId } from '../src/avatar-ids';

test('every profile picture id has its bundled image, and only those ids are accepted', () => {
  const files = readdirSync(new URL('../src/assets/avatars/', import.meta.url)).filter(f => f.endsWith('.webp'));
  assert.equal(files.length, AVATAR_IDS.length);
  for (const id of AVATAR_IDS) assert.ok(existsSync(new URL(`../src/assets/avatars/${id}.webp`, import.meta.url)), id);
  assert.equal(isAvatarId('avatar-01'), true);
  assert.equal(isAvatarId('avatar-36'), true);
  assert.equal(isAvatarId('avatar-37'), true);
  assert.equal(isAvatarId('avatar-56'), true);
  for (const bad of ['avatar-57', 'avatar-1', '../avatar-01', 'https://example.com/a.png', '', 7, null])
    assert.equal(isAvatarId(bad), false, String(bad));
});

test('near-copy drawings are retired from the picker but stay valid for employees who chose them', () => {
  assert.deepEqual(RETIRED_AVATAR_IDS, ['avatar-30', 'avatar-34', 'avatar-35']);
  for (const id of RETIRED_AVATAR_IDS) assert.equal(isAvatarId(id), true, id);
  assert.equal(AVATAR_IDS.length - RETIRED_AVATAR_IDS.length, 53);
});

test('twenty new office portraits are distinct assets and do not replace an existing drawing', () => {
  const digest = (id: string) =>
    createHash('sha256')
      .update(readFileSync(new URL(`../src/assets/avatars/${id}.webp`, import.meta.url)))
      .digest('hex');
  const seen = new Set(AVATAR_IDS.slice(0, 36).map(digest));
  const added = AVATAR_IDS.slice(36);
  assert.equal(added.length, 20);
  for (const id of added) {
    const hash = digest(id);
    assert.equal(seen.has(hash), false, `${id} duplicates another asset`);
    seen.add(hash);
  }
});
