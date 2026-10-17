import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMaintenance, mergeBoard, moveItem, type MaintenanceInput } from '../electron/maintenance';
import { defaultPolicy } from '../electron/policy';
import type { LearnedLesson, LessonMetric } from '../src/learning-types';
import type { MemoryEntry } from '../src/types';

// Step 6 of the agent-learning plan: a local daily check of memories, lessons and Skill Packs, kept as a board.
const NOW = Date.parse('2026-10-16T09:00:00Z');
const ago = (days: number) => new Date(NOW - days * 86400_000).toISOString();
const memory = (id: string, text: string, extra: Partial<Omit<MemoryEntry, 'schema_version' | 'source'>> = {}): MemoryEntry => ({
  schema_version: 1,
  source: 'user-confirmed',
  id,
  name: 'm-' + id,
  text,
  type: 'user',
  scope: 'private',
  importance: 0.7,
  ttl_days: 0,
  created_at: ago(10),
  updated_at: ago(10),
  ...extra,
});
const lesson = (id: string, text: string, at = ago(5)): LearnedLesson => ({
  id,
  revisions: [{ revision: 1, content: { name: 'l-' + id, kind: 'preference', trigger: '', text }, at }],
});
const metric = (id: string, extra: Partial<LessonMetric>): LessonMetric => ({
  id,
  name: 'l-' + id,
  active: true,
  answers: 0,
  good: 0,
  fix: 0,
  tasks: 0,
  repeats: 0,
  lastUsed: ago(1),
  ...extra,
});
const input = (over: Partial<MaintenanceInput> = {}): MaintenanceInput => ({
  memories: [],
  lessons: [],
  metrics: [],
  packs: [],
  now: NOW,
  ...over,
});
const kinds = (i: MaintenanceInput) =>
  findMaintenance(i)
    .map(f => `${f.kind}:${f.targets.join('+')}`)
    .sort();

test('memories: expired, unreviewed for half a year, short-lived and near-duplicates are found; healthy ones are not', () => {
  assert.deepEqual(kinds(input({ memories: [memory('ok', 'ตอบเป็นภาษาไทยและสั้น')] })), []);
  assert.deepEqual(
    kinds(
      input({
        memories: [
          memory('exp', 'ใช้ตารางเมื่อเปรียบเทียบตัวเลือก', { ttl_days: 5, expired: true }),
          memory('old', 'ส่งร่างให้หัวหน้าทางอีเมล', { updated_at: ago(200) }),
          memory('pr', 'ตอนนี้กำลังแก้ PR #190'),
          memory('a', 'Always answer in Thai with short bullet points and a summary line.'),
          memory('b', 'Always answer in Thai with short bullet points and a summary line!', { scope: 'project' }),
        ],
      }),
    ),
    [
      'memory-duplicate:memory:private:a+memory:project:b',
      'memory-ephemeral:memory:private:pr',
      'memory-expired:memory:private:exp',
      'memory-stale:memory:private:old',
    ],
  );
});

test('lessons: corrected again, rated "needs fixing", unused, short-lived and duplicate; packs: enabled ones failing review', () => {
  const found = kinds(
    input({
      lessons: [
        lesson('rep', 'ใส่เลขหน้าทุกหน้าในรายงาน'),
        lesson('bad', 'สรุปเป็นย่อหน้าเดียวเสมอ'),
        lesson('idle', 'ใช้ฟอนต์ TH Sarabun New ขนาด 16', ago(120)),
        lesson('wip', 'ทำถึงขั้นทดสอบแล้ว'),
        { id: 'off', revisions: [{ revision: 1, content: null, at: ago(1) }] },
      ],
      metrics: [
        metric('rep', { repeats: 2 }),
        metric('bad', { fix: 3, good: 1 }),
        metric('idle', { lastUsed: ago(100) }),
        metric('wip', {}),
      ],
      packs: [
        { id: 'good', enabled: true, review: { status: 'pass' } },
        { id: 'warn', enabled: true, review: { status: 'warn', findings: [{}] } },
        { id: 'off', enabled: false, review: { status: 'fail' } },
        { id: 'broken', invalid: true },
      ],
    }),
  );
  assert.deepEqual(found, [
    'lesson-ephemeral:lesson:wip',
    'lesson-fix:lesson:bad',
    'lesson-repeated:lesson:rep',
    'lesson-unused:lesson:idle',
    'pack-invalid:pack:broken',
    'pack-review:pack:warn',
  ]);
  assert.deepEqual(
    kinds(
      input({
        lessons: [
          lesson('x', 'Use a table when comparing three or more options.'),
          lesson('y', 'Use a table when comparing three or more options'),
        ],
        metrics: [metric('x', {}), metric('y', {})],
      }),
    ),
    ['lesson-duplicate:lesson:x+lesson:y'],
  );
  const ids = findMaintenance(input({ memories: [memory('pr', 'PR #12 waiting')] })).map(f => f.id);
  assert.deepEqual(
    ids,
    findMaintenance(input({ memories: [memory('pr', 'PR #12 waiting')] })).map(f => f.id),
    'stable ids',
  );
});

test('the board adds new problems, closes solved ones and reopens a "done" item that is still found', () => {
  const stale = input({ memories: [memory('pr', 'PR #12 waiting'), memory('exp', 'x'.repeat(20), { ttl_days: 1, expired: true })] });
  const first = mergeBoard(undefined, findMaintenance(stale), ago(2));
  assert.deepEqual(
    first.items.map(i => i.status),
    ['todo', 'todo'],
  );
  const exp = first.items.find(i => i.kind === 'memory-expired')!;
  const ephemeral = first.items.find(i => i.kind === 'memory-ephemeral')!;

  // The employee says the expired one is done, but it was not fixed: the fresh check sends it back.
  const notFixed = moveItem(first, exp.id, 'done', findMaintenance(stale), ago(1));
  assert.equal(notFixed.verified, false);
  assert.equal(notFixed.item.status, 'todo');
  assert.equal(notFixed.item.reopened, true);

  // After fixing it in the Memory dialog, done is accepted.
  const fixed = input({ memories: [memory('pr', 'PR #12 waiting')] });
  const accepted = moveItem(notFixed.board, exp.id, 'done', findMaintenance(fixed), ago(1));
  assert.equal(accepted.verified, true);
  assert.equal(accepted.item.status, 'done');
  assert.equal(accepted.item.resolvedBy, 'person');

  // A skipped item stays skipped; a later check closes what is gone and reopens a done item that came back.
  const skipped = moveItem(accepted.board, ephemeral.id, 'dismissed', []).board;
  const again = mergeBoard(skipped, findMaintenance(stale));
  assert.equal(again.items.find(i => i.id === ephemeral.id)!.status, 'dismissed');
  assert.equal(again.items.find(i => i.id === exp.id)!.status, 'todo');
  assert.equal(again.items.find(i => i.id === exp.id)!.reopened, true);
  const clean = mergeBoard(again, []);
  assert.equal(clean.items.find(i => i.id === exp.id)!.status, 'done');
  assert.equal(clean.items.find(i => i.id === exp.id)!.resolvedBy, 'check');

  assert.throws(() => moveItem(clean, 'nope', 'done', []), /MAINTENANCE_NOT_FOUND/);
  assert.throws(() => moveItem(clean, exp.id, 'deleted' as any, []), /INVALID_INPUT/);
  assert.equal(defaultPolicy().features.maintenance, true);
});
