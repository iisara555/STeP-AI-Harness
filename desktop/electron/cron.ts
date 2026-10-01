import { randomUUID, createHash } from 'node:crypto';
import type { Connection } from '../src/types';
import { Store } from './store';
import type { Policy } from './policy';

export type Automation = {
  id: string;
  name: string;
  query: string;
  schedule: string;
  enabled: boolean;
  connectionId: string;
  connectionBinding: string;
  model: string;
  team: string;
  workspace: string;
  at: string;
  nextAt: number;
  running?: string;
};
export const connectionBinding = (c: Connection) =>
  createHash('sha256')
    .update(JSON.stringify([c.provider, c.mode, c.executable, c.customRuntime, c.googleCloudProject, c.baseUrl, c.protocol]))
    .digest('hex');
export type AutomationRun = {
  id: string;
  automationId: string;
  sessionId?: string;
  status: 'queued' | 'running' | 'review' | 'error' | 'cancelled' | 'interrupted';
  at: string;
  code?: string;
};
function field(raw: string, min: number, max: number) {
  const values = new Set<number>();
  for (const part of raw.split(',')) {
    const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!match) throw new Error('CRON_INVALID');
    const step = Number(match[2] || 1),
      range = match[1] === '*' ? [min, max] : match[1].split('-').map(Number);
    const start = range[0],
      end = range[1] ?? (match[2] ? max : start);
    if (start < min || end > max || start > end || step < 1 || step > max + 1) throw new Error('CRON_INVALID');
    for (let n = start; n <= end; n += step) values.add(n);
  }
  return values;
}
export function nextCron(schedule: string, now: number) {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5 || schedule.length > 120) throw new Error('CRON_INVALID');
  const ranges = [
      [0, 59],
      [0, 23],
      [1, 31],
      [1, 12],
      [0, 6],
    ],
    sets = parts.map((p, i) => field(p, ...(ranges[i] as [number, number])));
  for (let at = Math.floor(now / 60_000) * 60_000 + 60_000, end = at + 370 * 86400_000; at < end; at += 60_000) {
    const d = new Date(at),
      dom = sets[2].has(d.getUTCDate()),
      dow = sets[4].has(d.getUTCDay());
    const day = sets[2].size === 31 ? dow : sets[4].size === 7 ? dom : dom || dow;
    if (sets[0].has(d.getUTCMinutes()) && sets[1].has(d.getUTCHours()) && sets[3].has(d.getUTCMonth() + 1) && day) return at;
  }
  throw new Error('CRON_INVALID');
}
export class Automations {
  private queue: string[] = [];
  private draining = false;
  private stopped = false;
  private controllers = new Map<string, AbortController>();
  private timer?: NodeJS.Timeout;
  private drainTask?: Promise<void>;
  constructor(
    private store: Store,
    private policy: () => Policy,
    private privacy: (text: string) => any,
    private execute: (job: Automation, signal: AbortSignal, created: (id: string) => void) => Promise<string>,
    private notify: (run: AutomationRun) => void,
    private now: () => number = Date.now,
  ) {
    for (const run of store.list<AutomationRun>('automation-run'))
      if (['queued', 'running'].includes(run.status)) {
        run.status = 'interrupted';
        store.put('automation-run', run.id, run);
      }
    for (const job of store.list<Automation>('automation')) {
      delete job.running;
      if (job.nextAt <= now()) job.nextAt = nextCron(job.schedule, now());
      store.put('automation', job.id, job);
    }
  }
  list() {
    return this.store.list<Automation>('automation');
  }
  history(id?: string) {
    return this.store
      .list<AutomationRun>('automation-run')
      .filter(r => !id || r.automationId === id)
      .sort((a, b) => b.at.localeCompare(a.at));
  }
  preview(raw: any) {
    if (!this.policy().features.cron) throw new Error('CRON_DISABLED');
    if (
      typeof raw.name !== 'string' ||
      !raw.name.trim() ||
      raw.name.length > 120 ||
      typeof raw.query !== 'string' ||
      !raw.query.trim() ||
      raw.query.length > 4000 ||
      typeof raw.schedule !== 'string'
    )
      throw new Error('INVALID_INPUT');
    const review = this.privacy(raw.name + '\n' + raw.query);
    if (review.action !== 'pass' || review.containsPersonalData || review.redactedText !== raw.name + '\n' + raw.query)
      throw new Error('PRIVACY_REVIEW_REQUIRED');
    const settings = this.store.settings(),
      connection = this.store.connections().find(c => c.id === raw.connectionId && c.ready);
    if (!connection) throw new Error('CONNECTION_NOT_READY');
    const existing = raw.id ? this.store.get<Automation>('automation', raw.id) : undefined;
    if (raw.id && !existing) throw new Error('AUTOMATION_NOT_FOUND');
    if (existing?.running) throw new Error('RUN_ALREADY_ACTIVE');
    if (!existing && this.list().length >= 50) throw new Error('AUTOMATION_LIMIT');
    const job: Automation = {
      id: existing?.id || randomUUID(),
      name: raw.name.trim(),
      query: raw.query.trim(),
      schedule: raw.schedule.trim(),
      enabled: raw.enabled === true,
      connectionId: connection.id,
      connectionBinding: connectionBinding(connection),
      model: connection.model,
      team: settings.team,
      workspace: settings.workspace,
      at: new Date(this.now()).toISOString(),
      nextAt: nextCron(raw.schedule, this.now()),
    };
    return job;
  }
  save(raw: any) {
    const job = this.preview(raw);
    this.store.put('automation', job.id, job);
    return job;
  }
  remove(id: string) {
    this.cancel(id);
    this.store.remove('automation', id);
  }
  cancel(id: string) {
    for (const run of this.history(id)) {
      if (run.status === 'queued') {
        run.status = 'cancelled';
        this.store.put('automation-run', run.id, run);
      }
      this.controllers.get(run.id)?.abort();
    }
    this.queue = this.queue.filter(r => this.store.get<AutomationRun>('automation-run', r)?.status === 'queued');
  }
  enqueue(id: string) {
    if (this.stopped || !this.policy().features.cron) throw new Error('CRON_DISABLED');
    const job = this.store.get<Automation>('automation', id);
    if (!job) throw new Error('AUTOMATION_NOT_FOUND');
    if (job.running || this.history(id).some(r => r.status === 'queued')) throw new Error('RUN_ALREADY_ACTIVE');
    if (this.queue.length >= 50) throw new Error('AUTOMATION_LIMIT');
    const run: AutomationRun = { id: randomUUID(), automationId: id, status: 'queued', at: new Date(this.now()).toISOString() };
    this.store.put('automation-run', run.id, run);
    this.queue.push(run.id);
    const history = this.history(),
      excess = history.length - 200;
    if (excess > 0)
      for (const old of history.filter(r => !['queued', 'running'].includes(r.status)).slice(-excess))
        this.store.remove('automation-run', old.id);
    this.drainTask = this.drain();
    return run;
  }
  tick() {
    if (this.stopped || !this.policy().features.cron) return;
    for (const job of this.list())
      if (job.enabled && job.nextAt <= this.now()) {
        job.nextAt = nextCron(job.schedule, this.now());
        this.store.put('automation', job.id, job);
        if (!job.running && !this.history(job.id).some(r => r.status === 'queued')) this.enqueue(job.id);
      }
  }
  start() {
    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), 15_000);
      this.timer.unref();
    }
  }
  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    for (const controller of this.controllers.values()) controller.abort();
    for (const id of this.queue) {
      const run = this.store.get<AutomationRun>('automation-run', id);
      if (run) {
        run.status = 'interrupted';
        this.store.put('automation-run', id, run);
      }
    }
    this.queue.length = 0;
  }
  async closeAndWait() {
    this.stop();
    while (this.draining) await new Promise(r => setTimeout(r, 10));
    await this.drainTask;
  }
  private async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length && !this.stopped) {
        const id = this.queue.shift()!,
          run = this.store.get<AutomationRun>('automation-run', id),
          job = run && this.store.get<Automation>('automation', run.automationId);
        if (!run || !job || run.status !== 'queued') continue;
        const controller = new AbortController();
        this.controllers.set(id, controller);
        try {
          const settings = this.store.settings(),
            connection = this.store.connections().find(c => c.id === job.connectionId);
          if (!this.policy().features.cron) throw new Error('CRON_DISABLED');
          if (
            settings.workspace !== job.workspace ||
            settings.team !== job.team ||
            connection?.model !== job.model ||
            !connection.ready ||
            connectionBinding(connection) !== job.connectionBinding
          )
            throw new Error('AUTOMATION_CONTEXT_CHANGED');
          run.status = 'running';
          job.running = id;
          this.store.put('automation', job.id, job);
          this.store.put('automation-run', id, run);
          run.sessionId = await this.execute(job, controller.signal, sessionId => {
            run.sessionId = sessionId;
            this.store.put('automation-run', id, run);
          });
          run.status = controller.signal.aborted ? 'cancelled' : 'review';
        } catch (e: any) {
          run.status = controller.signal.aborted ? 'cancelled' : 'error';
          run.code = /^[A-Z_]+$/.test(e.message) ? e.message : 'AUTOMATION_FAILED';
        } finally {
          this.controllers.delete(id);
          delete job.running;
          if (this.store.get('automation', job.id)) this.store.put('automation', job.id, job);
          this.store.put('automation-run', id, run);
          this.notify(run);
        }
      }
    } finally {
      this.draining = false;
    }
  }
}
