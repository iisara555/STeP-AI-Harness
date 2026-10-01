import {
  mkdirSync,
  lstatSync,
  existsSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  unlinkSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/** Reservations persist across processes and crashes; uncertain usage remains reserved. */
export class RunnerLedger {
  constructor(root) {
    this.root = join(root, "usage");
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    const s = lstatSync(this.root);
    if (!s.isDirectory() || s.isSymbolicLink())
      throw new Error("USAGE_STORAGE_INVALID");
  }
  change(callback) {
    const lock = join(this.root, "ledger.lock");
    let fd;
    try {
      fd = openSync(lock, "wx", 0o600);
    } catch {
      throw new Error("USAGE_LEDGER_BUSY");
    }
    try {
      const path = join(this.root, "ledger.json");
      let data = { records: [] };
      if (existsSync(path)) {
        const s = lstatSync(path);
        if (!s.isFile() || s.isSymbolicLink() || s.size > 2_000_000)
          throw new Error("USAGE_LEDGER_INVALID");
        data = JSON.parse(readFileSync(path, "utf8"));
      }
      if (
        !Array.isArray(data.records) ||
        data.records.some(
          (r) =>
            typeof r.id !== "string" ||
            typeof r.day !== "string" ||
            ![r.tokens, r.usd].every((n) => Number.isFinite(n) && n >= 0),
        )
      )
        throw new Error("USAGE_LEDGER_INVALID");
      const result = callback(data);
      const temp = path + "." + randomUUID() + ".tmp";
      writeFileSync(temp, JSON.stringify(data), { flag: "wx", mode: 0o600 });
      renameSync(temp, path);
      return result;
    } finally {
      closeSync(fd);
      unlinkSync(lock);
    }
  }
  reserve(estimate, policy) {
    const budgets = policy.budgets || {},
      day = new Date().toISOString().slice(0, 10),
      month = day.slice(0, 7),
      tokens = estimate.inputTokens + estimate.outputTokens;
    if (budgets.monthlyCostUsd !== undefined && estimate.usd === null)
      throw new Error("PRICE_UNAVAILABLE");
    return this.change((data) => {
      data.records = data.records.filter((r) => r.day.slice(0, 7) === month);
      const daily = data.records
          .filter((r) => r.day === day)
          .reduce((s, r) => s + r.tokens, 0),
        cost = data.records.reduce((s, r) => s + r.usd, 0);
      if (
        (budgets.dailyTokens !== undefined &&
          daily + tokens > budgets.dailyTokens) ||
        (budgets.monthlyCostUsd !== undefined &&
          cost + (estimate.usd || 0) > budgets.monthlyCostUsd)
      )
        throw new Error("BUDGET_BLOCKED");
      const id = randomUUID();
      data.records.push({
        id,
        day,
        tokens,
        usd: estimate.usd || 0,
        reserved: true,
      });
      return id;
    });
  }
  settle(id, usage, policy, profile) {
    this.change((data) => {
      const record = data.records.find((r) => r.id === id);
      if (!record) return;
      // Missing provider usage never refunds the estimate.
      if (
        !usage?.total ||
        ![usage.input, usage.output, usage.total].every(
          (n) => Number.isSafeInteger(n) && n >= 0,
        )
      )
        return;
      const price =
        policy.prices?.[profile.model] || policy.prices?.["compatible:*"];
      record.tokens = usage.total;
      if (price)
        record.usd =
          (usage.input * price.input + usage.output * price.output) / 1_000_000;
      record.reserved = false;
    });
  }
}
