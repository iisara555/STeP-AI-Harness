import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

// An experiment gets its own immutable allowance. Missing usage keeps the
// entire reservation charged and halts admission; it is never treated as zero.
export class ParityBudget {
  static async open(folder, limit = 300000) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 300000) throw new Error('INVALID_BUDGET_LIMIT');
    const file = join(folder, 'budget.json');
    let data;
    try {
      data = JSON.parse(await readFile(file, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (data && (data.schema !== 1 || data.limit !== limit)) throw new Error('BUDGET_CONTEXT_CHANGED');
    if (
      data &&
      (!Array.isArray(data.calls) ||
        !Number.isSafeInteger(data.used) ||
        data.used < 0 ||
        typeof data.uncertain !== 'boolean' ||
        data.calls.some(
          c =>
            !Number.isSafeInteger(c.reserved) ||
            c.reserved < 1 ||
            !['running', 'completed', 'error'].includes(c.status) ||
            (c.status !== 'running' && (!Number.isSafeInteger(c.charged) || c.charged < 1)),
        ) ||
        data.calls.filter(c => c.status !== 'running').reduce((n, c) => n + c.charged, 0) !== data.used)
    )
      throw new Error('BUDGET_LEDGER_INVALID');
    const budget = new ParityBudget(file, data || { schema: 1, limit, used: 0, uncertain: false, calls: [] });
    if (budget.data.calls.some(c => c.status === 'running')) throw new Error('INTERRUPTED_CALL_REQUIRES_REVIEW');
    await budget.save();
    return budget;
  }
  constructor(file, data) {
    this.file = file;
    this.data = data;
    this.pending = Promise.resolve();
  }
  save() {
    this.pending = this.pending.then(async () => {
      await writeFile(this.file + '.pending', JSON.stringify(this.data, null, 2));
      await rename(this.file + '.pending', this.file);
    });
    return this.pending;
  }
  async reserve(trial, amount) {
    const held = this.data.calls.filter(c => c.status === 'running').reduce((n, c) => n + c.reserved, 0);
    if (this.blocked()) throw new Error('USAGE_UNKNOWN_STOP');
    if (!Number.isSafeInteger(amount) || amount < 1 || this.data.used + held + amount > this.data.limit)
      throw new Error('TOKEN_BUDGET_STOP');
    const call = { trial, reserved: amount, status: 'running', startedAt: new Date().toISOString() };
    this.data.calls.push(call);
    await this.save();
    return call;
  }
  blocked() {
    return this.data.uncertain && this.data.acknowledgedThrough !== this.data.calls.length;
  }
  async continueAccounted(reason) {
    if (typeof reason !== 'string' || !reason.trim()) throw new Error('ACCOUNTING_REASON_REQUIRED');
    // Deliberate continuation retains every unknown reservation at full cost.
    // It cannot restore tokens or acknowledge future failures.
    this.data.acknowledgedThrough = this.data.calls.length;
    (this.data.accountingNotes ||= []).push({ at: new Date().toISOString(), reason, used: this.data.used });
    await this.save();
  }
  async settle(call, usage, status) {
    if (call.status !== 'running') throw new Error('CALL_ALREADY_SETTLED');
    const known = Number.isSafeInteger(usage?.total) && usage.total > 0;
    call.status = status;
    call.usage = known ? usage : undefined;
    call.charged = known ? usage.total : call.reserved;
    call.usageKnown = known;
    this.data.used += call.charged;
    this.data.uncertain ||= !known || call.charged > call.reserved;
    if (known && call.charged <= call.reserved && this.data.acknowledgedThrough === this.data.calls.length - 1)
      this.data.acknowledgedThrough = this.data.calls.length;
    await this.save();
  }
}
