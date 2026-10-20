import { randomUUID } from 'node:crypto';
import type { VaultPrompt } from '../src/vault-prompt';

/** Dedicated trusted UI, deliberately separate from ask_user and conversation persistence. */
export class VaultPrompts {
  private pending = new Map<string, { finish: (value?: Record<string, string>) => void; kind: VaultPrompt['kind'] }>();
  constructor(private emit: (prompt: VaultPrompt, closed?: boolean) => void) {}
  ask(input: Omit<VaultPrompt, 'id'>, signal?: AbortSignal): Promise<Record<string, string> | undefined> {
    if (signal?.aborted) return Promise.resolve(undefined);
    const prompt = { ...input, id: randomUUID() };
    return new Promise(resolve => {
      const finish = (value?: Record<string, string>) => {
        if (!this.pending.delete(prompt.id)) return;
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        this.emit(prompt, true);
        resolve(value);
      };
      const cancel = () => finish();
      const timer = setTimeout(cancel, 180000);
      this.pending.set(prompt.id, { finish, kind: input.kind });
      signal?.addEventListener('abort', cancel, { once: true });
      this.emit(prompt);
    });
  }
  respond(id: string, value?: Record<string, string>) {
    const pending = this.pending.get(id);
    if (!pending) throw new Error('VAULT_PROMPT_EXPIRED');
    const allowed = pending.kind === 'login' ? ['username', 'password'] : pending.kind === 'unlock' ? ['password'] : ['code'];
    if (
      value &&
      (Object.keys(value).some(key => !allowed.includes(key)) ||
        Object.values(value).some(v => typeof v !== 'string' || v.length > 4000 || /[\x00-\x1f]/.test(v)))
    )
      throw new Error('INVALID_INPUT');
    if (pending.kind === 'code' && value?.code) value = { code: value.code.trim().replace(/[ -]/g, '') };
    pending.finish(value);
  }
  cancelAll() {
    for (const pending of [...this.pending.values()]) pending.finish();
  }
}
