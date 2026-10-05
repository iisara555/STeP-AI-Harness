export type LessonContent = {
  name: string;
  kind: 'preference' | 'procedure';
  trigger: string;
  text: string;
};
export type LearningCandidate = {
  id: string;
  lessonId: string;
  baseRevision: number;
  content: LessonContent;
  evidence: string;
  /** manual: typed by the person; feedback: imported from a memory proposal; ai: drafted on request; review: drafted by the background review. */
  source: 'manual' | 'feedback' | 'ai' | 'review';
  sessionId?: string;
  at: string;
  status: 'pending' | 'approved' | 'rejected';
};
export type LearningRevision = {
  revision: number;
  content: LessonContent | null;
  candidateId?: string;
  restoredFrom?: number;
  at: string;
};
export type LearnedLesson = { id: string; revisions: LearningRevision[] };
export type LearningSnapshot = {
  context: string;
  generation: number;
  candidates: LearningCandidate[];
  lessons: LearnedLesson[];
};
/** The background review: allowed by policy, turned on by the employee, and how much of today's budget is left. */
export type LearningReviewState = { allowed: boolean; enabled: boolean; today: number; dailyLimit: number };
/** One turn's saved context: which confirmed lessons (`id@revision`) were sent, never their text. `index` is the
 * number of messages in the task when the turn started, so the answer that follows is the first assistant message from it. */
export type LearningUse = { sessionId: string; index: number; at: string; lessons: string[] };
/** A new human correction that matches a lesson already in use: the same thing had to be fixed again. */
export type LearningRepeat = { lessonId: string; revision: number; source: 'manual' | 'fix'; at: string };
export type LearningUsage = { uses: LearningUse[]; repeats: LearningRepeat[] };
export type LearningTally = { answers: number; good: number; fix: number };
export type LessonMetric = LearningTally & {
  id: string;
  name: string;
  active: boolean;
  /** Distinct tasks the lesson was sent with. */
  tasks: number;
  lastUsed?: string;
  repeats: number;
  lastRepeat?: string;
};
/** Measured since `since` (the first recorded turn): answers with and without lessons, and per lesson. */
export type LearningMetrics = { since?: string; withLessons: LearningTally; withoutLessons: LearningTally; lessons: LessonMetric[] };
