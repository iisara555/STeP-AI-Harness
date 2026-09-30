import { randomUUID } from 'node:crypto';
import type { RunEvent, ToolQuestion } from '../src/types';

export class Questions {
  private pending = new Map<string, { finish: (answer: string | null) => void; options: string[] }>();
  constructor(private emit: (event: RunEvent) => void) {}
  ask(sessionId: string, question: string, options: string[], signal: AbortSignal) {
    if (signal.aborted) throw new Error('CANCELLED');
    if (this.pending.size >= 8) throw new Error('TASK_LIMIT');
    const request: ToolQuestion = { id: randomUUID(), sessionId, question, options };
    return new Promise<string | null>(resolve => {
      const stop = () => finish(null);
      const timer = setTimeout(stop, 300_000);
      timer.unref();
      const finish = (answer: string | null) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', stop);
        this.pending.delete(request.id);
        this.emit({ sessionId, type: 'question-close', questionId: request.id });
        resolve(answer);
      };
      this.pending.set(request.id, { finish, options });
      signal.addEventListener('abort', stop, { once: true });
      this.emit({ sessionId, type: 'question', question: request });
    });
  }
  respond(id: string, answer: unknown) {
    const p = this.pending.get(id);
    if (!p) throw new Error('APPROVAL_EXPIRED');
    if (answer !== null && (typeof answer !== 'string' || !answer.trim() || answer.length > 2000)) throw new Error('INVALID_INPUT');
    p.finish(answer as string | null);
  }
  close() {
    for (const p of [...this.pending.values()]) p.finish(null);
  }
}
