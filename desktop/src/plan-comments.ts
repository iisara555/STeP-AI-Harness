// Comments on the tasks of a plan, like comments on an Antigravity artifact: the employee notes what to change on the
// task itself, and the assistant revises the plan or follows the note when it does that task. Pure, so it is tested
// without the app.
import type { WorkPlan } from './types';

/** Longest comment kept on one task (electron/workbench.ts). */
export const PLAN_COMMENT_LIMIT = 500;

/** Tasks the employee commented on, with their 1-based numbers. */
export function commentedTasks(plan?: WorkPlan) {
  return (plan?.tasks || []).flatMap((task, index) =>
    task.comment ? [{ number: index + 1, title: task.title, comment: task.comment }] : [],
  );
}

/** The message that asks the assistant to revise the plan by the comments, sent as the employee's own request. */
export function revisionRequest(plan: WorkPlan, heading: string, item = (number: number) => `ข้อ ${number}`) {
  return [heading, ...commentedTasks(plan).map(task => `- ${item(task.number)} «${task.title}»: ${task.comment}`)].join('\n');
}

/** The plan with the employee's task comments masked before it is sent; the rest is the model's own masked output. */
export const maskedPlan = (plan: WorkPlan | undefined, mask: (text: string) => string): WorkPlan | undefined =>
  plan && { ...plan, tasks: plan.tasks.map(task => (task.comment ? { ...task, comment: mask(task.comment) } : task)) };
