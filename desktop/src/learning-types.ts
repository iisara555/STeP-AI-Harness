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
  /** manual: typed by the person; feedback: imported from a memory proposal; ai: drafted by /learn's AI review. */
  source: 'manual' | 'feedback' | 'ai';
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
