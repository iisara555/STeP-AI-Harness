/**
 * Real-model Skill selection comparison: asks each named model to pick a Skill for staff-style requests from
 * manifest/routing-staff-benchmark.json with the exact selection prompt Desktop uses, and reports how often each picks
 * the expected Skill. Used to decide whether a smaller model (for example an Antigravity `-low` id) may do Skill
 * selection without picking more wrong Skills (the owner's quality rule, 2026-11-01).
 *
 *   STEP_EVAL_APPROVE_LIVE=1 STEP_EVAL_PROVIDER=antigravity STEP_EVAL_ANTIGRAVITY_EXECUTABLE=<pinned agy.exe> \
 *   STEP_EVAL_MODELS=gemini-3.8-flash-medium,gemini-3.8-flash-low [STEP_EVAL_PER_SKILL=1] npm run eval:selection
 *
 * Claude, OpenAI and Gemini use the same environment and caps as eval:golden (desktop/eval/runtime.ts: 50 calls and
 * 200,000 tokens per run; a selection call is about 7,000 tokens, so about 28 calls fit). Run the full set in parts of
 * 12 requests (24 calls with two models): STEP_EVAL_CASES=1-12, 13-24, 25-36, 37-48, 49-61 with STEP_EVAL_MAX_CALLS=26,
 * then join them with `npm run eval:selection -- merge <folder> ...`. Antigravity runs only the agy named by an absolute path (STeP's pinned copy), in a throwaway home; agy keeps its sign-in in the OS
 * keyring, so nothing is copied. The selection call matches the app's: same prompt, schema and no --effort for an id that
 * names its level. Each request costs one model call per model. Requests and Skills are synthetic; no employee data is read.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { prepareSkillSelection } from '../electron/skill-selection';
import { adapter } from '../electron/providers';
import { isolatedRuntimeHome } from '../electron/runtime-home';
import { checkAntigravity } from '../electron/antigravity';
import { evaluationRuntime } from './runtime';
import type { Connection } from '../src/types';

export type Case = { request: string; expected: string | null };
export type Outcome = Case & { model: string; chosen?: string | null; code?: string; ms: number; output?: number };

/** The first `perSkill` requests of every Skill, then every general request (expected: no Skill). */
export function sampleCases(suite: { skills: Record<string, string[]>; general: string[] }, perSkill: number): Case[] {
  return [
    ...Object.entries(suite.skills).flatMap(([skill, requests]) =>
      requests.slice(0, perSkill).map(request => ({ request, expected: skill })),
    ),
    ...suite.general.map(request => ({ request, expected: null })),
  ];
}

export function score(outcomes: Outcome[]) {
  const models = [...new Set(outcomes.map(o => o.model))];
  return models.map(model => {
    const mine = outcomes.filter(o => o.model === model);
    const skill = mine.filter(o => o.expected);
    const general = mine.filter(o => !o.expected);
    const ms = mine
      .filter(o => !o.code)
      .map(o => o.ms)
      .sort((a, b) => a - b);
    return {
      model,
      right: skill.filter(o => o.chosen === o.expected).length,
      wrongSkill: skill.filter(o => o.chosen && o.chosen !== o.expected).length,
      noSkill: skill.filter(o => o.chosen === null).length,
      skillCases: skill.length,
      generalKept: general.filter(o => o.chosen === null).length,
      generalCases: general.length,
      invalid: mine.filter(o => o.code).length,
      p50Ms: ms.length ? ms[Math.ceil(ms.length / 2) - 1] : undefined,
      outputTokens: mine.reduce((n, o) => n + (o.output || 0), 0),
    };
  });
}

export function report(rows: ReturnType<typeof score>, outcomes: Outcome[]) {
  const seconds = (ms?: number) => (ms === undefined ? '-' : (ms / 1000).toFixed(1) + ' s');
  const lines = [
    '| Model | Right Skill | Wrong Skill | No Skill | General kept general | Invalid / failed | p50 | Output tokens |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map(
      r =>
        `| ${r.model} | ${r.right}/${r.skillCases} | ${r.wrongSkill} | ${r.noSkill} | ${r.generalKept}/${r.generalCases} | ${r.invalid} | ${seconds(r.p50Ms)} | ${r.outputTokens.toLocaleString('en-US')} |`,
    ),
    '',
    'Requests where the models disagree:',
    '',
  ];
  const byRequest = new Map<string, Outcome[]>();
  for (const o of outcomes) byRequest.set(o.request, [...(byRequest.get(o.request) || []), o]);
  for (const [request, all] of byRequest) {
    const picks = all.map(o => o.code || String(o.chosen));
    if (new Set(picks).size > 1)
      lines.push(
        `- ${request} (expected ${all[0].expected ?? 'none'}): ${all.map(o => `${o.model} → ${o.code || o.chosen || 'none'}`).join(', ')}`,
      );
  }
  return lines.join('\n') + '\n';
}

async function liveRuntime(env: NodeJS.ProcessEnv) {
  if (env.STEP_EVAL_PROVIDER !== 'antigravity') {
    const live = await evaluationRuntime(env);
    const { context, adapter: run } = await live.runtime();
    return { connection: live.connection, context, run: run.run, close: live.close };
  }
  if (env.STEP_EVAL_APPROVE_LIVE !== '1') throw new Error('EVAL_LIVE_APPROVAL_REQUIRED');
  const executable = env.STEP_EVAL_ANTIGRAVITY_EXECUTABLE || '';
  // Only an explicitly named agy runs, in a fresh home like the app's; checkAntigravity refuses untested versions.
  if (!isAbsolute(executable)) throw new Error('ANTIGRAVITY_RUNTIME_REQUIRED');
  const home = await mkdtemp(join(tmpdir(), 'step-selection-eval-'));
  const connection: Connection = {
    id: 'eval',
    provider: 'antigravity',
    mode: 'subscription',
    model: '',
    executable,
    ready: true,
    note: '',
  };
  const { cwd, env: isolated } = await isolatedRuntimeHome(home, connection);
  await checkAntigravity(executable, { cwd, env: isolated });
  const selected = adapter('antigravity');
  return {
    connection,
    context: { cwd, env: isolated },
    run: selected.run.bind(selected),
    close: () => rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
  };
}

/**
 * `STEP_EVAL_CASES=13-24` keeps cases 13 to 24 (1-based, inclusive), so a run that would pass the call or token cap of
 * eval/runtime.ts (Claude, OpenAI and Gemini) can be done in parts and joined with `npm run eval:selection --
 * merge <folder> <folder> ...`.
 */
export function pickRange<T>(cases: T[], range?: string): T[] {
  if (!range) return cases;
  const match = /^(\d+)-(\d+)$/.exec(range.trim());
  const from = Number(match?.[1]),
    to = Number(match?.[2]);
  if (!match || from < 1 || to < from || from > cases.length) throw new Error('EVAL_CASES_INVALID');
  return cases.slice(from - 1, to);
}

/**
 * The outcomes of runs made in parts. A part stopped by the eval's own cap records the request it did not send
 * (EVAL_QUOTA_BOUND); that entry is dropped when another part answered the same request on the same model.
 */
export function joinOutcomes(all: Outcome[]) {
  const key = (o: Outcome) => JSON.stringify([o.request, o.model]);
  const answered = new Set(all.filter(o => o.code !== 'EVAL_QUOTA_BOUND').map(key));
  return all.filter(o => o.code !== 'EVAL_QUOTA_BOUND' || !answered.has(key(o)));
}

/** Joins the results.json of runs made in parts into one report. */
async function merge(folders: string[], out: string) {
  if (folders.length < 2) throw new Error('EVAL_MERGE_FOLDERS_REQUIRED');
  const parts = await Promise.all(folders.map(async f => JSON.parse(await readFile(join(f, 'results.json'), 'utf8'))));
  if (new Set(parts.map(p => JSON.stringify([p.provider, p.models, p.perSkill]))).size > 1) throw new Error('EVAL_MERGE_MISMATCH');
  const outcomes = joinOutcomes(parts.flatMap(p => p.outcomes));
  const rows = score(outcomes);
  // A part's own cap stop no longer matters once another part answered what it left out.
  const stops = parts.map(p => p.stopped).filter(code => code && (code !== 'EVAL_QUOTA_BOUND' || outcomes.some(o => o.code === code)));
  const text = stops.map(code => `Stopped early: ${code}\n\n`).join('') + report(rows, outcomes);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'results.json'), JSON.stringify({ ...parts[0], merged: folders, rows, outcomes }, null, 2));
  await writeFile(join(out, 'report.md'), text, 'utf8');
  console.log('\n' + text + `\nReport: ${join(out, 'report.md')}`);
}

async function main(env = process.env) {
  const here = dirname(fileURLToPath(import.meta.url)),
    root = resolve(here, '../..');
  const models = (env.STEP_EVAL_MODELS || '')
    .split(',')
    .map(m => m.trim())
    .filter(Boolean);
  if (!models.length || models.length > 4) throw new Error('EVAL_MODELS_REQUIRED');
  const perSkill = Number(env.STEP_EVAL_PER_SKILL || 1);
  if (!Number.isSafeInteger(perSkill) || perSkill < 1 || perSkill > 4) throw new Error('EVAL_PER_SKILL_INVALID');
  const suite = JSON.parse(await readFile(join(root, 'manifest/routing-staff-benchmark.json'), 'utf8'));
  const cases = pickRange(sampleCases(suite, perSkill), env.STEP_EVAL_CASES);
  const maxCalls = Number(env.STEP_EVAL_MAX_CALLS || cases.length * models.length);
  if (!Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > 900) throw new Error('EVAL_CALL_LIMIT_INVALID');
  const skills: any = await import('../../src/modules/skills/catalog.js');
  const registry = ((await skills.createSkillCatalog(root)()) as any[]).filter(e => e.status === 'routed');
  const live = await liveRuntime(env);
  const outcomes: Outcome[] = [];
  let calls = 0,
    failedInRow = 0,
    stopped = '';
  try {
    // Models alternate per request, so a slow or failing stretch of the service hits both alike.
    for (const item of cases)
      for (const model of models) {
        if (stopped || calls >= maxCalls) break;
        calls++;
        const selection = prepareSkillSelection(registry, item.request, '');
        const started = Date.now();
        let output = 0;
        try {
          const reply = await live.run(
            selection.prompt,
            { ...live.connection, model },
            {
              ...live.context,
              signal: new AbortController().signal,
              system: selection.system,
              jsonSchema: selection.schema,
              emit: () => {},
              onUsage: count => {
                output = Math.max(output, count.output || 0);
              },
            },
          );
          const chosen = selection.parse(reply);
          outcomes.push({
            ...item,
            model,
            chosen,
            ...(chosen === undefined ? { code: 'INVALID_SKILL_SELECTION' } : {}),
            ms: Date.now() - started,
            output,
          });
        } catch (error) {
          const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'PROVIDER_REQUEST_FAILED';
          outcomes.push({ ...item, model, code, ms: Date.now() - started, output });
          if (['LOGIN_REQUIRED', 'PROVIDER_QUOTA', 'PROVIDER_PERMISSION_DENIED', 'EVAL_QUOTA_BOUND'].includes(code)) stopped = code;
        }
        // A broken runtime or an unknown model id fails every call; stop instead of spending the rest of the run on it.
        failedInRow = outcomes.at(-1)!.code ? failedInRow + 1 : 0;
        if (failedInRow >= 6) stopped ||= 'REPEATED_FAILURES';
        console.log(`${calls}/${cases.length * models.length} ${model}: ${outcomes.at(-1)!.code || outcomes.at(-1)!.chosen || 'none'}`);
      }
  } finally {
    await live.close();
  }
  const rows = score(outcomes);
  const text = (stopped ? `Stopped early: ${stopped}\n\n` : '') + report(rows, outcomes);
  const folder = join(here, '..', 'eval-results', `${new Date().toISOString().replace(/[:.]/g, '-')}-selection`);
  await mkdir(folder, { recursive: true });
  await writeFile(
    join(folder, 'results.json'),
    JSON.stringify(
      {
        provider: live.connection.provider,
        models,
        perSkill,
        cases: env.STEP_EVAL_CASES || 'all',
        ...(stopped ? { stopped } : {}),
        rows,
        outcomes,
      },
      null,
      2,
    ),
  );
  await writeFile(join(folder, 'report.md'), text, 'utf8');
  console.log('\n' + text + `\nReport: ${join(folder, 'report.md')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'merge')
    await merge(
      process.argv.slice(3),
      join(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        'eval-results',
        `${new Date().toISOString().replace(/[:.]/g, '-')}-selection-merged`,
      ),
    );
  else await main();
}
