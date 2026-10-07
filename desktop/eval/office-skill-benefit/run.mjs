import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Budget } from './budget.mjs';
import { safeSummary } from './summary.mjs';
const root = process.env.STEP_EVAL_REPO,
  base = process.env.STEP_EVAL_OUTPUT,
  kit = process.env.STEP_EVAL_KIT;
if (!root || !base || !kit) throw new Error('USE_EVAL_LAUNCHER');
const repoModule = p => pathToFileURL(join(root, p)).href;
const { Store } = await import(repoModule('desktop/electron/store.ts'));
const { WorkService } = await import(repoModule('desktop/electron/service.ts'));
const { Workbench } = await import(repoModule('desktop/electron/workbench.ts'));
const { DesktopTools } = await import(repoModule('desktop/electron/tools.ts'));
const { Approvals } = await import(repoModule('desktop/electron/approvals.ts'));
const { Questions } = await import(repoModule('desktop/electron/questions.ts'));
const { ToolGate } = await import(repoModule('desktop/electron/tool-gate.ts'));
const { defaultPolicy } = await import(repoModule('desktop/electron/policy.ts'));
const { CodexAdapter, createRpc, initialize } = await import(repoModule('desktop/electron/providers.ts'));
const { sheetWorker } = await import(repoModule('desktop/electron/sheets.ts'));
const { evaluatePrivacyGate } = await import(repoModule('src/modules/privacy/index.js'));
const require2 = createRequire(join(root, 'desktop/package.json'));
const ExcelJS = require2('exceljs'),
  JSZip = require2('jszip');
const executable = join(kit, 'guarded-codex.mjs');
const worker = join(root, 'desktop/electron/sheet-worker.cjs');
const tasks = await Promise.all(
  [
    {
      id: 'xlsx',
      skill: 'spreadsheet-work',
      skillPath: 'skills/common/spreadsheet-work/SKILL.md',
      references: ['skills/common/spreadsheet-work/references/office-tools.md'],
    },
    {
      id: 'pptx',
      skill: 'presentation-design',
      skillPath: 'skills/creative/presentation-design/SKILL.md',
      references: ['skills/creative/presentation-design/references/editable-pptx.md'],
    },
    { id: 'memo', skill: 'decision-memo', skillPath: 'skills/pm/decision-memo/SKILL.md', references: ['docs/document-coauthoring.md'] },
  ].map(async task => {
    const spec = JSON.parse(await readFile(join(root, 'evals/skills', task.skill + '.json'), 'utf8'));
    const c2 = spec.cases.find(c3 => c3.id === 'positive-workflow');
    if (!c2?.prompt || !c2.outputAssertions?.length) throw new Error('SYNTHETIC_EVAL_CASE_REQUIRED');
    return { ...task, prompt: c2.prompt, outputAssertions: c2.outputAssertions };
  }),
);
async function verify(task, workspace, output) {
  if (task.id === 'xlsx') {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await readFile(join(workspace, 'office.xlsx')));
    const s = book.getWorksheet('\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25');
    return {
      artifactVerified: Boolean(
        s &&
        s.getCell('A2').value === '00123' &&
        s.getCell('A3').value === '00007' &&
        s.getCell('B2').value === 100 &&
        s.getCell('B3').value === 200 &&
        String(s.getCell('B4').value?.formula || '')
          .replace(/^=/, '')
          .toUpperCase() === 'SUM(B2:B3)',
      ),
      recalculation: 'not-run',
    };
  }
  if (task.id === 'pptx') {
    const z = await JSZip.loadAsync(await readFile(join(workspace, 'office.pptx')));
    const slides = Object.keys(z.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p));
    const xml = await Promise.all(slides.map(p => z.file(p).async('string')));
    const notes = Object.keys(z.files).filter(p => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p));
    const notesText = await Promise.all(notes.map(p => z.file(p).async('string')));
    return {
      artifactVerified:
        slides.length === 3 &&
        xml.some(x => x.includes('\u0E04\u0E27\u0E32\u0E21\u0E04\u0E37\u0E1A\u0E2B\u0E19\u0E49\u0E32')) &&
        xml.some(x => x.includes('<a:tbl>')) &&
        Boolean(z.file('ppt/charts/chart1.xml')) &&
        notes.length === 3 &&
        notesText.every(x =>
          x.includes('\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2A\u0E31\u0E07\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C'),
        ),
      visualReview: 'not-run',
    };
  }
  return {
    artifactVerified: null,
    checks: {
      pendingFacts: output.includes('\u0E23\u0E2D\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19'),
      comparesChoices: /100/.test(output) && /200/.test(output),
      readerEvidence: /ผู้อ่าน/.test(output) && /gap|ขาด|ยังไม่|รอยืนยัน/i.test(output),
    },
    semanticReview: 'pending-human-review',
  };
}
async function selfTest() {
  const workspace = await mkdtemp(join(base, 'self-test-'));
  const v = await sheetWorker(
    Buffer.alloc(0),
    {
      operation: 'sheet_create',
      spec: {
        sheets: [
          {
            name: '\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25',
            columns: [
              { label: '\u0E23\u0E2B\u0E31\u0E2A', type: 'text' },
              { label: '\u0E04\u0E48\u0E32\u0E43\u0E0A\u0E49\u0E08\u0E48\u0E32\u0E22', type: 'currency' },
            ],
            rows: [
              ['00123', 100],
              ['00007', 200],
            ],
            formulas: [{ cell: 'B4', formula: 'SUM(B2:B3)' }],
          },
        ],
      },
    },
    new AbortController().signal,
    worker,
  );
  await writeFile(join(workspace, 'office.xlsx'), Buffer.from(v.binary, 'base64'));
  assert.equal((await verify(tasks[0], workspace, '')).artifactVerified, true);
  const b = new ExcelJS.Workbook();
  await b.xlsx.load(await readFile(join(workspace, 'office.xlsx')));
  b.worksheets[0].getCell('A2').value = 123;
  await writeFile(join(workspace, 'office.xlsx'), await b.xlsx.writeBuffer());
  assert.equal((await verify(tasks[0], workspace, '')).artifactVerified, false);
  const p = await sheetWorker(
    Buffer.alloc(0),
    {
      operation: 'slides_create',
      spec: {
        slides: [
          {
            title: '\u0E04\u0E27\u0E32\u0E21\u0E04\u0E37\u0E1A\u0E2B\u0E19\u0E49\u0E32',
            bullets: ['\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E41\u0E25\u0E49\u0E27\u0E2A\u0E2D\u0E07\u0E02\u0E31\u0E49\u0E19\u0E15\u0E2D\u0E19'],
            notes: '\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2A\u0E31\u0E07\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C',
          },
          {
            title: '\u0E15\u0E32\u0E23\u0E32\u0E07',
            table: {
              headers: ['\u0E07\u0E32\u0E19', '\u0E2A\u0E16\u0E32\u0E19\u0E30'],
              rows: [['\u0E17\u0E14\u0E2A\u0E2D\u0E1A', '\u0E23\u0E48\u0E32\u0E07']],
            },
            notes: '\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2A\u0E31\u0E07\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C',
          },
          {
            title: '\u0E01\u0E23\u0E32\u0E1F',
            chart: {
              type: 'bar',
              categories: ['\u0E23\u0E2D\u0E1A\u0E41\u0E23\u0E01', '\u0E23\u0E2D\u0E1A\u0E2A\u0E2D\u0E07'],
              series: [{ name: '\u0E08\u0E33\u0E19\u0E27\u0E19', values: [2, 3] }],
            },
            notes: '\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2A\u0E31\u0E07\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C',
          },
        ],
      },
    },
    new AbortController().signal,
    worker,
  );
  await writeFile(join(workspace, 'office.pptx'), Buffer.from(p.binary, 'base64'));
  assert.equal((await verify(tasks[1], workspace, '')).artifactVerified, true);
  const z = await JSZip.loadAsync(Buffer.from(p.binary, 'base64'));
  z.remove('ppt/charts/chart1.xml');
  await writeFile(join(workspace, 'office.pptx'), await z.generateAsync({ type: 'nodebuffer' }));
  assert.equal((await verify(tasks[1], workspace, '')).artifactVerified, false);
  await writeFile(join(workspace, 'office.xlsx'), Buffer.from(v.binary, 'base64'));
  await writeFile(join(workspace, 'office.pptx'), Buffer.from(p.binary, 'base64'));
  console.log(JSON.stringify({ selfTest: 'passed', positiveAndNegativeArtifactChecks: 4, modelCalls: 0, syntheticArtifacts: workspace }));
}
if (process.argv.includes('--self-test')) {
  await selfTest();
  process.exit(0);
}
const c = { id: 'codex-oauth-eval', provider: 'openai', mode: 'subscription', model: '', executable, ready: true, note: '' };
async function backendModels() {
  const rpc = createRpc(c, { cwd: base, env: { ...process.env } });
  try {
    await initialize(rpc, 'openai');
    const account = await rpc.request('account/read', { refreshToken: true }, 3e4);
    if (account.account?.type !== 'chatgpt') throw new Error('CHATGPT_OAUTH_REQUIRED');
    await rpc.request('account/rateLimits/read', {}, 2e4);
    const models2 = [];
    let cursor;
    const seen = /* @__PURE__ */ new Set();
    do {
      const page = await rpc.request('model/list', { limit: 100, ...(cursor ? { cursor } : {}) }, 2e4);
      for (const m of page.data || []) {
        const id = m.model || m.id;
        if (id && !seen.has(id)) {
          models2.push(m);
          seen.add(id);
        }
      }
      const next = page.nextCursor || void 0;
      if (next && next === cursor) throw new Error('MODEL_LIST_CURSOR_STALLED');
      cursor = next;
    } while (cursor);
    if (!models2.length) throw new Error('NO_ACCOUNT_MODELS');
    return models2;
  } catch (e) {
    const lines = rpc.stderrTail().join('\n');
    const code = /401|unauthorized|token|refresh|login|sign.?in/i.test(lines)
      ? 'OAUTH_REAUTH_REQUIRED'
      : /403|forbidden/i.test(lines)
        ? 'NETWORK_OR_PERMISSION_DENIED'
        : 'BACKEND_CHECK_FAILED';
    console.error(
      JSON.stringify({ backendAuthenticated: false, code, httpStatus: lines.match(/failed: (\d{3})/)?.[1] ?? null, modelPrompts: 0 }),
    );
    throw new Error(code);
  } finally {
    await rpc.closeAndWait();
  }
}
let models = [];
try {
  models = await backendModels();
} catch {
  process.exit(1);
}
if (process.argv.includes('--probe')) {
  console.log(
    JSON.stringify({ backendAuthenticated: true, accountType: 'chatgpt', models: models.map(m => m.model || m.id), modelPrompts: 0 }),
  );
  process.exit(0);
}
if (!process.argv.includes('--live')) throw new Error('LIVE_FLAG_REQUIRED');
const budget = await Budget.open(base, JSON.parse(process.env.STEP_EVAL_PRIOR_CALLS || '{}'));
if (budget.data.inFlight) {
  const pending = budget.data.inFlight;
  await budget.finish(pending.trial, {
    status: 'interrupted',
    code: 'PREVIOUS_ATTEMPT_INTERRUPTED',
    model: pending.model,
    modelCalls: 0,
    reservedCallsAlreadyCounted: true,
  });
}
const priorCalls = new Map(Object.entries(budget.data.modelCalls));
const abortAll = new AbortController();
process.on('SIGINT', () => abortAll.abort());
process.on('SIGTERM', () => abortAll.abort());
const runRoot = await mkdtemp(join(base, 'live-'));
await mkdir(join(runRoot, 'trials'));
const report = {
  recordedAt: /* @__PURE__ */ new Date().toISOString(),
  provider: 'openai',
  auth: 'chatgpt-oauth',
  synthetic: true,
  pairedRoundsPerModel: 3,
  maxModelCallsPerModel: 18,
  modelJudgeCalls: 0,
  nativeTools: 'disabled',
  isolation: 'fresh stores, workspaces and ephemeral threads; authentication profile reused without copying',
  models: models.map(m => m.model || m.id),
  trials: [],
  modelBenefitEstablished: false,
  limitations: [
    'One paired sample per task/model; no statistical quality guarantee.',
    'Memo checks are heuristics; human semantic review remains pending.',
    'Recalculation/visual rendering and real Office documents were not tested.',
    'Token usage before this ledger is not measured; the 120000-token threshold stops admission of subsequent calls and is not a hard generation-token cap.',
  ],
};
await writeFile(join(runRoot, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ runRoot, models: report.models, pairedRoundsPerModel: 3, maxModelCallsPerModel: 18 }));
report.priorAttemptedCalls = Object.fromEntries(priorCalls);
report.initialReservations = budget.data.initialReservations;
report.source = { head: process.env.STEP_EVAL_SOURCE_HEAD || 'unknown', trackedChanges: process.env.STEP_EVAL_SOURCE_DIRTY === 'true' };
let globalStop = false;
for (const model of models) {
  if (globalStop || abortAll.signal.aborted) break;
  let calls = budget.calls(model.model || model.id),
    tokens = budget.tokens(model.model || model.id),
    stopModel = false;
  const modelId = model.model || model.id;
  const effort = (model.supportedReasoningEfforts || []).some(e => e.reasoningEffort === 'low')
    ? 'low'
    : model.defaultReasoningEffort || 'medium';
  for (const [taskIndex, task] of tasks.entries()) {
    if (stopModel || globalStop || abortAll.signal.aborted) break;
    const order = (models.indexOf(model) + taskIndex) % 2 ? ['without-skill', 'with-skill'] : ['with-skill', 'without-skill'];
    for (const arm of order) {
      if (stopModel || globalStop || abortAll.signal.aborted) break;
      const trialKey = JSON.stringify([modelId, task.id, arm]);
      if (budget.hasTrial(trialKey)) {
        const previous = budget.data.trials[trialKey];
        report.trials.push({
          ...previous,
          model: modelId,
          task: task.id,
          arm,
          resumed: true,
          previousModelCalls: previous.modelCalls,
          modelCalls: 0,
        });
        continue;
      }
      const safeModel = modelId.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 60);
      const workspace = await mkdtemp(join(runRoot, 'trials/', `${safeModel}-${task.id}-${arm}-`));
      const store = new Store(':memory:');
      store.put('connection', c.id, { ...c, model: modelId });
      store.put('settings', 'main', { workspace, team: 'cc' });
      const session = store.create(c.id, 'cc');
      const policy = defaultPolicy();
      const workbench = new Workbench(store, void 0, () => policy);
      const approvals = new Approvals(store, r => {
        if (r) queueMicrotask(() => approvals.respond(r.id, 'once'));
      });
      const questions = new Questions(event => {
        if (event.type === 'question' && event.question)
          queueMicrotask(() =>
            questions.respond(
              event.question.id,
              '\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E35\u0E48\u0E02\u0E32\u0E14\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E17\u0E23\u0E32\u0E1A \u0E43\u0E2B\u0E49\u0E15\u0E34\u0E14\u0E23\u0E2D\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E41\u0E25\u0E30\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E23\u0E48\u0E32\u0E07\u0E15\u0E32\u0E21\u0E17\u0E35\u0E48\u0E02\u0E2D',
            ),
          );
      });
      const gate = new ToolGate(
        () => policy,
        () => 'acceptEdits',
        () => workbench.root(),
        approvals,
        async () => ({ blocked: false, reason: '', results: [] }),
      );
      let tools;
      let usageWrites = Promise.resolve();
      const requests = [];
      let statusCode = '',
        trialCalls = 0;
      const harness = {
        root,
        route: async () => ({ routingContract: { mode: 'GENERAL', authority: { status: 'ALLOW' }, mandatoryReferences: [] } }),
        contextPolicy: () => ({ history: 'ignore', carryover: false }),
        privacy: evaluatePrivacyGate,
        skillMetadata: async () => null,
        documentPrivacy: async () => null,
        nextOutput: async () => null,
        toolLoop: () => true,
        permissionMode: () => 'acceptEdits',
        tools: async scope => {
          const host = await tools.host(scope);
          return {
            ...host,
            readOnly: host.readOnly.bind(host),
            execute: async (r, s) => {
              if (!['sheet_create', 'sheet_read', 'slides_create', 'ask_user'].includes(r.tool)) throw new Error('EVAL_TOOL_DISABLED');
              const record = { tool: r.tool, input: r.input, args: r.args };
              requests.push(record);
              try {
                const result = await host.execute(r, s);
                record.result = result;
                return result;
              } catch (e) {
                record.error = e instanceof Error ? e.message : 'TOOL_FAILED';
                throw e;
              }
            },
          };
        },
      };
      tools = new DesktopTools(
        workbench,
        harness,
        gate,
        approvals,
        questions,
        () => policy,
        () => 'acceptEdits',
        worker,
      );
      const instructions =
        arm === 'with-skill' ? await Promise.all([task.skillPath, ...task.references].map(f => readFile(join(root, f), 'utf8'))) : [];
      const selected = new CodexAdapter();
      const runtime = async () => ({
        context: { cwd: workspace, env: { ...process.env }, effort },
        adapter: {
          run: async (prompt, connection, context) => {
            await usageWrites;
            if (trialCalls >= 3) throw new Error('EVAL_TRIAL_CALL_BOUND');
            await budget.reserve(modelId, trialKey);
            calls = budget.calls(modelId);
            trialCalls++;
            report.inFlight = {
              model: modelId,
              task: task.id,
              arm,
              modelCalls: trialCalls,
              totalCallsForModel: calls,
              startedAt: /* @__PURE__ */ new Date().toISOString(),
            };
            await writeFile(join(runRoot, 'report.json'), JSON.stringify(report, null, 2));
            const stop = AbortSignal.any([context.signal, abortAll.signal, AbortSignal.timeout(12e4)]);
            let lastUsageTotal = 0;
            return selected.run(prompt, connection, {
              ...context,
              session: void 0,
              signal: stop,
              effort,
              system:
                (context.system || '') +
                '\n\nThe evaluation exposes only sheet_create, sheet_read, slides_create and ask_user. All other host tools are unavailable in both arms. Use only synthetic task data. Keep the final response concise.' +
                (instructions.length ? '\n\n<skill_instructions>\n' + instructions.join('\n\n') + '\n</skill_instructions>' : ''),
              onUsage: u => {
                const current = Math.max(lastUsageTotal, u.total || 0),
                  delta = current - lastUsageTotal;
                lastUsageTotal = current;
                if (delta) usageWrites = usageWrites.then(() => budget.usage(modelId, delta));
                tokens = budget.tokens(modelId) + delta;
                context.onUsage?.(u);
              },
            });
          },
        },
      });
      const service = new WorkService(
        store,
        harness,
        runtime,
        event => {
          if (event.type === 'failed') statusCode = event.text || 'RUN_FAILED';
        },
        void 0,
        void 0,
        [],
      );
      const started = Date.now();
      try {
        // Explicit --live authorizes transmission of these built-in public
        // synthetic cases. Use the host review flag; its credential blocks
        // and masking still apply, and application policy stays unchanged.
        await service.run(session.id, task.prompt, '', true, void 0, 'chat');
      } catch (e) {
        statusCode = e instanceof Error ? e.message : 'RUN_FAILED';
      }
      try {
        await usageWrites;
      } catch {
        statusCode = 'BUDGET_WRITE_FAILED';
        globalStop = true;
      }
      const done = store.session(session.id),
        output = done.messages.filter(m => m.role === 'assistant').at(-1)?.text || done.proposals.at(-1)?.text || '';
      if (done.status !== 'review' && !statusCode)
        statusCode = done.messages.filter(m => m.role === 'status').at(-1)?.text || 'RUN_NOT_REVIEW';
      let verified;
      try {
        verified = await verify(task, workspace, output);
      } catch {
        verified = { artifactVerified: false, reason: 'ARTIFACT_MISSING_OR_INVALID' };
      }
      const trial = {
        model: modelId,
        effort,
        round: taskIndex + 1,
        task: task.id,
        skill: task.skill,
        arm,
        sessionId: session.id,
        status: done.status,
        code: statusCode || void 0,
        modelCalls: trialCalls,
        usage: done.usage,
        durationMs: Date.now() - started,
        verified,
        workspace,
        output,
        requests,
        outputAssertions: task.outputAssertions,
      };
      await writeFile(join(workspace, 'recording.json'), JSON.stringify(trial, null, 2));
      await budget.finish(trialKey, {
        model: modelId,
        round: trial.round,
        task: task.id,
        skill: task.skill,
        arm,
        status: trial.status,
        code: trial.code,
        modelCalls: trial.modelCalls,
        verified,
        recording: relative(base, join(workspace, 'recording.json')),
      });
      report.trials.push(trial);
      delete report.inFlight;
      await writeFile(join(runRoot, 'report.json'), JSON.stringify(report, null, 2));
      console.log(
        JSON.stringify({
          model: modelId,
          round: trial.round,
          task: task.id,
          arm,
          status: done.status,
          code: statusCode || void 0,
          modelCalls: trialCalls,
          verified,
        }),
      );
      if (
        [
          'LOGIN_REQUIRED',
          'PROVIDER_QUOTA',
          'PROVIDER_PERMISSION_DENIED',
          'PROVIDER_TIMEOUT',
          'PROVIDER_NETWORK',
          'PROVIDER_NETWORK_FAILED',
          'PROVIDER_REQUEST_FAILED',
          'PROVIDER_BUSY',
          'BUDGET_WRITE_FAILED',
          'CANCELLED',
        ].includes(statusCode)
      ) {
        stopModel = true;
        globalStop = true;
      }
      if (['MODEL_NOT_AVAILABLE', 'EVAL_QUOTA_BOUND', 'PROMPT_TOO_LONG'].includes(statusCode) || calls >= 18 || tokens >= 12e4)
        stopModel = true;
      approvals.close();
      questions.close();
      store.close();
    }
  }
}
report.totalModelCalls = report.trials.reduce((n, t) => n + t.modelCalls, 0);
report.finishedAt = /* @__PURE__ */ new Date().toISOString();
report.cumulativeAdmittedCalls = budget.data.modelCalls;
report.usageAdmissionThreshold = 12e4;
report.liveEvaluationComplete = report.trials.length === models.length * 6;
report.stoppedEarly = !report.liveEvaluationComplete;
await writeFile(join(runRoot, 'report.json'), JSON.stringify(report, null, 2));
await writeFile(join(runRoot, 'summary.json'), JSON.stringify(safeSummary(report), null, 2));
console.log(
  JSON.stringify({
    report: join(runRoot, 'report.json'),
    summary: join(runRoot, 'summary.json'),
    trials: report.trials.length,
    totalModelCalls: report.totalModelCalls,
    modelBenefitEstablished: false,
  }),
);
