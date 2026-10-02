# Native workflows (STeP Desktop)

Native workflows are ways of working built into the harness, as Claude Code's plan mode is built in. They are not Skills the AI loads from files. The employee picks one in the composer's mode picker, under **ขั้นตอนทำงาน**. Its rules join the system prompt for that run only (`electron/workflows.ts`).

| Workflow | Picker label | What the assistant does |
|---|---|---|
| `plan` | วางแผนก่อนลงมือ | 1. Restates the goal and compares approaches when the path is not obvious.<br>2. Asks up to 5 clarifying questions with `ask_user`, one at a time, covering scope, audience, deadline, constraints, owner and "done".<br>3. Breaks the work into 3–12 tasks, each with a verifiable outcome. Tasks for an authorised person are marked "(ผู้มีอำนาจ)".<br>4. Submits the plan with the `plan` tool. It does not do the work. |
| `execute` | ลงมือทำตามแผน | 1. Works through the approved plan in order, calling `plan_update` (`doing`, then `done` with a one-line result).<br>2. Marks approvals, signatures, submissions or payments as `blocked`, with what the person must do, then continues with the tasks that do not depend on them.<br>3. Stops and asks when something contradicts the plan.<br>4. Ends with what is done, what is blocked and what is next. |
| `requirements` | เขียนเอกสารความต้องการ | 1. Interviews the employee with up to 8 questions covering the problem, stakeholders, goals and metrics, scope, constraints, risks and open questions.<br>2. Writes a requirements document whose numbered requirements are each testable (must/should/could).<br>3. Offers a TOR outline when the work will be procured. |
| `diagnose` | วิเคราะห์ปัญหา | 1. States the symptom precisely and gathers evidence with the tools and `ask_user`.<br>2. Ranks 2–4 hypotheses and runs the cheapest test that tells them apart.<br>3. Names a root cause only with evidence.<br>4. Proposes a quick fix and a lasting fix, with risk, owner, how to verify and how to prevent it recurring. |

## The plan and its card

- **Approving the plan:**
  - In the `plan` workflow, the `plan` tool always asks the employee to approve the plan, in pilot mode too.
  - An approved plan is kept on the task as `session.workPlan`: a goal plus up to 20 tasks, each with a status of `todo`, `doing`, `done` or `blocked` and an optional note.
  - A declined plan leaves the earlier approved plan in place, and the AI revises the plan with the employee.
- **The plan card:** it shows in the chat with "done X/Y", one icon per task and each task's note.
  - Its button **ลงมือทำตามแผน** (or **ทำตามแผนต่อ** once a task is done) runs the `execute` workflow.
  - `plan_update` refreshes the card while the assistant works.
- **Picker limits:**
  - `execute` can be picked only when the task has an approved plan.
  - A workflow always runs as chat, never as an image request.
  - A workflow cannot be combined with multi-worker drafting.
- **What a plan grants:** nothing beyond the work itself. Every tool still asks under the permission mode, and approving, signing, submitting and paying stay with people.

## Origins

The working methods follow common agent practices (brainstorm and clarify, plan with checkpoints, execute step by step, requirements interview, structured diagnosis). They are written here for office work at STeP; no third-party skill text is copied.
