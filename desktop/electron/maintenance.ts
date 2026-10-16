import { createHash } from 'node:crypto';
import { stableMemory } from './memory';
import { overlap } from '../src/learning-curator';
import type { LearnedLesson, LessonMetric } from '../src/learning-types';
import type { MaintenanceBoard, MaintenanceFinding, MaintenanceItem, MaintenanceStatus, MemoryEntry } from '../src/types';

// Maintenance of what the agent has learned (rules/learning-and-verification.md, step 6 of the agent-learning plan).
// A local check, with no model call and nothing sent anywhere, finds memories, lessons and Skill Packs that need a
// person's attention and keeps them on a small to-do / doing / done board. It never edits or deletes anything itself:
// the employee fixes an item in the Memory dialog, the Learning Inbox or Skill Packs. An item moved to done is checked
// again at once and goes back to "to do" if the problem is still there.

export const MAINTENANCE_EVERY_MS = 24 * 3600_000;
const DAY = 86400_000,
  STALE_MEMORY_DAYS = 180,
  UNUSED_LESSON_DAYS = 90,
  SIMILAR = 0.8,
  KEEP_CLOSED = 100;

type PackSummary = { id: string; enabled?: boolean; invalid?: boolean; review?: { status: string; findings?: unknown[] } };
export type MaintenanceInput = {
  memories: MemoryEntry[];
  lessons: LearnedLesson[];
  metrics: LessonMetric[];
  packs: PackSummary[];
  now?: number;
};

const key = (...parts: string[]) => createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 24);
const ephemeral = (text: string) => {
  try {
    stableMemory(text);
    return false;
  } catch {
    return true;
  }
};
const head = (lesson: LearnedLesson) => lesson.revisions[lesson.revisions.length - 1];

/** What needs a person's attention now. Pure: the same input gives the same findings with the same ids. */
export function findMaintenance(input: MaintenanceInput): MaintenanceFinding[] {
  const now = input.now ?? Date.now();
  const found: MaintenanceFinding[] = [];
  const add = (f: Omit<MaintenanceFinding, 'id'>) => found.push({ id: key(f.kind, ...f.targets), ...f });

  for (const m of input.memories) {
    const target = `memory:${m.scope}:${m.id}`;
    if (m.expired) add({ kind: 'memory-expired', area: 'memory', targets: [target], name: m.name });
    else if (!m.ttl_days && now - Date.parse(m.updated_at) > STALE_MEMORY_DAYS * DAY)
      add({ kind: 'memory-stale', area: 'memory', targets: [target], name: m.name });
    if (ephemeral(m.name + '\n' + m.text)) add({ kind: 'memory-ephemeral', area: 'memory', targets: [target], name: m.name });
  }
  for (let i = 0; i < input.memories.length; i++)
    for (let j = i + 1; j < input.memories.length; j++) {
      const a = input.memories[i],
        b = input.memories[j];
      if (overlap(a.text, b.text) >= SIMILAR)
        add({
          kind: 'memory-duplicate',
          area: 'memory',
          targets: [`memory:${a.scope}:${a.id}`, `memory:${b.scope}:${b.id}`].sort(),
          name: `${a.name} · ${b.name}`,
        });
    }

  const metrics = new Map(input.metrics.map(m => [m.id, m]));
  const active = input.lessons.filter(l => head(l)?.content);
  for (const lesson of active) {
    const content = head(lesson).content!,
      target = `lesson:${lesson.id}`,
      metric = metrics.get(lesson.id);
    if (metric && metric.repeats >= 2)
      add({ kind: 'lesson-repeated', area: 'lesson', targets: [target], name: content.name, count: metric.repeats });
    if (metric && metric.fix >= 2 && metric.fix > metric.good)
      add({ kind: 'lesson-fix', area: 'lesson', targets: [target], name: content.name, count: metric.fix });
    const lastUsed = Date.parse(metric?.lastUsed || head(lesson).at);
    if (now - lastUsed > UNUSED_LESSON_DAYS * DAY) add({ kind: 'lesson-unused', area: 'lesson', targets: [target], name: content.name });
    if (ephemeral([content.name, content.trigger, content.text].join('\n')))
      add({ kind: 'lesson-ephemeral', area: 'lesson', targets: [target], name: content.name });
  }
  for (let i = 0; i < active.length; i++)
    for (let j = i + 1; j < active.length; j++) {
      const a = head(active[i]).content!,
        b = head(active[j]).content!;
      if (a.kind === b.kind && overlap(a.text, b.text) >= SIMILAR)
        add({
          kind: 'lesson-duplicate',
          area: 'lesson',
          targets: [`lesson:${active[i].id}`, `lesson:${active[j].id}`].sort(),
          name: `${a.name} · ${b.name}`,
        });
    }

  for (const pack of input.packs) {
    if (!pack.enabled && !pack.invalid) continue;
    const target = `pack:${pack.id}`;
    if (pack.invalid) add({ kind: 'pack-invalid', area: 'skill', targets: [target], name: pack.id });
    else if (pack.review && pack.review.status !== 'pass')
      add({ kind: 'pack-review', area: 'skill', targets: [target], name: pack.id, count: pack.review.findings?.length || 0 });
  }
  return found;
}

/** Applies a new check to the board: new problems are added, solved ones close, and a "done" item still found reopens. */
export function mergeBoard(
  board: MaintenanceBoard | undefined,
  findings: MaintenanceFinding[],
  now = new Date().toISOString(),
): MaintenanceBoard {
  const items = new Map((board?.items || []).map(i => [i.id, { ...i }]));
  const seen = new Set<string>();
  for (const f of findings) {
    seen.add(f.id);
    const item = items.get(f.id);
    if (!item) items.set(f.id, { ...f, status: 'todo', foundAt: now, updatedAt: now });
    else {
      Object.assign(item, f);
      if (item.status === 'done')
        Object.assign(item, { status: 'todo', reopened: true, updatedAt: now, resolvedAt: undefined, resolvedBy: undefined });
    }
  }
  for (const item of items.values())
    if (!seen.has(item.id) && (item.status === 'todo' || item.status === 'doing'))
      Object.assign(item, { status: 'done', resolvedAt: now, resolvedBy: 'check', reopened: false, updatedAt: now });
  const open = [...items.values()].filter(i => i.status === 'todo' || i.status === 'doing');
  const closed = [...items.values()]
    .filter(i => i.status === 'done' || i.status === 'dismissed')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, KEEP_CLOSED);
  return { checkedAt: now, items: [...open, ...closed] };
}

/** A move made by the employee. "Done" is only kept if a fresh check no longer finds the problem. */
export function moveItem(
  board: MaintenanceBoard,
  id: string,
  status: MaintenanceStatus,
  fresh: MaintenanceFinding[],
  now = new Date().toISOString(),
) {
  const item = board.items.find(i => i.id === id);
  if (!item) throw new Error('MAINTENANCE_NOT_FOUND');
  if (!['todo', 'doing', 'done', 'dismissed'].includes(status)) throw new Error('INVALID_INPUT');
  const still = fresh.some(f => f.id === id);
  const next: MaintenanceItem =
    status === 'done' && still
      ? { ...item, status: 'todo', reopened: true, updatedAt: now }
      : {
          ...item,
          status,
          reopened: false,
          updatedAt: now,
          ...(status === 'done' ? { resolvedAt: now, resolvedBy: 'person' as const } : {}),
        };
  return { board: { ...board, items: board.items.map(i => (i.id === id ? next : i)) }, item: next, verified: status !== 'done' || !still };
}
