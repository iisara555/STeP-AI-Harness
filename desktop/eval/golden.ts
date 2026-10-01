import { runGovernedDraft } from '../../src/modules/runner/index.js';
/**
 * Golden-set evaluation: runs fixed synthetic tasks through the real router, Skill loading and
 * WorkService with a real provider, then grades each draft against its rubric. Use it whenever a
 * model, Skill, source or prompt changes, and compare the reports across runs.
 *
 *   STEP_EVAL_PROVIDER=claude|openai|gemini STEP_EVAL_API_KEY=... [STEP_EVAL_MODEL=...] [STEP_EVAL_RUNS=3] \
 *   [STEP_EVAL_ONLY=TOR-SYN-01,MIN-SYN-01] npm run eval:golden
 *
 * The key is read from the environment only and is never written to the report. Each call uses a
 * throwaway runtime home, so personal CLI settings, MCP servers and sign-ins are never read.
 * Automated checks are not a quality certificate: a person still reads the saved outputs.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../electron/store';
import { WorkService, type Harness } from '../electron/service';
import { adapter } from '../electron/providers';
import { isolatedRuntimeHome } from '../electron/runtime-home';
import type { Connection, Provider } from '../src/types';

export type Check = {
  id: string;
  label: string;
  type: 'include' | 'exclude' | 'onlyAmounts';
  pattern?: string;
  allowed?: string[];
  critical?: boolean;
};
export type Scenario = { id: string; title: string; team: string; request: string; source: string; checks: Check[] };
export type Graded = { id: string; label: string; critical: boolean; passed: boolean; detail?: string };
export type RunResult = {
  scenario: string;
  run: number;
  status: string;
  code?: string;
  ms: number;
  tokens?: { input: number; output: number; total: number };
  route: string;
  references: string[];
  checks: Graded[];
  criticalPassed: boolean;
  output: string;
};

/** Grades one draft. Money amounts are compared as written, so "10,000" and "10000" both count. */
export function grade(text: string, checks: Check[]): Graded[] {
  return checks.map(check => {
    const critical = Boolean(check.critical);
    if (check.type === 'onlyAmounts') {
      const amounts = [...text.matchAll(/(\d{1,3}(?:,\d{3})+|\d{3,})(?:\.\d+)?\s*บาท/g)].map(m => m[1]);
      const extra = [...new Set(amounts.filter(a => !(check.allowed || []).includes(a)))];
      return {
        id: check.id,
        label: check.label,
        critical,
        passed: extra.length === 0,
        ...(extra.length ? { detail: extra.join(', ') } : {}),
      };
    }
    const match = new RegExp(check.pattern || '', 'iu').exec(text);
    const passed = check.type === 'include' ? Boolean(match) : !match;
    return {
      id: check.id,
      label: check.label,
      critical,
      passed,
      ...(check.type === 'exclude' && match ? { detail: match[0].slice(0, 120) } : {}),
    };
  });
}

export async function runGolden(options: {
  harness: Harness;
  runtime: (connection: Connection) => Promise<any>;
  connection: Connection;
  scenarios: Scenario[];
  runs: number;
  onProgress?: (line: string) => void;
}): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (const scenario of options.scenarios) {
    for (let run = 1; run <= options.runs; run++) {
      const store = new Store(':memory:');
      store.put('connection', options.connection.id, options.connection);
      store.put('settings', 'main', {
        team: scenario.team,
        assistant: 'STeP Mate',
        workspace: tmpdir(),
        theme: 'system',
        onboarding: true,
      });
      const session = store.create(options.connection.id, scenario.team);
      const service = new WorkService(store, options.harness, options.runtime, () => {});
      const started = Date.now();
      options.onProgress?.(`${scenario.id} รอบ ${run}/${options.runs}`);
      await runGovernedDraft(
        {
          query: scenario.request,
          source: scenario.source,
          team: scenario.team,
          approveProvider: true,
          policy: { features: { headless: true } },
        },
        {
          attended: true,
          harness: options.harness,
          execute: async () => {
            await service.run(session.id, scenario.request, scenario.source, true);
            const draft = store.session(session.id);
            return { status: draft.status, text: draft.proposals.at(-1)?.text || '' };
          },
        },
      ).catch(error => {
        const stopped = store.session(session.id);
        stopped.status = 'error';
        stopped.messages.push({
          role: 'status',
          text: /^[A-Z_]+$/.test(error.message) ? error.message : 'EVAL_FAILED',
          at: new Date().toISOString(),
        });
        store.save(stopped);
      });
      const done = store.session(session.id);
      const output = done.proposals.at(-1)?.text || '';
      const trace = done.runs?.at(-1);
      const checks = done.status === 'review' ? grade(output, scenario.checks) : [];
      results.push({
        scenario: scenario.id,
        run,
        status: done.status,
        ...(trace?.code ? { code: trace.code } : {}),
        ms: Date.now() - started,
        ...(done.usage ? { tokens: { input: done.usage.input, output: done.usage.output, total: done.usage.total } } : {}),
        route: trace?.route || '',
        references: [...new Set((trace?.steps || []).flatMap(s => s.references))],
        checks,
        criticalPassed: done.status === 'review' && checks.every(c => !c.critical || c.passed),
        output,
      });
      store.close();
    }
  }
  return results;
}

async function referenceDigest(root: string, paths: string[]) {
  const hash = createHash('sha256');
  for (const path of [...paths].sort()) hash.update(path + '\0' + (await readFile(join(root, path), 'utf8').catch(() => '')) + '\0');
  return hash.digest('hex').slice(0, 12);
}

export function report(meta: Record<string, string>, results: RunResult[], scenarios: Scenario[]) {
  const lines = [
    `# Golden-set evaluation — ${meta.provider} ${meta.model || '(provider default)'}`,
    '',
    ...Object.entries(meta).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '| Scenario | Run | Status | Critical gates | Checks | Tokens | Seconds |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...results.map(r => {
      const passed = r.checks.filter(c => c.passed).length;
      return `| ${r.scenario} | ${r.run} | ${r.status}${r.code ? ` (${r.code})` : ''} | ${r.criticalPassed ? 'pass' : 'FAIL'} | ${passed}/${r.checks.length} | ${r.tokens?.total ?? '-'} | ${(r.ms / 1000).toFixed(0)} |`;
    }),
    '',
    '## Checks that did not pass',
    '',
  ];
  for (const r of results)
    for (const c of r.checks.filter(c => !c.passed))
      lines.push(`- ${r.scenario} run ${r.run}: ${c.critical ? '**critical** ' : ''}${c.label}${c.detail ? ` — found “${c.detail}”` : ''}`);
  lines.push(
    '',
    '## Scenarios',
    '',
    ...scenarios.map(s => `- ${s.id} ${s.title}: ${s.request}`),
    '',
    'Automated checks flag critical failures and obvious omissions. Read the saved drafts before comparing models.',
  );
  return lines.join('\n') + '\n';
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, '../..');
  const provider = process.env.STEP_EVAL_PROVIDER as Provider;
  const key = process.env.STEP_EVAL_API_KEY || '';
  if (!['claude', 'openai', 'gemini'].includes(provider) || !key) {
    console.error(
      'Set STEP_EVAL_PROVIDER (claude|openai|gemini) and STEP_EVAL_API_KEY. Optional: STEP_EVAL_MODEL, STEP_EVAL_RUNS, STEP_EVAL_ONLY.',
    );
    process.exit(2);
  }
  const runs = Math.max(1, Math.min(10, Number(process.env.STEP_EVAL_RUNS || 3)));
  const only = (process.env.STEP_EVAL_ONLY || '').split(',').filter(Boolean);
  const golden = JSON.parse(await readFile(join(here, 'golden.json'), 'utf8'));
  const scenarios: Scenario[] = golden.scenarios.filter((s: Scenario) => !only.length || only.includes(s.id));

  const importRoot = (path: string) => import(new URL(`../../${path}`, import.meta.url).href);
  const routing: any = await importRoot('src/modules/router/service.js');
  const routerPolicy: any = await importRoot('src/modules/router/index.js');
  const privacy: any = await importRoot('src/modules/privacy/index.js');
  const documents: any = await importRoot('src/modules/privacy/document.js');
  const outputs: any = await importRoot('src/modules/output-manager.js');
  const harness: Harness = {
    root,
    route: routing.queryStepRouter,
    contextPolicy: routerPolicy.classifyContextPolicy,
    privacy: privacy.evaluatePrivacyGate,
    skillMetadata: async (id: string) => {
      const m = await routing.loadSkillContextMetadata(id);
      return { ...m, mandatoryReferences: await routing.loadDocumentContextMetadata(m.mandatory) };
    },
    documentPrivacy: documents.evaluateDocumentPrivacy,
    nextOutput: outputs.getNextOutputPath,
  };

  const requireModule = createRequire(import.meta.url);
  const executable =
    provider === 'openai'
      ? requireModule.resolve('@openai/codex/bin/codex.js')
      : provider === 'gemini'
        ? requireModule.resolve('@google/gemini-cli/bundle/gemini.js')
        : '';
  const connection: Connection = {
    id: 'eval',
    provider,
    mode: 'api',
    model: process.env.STEP_EVAL_MODEL || '',
    executable,
    ready: true,
    note: '',
  };
  const home = await mkdtemp(join(tmpdir(), 'step-eval-'));
  const { cwd, env } = await isolatedRuntimeHome(home, connection);
  const runtime = async () => ({ adapter: adapter(provider), context: { cwd, env, key } });

  const results = await runGolden({ harness, runtime, connection, scenarios, runs, onProgress: line => console.log(line) });
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

  const git = (args: string[]) => {
    try {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  };
  const revision = git(['rev-parse', '--short', 'HEAD']) + (git(['status', '--porcelain']) ? '-dirty' : '');
  const meta = {
    provider,
    model: connection.model || '(provider default)',
    date: new Date().toISOString(),
    harness: revision,
    skills: await referenceDigest(
      root,
      [...new Set(results.flatMap(r => r.references))].filter(p => existsSync(join(root, p))),
    ),
    runs: String(runs),
  };
  const stamp = meta.date.replace(/[:.]/g, '-');
  const folder = join(here, '..', 'eval-results', `${stamp}-${provider}`);
  await mkdir(folder, { recursive: true });
  for (const r of results) await writeFile(join(folder, `${r.scenario}-run${r.run}.md`), r.output || '(no draft)\n', 'utf8');
  await writeFile(join(folder, 'results.json'), JSON.stringify({ meta, results: results.map(({ output, ...rest }) => rest) }, null, 2));
  await writeFile(join(folder, 'report.md'), report(meta, results, scenarios), 'utf8');
  const failed = results.filter(r => !r.criticalPassed).length;
  console.log(`\n${results.length - failed}/${results.length} runs passed every critical gate. Report: ${join(folder, 'report.md')}`);
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
