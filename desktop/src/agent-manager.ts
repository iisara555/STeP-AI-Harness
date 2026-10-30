// The all-tasks overview (like Antigravity's Agent Manager): every task the assistant is doing or has done, sorted by
// what the employee has to do next. Pure, so the grouping is tested without the app.
import type { ApprovalRequest, Session, ToolQuestion } from './types';

/** Tasks the app runs at the same time (electron/service.ts); more wait for a free slot. */
export const PARALLEL_RUNS = 3;
/** Finished and stopped tasks shown in each of their groups; the rest stay in the task list and search. */
export const MANAGER_RECENT = 20;

export type ManagerGroup = 'needs-you' | 'running' | 'done' | 'stopped';
export type ManagerTask = {
  id: string;
  title: string;
  project: string;
  team: string;
  status: string;
  updatedAt: string;
  group: ManagerGroup;
  /** Why the task waits on the employee: a question, a permission (with its title) or missing information. */
  waiting?: { kind: 'question' | 'approval' | 'clarification'; text?: string };
  /** Progress of the task's approved plan, when it has one. */
  plan?: { done: number; total: number };
};

const DONE = new Set(['review', 'completed']);
const STOPPED = new Set(['error', 'cancelled', 'interrupted', 'paused']);

/** One task's place in the overview, or undefined for a new task nothing has happened in yet. */
export function managerTask(session: Session, questions: ToolQuestion[], approvals: ApprovalRequest[]): ManagerTask | undefined {
  const question = questions.find(q => q.sessionId === session.id);
  const approval = approvals.find(a => a.sessionId === session.id);
  const waiting: ManagerTask['waiting'] = question
    ? { kind: 'question', text: question.question }
    : approval
      ? { kind: 'approval', text: approval.title }
      : session.status === 'waiting'
        ? { kind: 'clarification' }
        : undefined;
  const group: ManagerGroup | undefined = waiting
    ? 'needs-you'
    : session.status === 'running'
      ? 'running'
      : DONE.has(session.status)
        ? 'done'
        : STOPPED.has(session.status)
          ? 'stopped'
          : undefined;
  if (!group) return undefined;
  const tasks = session.workPlan?.tasks || [];
  return {
    id: session.id,
    title: session.title,
    project: session.project,
    team: session.team,
    status: session.status,
    updatedAt: session.updatedAt,
    group,
    ...(waiting ? { waiting } : {}),
    ...(tasks.length ? { plan: { done: tasks.filter(task => task.status === 'done').length, total: tasks.length } } : {}),
  };
}

/** Every task in its group, newest first; finished and stopped groups keep their most recent MANAGER_RECENT. */
export function managerGroups(sessions: Session[], questions: ToolQuestion[], approvals: ApprovalRequest[]) {
  const groups: Record<ManagerGroup, ManagerTask[]> = { 'needs-you': [], running: [], done: [], stopped: [] };
  for (const session of [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const task = managerTask(session, questions, approvals);
    if (task) groups[task.group].push(task);
  }
  groups.done = groups.done.slice(0, MANAGER_RECENT);
  groups.stopped = groups.stopped.slice(0, MANAGER_RECENT);
  return groups;
}

/** Tasks waiting on the employee, for the count on the overview's menu entry. */
export function needsYouCount(sessions: Session[], questions: ToolQuestion[], approvals: ApprovalRequest[]) {
  return sessions.filter(session => managerTask(session, questions, approvals)?.group === 'needs-you').length;
}
