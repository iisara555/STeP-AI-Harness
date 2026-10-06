import test from 'node:test';
import assert from 'node:assert/strict';
import { RELEASE_NOTES, compareVersions, unseenNotes } from '../src/whats-new';
import pkg from '../package.json' with { type: 'json' };

const notes = [
  { version: '0.5.20', items: () => ['c'] },
  { version: '0.5.19', items: () => ['b'] },
  { version: '0.5.18', items: () => ['a'] },
];

test('versions compare by number, not as text', () => {
  assert.equal(compareVersions('0.5.9', '0.5.10'), -1);
  assert.equal(compareVersions('0.6.0', '0.5.18'), 1);
  assert.equal(compareVersions('0.5.18', '0.5.18'), 0);
});

test('after an update, the notes since the last seen version show once', () => {
  assert.deepEqual(
    unseenNotes('0.5.18', '0.5.20', notes).map(n => n.version),
    ['0.5.20', '0.5.19'],
  );
  assert.deepEqual(unseenNotes('0.5.20', '0.5.20', notes), [], 'already seen');
  assert.deepEqual(unseenNotes('0.5.21', '0.5.20', notes), [], 'went back a version');
  assert.deepEqual(
    unseenNotes(undefined, '0.5.19', notes).map(n => n.version),
    ['0.5.19'],
    'updated from a version before this window: only the current notes',
  );
  assert.deepEqual(unseenNotes('0.5.18', '0.5.19', [{ version: '0.5.18', items: () => [] }]), [], 'a version without notes');
});

test('this version has notes, newest first', () => {
  assert.equal(RELEASE_NOTES[0].version, pkg.version, 'add the new version to src/whats-new.ts before a release');
  for (let i = 1; i < RELEASE_NOTES.length; i++) assert.equal(compareVersions(RELEASE_NOTES[i - 1].version, RELEASE_NOTES[i].version), 1);
  for (const note of RELEASE_NOTES) assert.ok(note.items().length > 0);
});
