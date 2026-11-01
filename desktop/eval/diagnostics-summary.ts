/**
 * Summarises a STeP Desktop diagnostics log (logs/diagnostics.jsonl) into the numbers the backend optimisation plan
 * tracks: answer time (p50 / p90), AI calls per answer, tokens per answer and time per kind of call, per provider and
 * model. Reads only the codes, sizes and timings the log already holds; makes no provider calls.
 *
 *   npm run eval:diagnostics -- [path/to/diagnostics.jsonl] [--since 2026-11-01] [--until 2026-11-02] [--json]
 *
 * Without a path it reads the app's own log on this computer.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { posix, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Call = {
  at: string;
  run: string;
  provider: string;
  model: string;
  kind: string;
  outcome: string;
  ms: number;
  ttftMs?: number;
  input?: number;
  output?: number;
  total?: number;
  cachedInput?: number;
};
export type Run = {
  at: string;
  id?: string;
  provider: string;
  model: string;
  outcome: string;
  route: string;
  ms: number;
  selection?: string;
  calls: Call[];
};

const num = (value: unknown) => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};
const str = (value: unknown) => (typeof value === 'string' ? value : '');

/** Joins each run-trace line with the provider-call lines of the same run. Logs written before run-trace carried the
 * run id get the calls logged since the previous run-trace, which the app writes just before the trace. */
export function parseRuns(text: string): Run[] {
  const runs: Run[] = [];
  const calls = new Map<string, Call[]>();
  let sinceTrace: string[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    if (entry.event === 'provider-call') {
      const run = str(entry.run);
      if (!run) continue;
      const call: Call = {
        at: str(entry.at),
        run,
        provider: str(entry.provider),
        model: str(entry.model),
        kind: str(entry.kind) || 'answer',
        outcome: str(entry.outcome),
        ms: num(entry.ms) ?? 0,
        ttftMs: num(entry.ttftMs),
        input: num(entry.input),
        output: num(entry.output),
        total: num(entry.total),
        cachedInput: num(entry.cachedInput),
      };
      if (!calls.has(run)) {
        calls.set(run, []);
        sinceTrace.push(run);
      }
      calls.get(run)!.push(call);
    } else if (entry.event === 'run-trace') {
      const id = str(entry.run) || sinceTrace[sinceTrace.length - 1];
      const own = (id && calls.get(id)) || [];
      if (id) calls.delete(id);
      sinceTrace = [];
      runs.push({
        at: str(entry.at),
        ...(id ? { id } : {}),
        provider: str(entry.provider) || own[0]?.provider || '',
        model: str(entry.model) || own[0]?.model || '',
        outcome: str(entry.outcome),
        route: str(entry.route),
        ms: num(entry.ms) ?? 0,
        ...(str(entry.selection) ? { selection: str(entry.selection) } : {}),
        calls: own,
      });
    }
  }
  return runs;
}

/** Nearest-rank percentile; undefined for no values. */
export function percentile(values: number[], p: number) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

export type Row = {
  provider: string;
  model: string;
  runs: number;
  failed: number;
  cancelled: number;
  p50Ms?: number;
  p90Ms?: number;
  callsPerRun?: number;
  tokensPerRun?: number;
  cachedShare?: number;
  kinds: Record<string, { calls: number; p50Ms?: number; failed: number }>;
};

// Run outcomes (WorkService finish): review = answered, clarify = asked a question back, error, cancelled.
const FINISHED = new Set(['review', 'clarify']);

/** One row per provider and model. Times and tokens count finished runs only; failed and cancelled runs are counted apart. */
export function summarize(runs: Run[], options: { since?: string; until?: string } = {}): Row[] {
  const picked = runs.filter(r => (!options.since || r.at >= options.since) && (!options.until || r.at < options.until));
  const groups = new Map<string, Run[]>();
  for (const run of picked) {
    const key = `${run.provider}\0${run.model}`;
    groups.set(key, [...(groups.get(key) || []), run]);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const [provider, model] = key.split('\0');
      const done = group.filter(r => FINISHED.has(r.outcome));
      const withCalls = done.filter(r => r.calls.length);
      const tokens = withCalls.map(r => r.calls.reduce((sum, c) => sum + (c.total ?? 0), 0)).filter(t => t > 0);
      const input = withCalls.flatMap(r => r.calls).reduce((sum, c) => sum + (c.input ?? 0), 0);
      const cached = withCalls.flatMap(r => r.calls).reduce((sum, c) => sum + (c.cachedInput ?? 0), 0);
      const kinds: Row['kinds'] = {};
      for (const call of group.flatMap(r => r.calls)) {
        const k = (kinds[call.kind] ||= { calls: 0, failed: 0 });
        k.calls++;
        if (call.outcome === 'error') k.failed++;
      }
      for (const kind of Object.keys(kinds))
        kinds[kind].p50Ms = percentile(
          group
            .flatMap(r => r.calls)
            .filter(c => c.kind === kind && c.outcome !== 'error')
            .map(c => c.ms),
          50,
        );
      return {
        provider,
        model,
        runs: group.length,
        failed: group.filter(r => r.outcome === 'error').length,
        cancelled: group.filter(r => r.outcome === 'cancelled').length,
        p50Ms: percentile(
          done.map(r => r.ms),
          50,
        ),
        p90Ms: percentile(
          done.map(r => r.ms),
          90,
        ),
        callsPerRun: percentile(
          withCalls.map(r => r.calls.length),
          50,
        ),
        tokensPerRun: percentile(tokens, 50),
        cachedShare: input ? cached / input : undefined,
        kinds,
      };
    })
    .sort((a, b) => b.runs - a.runs);
}

const seconds = (ms?: number) => (ms === undefined ? '-' : (ms / 1000).toFixed(1) + ' s');
const plain = (n?: number) => (n === undefined ? '-' : Math.round(n).toLocaleString('en-US'));

/** A Markdown table, ready to paste into the plan or a pull request. */
export function report(rows: Row[]) {
  if (!rows.length) return 'No run-trace lines in this log for the chosen dates.\n';
  const lines = [
    '| Provider | Model | Runs | Failed | Cancelled | p50 | p90 | AI calls / answer | Tokens / answer | Cached input |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows
      .map(r =>
        [
          r.provider || '?',
          r.model || '(default)',
          r.runs,
          r.failed,
          r.cancelled,
          seconds(r.p50Ms),
          seconds(r.p90Ms),
          plain(r.callsPerRun),
          plain(r.tokensPerRun),
          r.cachedShare === undefined ? '-' : Math.round(r.cachedShare * 100) + '%',
        ].join(' | '),
      )
      .map(line => `| ${line} |`),
    '',
    '| Provider | Model | Kind of call | Calls | Failed | p50 |',
    '| --- | --- | --- | ---: | ---: | ---: |',
    ...rows.flatMap(r =>
      Object.entries(r.kinds)
        .sort((a, b) => b[1].calls - a[1].calls)
        .map(
          ([kind, k]) => `| ${r.provider || '?'} | ${r.model || '(default)'} | ${kind} | ${k.calls} | ${k.failed} | ${seconds(k.p50Ms)} |`,
        ),
    ),
  ];
  return lines.join('\n') + '\n';
}

/** Where the installed app writes its log (Electron userData of "@step-cmu/desktop"). */
export function defaultLogPath(platform = process.platform, env = process.env, home = homedir()) {
  // The path module of the target platform, so the result is right whichever system runs this.
  const { join } = platform === 'win32' ? win32 : posix;
  const base =
    platform === 'win32'
      ? env.APPDATA || join(home, 'AppData', 'Roaming')
      : platform === 'darwin'
        ? join(home, 'Library', 'Application Support')
        : env.XDG_CONFIG_HOME || join(home, '.config');
  return join(base, '@step-cmu', 'desktop', 'logs', 'diagnostics.jsonl');
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const since = value('--since'),
    until = value('--until');
  const json = args.includes('--json');
  const path = args.find(a => !a.startsWith('--')) || defaultLogPath();
  const rows = summarize(parseRuns(await readFile(path, 'utf8')), { since, until });
  process.stdout.write(json ? JSON.stringify(rows, null, 2) + '\n' : report(rows));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
