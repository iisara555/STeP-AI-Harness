import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { AVATAR_IDS, isAvatarId } from '../src/avatar-ids';

test('every profile picture id has its bundled image, and only those ids are accepted', () => {
  const files = readdirSync(new URL('../src/assets/avatars/', import.meta.url)).filter(f => f.endsWith('.webp'));
  assert.equal(files.length, AVATAR_IDS.length);
  for (const id of AVATAR_IDS) assert.ok(existsSync(new URL(`../src/assets/avatars/${id}.webp`, import.meta.url)), id);
  assert.equal(isAvatarId('avatar-01'), true);
  assert.equal(isAvatarId('avatar-36'), true);
  for (const bad of ['avatar-37', 'avatar-1', '../avatar-01', 'https://example.com/a.png', '', 7, null])
    assert.equal(isAvatarId(bad), false, String(bad));
});
