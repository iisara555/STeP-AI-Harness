import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export class Budget {
  constructor(path, data) {
    this.path = path;
    this.data = data;
    this.pendingWrites = Promise.resolve();
  }
  static async open(output, initialReservations = {}) {
    const path = join(output, 'budget.json');
    let data;
    try {
      data = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      data = {
        schema: 1,
        modelCalls: { ...initialReservations },
        initialReservations: { ...initialReservations },
        modelTokens: {},
        trials: {},
        note: 'Prior calls are explicitly supplied for this evaluation. Earlier token usage is not measured. Use one machine per account; move this entire results folder to resume elsewhere.',
      };
    }
    if (data.schema !== 1 || !data.modelCalls || !data.modelTokens || !data.trials) throw new Error('INVALID_BUDGET');
    for (const count of Object.values(data.modelCalls)) if (!Number.isSafeInteger(count) || count < 0) throw new Error('INVALID_BUDGET');
    if (
      Object.keys(initialReservations).length &&
      JSON.stringify(Object.entries(initialReservations).sort()) !== JSON.stringify(Object.entries(data.initialReservations || {}).sort())
    )
      throw new Error('PRIOR_CALLS_MUST_MATCH_EXISTING_LEDGER');
    const b = new Budget(path, data);
    await b.save();
    return b;
  }
  calls(model) {
    return this.data.modelCalls[model] || 0;
  }
  tokens(model) {
    return this.data.modelTokens[model] || 0;
  }
  hasTrial(key) {
    return Object.hasOwn(this.data.trials, key);
  }
  save() {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.pendingWrites = this.pendingWrites.then(async () => {
      const pending = this.path + '.pending';
      await writeFile(pending, snapshot, { mode: 0o600 });
      await rename(pending, this.path);
    });
    return this.pendingWrites;
  }
  async reserve(model, trial) {
    if (this.calls(model) >= 18 || this.tokens(model) >= 120000) throw new Error('EVAL_QUOTA_BOUND');
    this.data.modelCalls[model] = this.calls(model) + 1;
    this.data.inFlight = { model, trial, modelCalls: this.calls(model), reservedAt: new Date().toISOString() };
    await this.save();
  }
  async usage(model, delta) {
    if (!Number.isFinite(delta) || delta < 0) throw new Error('INVALID_USAGE');
    this.data.modelTokens[model] = this.tokens(model) + delta;
    await this.save();
  }
  async finish(trial, result) {
    this.data.trials[trial] = result;
    delete this.data.inFlight;
    await this.save();
  }
}
