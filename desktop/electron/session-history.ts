import type { Store } from './store';
import type { Session } from '../src/types';

// Searchable session history for the AI (rules/learning-and-verification.md, step 3 of the agent-learning plan): the
// assistant can find an earlier task on this computer by words, project or date and read a bounded excerpt, so the
// employee does not have to explain it again. Only the same team's other tasks are visible, and what is returned still
// passes the tool loop's privacy check and transmission consent before it reaches the AI.

export type HistoryQuery = { query?: string; from?: string; to?: string; project?: string; limit?: number };
export type HistoryHit = { id: string; title: string; project: string; updatedAt: string; status: string; snippet: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (value: unknown, end = false) => {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !DAY.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('INVALID_INPUT');
  // Dates are local calendar days (Thailand for STeP), compared on the saved ISO time.
  return new Date(value + (end ? 'T23:59:59.999' : 'T00:00:00')).getTime();
};
const clean = (text: unknown) =>
  String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
function snippet(s: Session, words: string[]) {
  const texts = [s.title, ...s.messages.filter(m => m.role !== 'status').map(m => m.text), s.draft].map(clean).filter(Boolean);
  for (const text of words.length ? texts : []) {
    const at = words.map(w => text.toLowerCase().indexOf(w)).find(i => i >= 0);
    if (at !== undefined) return (at > 80 ? '…' : '') + text.slice(Math.max(0, at - 80), at + 160) + (text.length > at + 160 ? '…' : '');
  }
  const first = clean(s.messages.find(m => m.role === 'user')?.text);
  return first.slice(0, 240) + (first.length > 240 ? '…' : '');
}

/** Earlier tasks of the same team, newest first, at most `limit` (1-10, default 5). The current task is left out. */
export function searchHistory(store: Store, team: string, current: string, q: HistoryQuery): HistoryHit[] {
  const from = day(q.from),
    to = day(q.to, true);
  if (from !== undefined && to !== undefined && from > to) throw new Error('INVALID_INPUT');
  const limit = q.limit === undefined ? 5 : Number(q.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw new Error('INVALID_INPUT');
  const query = clean(q.query).slice(0, 200),
    project = clean(q.project).toLowerCase();
  const ids = new Set(store.search(query));
  const words = query
    .toLowerCase()
    .split(' ')
    .filter(w => w.length >= 2);
  return store
    .list<Session>('session')
    .filter(s => ids.has(s.id) && s.id !== current && s.team === team)
    .filter(s => {
      const at = Date.parse(s.updatedAt);
      return (from === undefined || at >= from) && (to === undefined || at <= to);
    })
    .filter(s => !project || clean(s.project).toLowerCase().includes(project))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map(s => ({ id: s.id, title: s.title, project: s.project, updatedAt: s.updatedAt, status: s.status, snippet: snippet(s, words) }));
}

/** A bounded excerpt of one earlier task: its request, the last turns and the start of its draft. */
export function readHistory(store: Store, team: string, current: string, id: string) {
  const s = store.list<Session>('session').find(x => x.id === id);
  if (!s || s.id === current || s.team !== team) throw new Error('SESSION_NOT_FOUND');
  let budget = 8000;
  const turns: { role: string; text: string }[] = [];
  for (const m of s.messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-12)
    .reverse()) {
    if (budget <= 0) break;
    const text = clean(m.text).slice(0, Math.min(1500, budget));
    budget -= text.length;
    turns.unshift({ role: m.role, text });
  }
  return {
    id: s.id,
    title: s.title,
    project: s.project,
    updatedAt: s.updatedAt,
    status: s.status,
    request: clean(s.originalQuery).slice(0, 1000),
    turns,
    ...(s.draft ? { draft: s.draft.slice(0, 2000), draftTruncated: s.draft.length > 2000 } : {}),
  };
}
