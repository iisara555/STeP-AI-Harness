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
