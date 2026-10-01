import { randomUUID } from 'node:crypto';
import type { ApprovalAnswer, TransmissionGrant } from '../src/types';

export const TRANSMISSION_LIMITS = { chars: 200_000, results: 24, ms: 600_000 };
export type TransmissionSource = { key: string; label: string };
/** In-memory consent for one tool loop, never a remembered execution permission. */
export class RunTransmission {
  private grants = new Map<string, TransmissionGrant>();
  private tail: Promise<unknown> = Promise.resolve();
  private closed = false;
  constructor(
    private sessionId: string,
    private destination: string,
    private check: () => Promise<void>,
    private notify: () => void,
    private now = () => Date.now(),
  ) {}
  list() {
    return [...this.grants.values()].filter(g => Date.parse(g.expiresAt) > this.now()).map(g => ({ ...g }));
  }
  has(id: string) {
    return [...this.grants.values()].some(g => g.id === id);
  }
  close() {
    this.closed = true;
    this.grants.clear();
    this.notify();
  }
  async authorize(chars: number, source: TransmissionSource | undefined, ask: (scope?: string) => Promise<ApprovalAnswer>) {
    // Read tools run in parallel. Queue the consent checks so one explicit scope covers that batch.
    const pending = this.tail.then(async () => {
      if (this.closed) throw new Error('CANCELLED');
      await this.check();
      const prior = source && this.grants.get(source.key);
      const usable = prior && Date.parse(prior.expiresAt) > this.now() && prior.remainingResults > 0 && prior.remainingChars >= chars;
      if (!usable) {
        if (source) this.grants.delete(source.key);
        const scope =
          source && chars <= TRANSMISSION_LIMITS.chars
            ? `${source.label}\nส่งให้ ${this.destination} เฉพาะรอบการทำงานนี้ ไม่เกิน 10 นาที, 24 ผลการอ่าน และ 200,000 ตัวอักษรรวม\nฉันตรวจสิทธิ์ต้นทางแล้ว และอนุญาตให้ส่งข้อความทั่วไปหรือภายในในขอบเขตนี้`
            : undefined;
        const answer = await ask(scope);
        if (this.closed) throw new Error('CANCELLED');
        await this.check();
        if (answer === 'cancel') throw new Error('TOOL_DATA_DECLINED');
        if (answer === 'run' && source && scope)
          this.grants.set(source.key, {
            id: randomUUID(),
            sessionId: this.sessionId,
            destination: this.destination,
            source: source.label,
            expiresAt: new Date(this.now() + TRANSMISSION_LIMITS.ms).toISOString(),
            remainingChars: TRANSMISSION_LIMITS.chars,
            remainingResults: TRANSMISSION_LIMITS.results,
          });
      }
      const grant = source && this.grants.get(source.key);
      if (grant) {
        grant.remainingChars -= chars;
        grant.remainingResults--;
      }
      await this.check();
      this.notify();
    });
    this.tail = pending.catch(() => {});
    await pending;
  }
}
