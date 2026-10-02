import type { WorkPlan, WorkTask, Workflow } from '../src/types';

// Native workflows of the harness, as Claude Code's plan mode is native rather than a Skill to load: the employee picks
// one in the composer and its rules join the system prompt for that run. The working methods follow widely used agent
// practices (brainstorm, clarify, plan with checkpoints, execute step by step, requirements interview, structured
// diagnosis), written here for office work at STeP rather than copied from any skill pack.
export const WORKFLOWS: readonly Workflow[] = ['plan', 'execute', 'requirements', 'diagnose'];
export const isWorkflow = (value: unknown): value is Workflow => WORKFLOWS.includes(value as Workflow);

const PLAN_RULE = `Native workflow: PLAN BEFORE DOING. Do not do the work itself in this run; produce an approved plan.
1. Understand: restate the goal in one or two sentences. If the path is not obvious, compare 2-3 approaches with their trade-offs and recommend one.
2. Clarify: ask the employee with ask_user, one question at a time and with options where possible, until the scope, audience, deadline, constraints (budget, rules, procurement), owner and "done" are clear. Ask at most 5 questions; list any remaining assumptions instead of asking more.
3. Plan: break the work into 3-12 small tasks in order. Each task has a verifiable outcome ("done when ..."). Mark tasks that need a person (approval, signature, submission, payment) with "(ผู้มีอำนาจ)"; the assistant never does those.
4. Submit with the plan tool: input = the plan in Markdown, first line "# เป้าหมาย: <goal>", then one task per line as "- [ ] <task> — เสร็จเมื่อ <outcome>". Then tell the employee the plan is waiting for approval and that "ลงมือทำตามแผน" runs it.`;

const REQUIREMENTS_RULE = `Native workflow: REQUIREMENTS. Interview first, then write the requirements document.
1. Ask with ask_user, one question at a time and with options where possible: the problem and who has it, users and stakeholders, goals and how success is measured, what is in and out of scope, constraints (budget, deadline, regulations, procurement), risks, and open questions. At most 8 questions; record what is still unknown as open questions.
2. Write the document with these sections: ความเป็นมา, ปัญหา, เป้าหมายและตัวชี้วัดความสำเร็จ, ผู้ใช้และผู้มีส่วนได้ส่วนเสีย, ขอบเขต (ทำ/ไม่ทำ), ความต้องการ (numbered; must/should/could; each one testable), ข้อจำกัดและสมมติฐาน, ความเสี่ยง, คำถามที่ยังเปิดอยู่, ขั้นตอนถัดไป.
3. When the work will be procured by a government unit, offer to turn it into a TOR outline. Label assumptions as assumptions and never invent facts about STeP.`;

const DIAGNOSE_RULE = `Native workflow: DIAGNOSE A PROBLEM. Find the cause before proposing a fix.
1. State the symptom precisely: what happens, where, since when, how often, who is affected, expected versus actual.
2. Gather evidence: read the files, documents or pages involved with the tools, and ask the employee with ask_user for missing facts (one question at a time).
3. List 2-4 hypotheses ranked by likelihood, each with the evidence for and against.
4. Check the cheapest test that tells the hypotheses apart first, and say what each result would mean.
5. Name a root cause only with evidence; otherwise say what is still unknown and how to find out.
6. Recommend fixes (a quick fix and a lasting fix) with risk, owner and how to verify, and how to prevent it happening again.`;

function executeRule(plan?: WorkPlan) {
  if (!plan?.tasks.length)
    return 'Native workflow: EXECUTE THE PLAN. There is no approved plan in this task. Tell the employee to run the "วางแผน" workflow first, and do not start the work.';
  const tasks = plan.tasks.map((t, i) => `${i + 1}. [${t.status}] ${t.title}${t.note ? ` (note: ${t.note})` : ''}`).join('\n');
  return `Native workflow: EXECUTE THE APPROVED PLAN.
Goal: ${plan.goal}
Tasks (number, status, task):
${tasks}
Work through the tasks in order, starting at the first one not done. Before starting a task call plan_update(input=<task number>, args.status="doing"). Do it with the tools, check its "done when" outcome, then call plan_update(input=<task number>, args.status="done", content=<one-line result>). A task marked (ผู้มีอำนาจ), or anything that needs approval, a signature, a submission or a payment, is never done by the assistant: mark it "blocked" with what the person must do, and continue with the tasks that do not depend on it. If something contradicts the plan, mark the task "blocked" with the reason and ask the employee with ask_user; never change the plan silently. End with a short summary: done, blocked (and who must act), and what is next.`;
}

export function workflowRule(workflow: Workflow, plan?: WorkPlan) {
  return workflow === 'plan'
    ? PLAN_RULE
    : workflow === 'execute'
      ? executeRule(plan)
      : workflow === 'requirements'
        ? REQUIREMENTS_RULE
        : DIAGNOSE_RULE;
}

/** The plan the plan tool submitted, as a goal and tasks; tasks are checklist, numbered or bulleted lines. */
export function parsePlan(text: string): Omit<WorkPlan, 'approvedAt'> {
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const goalLine = lines.find(l => /^#+\s*/.test(l));
  const goal = (goalLine || lines.find(Boolean) || '')
    .replace(/^#+\s*/, '')
    .replace(/^(เป้าหมาย|goal)\s*[:：]\s*/i, '')
    .slice(0, 300);
  const tasks: WorkTask[] = [];
  for (const line of lines) {
    const match = /^(?:[-*+]\s*(?:\[[ xX]\]\s*)?|\d{1,2}[.)]\s+)(.+)$/.exec(line);
    if (!match || line === goalLine) continue;
    const title = match[1].trim().slice(0, 300);
    if (title) tasks.push({ title, status: /^[-*+]\s*\[[xX]\]/.test(line) ? 'done' : 'todo' });
    if (tasks.length === 20) break;
  }
  return { goal, tasks };
}
