// Notifications on each task in the task list: a task waiting on the employee, running, or finished or stopped since
// the employee last opened it. Pure, so the rules are tested without the app.
import type { ApprovalRequest, Session, ToolQuestion } from './types';

export type TaskAlert = 'needs-you' | 'running' | 'done' | 'stopped';

const DONE = new Set(['review', 'completed']);
const STOPPED = new Set(['error', 'cancelled', 'interrupted', 'paused']);

/** The task's notification, if any. `seen` is the task's updatedAt when the employee last had it open. */
export function taskAlert(
  session: Pick<Session, 'id' | 'status' | 'updatedAt'>,
  questions: ToolQuestion[],
  approvals: ApprovalRequest[],
  seen?: string,
): TaskAlert | undefined {
  if (questions.some(q => q.sessionId === session.id) || approvals.some(a => a.sessionId === session.id) || session.status === 'waiting')
    return 'needs-you';
  if (session.status === 'running') return 'running';
  const unseen = !seen || seen < session.updatedAt;
  if (unseen && DONE.has(session.status)) return 'done';
  if (unseen && STOPPED.has(session.status)) return 'stopped';
  return undefined;
}

/** Tasks waiting on the employee, counted on the task list's icon when the list is folded. */
export function needsYouCount(sessions: Session[], questions: ToolQuestion[], approvals: ApprovalRequest[]) {
  return sessions.filter(session => taskAlert(session, questions, approvals) === 'needs-you').length;
}

/** What each notification says to a screen reader and on hover. */
export const TASK_ALERT_LABELS: Record<TaskAlert, string> = {
  'needs-you': 'รอคุณ',
  running: 'กำลังทำ',
  done: 'เสร็จแล้ว ยังไม่ได้เปิดดู',
  stopped: 'ไม่สำเร็จ ยังไม่ได้เปิดดู',
};

/** Where the renderer keeps, per task, the updatedAt the employee last saw (this computer only). */
export const TASK_SEEN_KEY = 'step.taskSeen';

/**
 * The seen marks read from storage. On first use every existing task counts as seen, so an upgrade does not light up
 * the whole history.
 */
export function initialSeen(stored: string | null, sessions: Pick<Session, 'id' | 'updatedAt'>[]): Record<string, string> {
  try {
    const parsed = stored ? JSON.parse(stored) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    /* Unreadable marks start over. */
  }
  return Object.fromEntries(sessions.map(s => [s.id, s.updatedAt]));
}
