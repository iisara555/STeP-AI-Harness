import type { Store } from './store';

export type ConsentEvent = 'prompt' | 'confirmed' | 'cancelled';
export type ConsentCount = { prompts: number; confirmed: number; cancelled: number };
export type ConsentMetric = ConsentCount & { sessionId: string; byTool: Record<string, ConsentCount>; updatedAt: string };

const empty = (): ConsentCount => ({ prompts: 0, confirmed: 0, cancelled: 0 });
const field = { prompt: 'prompts', confirmed: 'confirmed', cancelled: 'cancelled' } as const;

/**
 * Counts consent dialogs per task on this computer only, so a pilot can show how often people were asked and how
 * often they said no. It stores tool names and counts, never what was asked about.
 */
export class ConsentMetrics {
  constructor(private store: Store) {}
  record(sessionId: string | undefined, tool: string, event: ConsentEvent) {
    const id = sessionId || 'none';
    const metric = this.store.get<ConsentMetric>('consent-metric', id) ?? { sessionId: id, ...empty(), byTool: {}, updatedAt: '' };
    const byTool = (metric.byTool[tool] ??= empty());
    metric[field[event]]++;
    byTool[field[event]]++;
    metric.updatedAt = new Date().toISOString();
    this.store.put('consent-metric', id, metric);
  }
  /** `taskCount` is every task on this computer, so tasks that were never asked count toward the average. */
  summary(taskCount: number) {
    const tasks = this.store.list<ConsentMetric>('consent-metric');
    const total = tasks.reduce(
      (sum, m) => ({
        prompts: sum.prompts + m.prompts,
        confirmed: sum.confirmed + m.confirmed,
        cancelled: sum.cancelled + m.cancelled,
      }),
      empty(),
    );
    const asked = tasks.filter(m => m.sessionId !== 'none');
    const tasksAsked = asked.length;
    const perTask = taskCount > 0 ? Math.round((asked.reduce((n, m) => n + m.prompts, 0) / taskCount) * 10) / 10 : 0;
    return { ...total, tasks: taskCount, tasksAsked, perTask };
  }
  clear() {
    for (const m of this.store.list<ConsentMetric>('consent-metric')) this.store.remove('consent-metric', m.sessionId);
  }
}
