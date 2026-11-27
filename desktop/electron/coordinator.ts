import type { Session } from '../src/types';
import { Store } from './store';
import { WorkService, MAX_PARALLEL_RUNS } from './service';
import type { Policy } from './policy';
import { section } from './prompt';
import { extractStructuredJson } from './json-schema';
import { tm } from './i18n';

export type Subtask = { id: string; query: string; dependsOn: string[]; skill?: string };
export function dependencyWaves(tasks: Subtask[]) {
  if (!tasks.length || tasks.length > 8 || new Set(tasks.map(t => t.id)).size !== tasks.length) throw new Error('COORDINATOR_PLAN_INVALID');
  const ids = new Set(tasks.map(t => t.id)),
    done = new Set<string>(),
    waves: Subtask[][] = [];
  for (const task of tasks)
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(task.id) || !task.query.trim() || task.query.length > 4000 || task.dependsOn.some(d => !ids.has(d)))
      throw new Error('COORDINATOR_PLAN_INVALID');
  while (done.size < tasks.length) {
    const ready = tasks.filter(t => !done.has(t.id) && t.dependsOn.every(d => done.has(d)));
    if (!ready.length) throw new Error('COORDINATOR_DEPENDENCY_CYCLE');
    waves.push(ready);
    ready.forEach(t => done.add(t.id));
  }
  return waves;
}
/** Undeclared steps are barriers. Repeated outputs represent successive versions. */
export function playbookTasks(steps: any[]): Subtask[] {
  const producers = new Map<string, number[]>();
  for (const [i, step] of steps.entries()) {
    if (step.kind === 'action' || step.type === 'action' || step.action || step.actionId) throw new Error('AUTHORITY_REVIEW_REQUIRED');
    if (step.produces !== undefined && (!Array.isArray(step.produces) || step.produces.some((s: unknown) => typeof s !== 'string')))
      throw new Error('COORDINATOR_PLAN_INVALID');
    for (const output of step.produces || []) {
      producers.set(output, [...(producers.get(output) || []), i]);
    }
  }
  return steps.map((step, i) => {
    if (step.kind === 'action' || step.action || step.actionId) throw new Error('AUTHORITY_REVIEW_REQUIRED');
    const id = String(step.id || `step-${i + 1}`);
    const declared =
      Array.isArray(step.consumes) &&
      Array.isArray(step.produces) &&
      (!step.dependenciesDeclared || (step.dependenciesDeclared.consumes && step.dependenciesDeclared.produces));
    const barrier = steps
      .slice(0, i)
      .findLastIndex(
        s =>
          !Array.isArray(s.consumes) ||
          !Array.isArray(s.produces) ||
          (s.dependenciesDeclared && (!s.dependenciesDeclared.consumes || !s.dependenciesDeclared.produces)),
      );
    const indices = declared
      ? step.consumes
          .map((x: string) => {
            const candidates = producers.get(x) || [];
            return candidates.filter(n => n < i).at(-1) ?? candidates.find(n => n >= i);
          })
          .filter((n: unknown) => n !== undefined)
      : Array.from({ length: i }, (_, n) => n);
    if (barrier >= 0) indices.push(barrier);
    const dependsOn = [...new Set<string>(indices.map((n: number) => String(steps[n].id || `step-${n + 1}`)))];
    if (declared && step.consumes.some((s: unknown) => typeof s !== 'string')) throw new Error('COORDINATOR_PLAN_INVALID');
    return { id, query: String(step.description || step.skill || step.skillId || ''), dependsOn, skill: step.skill || step.skillId };
  });
}
function parsePlan(text: string): Subtask[] {
  const source = extractStructuredJson(text);
  let raw: any;
  try {
    raw = JSON.parse(source);
  } catch {
    throw new Error('COORDINATOR_PLAN_INVALID');
  }
  if (!Array.isArray(raw?.tasks)) throw new Error('COORDINATOR_PLAN_INVALID');
  const tasks = raw.tasks.map((t: any) => {
    if (
      !t ||
      typeof t.id !== 'string' ||
      typeof t.query !== 'string' ||
      !Array.isArray(t.dependsOn) ||
      t.dependsOn.some((d: unknown) => typeof d !== 'string')
    )
      throw new Error('COORDINATOR_PLAN_INVALID');
    // Only the host router or a registered Playbook may assign a Skill to a worker.
    return { id: t.id, query: t.query, dependsOn: t.dependsOn };
  });
  dependencyWaves(tasks);
  return tasks;
}
/** Everything one coordinated draft sends a worker or the merge must fit here; it is checked before any AI call. */
export const COORDINATOR_CONTEXT_LIMIT = 100_000;
const PLAN_PROMPT =
  'Decompose the request below into 2–8 draft-only subtasks that together produce the requested deliverable. Return only JSON {"tasks":[{"id":"a","query":"...","dependsOn":[]}]}. Each query must be self-contained, say which part of the deliverable it drafts, and be written in the language of the request, because the employee reviews the plan before it starts. Declare all dependencies. Do not add a task that combines, compiles or formats the whole deliverable: the host merges the parts afterwards. Do not grant authority or propose external actions.';
const PLAN_RETRY = 'Your previous reply was not a valid plan. Reply with the JSON object only, in exactly that shape.';
/** Failures that end a run without a second planning attempt: retrying the plan would not change them. */
const FINAL = new Set([
  'CANCELLED',
  'WORKSPACE_CHANGED',
  'POLICY_CHANGED',
  'COORDINATOR_NEEDS_INPUT',
  'AUTHORITY_REVIEW_REQUIRED',
  'RUN_LIMIT',
  'CONTEXT_LIMIT',
]);
/** The draft a finished child left for the merge. */
const draftOf = (child: Session) =>
  child.proposals.at(-1)?.text || child.draft || child.messages.filter(m => m.role === 'assistant').at(-1)?.text || '';
export type CoordinatorStep = { label: string };
export type CoordinatorEvent =
  | { sessionId: string; type: 'plan'; plan: CoordinatorStep[] }
  | { sessionId: string; type: 'step'; index: number; state: 'running' | 'done' };
type Coordination = NonNullable<Session['coordination']>;
export class Coordinator {
  private active = new Map<string, { controller: AbortController; children: Set<string>; done: Promise<void> }>();
  constructor(
    private store: Store,
    private service: WorkService,
    private policy: () => Policy,
    private identity: (id: string) => string,
    /** Asks the employee to approve the plan; `finished` lists subtasks a resumed run does not repeat. */
    private approve: (id: string, tasks: Subtask[], signal: AbortSignal, finished: string[]) => Promise<boolean>,
    private route: (query: string, team: string) => Promise<any>,
    private activity: (id: string, text: string) => void,
    private events: (event: CoordinatorEvent) => void = () => {},
  ) {}
  has(id: string) {
    return this.active.has(id);
  }
  /** A coordinated draft that failed or was stopped before its merged draft, and can continue from its open subtasks. */
  resumable(id: string) {
    const saved = this.store.session(id).coordination;
    return Boolean(saved && saved.state !== 'done');
  }
  cancel(id: string) {
    const run = this.active.get(id);
    run?.controller.abort();
    run?.children.forEach(child => this.service.cancel(child));
    this.service.cancel(id);
  }
  cancelAll() {
    for (const id of this.active.keys()) this.cancel(id);
  }
  async closeAndWait() {
    const pending = [...this.active.values()].map(r => r.done);
    this.cancelAll();
    await Promise.allSettled(pending);
  }
  /** Subtask tasks of a parent, which are hidden from the task list and go when the parent is deleted. */
  children(id: string) {
    return this.store.list<Session>('session').filter(s => s.subtask && s.parentId === id);
  }
  private record(id: string, change: (saved: Coordination) => void) {
    const session = this.store.session(id);
    if (!session.coordination) return;
    change(session.coordination);
    this.store.save(session);
  }
  /**
   * Plans, asks the employee to approve the plan, runs the draft-only workers and merges their drafts into one draft
   * for review. With `resume`, a run that failed or was stopped continues from the saved plan: finished subtasks keep
   * their drafts and only the open ones run again, after the employee approves the plan again.
   */
  async run(
    id: string,
    query: string,
    source: string,
    accepted?: { text: string; files: string[]; onAccepted: () => void },
    resume?: { onAccepted: () => void },
  ) {
    if (!this.policy().features.coordinator) throw new Error('COORDINATOR_DISABLED');
    if (this.active.size || this.service.isActive(id)) throw new Error('RUN_ALREADY_ACTIVE');
    const parent = this.store.session(id);
    const saved = resume ? parent.coordination : undefined;
    if (resume && (!saved || saved.state === 'done')) throw new Error('COORDINATOR_DISABLED');
    if (saved) {
      query = saved.query;
      source = saved.source;
    }
    // Every worker and the merge carry the request and its sources: a request that cannot fit fails before any AI call.
    if (source.length + query.length > COORDINATOR_CONTEXT_LIMIT) throw new Error('CONTEXT_LIMIT');
    const controller = new AbortController(),
      children = new Set<string>(),
      identity = this.identity(id),
      policy = this.policy();
    let finished!: () => void;
    const done = new Promise<void>(resolve => {
      finished = resolve;
    });
    this.active.set(id, { controller, children, done });
    const check = () => {
      if (controller.signal.aborted) throw new Error('CANCELLED');
      if (identity !== this.identity(id)) throw new Error('WORKSPACE_CHANGED');
      if (policy !== this.policy() || !this.policy().features.coordinator) throw new Error('POLICY_CHANGED');
    };
    const watcher = setInterval(() => {
      try {
        check();
      } catch {
        controller.abort();
        children.forEach(child => this.service.cancel(child));
        this.service.cancel(id);
      }
    }, 250);
    /** `rule` marks a worker: the host's instruction for its part, kept out of the text its documents are searched by. */
    const execute = async (text: string, data: string, skill?: string, rule?: string) => {
      check();
      const owner = this.store.session(id);
      const child = this.store.create(owner.connectionId, owner.team, owner.project);
      child.parentId = id;
      child.subtask = true;
      child.model = owner.model;
      child.effort = owner.effort;
      this.store.save(child);
      children.add(child.id);
      const started = Date.now();
      while (this.service.activeCount() >= MAX_PARALLEL_RUNS) {
        check();
        if (Date.now() - started > 600_000) throw new Error('RUN_LIMIT');
        await new Promise(r => setTimeout(r, 25));
      }
      // Authority is decided on the employee's own request (checked above), as for a plain draft of it. Workers read
      // the organization's documents for their part as the plain draft does, so a part cites STeP sources, not memory.
      await this.service.run(child.id, text, data, true, skill, 'draft', undefined, [], {
        draftOnly: true,
        allowKnowledge: Boolean(rule),
        part: { request: query, rule },
      });
      check();
      const completed = this.store.session(child.id);
      if (completed.status !== 'review')
        throw new Error(completed.status === 'waiting' ? 'COORDINATOR_NEEDS_INPUT' : 'COORDINATOR_CHILD_FAILED');
      return { child: child.id, text: draftOf(completed) };
    };
    const plan = async () => {
      this.activity(id, tm('กำลังวางแผนงานย่อย'));
      // A plan the model wrote badly gets one more attempt before the run fails.
      for (let attempt = 0; ; attempt++) {
        let planner = '';
        try {
          const result = await execute((attempt ? PLAN_RETRY + '\n' : '') + PLAN_PROMPT + '\n' + section('request', query), source);
          planner = result.child;
          return parsePlan(result.text);
        } catch (error) {
          if (attempt || FINAL.has((error as Error).message)) throw error;
        } finally {
          // The planner's reply is only the plan: it is not kept as a task of its own.
          if (planner) {
            children.delete(planner);
            this.store.remove('session', planner);
          }
        }
      }
    };
    try {
      if (accepted) {
        const session = this.store.session(id);
        session.messages.push({
          role: 'user',
          text: accepted.text,
          at: new Date().toISOString(),
          ...(accepted.files.length ? { files: accepted.files.map(name => ({ name })) } : {}),
        });
        // A new request starts a new plan; drafts of an earlier plan are not reused.
        for (const old of this.children(id)) this.store.remove('session', old.id);
        session.mode = 'draft';
        session.status = 'running';
        session.coordination = { query, source, tasks: [], done: {}, state: 'planning', at: session.messages.at(-1)!.at };
        this.store.save(session);
        accepted.onAccepted();
      } else if (resume) {
        const session = this.store.session(id);
        session.status = 'running';
        this.store.save(session);
        resume.onAccepted();
      }
      // The merge answers the request as it was stored (masked where the privacy check masked it), not a second copy.
      const at = this.store.session(id).coordination?.at;
      const request = this.store.session(id).messages.findLast(m => m.role === 'user' && m.at === at);
      let tasks: Subtask[] = saved?.tasks || [];
      if (!tasks.length) {
        const routed = await this.route(query, parent.team),
          contract = routed.routingContract;
        if (contract?.authority?.status !== 'ALLOW' || ['BLOCK', 'ESCALATE', 'UNAVAILABLE'].includes(contract?.mode))
          throw new Error('AUTHORITY_REVIEW_REQUIRED');
        // A request the router would ask about first goes back to the employee, as a plain draft would.
        if (contract?.mode === 'CLARIFY') throw new Error('COORDINATOR_NEEDS_INPUT');
        if (contract.mode === 'PLAYBOOK' && routed.selectedPlaybook?.steps?.length) tasks = playbookTasks(routed.selectedPlaybook.steps);
        else {
          tasks = await plan();
          // A part's own wording only suggests its Skill. Its authority is the request's: the planner's phrasing of
          // "the proposal for consideration" must not turn a draft the plain path accepts into a refusal.
          for (const task of tasks) {
            const subRoute = await this.route(task.query, parent.team);
            const subContract = subRoute?.routingContract;
            if (
              subContract?.authority?.status === 'ALLOW' &&
              subContract?.mode === 'SKILL' &&
              !task.skill &&
              typeof subContract?.skill === 'string'
            ) {
              task.skill = subContract.skill;
            }
          }
        }
      }
      check();
      // Finished drafts of a resumed run are reused only while their task still holds the reviewed draft.
      const results = new Map<string, string>();
      const kept: Record<string, string> = {};
      for (const [taskId, childId] of Object.entries(saved?.done || {})) {
        const child = this.store.list<Session>('session').find(s => s.id === childId);
        const text = child?.status === 'review' ? draftOf(child) : '';
        if (text && tasks.some(t => t.id === taskId)) {
          results.set(taskId, text);
          kept[taskId] = childId;
        }
      }
      for (const stale of this.children(id)) if (!Object.values(kept).includes(stale.id)) this.store.remove('session', stale.id);
      this.record(id, c => {
        c.tasks = tasks;
        c.done = kept;
      });
      if (!(await this.approve(id, tasks, controller.signal, [...results.keys()]))) throw new Error('CANCELLED');
      check();
      this.record(id, c => (c.state = 'running'));
      const waves = dependencyWaves(tasks),
        number = (taskId: string) => tasks.findIndex(t => t.id === taskId) + 1;
      // The plan the employee approved stays on screen while it runs, one line per subtask and one for the merge.
      this.events({
        sessionId: id,
        type: 'plan',
        plan: [...tasks.map(t => ({ label: t.query.slice(0, 300) })), { label: tm('รวมผลเป็นร่างรอตรวจ') }],
      });
      for (const taskId of results.keys()) this.events({ sessionId: id, type: 'step', index: number(taskId) - 1, state: 'done' });
      // Each worker drafts only its part, sized so that all parts and the sources still fit the merge.
      const share = Math.max(4000, Math.floor((COORDINATOR_CONTEXT_LIMIT - source.length - query.length) / tasks.length) - 1000);
      for (const wave of waves) {
        const open = wave.filter(t => !results.has(t.id));
        for (let i = 0; i < open.length; i += MAX_PARALLEL_RUNS) {
          const batch = open.slice(i, i + MAX_PARALLEL_RUNS);
          this.activity(id, tm('กำลังทำงานย่อย {0} จาก {1}', batch.map(t => number(t.id)).join(', '), tasks.length));
          const outcomes = await Promise.allSettled(
            batch.map(async task => {
              const index = number(task.id) - 1;
              const data =
                source +
                '\n' +
                section(
                  'tool_results',
                  task.dependsOn.map(d => `${number(d)}. ${tasks[number(d) - 1].query}\n${results.get(d)}`).join('\n\n'),
                );
              if (data.length > COORDINATOR_CONTEXT_LIMIT) throw new Error('CONTEXT_LIMIT');
              this.events({ sessionId: id, type: 'step', index, state: 'running' });
              const result = await execute(
                task.query,
                data + '\n' + section('parent_request', query),
                task.skill,
                `This is subtask ${index + 1} of ${tasks.length} of the parent request. Draft only this part, completely, in the language of the parent request; the host merges the parts afterwards. Reply with the part's text only: no greeting, introduction, closing offer or export tip. Keep it under about ${share} characters.`,
              );
              results.set(task.id, result.text);
              this.record(id, c => (c.done[task.id] = result.child));
              this.events({ sessionId: id, type: 'step', index, state: 'done' });
            }),
          );
          const failed = outcomes.find(r => r.status === 'rejected');
          if (failed?.status === 'rejected') throw failed.reason;
        }
      }
      check();
      // The parts go to the merge in plan order, each under its subtask, so nothing is dropped or reordered silently.
      const parts = section('tool_results', tasks.map((t, i) => `## ${i + 1}. ${t.query}\n${results.get(t.id) || ''}`).join('\n\n'));
      // Workers already used the sources. When the sources and every part together are too long, the merge works
      // from the parts alone rather than failing after all the subtasks were done.
      let combined = source + '\n' + parts;
      if (combined.length > COORDINATOR_CONTEXT_LIMIT) combined = parts;
      if (combined.length > COORDINATOR_CONTEXT_LIMIT) throw new Error('CONTEXT_LIMIT');
      this.record(id, c => (c.state = 'merging'));
      this.activity(id, tm('กำลังรวมผลเป็นร่างรอตรวจ'));
      this.events({ sessionId: id, type: 'step', index: tasks.length, state: 'running' });
      await this.service.run(id, request?.text || query, combined, true, undefined, 'draft', undefined, ['Subtask drafts'], {
        draftOnly: true,
        mergeOnly: true,
        planOffset: tasks.length,
        ...(request ? { acceptedMessageAt: request.at } : {}),
      });
      check();
      // A merge that did not end in a draft has already reported its reason; the finished subtasks stay for a retry.
      this.record(id, c => (c.state = this.store.session(id).status === 'review' ? 'done' : 'failed'));
    } catch (error) {
      controller.abort();
      children.forEach(child => this.service.cancel(child));
      const session = this.store.session(id);
      if (session.coordination) session.coordination.state = 'failed';
      session.status = (error as Error).message === 'CANCELLED' ? 'cancelled' : 'error';
      session.messages.push({
        role: 'status',
        text: /^[A-Z_]+$/.test((error as Error).message) ? (error as Error).message : 'COORDINATOR_FAILED',
        at: new Date().toISOString(),
      });
      this.store.save(session);
      throw error;
    } finally {
      clearInterval(watcher);
      this.active.delete(id);
      finished();
    }
  }
}
