// The Learning Inbox's health report, after Hermes Agent's Curator but report-only: it points at lessons that look
// duplicated or conflicting, pending proposals left waiting, long lessons and how full the store is. It never merges,
// archives or disables anything, and it does not treat a rarely used lesson as worthless (a yearly procedure is rare).
import type { LearningSnapshot, LessonContent } from './learning-types';

export type CuratorFinding =
  | { kind: 'duplicate'; lessons: [string, string]; similarity: number }
  | { kind: 'sharedTrigger'; lessons: [string, string]; words: string[] }
  | { kind: 'stalePending'; candidate: string; days: number }
  | { kind: 'long'; lesson: string; chars: number }
  | { kind: 'capacity'; what: 'pending' | 'lessons'; used: number; limit: number };

const normalize = (text: string) => text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
/** Character bigrams, which work for Thai (no spaces between words) as well as English. */
const bigrams = (text: string) => {
  const value = normalize(text);
  const grams = new Set<string>();
  for (let i = 0; i < value.length - 1; i++) grams.add(value.slice(i, i + 2));
  return grams;
};
export function similarity(a: string, b: string) {
  const x = bigrams(a),
    y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const gram of x) if (y.has(gram)) shared++;
  return shared / (x.size + y.size - shared);
}
/** How much of the shorter text the longer one covers, so a short correction can match a longer lesson. Texts under
 * six bigrams score 0: too short to say they are about the same thing. */
export function overlap(a: string, b: string) {
  const x = bigrams(a),
    y = bigrams(b);
  if (Math.min(x.size, y.size) < 6) return 0;
  let shared = 0;
  for (const gram of x) if (y.has(gram)) shared++;
  return shared / Math.min(x.size, y.size);
}
const triggers = (content: LessonContent) =>
  content.kind === 'procedure'
    ? content.trigger
        .split(/[,\n]/)
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length >= 2)
    : [];

export function curatorReport(state: Pick<LearningSnapshot, 'candidates' | 'lessons'>, now = Date.now()): CuratorFinding[] {
  const findings: CuratorFinding[] = [];
  const active = state.lessons
    .map(lesson => ({ id: lesson.id, content: lesson.revisions[lesson.revisions.length - 1]?.content }))
    .filter((lesson): lesson is { id: string; content: LessonContent } => Boolean(lesson.content));
  for (let i = 0; i < active.length; i++)
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i].content,
        b = active[j].content;
      const score = similarity(a.text, b.text);
      if (score >= 0.6) findings.push({ kind: 'duplicate', lessons: [a.name, b.name], similarity: Number(score.toFixed(2)) });
      else {
        const shared = triggers(a).filter(word => triggers(b).includes(word));
        if (shared.length) findings.push({ kind: 'sharedTrigger', lessons: [a.name, b.name], words: shared });
      }
    }
  for (const candidate of state.candidates) {
    const days = Math.floor((now - Date.parse(candidate.at)) / 86_400_000);
    if (candidate.status === 'pending' && days >= 30) findings.push({ kind: 'stalePending', candidate: candidate.content.name, days });
  }
  for (const lesson of active)
    if (lesson.content.text.length > 2000) findings.push({ kind: 'long', lesson: lesson.content.name, chars: lesson.content.text.length });
  const pending = state.candidates.filter(c => c.status === 'pending').length;
  if (pending >= 16) findings.push({ kind: 'capacity', what: 'pending', used: pending, limit: 20 });
  if (state.lessons.length >= 80) findings.push({ kind: 'capacity', what: 'lessons', used: state.lessons.length, limit: 100 });
  return findings;
}
