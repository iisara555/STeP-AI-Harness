/**
 * Real-model check of the Skill Review (policy `skillReview`) before it is turned on for everyone. For each synthetic
 * case in eval/skill-review-cases.json it makes the app's own review call (same system prompt, schema, checklist and
 * prompt as desktop/electron/service.ts) and scores the verdict:
 *
 * - missing: an answer that lacks a required part or breaks a guardrail must be sent back, naming the problem;
 * - complete / pending / ask: a finished answer, one that keeps the employee's facts as [รอยืนยัน], or one that asks the
 *   employee first, must go out as it is (a false send-back costs a rewrite and can push the AI to invent facts).
 *
 * Each case sent back is then rewritten once with the app's answer_check turn (tool-loop.ts answerCheckTurn), and the
 * rewrite must contain the fix and keep at least half the answer. This costs one call per case plus one per rewrite.
 *
 *   STEP_EVAL_APPROVE_LIVE=1 STEP_EVAL_PROVIDER=antigravity STEP_EVAL_ANTIGRAVITY_EXECUTABLE=<pinned agy.exe> \
 *   STEP_EVAL_MODELS=gemini-3.8-flash-medium npm run eval:review
 *
 * Claude, OpenAI and Gemini use the environment of eval:golden (desktop/eval/runtime.ts; set STEP_EVAL_MAX_CALLS=30).
 * An OpenAI-compatible endpoint (OpenRouter, the organization gateway, a local Ollama) uses STEP_EVAL_PROVIDER=compatible
 * with STEP_EVAL_BASE_URL and, unless it is on this computer, STEP_EVAL_API_KEY. Results go to desktop/eval-results/.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SKILL_REVIEW_SCHEMA,
  SKILL_REVIEW_SYSTEM,
  parseSkillReview,
  skillChecklist,
  skillReviewPrompt,
  skillReviewStatus,
} from '../electron/answer-review';
import { answerCheckTurn } from '../electron/tool-loop';
import { section } from '../electron/prompt';
import { CHAT_RULES } from '../electron/service';
import { adapter } from '../electron/providers';
import { liveRuntime } from './skill-selection-live';
import type { Connection } from '../src/types';

export type ReviewCase = {
  id: string;
  skill: string;
  kind: 'missing' | 'complete' | 'pending' | 'ask';
  request: string;
  answer: string;
  /** For missing: a pattern the review's findings must match. */
  expect: string;
  /** For missing: a pattern the rewrite must match. */
  fixed: string;
};
export type ReviewOutcome = {
  id: string;
  kind: ReviewCase['kind'];
  model: string;
  status?: 'done' | 'continue' | 'blocked';
  findings?: string;
  code?: string;
  ms: number;
  input: number;
  output: number;
  fix?: { ok: boolean; why?: string; ms: number; chars: number; output: number };
};

/** Whether the review did the right thing for this case. */
export function verdict(item: ReviewCase, outcome: ReviewOutcome) {
  if (outcome.code || !outcome.status) return 'invalid';
  const sentBack = outcome.status === 'continue' && Boolean(outcome.findings);
  if (item.kind === 'missing') return !sentBack ? 'missed' : new RegExp(item.expect, 'i').test(outcome.findings || '') ? 'right' : 'vague';
  return sentBack ? 'false-send-back' : 'right';
}

/** A rewrite must contain the fix, keep at least half the answer, and not talk about the check. */
export function judgeFix(item: ReviewCase, rewrite: string) {
  if (!new RegExp(item.fixed, 'i').test(rewrite)) return 'fix-missing';
  if (rewrite.length < item.answer.length * 0.5) return 'shorter';
  if (/answer_check|การตรวจ(?:คำตอบ)?นี้|findings/i.test(rewrite)) return 'mentions-check';
  return '';
}

const pick = (values: number[], share: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * share) - 1)] : undefined;
};

export function score(cases: ReviewCase[], outcomes: ReviewOutcome[]) {
  return [...new Set(outcomes.map(o => o.model))].map(model => {
    const mine = outcomes.filter(o => o.model === model);
    const judged = mine.map(o =>
      verdict(
        cases.find(c => c.id === o.id)!,
        o,
      ),
    );
    const missing = mine.filter(o => o.kind === 'missing');
    const fixes = mine.filter(o => o.fix);
    const ms = mine.filter(o => !o.code).map(o => o.ms);
    return {
      model,
      right: judged.filter(v => v === 'right').length,
      cases: mine.length,
      caught: missing.filter(o =>
        ['right', 'vague'].includes(
          verdict(
            cases.find(c => c.id === o.id)!,
            o,
          ),
        ),
      ).length,
      missingCases: missing.length,
      falseSendBack: judged.filter(v => v === 'false-send-back').length,
      passCases: mine.length - missing.length,
      invalid: judged.filter(v => v === 'invalid').length,
      fixed: fixes.filter(o => o.fix!.ok).length,
      rewrites: fixes.length,
      reviewP50Ms: pick(ms, 0.5),
      reviewP90Ms: pick(ms, 0.9),
      rewriteP50Ms: pick(
        fixes.map(o => o.fix!.ms),
        0.5,
      ),
      reviewTokens: mine.reduce((n, o) => n + o.input + o.output, 0),
      rewriteOutputTokens: fixes.reduce((n, o) => n + o.fix!.output, 0),
    };
  });
}

export function report(cases: ReviewCase[], rows: ReturnType<typeof score>, outcomes: ReviewOutcome[]) {
  const s = (ms?: number) => (ms === undefined ? '-' : (ms / 1000).toFixed(1) + ' s');
  const lines = [
    '| Model | Right verdict | Caught missing | False send-back | Invalid | Rewrite fixed | Review p50 / p90 | Rewrite p50 | Review tokens | Rewrite output tokens |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map(
      r =>
        `| ${r.model} | ${r.right}/${r.cases} | ${r.caught}/${r.missingCases} | ${r.falseSendBack}/${r.passCases} | ${r.invalid} | ${r.fixed}/${r.rewrites} | ${s(r.reviewP50Ms)} / ${s(r.reviewP90Ms)} | ${s(r.rewriteP50Ms)} | ${r.reviewTokens.toLocaleString('en-US')} | ${r.rewriteOutputTokens.toLocaleString('en-US')} |`,
    ),
    '',
    'Cases not judged right, or rewrites that failed:',
    '',
  ];
  for (const o of outcomes) {
    const v = verdict(
      cases.find(c => c.id === o.id)!,
      o,
    );
    if (v !== 'right' || (o.fix && !o.fix.ok))
      lines.push(
        `- ${o.model} ${o.id} (${o.kind}): ${v}${o.code ? ' ' + o.code : ''}${o.findings ? ' — ' + o.findings.replace(/\n/g, ' ') : ''}${o.fix && !o.fix.ok ? ` · rewrite ${o.fix.why}` : ''}`,
      );
  }
  return lines.join('\n') + '\n';
}

async function runtime(env: NodeJS.ProcessEnv) {
  if (env.STEP_EVAL_PROVIDER !== 'compatible') return liveRuntime(env);
  if (env.STEP_EVAL_APPROVE_LIVE !== '1') throw new Error('EVAL_LIVE_APPROVAL_REQUIRED');
  const baseUrl = env.STEP_EVAL_BASE_URL || '';
  const local = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(baseUrl + '/');
  if (!/^https:\/\//.test(baseUrl) && !local) throw new Error('EVAL_BASE_URL_INVALID');
  if (!local && !env.STEP_EVAL_API_KEY) throw new Error('API_KEY_REQUIRED');
  const connection: Connection = {
    id: 'eval',
    provider: 'compatible',
    protocol: 'openai',
    baseUrl,
    mode: 'api',
    model: '',
    executable: '',
    ready: true,
    note: '',
  };
  const selected = adapter('compatible');
  return {
    connection,
    context: { cwd: process.cwd(), env: {}, key: env.STEP_EVAL_API_KEY || 'local' },
    run: selected.run.bind(selected),
    close: async () => {},
  };
}

async function main(env = process.env) {
  const here = dirname(fileURLToPath(import.meta.url)),
    root = resolve(here, '../..');
  const models = (env.STEP_EVAL_MODELS || '')
    .split(',')
    .map(m => m.trim())
    .filter(Boolean);
  if (!models.length || models.length > 4) throw new Error('EVAL_MODELS_REQUIRED');
  const suite = JSON.parse(await readFile(join(here, 'skill-review-cases.json'), 'utf8'));
  const only = (env.STEP_EVAL_CASES || '').split(',').filter(Boolean);
  const cases: ReviewCase[] = suite.cases.filter((c: ReviewCase) => !only.length || only.includes(c.id));
  const rewrite = env.STEP_EVAL_REWRITE !== '0';
  const live = await runtime(env);
  const outcomes: ReviewOutcome[] = [];
  let stopped = '';
  try {
    for (const item of cases)
      for (const model of models) {
        if (stopped) break;
        const skill = await readFile(join(root, 'skills', item.skill, 'SKILL.md'), 'utf8');
        const connection = { ...live.connection, model };
        const call = async (prompt: string, system: string, schema?: Record<string, unknown>) => {
          let input = 0,
            output = 0;
          const started = Date.now();
          const reply = await live.run(prompt, connection, {
            ...live.context,
            signal: AbortSignal.timeout(Number(env.STEP_EVAL_TIMEOUT_MS || 300_000)),
            system,
            ...(schema ? { jsonSchema: schema } : {}),
            emit: () => {},
            onUsage: count => {
              input = Math.max(input, count.input || 0);
              output = Math.max(output, count.output || 0);
            },
          });
          return { reply, ms: Date.now() - started, input, output };
        };
        const outcome: ReviewOutcome = { id: item.id, kind: item.kind, model, ms: 0, input: 0, output: 0 };
        try {
          const review = await call(
            skillReviewPrompt(skillChecklist(skill), item.request, item.answer),
            SKILL_REVIEW_SYSTEM,
            SKILL_REVIEW_SCHEMA,
          );
          Object.assign(outcome, { ms: review.ms, input: review.input, output: review.output });
          outcome.status = skillReviewStatus(review.reply);
          outcome.findings = parseSkillReview(review.reply);
          if (!outcome.status) outcome.code = 'INVALID_REVIEW';
          if (rewrite && item.kind === 'missing' && outcome.findings) {
            // The rewrite turn as the tool loop sends it: the request, then the reviewed answer and what was found.
            const system = [CHAT_RULES, section('selected_skill', skill)].join('\n\n');
            const fixed = await call(section('current_message', item.request) + answerCheckTurn(item.answer, outcome.findings), system);
            const why = judgeFix(item, fixed.reply);
            outcome.fix = { ok: !why, ...(why ? { why } : {}), ms: fixed.ms, chars: fixed.reply.length, output: fixed.output };
          }
        } catch (error) {
          outcome.code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'PROVIDER_REQUEST_FAILED';
          if (['LOGIN_REQUIRED', 'PROVIDER_QUOTA', 'PROVIDER_PERMISSION_DENIED', 'EVAL_QUOTA_BOUND'].includes(outcome.code))
            stopped = outcome.code;
        }
        outcomes.push(outcome);
        console.log(
          `${outcomes.length}/${cases.length * models.length} ${model} ${item.id}: ${verdict(item, outcome)}${outcome.fix ? ` · rewrite ${outcome.fix.ok ? 'fixed' : outcome.fix.why}` : ''}`,
        );
      }
  } finally {
    await live.close();
  }
  const rows = score(cases, outcomes);
  const text = (stopped ? `Stopped early: ${stopped}\n\n` : '') + report(cases, rows, outcomes);
  const folder = join(here, '..', 'eval-results', `${new Date().toISOString().replace(/[:.]/g, '-')}-review`);
  await mkdir(folder, { recursive: true });
  await writeFile(
    join(folder, 'results.json'),
    JSON.stringify({ provider: live.connection.provider, models, ...(stopped ? { stopped } : {}), rows, outcomes }, null, 2),
  );
  await writeFile(join(folder, 'report.md'), text, 'utf8');
  console.log('\n' + text + `\nReport: ${join(folder, 'report.md')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
