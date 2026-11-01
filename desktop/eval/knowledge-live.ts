/**
 * Live STeP knowledge check: asks the reworded and follow-up questions of eval/knowledge-paraphrases.json through
 * the real WorkService chat with a real model and the host's `reference` tool, and reports whether each answer reached
 * the right STeP document (in the keyword search excerpts or opened by the AI itself), how many AI rounds and seconds
 * it took, and the answer for a person to read. It is the baseline for A1 / S1 of the backend optimisation plan: a
 * change that picks documents differently must reach at least as many right documents, in no more time.
 *
 *   STEP_EVAL_APPROVE_LIVE=1 STEP_EVAL_PROVIDER=antigravity STEP_EVAL_ANTIGRAVITY_EXECUTABLE=<pinned agy.exe> \
 *   STEP_EVAL_MODEL=gemini-3.8-flash-medium [STEP_EVAL_ONLY=misses] [STEP_EVAL_LIMIT=10] npm run eval:knowledge
 *
 * Runtimes are the same as eval:selection (Antigravity only through an agy named by absolute path, in a throwaway home;
 * Claude, OpenAI and Gemini through eval/runtime.ts). Only `reference` and `skill` run; every other tool answers
 * EVAL_TOOL_DISABLED. The answer check is off, so each question is the answer's own calls. Questions are synthetic.
 * STEP_EVAL_DOCUMENT_SELECTION=off turns A1 (an AI picks documents from the registry before answering) off for a
 * same-day comparison with keyword search alone. When the app asks back which Skill fits, the case's `reply` is sent once, as an employee would; still asking (or no
 * reply) is reported as CLARIFY and counts as not reached.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../electron/store';
import { WorkService, type Harness } from '../electron/service';
import { OrganizationKnowledge } from '../electron/knowledge';
import { defaultPolicy } from '../electron/policy';
import { Workbench } from '../electron/workbench';
import { ToolGate } from '../electron/tool-gate';
import { Approvals } from '../electron/approvals';
import { Questions } from '../electron/questions';
import { DesktopTools, type ToolScope } from '../electron/tools';
import type { LoopHost } from '../electron/tool-loop';
import { evaluationHarness } from './golden';
import { liveRuntime } from './skill-selection-live';

/** reply: what the employee answers when the app asks back which Skill fits, sent once (as a person would). */
export type Case = { q: string; doc: string | string[]; earlier?: string; reply?: string };
export type Outcome = {
  q: string;
  earlier?: string;
  expected: string[];
  searched: string[];
  /** Documents the AI picked from the registry before answering (A1, policy documentSelection). */
  selected?: string[];
  opened: string[];
  keyword: boolean;
  reached: boolean;
  /** The app asked back which Skill fits before answering (and the case's reply was sent, if it has one). */
  asked?: boolean;
  rounds: number;
  ms: number;
  code?: string;
  answer: string;
};

/** The query Desktop searches for a chat turn (service.ts): the conversation's first request, then the new message. */
export const turnQuery = (item: Case) => [...new Set([item.earlier, item.q].filter(Boolean))].join('\n');

/**
 * Right document reached: in the search excerpts, picked from the registry before the answer (A1), or opened by the AI.
 * A general question must reach none.
 */
export function judge(item: Case, searched: string[], opened: string[], selected: string[] = []) {
  const expected = [item.doc].flat();
  if (expected.includes('none')) return { keyword: !searched.length, reached: !searched.length && !opened.length && !selected.length };
  return {
    keyword: expected.includes(searched[0]),
    reached: [...searched, ...selected, ...opened].some(id => expected.includes(id)),
  };
}

export function summary(outcomes: Outcome[]) {
  const answered = outcomes.filter(o => !o.code);
  const ms = answered.map(o => o.ms).sort((a, b) => a - b);
  const rounds = answered.map(o => o.rounds).sort((a, b) => a - b);
  const mid = <T>(values: T[]) => (values.length ? values[Math.ceil(values.length / 2) - 1] : undefined);
  return {
    cases: outcomes.length,
    keyword: outcomes.filter(o => o.keyword).length,
    reached: outcomes.filter(o => o.reached).length,
    keywordMissedButReached: outcomes.filter(o => !o.keyword && o.reached).length,
    asked: outcomes.filter(o => o.asked).length,
    failed: outcomes.length - answered.length,
    p50Ms: mid(ms),
    p50Rounds: mid(rounds),
    opened: outcomes.reduce((n, o) => n + o.opened.length, 0),
  };
}

export function report(meta: Record<string, string>, outcomes: Outcome[]) {
  const s = summary(outcomes);
  const seconds = (ms?: number) => (ms === undefined ? '-' : (ms / 1000).toFixed(1) + ' s');
  const lines = [
    `# STeP knowledge, live (${meta.provider} ${meta.model})`,
    '',
    `Harness ${meta.harness}, ${meta.date}. Reached = the right document was in the search excerpts, picked from the registry before the answer, or opened by the AI. A1 ${meta.documentSelection || 'on'}.`,
    '',
    '| Questions | Keyword search right | Reached by the answer | Reached only because the AI opened it | Failed | p50 time | p50 AI rounds | Documents opened | Asked back first |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    `| ${s.cases} | ${s.keyword} | ${s.reached} | ${s.keywordMissedButReached} | ${s.failed} | ${seconds(s.p50Ms)} | ${s.p50Rounds ?? '-'} | ${s.opened} | ${s.asked} |`,
    '',
  ];
  for (const o of outcomes)
    lines.push(
      `## ${o.reached ? 'reached' : 'MISSED'}: ${o.earlier ? `[${o.earlier}] ` : ''}${o.q}`,
      '',
      `Expected ${o.expected.join(' or ')}; search ${o.searched.join(', ') || 'nothing'}; ${o.selected ? `picked ${o.selected.join(', ')}; ` : ''}opened ${o.opened.join(', ') || 'nothing'}; ${o.rounds} rounds, ${seconds(o.ms)}${o.code ? `; ${o.code}` : ''}`,
      '',
      o.answer.trim() ? '> ' + o.answer.trim().slice(0, 1500).replace(/\n/g, '\n> ') : '(no answer)',
      '',
    );
  return lines.join('\n') + '\n';
}

type Live = Awaited<ReturnType<typeof liveRuntime>>;

/** Runs each case as a fresh chat (a follow-up first asks its earlier question in the same chat). */
export async function runKnowledge(options: {
  root: string;
  cases: Case[];
  live: Pick<Live, 'connection' | 'context' | 'run'>;
  onProgress?: (line: string) => void;
  /** Policy documentSelection (A1); on by default like the app, off to compare with keyword search alone. */
  documentSelection?: boolean;
}): Promise<Outcome[]> {
  const { root, cases, live } = options,
    connection = live.connection;
  const here = dirname(fileURLToPath(import.meta.url));
  const routing: any = await import('../../src/modules/router/service.js');
  const skills: any = await import('../../src/modules/skills/catalog.js');
  const knowledge = new OrganizationKnowledge(root, routing.loadDocumentCatalog);
  const workspace = await mkdtemp(join(tmpdir(), 'step-knowledge-eval-'));
  const policy = { ...defaultPolicy(), features: { ...defaultPolicy().features, answerCheck: false } };
  const base = await evaluationHarness(root);
  const outcomes: Outcome[] = [];
  try {
    for (const [index, item] of cases.entries()) {
      const store = new Store(':memory:');
      store.put('connection', connection.id, connection);
      store.put('settings', 'main', { team: 'cc', assistant: 'STeP Mate', workspace, theme: 'system', onboarding: true });
      const workbench = new Workbench(store, undefined, () => policy);
      const approvals = new Approvals(store, request => {
        if (request) queueMicrotask(() => approvals.respond(request.id, 'run'));
      });
      const gate = new ToolGate(
        () => policy,
        () => 'ask',
        () => workbench.root(),
        approvals,
        async () => ({ blocked: false, reason: '', results: [] }),
      );
      const opened: string[] = [];
      const harness: Harness = {
        ...base,
        catalog: skills.createSkillCatalog(root),
        documentCatalog: routing.loadDocumentCatalog,
        documentMetadata: routing.loadDocumentContextMetadata,
        toolLoop: () => true,
        hybridSkillSelection: () => true,
        answerCheck: () => false,
        documentSelection: () => options.documentSelection !== false,
      };
      const desktopTools = new DesktopTools(
        workbench,
        harness,
        gate,
        approvals,
        new Questions(() => {}),
        () => policy,
        () => 'ask',
        resolve(here, '../electron/sheet-worker.cjs'),
      );
      harness.tools = async (scope: ToolScope): Promise<LoopHost> => {
        const host = await desktopTools.host(scope);
        return {
          ...host,
          execute: async (request, signal) => {
            if (request.tool === 'reference' && request.input) opened.push(request.input);
            if (!['reference', 'skill'].includes(request.tool)) throw new Error('EVAL_TOOL_DISABLED');
            return host.execute(request, signal);
          },
        };
      };
      const service = new WorkService(
        store,
        harness,
        async () => ({ context: live.context, adapter: { run: live.run } as any }),
        () => {},
      );
      const session = store.create(connection.id, 'cc');
      const started = Date.now();
      let code = '';
      try {
        if (item.earlier) await service.run(session.id, item.earlier, '', true, undefined, 'chat');
        opened.length = 0;
        const before = (store.session(session.id).runs || []).length;
        const turnStarted = Date.now();
        await service.run(session.id, item.q, '', true, undefined, 'chat');
        // The app may ask back which Skill fits (no AI call). The employee's answer is sent once, as a person would.
        const askedBack = () => store.session(session.id).runs?.at(-1)?.outcome === 'clarify';
        const asked = askedBack();
        if (asked && item.reply) await service.run(session.id, item.reply, '', true, undefined, 'chat');
        const done = store.session(session.id);
        const trace = done.runs?.at(-1);
        const turns = (done.runs || []).slice(before);
        const selected = [...new Set(turns.flatMap(run => run.documentSelection?.documents || []))];
        code = trace?.code || (done.status === 'error' ? 'RUN_FAILED' : askedBack() ? 'CLARIFY' : '');
        const searched = [...new Set((await knowledge.search(turnQuery(item))).map(s => s.id))];
        const uniqueOpened = [...new Set(opened)];
        outcomes.push({
          q: item.q,
          ...(item.earlier ? { earlier: item.earlier } : {}),
          expected: [item.doc].flat(),
          searched,
          ...(selected.length ? { selected } : {}),
          opened: uniqueOpened,
          ...judge(item, searched, uniqueOpened, selected),
          // Still asking back after the reply (or with none): no answer was given, so nothing was reached.
          ...(code === 'CLARIFY' ? { reached: false } : {}),
          ...(asked ? { asked } : {}),
          rounds: turns.flatMap(run => run.steps || []).reduce((n, step) => n + (step.providerCalls || []).length, 0),
          ms: Date.now() - turnStarted,
          ...(code ? { code } : {}),
          answer: done.messages.filter(m => m.role === 'assistant').at(-1)?.text || '',
        });
      } catch (error) {
        code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'EVAL_FAILED';
        outcomes.push({
          q: item.q,
          ...(item.earlier ? { earlier: item.earlier } : {}),
          expected: [item.doc].flat(),
          searched: [],
          opened: [...new Set(opened)],
          keyword: false,
          reached: false,
          rounds: 0,
          ms: Date.now() - started,
          code,
          answer: '',
        });
      } finally {
        approvals.close();
        store.close();
      }
      const last = outcomes.at(-1)!;
      options.onProgress?.(`${index + 1}/${cases.length} ${last.reached ? 'reached' : 'MISSED '} ${last.code || ''} ${item.q}`);
      if (['LOGIN_REQUIRED', 'PROVIDER_QUOTA', 'PROVIDER_PERMISSION_DENIED', 'EVAL_QUOTA_BOUND'].includes(code)) break;
      if (outcomes.length >= 4 && outcomes.slice(-4).every(o => o.code)) break;
    }
  } finally {
    await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  return outcomes;
}

async function main(env = process.env) {
  const here = dirname(fileURLToPath(import.meta.url)),
    root = resolve(here, '../..');
  const suite = JSON.parse(await readFile(join(here, 'knowledge-paraphrases.json'), 'utf8')) as { paraphrases: Case[]; followUps: Case[] };
  const routing: any = await import('../../src/modules/router/service.js');
  const knowledge = new OrganizationKnowledge(root, routing.loadDocumentCatalog);
  let cases = [...suite.paraphrases, ...suite.followUps];
  if (env.STEP_EVAL_ONLY === 'misses') {
    const misses: Case[] = [];
    for (const item of cases)
      if (
        !judge(
          item,
          (await knowledge.search(turnQuery(item))).map(s => s.id),
          [],
        ).keyword
      )
        misses.push(item);
    cases = misses;
  } else if (env.STEP_EVAL_ONLY && env.STEP_EVAL_ONLY !== 'all') throw new Error('EVAL_ONLY_INVALID');
  const limit = Number(env.STEP_EVAL_LIMIT || cases.length);
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('EVAL_LIMIT_INVALID');
  cases = cases.slice(0, limit);
  const model = env.STEP_EVAL_MODEL || '';

  const live = await liveRuntime(env);
  const connection = { ...live.connection, model: model || live.connection.model };
  let outcomes: Outcome[];
  try {
    outcomes = await runKnowledge({
      root,
      cases,
      live: { ...live, connection },
      onProgress: line => console.log(line),
      documentSelection: env.STEP_EVAL_DOCUMENT_SELECTION !== 'off',
    });
  } finally {
    await live.close();
  }
  const git = (args: string[]) => {
    try {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  };
  const meta = {
    provider: connection.provider,
    model: connection.model || '(provider default)',
    documentSelection: env.STEP_EVAL_DOCUMENT_SELECTION === 'off' ? 'off' : 'on',
    date: new Date().toISOString(),
    harness: git(['rev-parse', '--short', 'HEAD']) + (git(['status', '--porcelain']) ? '-dirty' : ''),
  };
  const folder = join(here, '..', 'eval-results', `${meta.date.replace(/[:.]/g, '-')}-knowledge`);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'results.json'), JSON.stringify({ meta, summary: summary(outcomes), outcomes }, null, 2));
  const text = report(meta, outcomes);
  await writeFile(join(folder, 'report.md'), text, 'utf8');
  console.log('\n' + text.split('\n').slice(0, 8).join('\n') + `\nReport: ${join(folder, 'report.md')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
