// Phase 5 of learning from work: measure whether confirmed lessons help, from data the app already has. It counts how
// often each lesson is sent, how people rated the answers that used it, and how often they had to correct the same
// thing again after confirming it. It is a signal for a person to judge, not proof that the AI got better.
import type { LearnedLesson, LearningMetrics, LearningTally, LearningUsage, LearningUse, LessonMetric } from './learning-types';

/** Fewer rated answers than this and the rates say little; the inbox says so instead of showing a trend. */
export const MIN_RATED = 20;
const tally = (): LearningTally => ({ answers: 0, good: 0, fix: 0 });
const add = (t: LearningTally, rating?: 'good' | 'fix') => {
  t.answers++;
  if (rating) t[rating]++;
};

export function learningMetrics(
  lessons: LearnedLesson[],
  usage: LearningUsage,
  rating: (use: LearningUse) => 'good' | 'fix' | undefined,
): LearningMetrics {
  const withLessons = tally(),
    withoutLessons = tally();
  const per = new Map<string, LessonMetric & { sessions: Set<string> }>();
  for (const lesson of lessons) {
    const head = lesson.revisions[lesson.revisions.length - 1];
    per.set(lesson.id, {
      id: lesson.id,
      name: head?.content?.name || [...lesson.revisions].reverse().find(r => r.content)?.content?.name || '',
      active: Boolean(head?.content),
      ...tally(),
      tasks: 0,
      sessions: new Set(),
      repeats: 0,
    });
  }
  for (const use of usage.uses) {
    const score = rating(use);
    add(use.lessons.length ? withLessons : withoutLessons, score);
    for (const id of new Set(use.lessons.map(l => l.slice(0, l.lastIndexOf('@'))))) {
      const metric = per.get(id);
      if (!metric) continue;
      add(metric, score);
      metric.sessions.add(use.sessionId);
      if (!metric.lastUsed || use.at > metric.lastUsed) metric.lastUsed = use.at;
    }
  }
  for (const repeat of usage.repeats) {
    const metric = per.get(repeat.lessonId);
    if (!metric) continue;
    metric.repeats++;
    if (!metric.lastRepeat || repeat.at > metric.lastRepeat) metric.lastRepeat = repeat.at;
  }
  const since = usage.uses.reduce<string | undefined>((first, use) => (!first || use.at < first ? use.at : first), undefined);
  return {
    since,
    withLessons,
    withoutLessons,
    // Lessons corrected again first, then the most used.
    lessons: [...per.values()]
      .map(({ sessions, ...metric }) => ({ ...metric, tasks: sessions.size }))
      .sort((a, b) => b.repeats - a.repeats || b.answers - a.answers),
  };
}
