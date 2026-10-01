import { randomUUID, createHash } from 'node:crypto';
import type { ApprovalRequest, ApprovalRule, ApprovalAnswer } from '../src/types';
import { Store } from './store';

export const approvalHash = (value: string) => createHash('sha256').update(value).digest('hex');
export class Approvals {
  private pending = new Map<
    string,
    { resolve: (answer: ApprovalAnswer) => void; request: ApprovalRequest; rule: ApprovalRule; timer: ReturnType<typeof setTimeout> }
  >();
  constructor(
    private store: Store,
    private emit: (request?: ApprovalRequest, closedId?: string) => void,
  ) {}
  rule(workspace: string, tool: string, target: string): ApprovalRule {
    const workspaceHash = approvalHash(workspace);
    const targetHash = approvalHash(target);
    return {
      id: approvalHash([workspaceHash, tool, targetHash].join('\0')),
      workspaceHash,
      tool,
      targetHash,
      at: new Date().toISOString(),
    };
  }
  remembered(rule: ApprovalRule) {
    return Boolean(this.store.get('approval', rule.id));
  }
  list() {
    return this.store.list<ApprovalRule>('approval');
  }
  remove(id: string) {
    this.store.remove('approval', id);
  }
  request(rule: ApprovalRule, detail: Omit<ApprovalRequest, 'id' | 'tool'>, signal?: AbortSignal) {
    return this.choose(rule, detail, signal).then(answer => answer !== 'cancel');
  }
  choose(rule: ApprovalRule, detail: Omit<ApprovalRequest, 'id' | 'tool'>, signal?: AbortSignal) {
    if (signal?.aborted) return Promise.resolve<ApprovalAnswer>('cancel');
    if (this.pending.size >= 20) throw new Error('APPROVAL_LIMIT');
    return new Promise<ApprovalAnswer>(resolve => {
      const request = { ...detail, tool: rule.tool, id: randomUUID() };
      const timer = setTimeout(() => this.respond(request.id, 'cancel'), 300_000);
      timer.unref();
      const stop = () => {
        if (this.pending.has(request.id)) this.respond(request.id, 'cancel');
      };
      signal?.addEventListener('abort', stop, { once: true });
      this.pending.set(request.id, {
        resolve: approved => {
          signal?.removeEventListener('abort', stop);
          resolve(approved);
        },
        request,
        rule,
        timer,
      });
      this.emit(request);
    });
  }
  respond(id: string, answer: ApprovalAnswer) {
    const pending = this.pending.get(id);
    if (!pending) throw new Error('APPROVAL_EXPIRED');
    if (
      !['cancel', 'once', 'workspace', 'run'].includes(answer) ||
      (answer === 'workspace' && !pending.request.allowRemember) ||
      (answer === 'run' && !pending.request.runScope)
    )
      throw new Error('INVALID_INPUT');
    clearTimeout(pending.timer);
    this.pending.delete(id);
    if (answer === 'workspace') this.store.put('approval', pending.rule.id, pending.rule);
    pending.resolve(answer);
    this.emit(undefined, id);
  }
  close() {
    for (const id of [...this.pending.keys()]) this.respond(id, 'cancel');
  }
}
