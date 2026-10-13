import { readFile, writeFile, mkdir, mkdtemp, open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { CodexAdapter, ClaudeAdapter, ProviderSession, closeClaudeSpares } from '../../electron/providers.ts';
import { AntigravityAdapter } from '../../electron/antigravity.ts';
import { ToolLoop } from '../../electron/tool-loop.ts';
import { evaluatePrivacyGate } from '../../../src/modules/privacy/index.js';
import { ParityBudget } from './budget.mjs';
import { trialHost } from './host.mjs';
import { nativeClaude, nativeCodex, observeClaudeSdk } from './native.mjs';
import { nativeAntigravity } from './agy.mjs';
import { PROMPT, RULES, SOURCE, SEED, TEXT_PROTOCOL, NATIVE_PROTOCOL, hash, verify, metrics } from './spec.mjs';
import { runtimeEnv, desktopData, containsPath, resolvedDestination } from '../office-skill-benefit/config.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');
const args = process.argv.slice(2);
const continueAccounted = args.includes('--continue-accounted');
const protocol = args.includes('--protocol-test');
const live = args.includes('--live'),
  self = args.includes('--self-test');
let output = join(root, 'output/CC/2026/10/harness-parity');
const outIndex = args.indexOf('--output');
if (outIndex >= 0 && (!args[outIndex + 1] || args[outIndex + 1].startsWith('--'))) throw new Error('OUTPUT_REQUIRED');
if (
  ['--live', '--probe', '--self-test', '--protocol-test'].filter(flag => args.includes(flag)).length !== 1 ||
  (continueAccounted && !live)
)
  throw new Error('CHOOSE_ONE_MODE');
if (outIndex >= 0) output = resolve(args[outIndex + 1]);
if (
  args.some(
    (arg, i) =>
      !['--live', '--probe', '--self-test', '--protocol-test', '--output', '--continue-accounted'].includes(arg) &&
      !(outIndex >= 0 && i === outIndex + 1),
  )
)
  throw new Error('INVALID_ARGUMENT');
if (!live && !self && !protocol && !args.includes('--probe')) throw new Error('CHOOSE_LIVE_PROBE_OR_SELF_TEST');
output = resolvedDestination(output);
await mkdir(output, { recursive: true });
const fingerprints = {};
for (const path of [
  'manifest/documents.yaml',
  SOURCE,
  'skills/pm/decision-memo/SKILL.md',
  'skills/common/spreadsheet-work/SKILL.md',
  'desktop/electron/providers.ts',
  'desktop/electron/antigravity.ts',
  'desktop/electron/tools.ts',
  'desktop/electron/tool-loop.ts',
  'desktop/electron/workbench.ts',
  'desktop/electron/policy.ts',
  'desktop/electron/sheet-worker.cjs',
  ...['run', 'host', 'spec', 'budget', 'native', 'agy', 'stdio'].map(name => `desktop/eval/harness-parity/${name}.mjs`),
])
  fingerprints[path] = hash(await readFile(join(root, path)));
const skill = (
  await Promise.all(
    ['skills/pm/decision-memo/SKILL.md', 'skills/common/spreadsheet-work/SKILL.md'].map(path => readFile(join(root, path), 'utf8')),
  )
).join('\n\n');
const system = RULES + '\n<skill_instructions>\n' + skill + '\n</skill_instructions>';
if (evaluatePrivacyGate(PROMPT + system).action === 'block-external') throw new Error('EVAL_PRIVACY_BLOCKED');

if (self) {
  const folder = await mkdtemp(join(output, 'self-test-'));
  await writeFile(join(folder, 'recovery.md'), SEED);
  const controller = new AbortController();
  const host = await trialHost(
    root,
    folder,
    { id: 'synthetic-parity', provider: 'openai', mode: 'subscription', model: 'synthetic', executable: '', ready: true, note: '' },
    controller.signal,
  );
  try {
    const call = async (tool, input, args = {}, content = '') => host.native({ tool, input, argsJson: JSON.stringify(args), content });
    if (!(await call('reference', 'step-public-profile')).ok) throw new Error('SOURCE_TOOL_FAILED');
    const brief =
      'อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่\nMake Innovation Simple\nข้อมูลสาธารณะไม่ใช่สิทธิ์อนุมัติ\nจำนวนพนักงานปี 2026: รอยืนยัน\n[STeP Public Profile](docs/knowledge/step-public-profile.md)\n';
    if (!(await call('changes', 'brief.md', { action: 'stage' }, brief)).ok) throw new Error('WRITE_TOOL_FAILED');
    const spec = {
      sheets: [
        {
          name: 'ข้อมูล',
          columns: [
            { label: 'รหัส', type: 'text' },
            { label: 'จำนวน', type: 'number' },
          ],
          rows: [
            ['00123', 100],
            ['00007', 200],
            ['รวม', null],
          ],
          formulas: [{ cell: 'B4', formula: 'SUM(B2:B3)' }],
          source: 'ข้อมูลสังเคราะห์สำหรับทดสอบ',
        },
      ],
    };
    if (!(await call('sheet_create', 'budget.xlsx', { spec })).ok) throw new Error('SHEET_TOOL_FAILED');
    await call('sheet_read', 'budget.xlsx', { sheet: 'ข้อมูล', range: 'A1:B4' });
    const first = await call('files', 'recovery.md', { action: 'read' });
    if (first.code !== 'FILE_BUSY_ONCE') throw new Error('FAULT_NOT_INJECTED');
    const read = await call('files', 'recovery.md', { action: 'read' });
    const patch = { old_string: 'สถานะ: รอดำเนินการ', new_string: 'สถานะ: เสร็จแล้ว', expectedHash: read.result.hash };
    const conflict = await call('patch', 'recovery.md', patch);
    if (conflict.code !== 'FILE_CONFLICT') throw new Error('CONFLICT_NOT_GUARDED');
    patch.expectedHash = (await call('files', 'recovery.md', { action: 'read' })).result.hash;
    if (!(await call('patch', 'recovery.md', patch)).ok) throw new Error('RECOVERY_FAILED');
    const positive = await verify(folder, host.records, ExcelJS);
    if (positive.completed !== 3) throw new Error('POSITIVE_CHECK_FAILED');
    await writeFile(join(folder, 'brief.md'), brief.replace('Make Innovation Simple', 'Invented tagline'));
    const negative = await verify(folder, host.records, ExcelJS);
    if (negative.checks.evidenceMemo) throw new Error('NEGATIVE_CHECK_FAILED');
    await writeFile(join(folder, 'brief.md'), brief);
    console.log(
      JSON.stringify({ selfTest: 'passed', realHost: true, completed: positive.completed, ...metrics(host.records), modelCalls: 0 }),
    );
  } finally {
    await host.close();
  }
  process.exitCode = 0;
} else {
  const data = desktopData({});
  const db = new DatabaseSync(join(data, 'workspace.sqlite'), { readOnly: true });
  const connections = db
    .prepare("SELECT value FROM records WHERE kind='connection' ORDER BY id")
    .all()
    .map(row => JSON.parse(row.value));
  db.close();
  const selected = ['claude', 'openai', 'antigravity'].map(provider => {
    const rows = connections.filter(c => c.provider === provider && c.mode === 'subscription' && c.ready && c.signedIn);
    if (rows.length !== 1) throw new Error('ONE_READY_CONNECTION_PER_PROVIDER_REQUIRED');
    const connection = { ...rows[0] };
    // Pin the same catalog model in both arms; Claude's selected default is
    // resolved by the CLI and its actual model is recorded from SDK init.
    connection.model ||= 'default';
    const profile = join(data, 'runtimes', connection.id);
    if (containsPath(profile, output) || containsPath(output, profile)) throw new Error('OUTPUT_AUTH_PROFILE_OVERLAP');
    return { connection, profile };
  });
  const contextKey = hash(
    JSON.stringify({
      fingerprints,
      prompt: PROMPT,
      system,
      models: selected.map(({ connection }) => [connection.provider, connection.model, connection.executable]),
      tokenLimit: 300000,
    }),
  );
  const manifest = {
    schema: 1,
    contextKey,
    taskCount: 3,
    repetitions: 1,
    models: selected.map(({ connection }) => ({
      provider: connection.provider,
      selectedModel: connection.model,
      executable: connection.executable,
      effort: 'low',
    })),
    fingerprints,
    tokenLimit: 300000,
    prompt: PROMPT,
    hostTools: ['reference', 'files', 'changes', 'patch', 'sheet_create', 'sheet_read'],
    caching: 'provider defaults; unchanged',
    nativeSurface: 'one structured step_host bridge; argsJson uses the same host argument validation',
    sources: [{ id: 'step-public-profile', path: SOURCE, sha256: fingerprints[SOURCE] }],
    limits: [
      'Single repetition of a three-task pack: directional evidence only, no statistical ranking.',
      'Baseline uses existing provider adapters + ToolLoop with a fixed scoped prompt, not the full UI routing path.',
      'Native tools retain host gates; provider built-ins remain disabled.',
      'Budget uses conservative reservations and stops on missing usage. SDK/CLI counters are not billing statements; unseen provider helper calls cannot be bounded by this host.',
      'No formula recalculation or visual/typographic document review. Semantic checks cover specified facts only.',
    ],
  };
  if (protocol) {
    const { connection, profile } = selected.find(s => s.connection.provider === 'openai');
    const result = await nativeCodex(
      '',
      connection,
      { cwd: output, env: runtimeEnv(profile), signal: AbortSignal.timeout(30000), system: RULES, preflightOnly: true },
      async () => {
        throw new Error('NO_MODEL_TURN_ALLOWED');
      },
    );
    await writeFile(
      join(output, 'codex-protocol-preflight.json'),
      JSON.stringify({ ...result, at: new Date().toISOString(), model: connection.model }, null, 2),
    );
    console.log(JSON.stringify(result));
    const agy = selected.find(s => s.connection.provider === 'antigravity');
    let agyResult;
    let diagnostic;
    try {
      agyResult = await nativeAntigravity(
        '',
        agy.connection,
        {
          cwd: output,
          env: runtimeEnv(agy.profile),
          signal: AbortSignal.timeout(30000),
          system: RULES,
          effort: 'low',
          preflightOnly: true,
          onDiagnostic: value => {
            diagnostic = value;
          },
        },
        async () => {
          throw new Error('NO_MODEL_TURN_ALLOWED');
        },
      );
    } catch (e) {
      agyResult = { code: /^[A-Z_]+$/.test(e.message) ? e.message : 'EVAL_PREFLIGHT_FAILED', diagnostic, modelCalls: 0 };
    }
    await writeFile(
      join(output, 'antigravity-protocol-preflight.json'),
      JSON.stringify({ ...agyResult, at: new Date().toISOString() }, null, 2),
    );
    console.log(JSON.stringify(agyResult));
  } else if (!live) {
    console.log(JSON.stringify({ probe: 'ready', models: manifest.models, taskCount: 3, modelCalls: 0, contextKey }));
  } else {
    const lock = await open(join(output, 'eval.lock'), 'wx');
    try {
      const budget = await ParityBudget.open(output);
      let report;
      try {
        report = JSON.parse(await readFile(join(output, 'report.json'), 'utf8'));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      if (report && report.contextKey !== contextKey) {
        const corePaths = Object.keys(fingerprints).filter(path => !/harness-parity\/(run|budget|native|agy)\.mjs$/.test(path));
        if (!continueAccounted || report.prompt !== PROMPT || corePaths.some(path => report.fingerprints[path] !== fingerprints[path]))
          throw new Error('EVAL_CONTEXT_CHANGED');
        (report.revisions ||= []).push({ contextKey: report.contextKey, fingerprints: report.fingerprints });
        report.contextKey = contextKey;
        report.fingerprints = fingerprints;
      }
      report ||= { ...manifest, startedAt: new Date().toISOString(), trials: [] };
      if (continueAccounted)
        await budget.continueAccounted(
          'Continue native experiments within the original 300000 allowance. Retain the full 50000 reservation for the zero-usage Antigravity failure; no tokens restored. Non-Claude native runs are single-call capability probes because the full matrix does not fit the remaining allowance.',
        );
      const priorClaude = report.trials.find(t => t.provider === 'claude' && t.arm === 'baseline');
      if (priorClaude?.observedModels?.length === 1)
        selected.find(s => s.connection.provider === 'claude').connection.model = priorClaude.observedModels[0];
      await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
      const save = async () => {
        report.budget = budget.data;
        await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
        const rows = report.trials.map(
          t =>
            `| ${t.provider} | ${t.observedModels?.length === 1 ? t.observedModels[0] : t.model} | ${t.arm} | ${t.verified?.completed ?? 0}/3 | ${t.metrics.invalidCalls} | ${t.metrics.recoveredErrors}/${t.metrics.injectedErrors} | ${(t.durationMs / 1000).toFixed(1)} | ${t.usage?.total ?? 'ไม่ทราบ'} | ${t.code || 'completed'} |`,
        );
        const text = `# STeP Harness Parity Pilot\n\nเริ่ม ${report.startedAt} · 3 งานต่อรอบ · ทำซ้ำ 1 รอบ · caching ใช้ค่าเดิมของแต่ละค่าย\n\n| ค่าย | โมเดล | ช่องทางเครื่องมือ | งานผ่าน | เรียกผิด | กู้ error/จำลอง | วินาที | tokens ที่รายงาน | สถานะ |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\nBudget charge: ${budget.data.used.toLocaleString('en-US')} / 300,000 tokens (รวมสำรองเต็มเมื่อ usage ไม่ทราบ; Gemini คิดเพิ่ม cache reads เพื่อไม่ประเมินต่ำ)\n\n## วิธีตรวจ\n\nอ่านไฟล์จริง brief.md, budget.xlsx, recovery.md ในแต่ละโฟลเดอร์ ตรวจแหล่งที่อ่านผ่าน reference, ข้อเท็จจริงที่ระบุ, รหัส text, สูตร, การอ่านกลับ และข้อความที่เพิ่มระหว่างแก้ ผลคำตอบโมเดลเพียงอย่างเดียวไม่ถือว่างานเสร็จ\n\n## ข้อจำกัด\n\n${manifest.limits.map(l => '- ' + l).join('\n')}\n\nProtocol references: [Codex dynamic tools](https://learn.chatgpt.com/docs/app-server), [Claude SDK custom tools](https://code.claude.com/docs/en/agent-sdk/custom-tools), [Antigravity MCP](https://antigravity.google/docs/mcp), [headless counters](https://antigravity.google/docs/cli/headless/).\n`;
        await writeFile(join(output, 'summary.md'), text);
      };
      let stop = false;
      await save();
      for (const arm of ['baseline', 'native']) {
        const order = arm === 'native' ? [selected[0], selected[2], selected[1]] : selected;
        for (const { connection, profile } of order) {
          const key = `${connection.provider}-${arm}`;
          if (report.trials.some(t => t.key === key)) continue;
          if (stop) break;
          const workspace = join(output, key);
          await mkdir(workspace, { recursive: true });
          await writeFile(join(workspace, 'recovery.md'), SEED);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 300000);
          const host = await trialHost(root, workspace, connection, controller.signal);
          const session = new ProviderSession();
          let usage,
            outputText = '',
            code;
          const turns = [];
          const observedModels = new Set();
          const probeOnly = arm === 'native' && connection.provider !== 'claude';
          const started = Date.now();
          const env = { ...runtimeEnv(profile), CLAUDE_CONFIG_DIR: join(profile, '.claude') };
          const context = {
            cwd: workspace,
            env,
            system: system + '\n' + (arm === 'baseline' ? TEXT_PROTOCOL : NATIVE_PROTOCOL),
            signal: controller.signal,
            emit: () => {},
            effort: 'low',
            onModel: model => observedModels.add(model),
            probeOnly,
            stopProbe: () => controller.abort(),
          };
          const invoke = async (prompt, run, native = false) => {
            const reservation = await budget.reserve(
              key,
              native ? (probeOnly ? (connection.provider === 'antigravity' ? 25000 : 45000) : 90000) : 50000,
            );
            const turn = { status: 'running' };
            turns.push(turn);
            let observed;
            let budgetObservation;
            try {
              const text = await run(prompt, {
                ...context,
                ...(native ? {} : { session }),
                onBudgetUsage: count => {
                  budgetObservation = count;
                  if (count.total >= reservation.reserved * 0.75) controller.abort();
                },
                allowNextNativeTurn: () =>
                  budgetObservation && budgetObservation.total + budgetObservation.lastInput + 8192 < reservation.reserved,
                onUsage: count => {
                  if (!Number.isSafeInteger(count.total) || count.total < 0) return;
                  observed = Object.fromEntries(
                    ['input', 'output', 'total', 'cachedInput', 'cacheWriteInput']
                      .filter(k => count[k] !== undefined)
                      .map(k => [k, Math.max(observed?.[k] || 0, count[k])]),
                  );
                  // Leave headroom for one in-flight completion and hidden native
                  // overhead; never admit another call after uncertainty.
                  if (count.total + (connection.provider === 'antigravity' ? count.cachedInput || 0 : 0) >= reservation.reserved * 0.75)
                    controller.abort();
                },
              });
              turn.status = 'completed';
              return text;
            } finally {
              turn.usage = observed;
              turn.status = turn.status === 'running' ? 'error' : turn.status;
              const chargedUsage =
                observed && connection.provider === 'antigravity'
                  ? { ...observed, total: observed.total + (observed.cachedInput || 0) }
                  : observed;
              await budget.settle(reservation, chargedUsage, turn.status);
            }
          };
          try {
            console.log(JSON.stringify({ trial: key, stage: 'started', remainingBudget: 300000 - budget.data.used }));
            if (arm === 'baseline') {
              const adapter =
                connection.provider === 'openai'
                  ? new CodexAdapter()
                  : connection.provider === 'claude'
                    ? new ClaudeAdapter(async () => observeClaudeSdk(await import('@anthropic-ai/claude-agent-sdk'), context.onModel))
                    : new AntigravityAdapter();
              outputText = await new ToolLoop(host.host, 7, 10000).run(
                PROMPT,
                prompt => invoke(prompt, (text, ctx) => adapter.run(text, connection, ctx)),
                controller.signal,
              );
            } else {
              const run =
                connection.provider === 'openai' ? nativeCodex : connection.provider === 'claude' ? nativeClaude : nativeAntigravity;
              outputText = await invoke(PROMPT, (text, ctx) => run(text, connection, ctx, host.native), true);
            }
          } catch (e) {
            code = /^[A-Z_]+$/.test(e.message) ? e.message : 'EVAL_RUN_FAILED';
          } finally {
            clearTimeout(timeout);
            await session.closeAndWait();
            closeClaudeSpares(connection.id);
            await host.close();
          }
          const known = turns.filter(t => t.usage);
          if (known.length)
            usage = Object.fromEntries(
              ['input', 'output', 'total', 'cachedInput', 'cacheWriteInput']
                .filter(k => known.some(t => t.usage[k] !== undefined))
                .map(k => [k, known.reduce((n, t) => n + (t.usage[k] || 0), 0)]),
            );
          const verified = await verify(workspace, host.records, ExcelJS);
          const trial = {
            key,
            provider: connection.provider,
            model: connection.model,
            observedModels: [...observedModels],
            arm,
            scope: probeOnly ? 'capability-probe-only' : 'three-task-pack',
            code,
            durationMs: Date.now() - started,
            providerInvocations: turns.length,
            usage,
            usageCoverage: { observed: known.length, admitted: turns.length },
            turns,
            verified,
            metrics: metrics(host.records),
            output: outputText,
            requests: host.records,
            workspace,
          };
          await writeFile(join(workspace, 'recording.json'), JSON.stringify(trial, null, 2));
          report.trials.push(trial);
          // Resolve the selected default once, then use that exact model for
          // its native arm. Never compare a moving default with a new model.
          if (connection.provider === 'claude' && arm === 'baseline' && observedModels.size === 1)
            connection.model = [...observedModels][0];
          await save();
          console.log(
            JSON.stringify({
              trial: key,
              stage: 'finished',
              completed: verified.completed,
              code,
              tokens: usage?.total,
              chargedTotal: budget.data.used,
              ...trial.metrics,
            }),
          );
          stop = budget.blocked() || code === 'TOKEN_BUDGET_STOP';
        }
      }
      report.finishedAt = new Date().toISOString();
      report.stopped = stop;
      await save();
    } finally {
      await lock.close();
      const { unlink } = await import('node:fs/promises');
      await unlink(join(output, 'eval.lock'));
    }
  }
}
