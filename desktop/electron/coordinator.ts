import { Store } from './store';
import { WorkService, MAX_PARALLEL_RUNS } from './service';
import type { Policy } from './policy';
import { section } from './prompt';

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
  const source = /```(?:json)?\s*\n([\s\S]*?)```/.exec(text)?.[1] || text;
  let raw: any;
  try {
    raw = JSON.parse(source);
  } catch {
    throw new Error('COORDINATOR_PLAN_INVALID');
  }
  if (!Array.isArray(raw.tasks)) throw new Error('COORDINATOR_PLAN_INVALID');
  const tasks = raw.tasks.map((t: any) => {
    if (
      typeof t.id !== 'string' ||
      typeof t.query !== 'string' ||
      !Array.isArray(t.dependsOn) ||
      t.dependsOn.some((d: unknown) => typeof d !== 'string')
    )
      throw new Error('COORDINATOR_PLAN_INVALID');
    return { id: t.id, query: t.query, dependsOn: t.dependsOn };
  });
  dependencyWaves(tasks);
  return tasks;
}
export class Coordinator {
  private active = new Map<string, { controller: AbortController; children: Set<string>; done: Promise<void> }>();
  constructor(
    private store: Store,
    private service: WorkService,
    private policy: () => Policy,
    private identity: (id: string) => string,
    private approve: (id: string, tasks: Subtask[], signal: AbortSignal) => Promise<boolean>,
    private route: (query: string, team: string) => Promise<any>,
    private activity: (id: string, text: string) => void,
  ) {}
  has(id: string) {
    return this.active.has(id);
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
  async run(id: string, query: string, source: string) {
    if (!this.policy().features.coordinator) throw new Error('COORDINATOR_DISABLED');
    if (this.active.size || this.service.isActive(id)) throw new Error('RUN_ALREADY_ACTIVE');
    const parent = this.store.session(id);
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
    const execute = async (text: string, data: string, skill?: string) => {
      check();
      const child = this.store.create(parent.connectionId, parent.team, parent.project);
      child.parentId = id;
      child.model = parent.model;
      child.effort = parent.effort;
      this.store.save(child);
      children.add(child.id);
      const started = Date.now();
      while (this.service.activeCount() >= MAX_PARALLEL_RUNS) {
        check();
        if (Date.now() - started > 600_000) throw new Error('RUN_LIMIT');
        await new Promise(r => setTimeout(r, 25));
      }
      await this.service.run(child.id, text, data, true, skill, 'draft', undefined, [], { draftOnly: true });
      check();
      const completed = this.store.session(child.id);
      if (completed.status !== 'review')
        throw new Error(completed.status === 'waiting' ? 'COORDINATOR_NEEDS_INPUT' : 'COORDINATOR_CHILD_FAILED');
      return (
        completed.proposals.at(-1)?.text || completed.draft || completed.messages.filter(m => m.role === 'assistant').at(-1)?.text || ''
      );
    };
    try {
      const routed = await this.route(query, parent.team),
        contract = routed.routingContract;
      if (contract?.authority?.status !== 'ALLOW' || ['BLOCK', 'ESCALATE', 'CLARIFY', 'UNAVAILABLE'].includes(contract?.mode))
        throw new Error('AUTHORITY_REVIEW_REQUIRED');
      let tasks: Subtask[];
      if (contract.mode === 'PLAYBOOK' && routed.selectedPlaybook?.steps?.length) tasks = playbookTasks(routed.selectedPlaybook.steps);
      else {
        this.activity(id, 'กำลังวางแผนงานย่อย');
        tasks = parsePlan(
          await execute(
            'Decompose the request below into 2–8 draft-only subtasks. Return only JSON {"tasks":[{"id":"a","query":"...","dependsOn":[]}]}. Declare all dependencies. Do not grant authority or propose external actions.\n' +
              section('request', query),
            source,
          ),
        );
      }
      check();
      if (!(await this.approve(id, tasks, controller.signal))) throw new Error('CANCELLED');
      check();
      const waves = dependencyWaves(tasks),
        results = new Map<string, string>();
      for (const wave of waves) {
        for (let i = 0; i < wave.length; i += MAX_PARALLEL_RUNS) {
          const batch = wave.slice(i, i + MAX_PARALLEL_RUNS);
          this.activity(id, `กำลังทำงานย่อย ${batch.map(t => t.id).join(', ')}`);
          const outcomes = await Promise.allSettled(
            batch.map(async task => {
              const data = source + '\n' + section('tool_results', task.dependsOn.map(d => `${d}: ${results.get(d)}`).join('\n'));
              if (data.length > 100_000) throw new Error('CONTEXT_LIMIT');
              results.set(task.id, await execute(task.query, data + '\n' + section('parent_request', query), task.skill));
            }),
          );
          const failed = outcomes.find(r => r.status === 'rejected');
          if (failed?.status === 'rejected') throw failed.reason;
        }
      }
      check();
      const combined = source + '\n' + section('tool_results', JSON.stringify([...results]));
      if (combined.length > 100_000) throw new Error('CONTEXT_LIMIT');
      this.activity(id, 'กำลังรวมผลเป็นร่างรอตรวจ');
      await this.service.run(id, query, combined, true, undefined, 'draft', undefined, ['Subtask drafts'], {
        draftOnly: true,
        mergeOnly: true,
      });
      check();
    } catch (error) {
      controller.abort();
      children.forEach(child => this.service.cancel(child));
      const session = this.store.session(id);
      session.status = (error as Error).message === 'CANCELLED' ? 'interrupted' : 'error';
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
