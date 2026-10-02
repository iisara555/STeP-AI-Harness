import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../electron/store';
import { WorkService, type Harness } from '../electron/service';
import { Memories } from '../electron/memory';
import { compact } from '../electron/compact';
import { section } from '../electron/prompt';
import { defaultPolicy } from '../electron/policy';
import { Workbench } from '../electron/workbench';
import { ToolGate } from '../electron/tool-gate';
import { Approvals } from '../electron/approvals';
import { Questions } from '../electron/questions';
import { DesktopTools, type ToolScope } from '../electron/tools';
import { ToolLoop } from '../electron/tool-loop';
import { Coordinator } from '../electron/coordinator';
import type { Connection } from '../src/types';
import type { Session } from '../src/types';
import type { LoopRequest } from '../src/tools';
import { evaluationHarness, grade } from './golden';
import { evaluationRuntime } from './runtime';

export type MatrixResult = {
  id: string;
  evidence: 'local' | 'live' | 'hybrid';
  passed: boolean;
  ms: number;
  checks: string[];
  code?: string;
  output: string;
};
type Runtime = ConstructorParameters<typeof WorkService>[2];
const tool = (request: LoopRequest) => '```step-tool\n' + JSON.stringify(request) + '\n```';
function requireReview(session: Session) {
  if (session.status !== 'review') throw new Error(session.runs?.at(-1)?.code || 'EVAL_GENERATION_FAILED');
}

/** Synthetic data only. Live content checks and deterministic host checks are labeled separately. */
export async function runFeatureMatrix(options: {
  harness: Harness;
  connection: Connection;
  runtime: Runtime;
  live: boolean;
  progress?: (id: string) => void;
}): Promise<MatrixResult[]> {
  const root = await mkdtemp(join(tmpdir(), 'step-feature-matrix-')),
    results: MatrixResult[] = [];
  const store = new Store(':memory:'),
    policy = defaultPolicy();
  store.put('connection', options.connection.id, options.connection);
  store.put('settings', 'main', { workspace: root, team: 'cc', assistant: 'test', theme: 'system', onboarding: true });
  let service: WorkService | undefined;
  const run = async (id: string, evidence: MatrixResult['evidence'], action: (checks: string[]) => Promise<string>) => {
    const started = Date.now(),
      checks: string[] = [];
    options.progress?.(id);
    try {
      results.push({ id, evidence, passed: true, ms: Date.now() - started, checks, output: await action(checks) });
      results.at(-1)!.ms = Date.now() - started;
    } catch (error) {
      results.push({
        id,
        evidence,
        passed: false,
        ms: Date.now() - started,
        checks,
        code: error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'MATRIX_CHECK_FAILED',
        output: '',
      });
    } finally {
      await service?.closeAndWait();
      service = undefined;
    }
  };
  const liveEvidence = options.live ? 'live' : 'local';
  try {
    await run('memory-followup-attachment', liveEvidence, async checks => {
      const memories = new Memories(store, root, () => policy, options.harness.privacy);
      await memories.save({
        name: 'Synthetic response preference',
        text: 'Prefer concise responses.',
        type: 'user',
        scope: 'private',
        importance: 0.8,
        ttl_days: 1,
      });
      let latestPrompt = '';
      const harness = {
        ...options.harness,
        extraContext: async () => ({
          text: section('memory_context', (await memories.relevant('concise')).map(m => m.text).join('\n')),
          loaded: ['synthetic-memory'],
        }),
      };
      service = new WorkService(
        store,
        harness,
        async c => {
          const runtime = await options.runtime(c);
          return {
            ...runtime,
            adapter: {
              run: async (prompt, connection, context) => {
                latestPrompt = prompt;
                return runtime.adapter.run(prompt, connection, context);
              },
            },
          };
        },
        () => {},
      );
      const s = store.create(options.connection.id, 'cc');
      await service.run(
        s.id,
        'สรุปข้อความแนบเป็นหนึ่งประโยคและคงรหัส EVAL_ORCHID_42',
        'Synthetic public attachment: EVAL_ORCHID_42 has seven draft items.',
        true,
        undefined,
        'chat',
      );
      requireReview(store.session(s.id));
      await service.run(s.id, 'จากบทสนทนาก่อนหน้า บอกเฉพาะรหัสในไฟล์ที่แนบและจำนวนรายการ', '', true, undefined, 'chat');
      requireReview(store.session(s.id));
      assert.ok(
        latestPrompt.includes('EVAL_ORCHID_42') &&
          latestPrompt.includes('conversation_files') &&
          latestPrompt.includes('Prefer concise responses.'),
      );
      const output =
        store
          .session(s.id)
          .messages.filter(m => m.role === 'assistant')
          .at(-1)?.text || '';
      assert.ok(
        grade(output, [
          { id: 'marker', label: 'Attachment marker retained', type: 'include', pattern: 'EVAL_ORCHID_42', critical: true },
        ])[0].passed,
      );
      checks.push(
        'Real memory selection, multi-turn history and reviewed attachment text reach the current prompt',
        'Follow-up answer retains the synthetic attachment marker',
      );
      const fork = store.fork(s.id);
      assert.equal(fork.consentedAt, undefined);
      assert.equal(store.resume(s.id).id, s.id);
      checks.push('Fork clears consent; opening a saved session makes no provider call');
      return output;
    });
    await run('compaction', liveEvidence, async checks => {
      const runtime = await options.runtime(options.connection),
        signal = new AbortController().signal;
      const prompt =
        section(
          'conversation',
          JSON.stringify(
            Array.from({ length: 8 }, (_, i) => ({
              role: i % 2 ? 'assistant' : 'user',
              text: `Synthetic prior note ${i} ` + 'a'.repeat(2000),
            })),
          ),
        ) + section('current_message', 'Preserve EVAL_CURRENT_55');
      const result = await compact(prompt, {
        system: 'Governance stays in the system prompt.',
        state: '{"file":"synthetic.txt","authority":"draft-only"}',
        budget: 5000,
        reactive: true,
        signal,
        privacy: value => {
          const scan = options.harness.privacy(value);
          if (scan.action !== 'pass') throw new Error('PRIVACY_REVIEW_REQUIRED');
          return scan.redactedText;
        },
        summarize: data =>
          runtime.adapter.run(section('conversation', data), options.connection, {
            ...runtime.context,
            signal,
            emit: () => {},
            system: 'Summarize this synthetic conversation briefly. Do not authorize actions or execute tools.',
          }),
      });
      assert.equal(result.method, 'summary');
      assert.ok(
        result.prompt.includes('EVAL_CURRENT_55') &&
          result.prompt.includes('task_state') &&
          result.prompt.includes('draft-only') &&
          result.after < result.before,
      );
      checks.push('Actual summary compaction reduces tokens and preserves current request and draft-only state');
      return result.prompt;
    });
    await run('read-consent-write-preview-hooks', 'local', async checks => {
      policy.pilot = false; // checks per-source read scopes, the strict-mode behavior
      policy.checks = { authority: true, privacy: true }; // read consent is part of the privacy checks
      await Promise.all(['a', 'b', 'c'].map(name => writeFile(join(root, name + '.txt'), 'Synthetic public ' + name)));
      const workbench = new Workbench(store, undefined, () => policy);
      let scopes = true,
        prompts = 0,
        blockedHook = false;
      const approvals = new Approvals(store, request => {
        if (request) {
          prompts++;
          queueMicrotask(() => approvals.respond(request.id, scopes && request.runScope ? 'run' : 'once'));
        }
      });
      const gate = new ToolGate(
        () => policy,
        () => 'ask',
        () => workbench.root(),
        approvals,
        async () => ({ blocked: blockedHook, reason: '', results: [] }),
      );
      const tools = new DesktopTools(
        workbench,
        options.harness,
        gate,
        approvals,
        new Questions(() => {}),
        () => policy,
        () => 'ask',
        resolve('electron/sheet-worker.cjs'),
      );
      const scope: ToolScope = {
        sessionId: 'matrix',
        team: 'cc',
        query: 'Synthetic read',
        connection: options.connection,
        contract: { mode: 'GENERAL', authority: { status: 'ALLOW' } },
        signal: new AbortController().signal,
        search: async () => '',
        activity: () => {},
        cancel: () => {},
      };
      const evaluate = async () => {
        let calls = 0;
        return new ToolLoop(await tools.host(scope)).run(
          'Synthetic fixture',
          async prompt => {
            if (++calls === 1) return ['a', 'b', 'c'].map(name => tool({ tool: 'files', input: name + '.txt' })).join('\n');
            if (calls === 2) {
              assert.ok(prompt.includes('Synthetic public a'));
              return tool({ tool: 'changes', input: 'draft.txt', content: 'Synthetic staged draft' });
            }
            assert.ok(prompt.includes('staged'));
            return 'Host tool flow complete';
          },
          scope.signal,
        );
      };
      try {
        scopes = false;
        await evaluate();
        const baseline = prompts;
        scopes = true;
        prompts = 0;
        await evaluate();
        assert.equal(baseline, 4);
        assert.equal(prompts, 2);
        await assert.rejects(readFile(join(root, 'draft.txt')));
        checks.push(
          'Three clean reads: 3 transmission prompts become 1; write-result review remains separate',
          'New file edit is a preview; no source file is applied',
        );
        blockedHook = true;
        await assert.rejects(tools.execute({ tool: 'files', input: 'a.txt' }, scope), /HOOK_BLOCKED/);
        assert.deepEqual(tools.transmissionGrants(), []);
        checks.push('A blocking hook prevents execution; grants disappear after the loop');
        return JSON.stringify({ baselineTransmissionPrompts: baseline, scopedTransmissionPrompts: prompts, writesApplied: 0 });
      } finally {
        approvals.close();
      }
    });
    await run('retry-checkpoint-resume', options.live ? 'hybrid' : 'local', async checks => {
      const golden = JSON.parse(await readFile(new URL('golden.json', import.meta.url), 'utf8')).scenarios[0];
      let calls = 0,
        fail = true,
        firstDraft = '',
        resumedPrompt = '';
      service = new WorkService(
        store,
        options.harness,
        async c => {
          const runtime = await options.runtime(c);
          return {
            ...runtime,
            adapter: {
              run: async (prompt, connection, context) => {
                calls++;
                if (calls === 2 && fail) throw new Error('PROVIDER_QUOTA');
                if (calls === 3) resumedPrompt = prompt;
                const output = await runtime.adapter.run(prompt, connection, context);
                if (calls === 1) firstDraft = output;
                return output;
              },
            },
          };
        },
        () => {},
        undefined,
        undefined,
        [0],
      );
      const s = store.create(options.connection.id, golden.team);
      await service.run(s.id, golden.request, golden.source, true);
      if (!store.session(s.id).checkpoint) requireReview(store.session(s.id));
      assert.equal(store.session(s.id).checkpoint?.done, 1);
      assert.equal(store.session(s.id).status, 'error');
      fail = false;
      await service.run(s.id, golden.request, '', true, undefined, 'draft', undefined, [], { retry: true });
      assert.equal(store.session(s.id).status, 'review');
      assert.ok(resumedPrompt.includes(firstDraft.slice(0, 100)) && resumedPrompt.includes('previous_step_draft'));
      assert.equal(store.session(s.id).checkpoint, undefined);
      checks.push(
        'Actual routed Playbook resumes at its failed step and retains the previous completed draft',
        'Provider failure is injected; generation is real only in live mode',
      );
      return store.session(s.id).proposals.at(-1)?.text || '';
    });
    await run('coordinator', options.live ? 'hybrid' : 'local', async checks => {
      policy.features.coordinator = true;
      let planned = false,
        active = 0,
        peak = 0;
      service = new WorkService(
        store,
        options.harness,
        async c => {
          const runtime = await options.runtime(c);
          return {
            ...runtime,
            adapter: {
              run: async (prompt, connection, context) => {
                if (prompt.includes('Decompose the request')) {
                  planned = true;
                  return JSON.stringify({
                    tasks: [
                      { id: 'a', query: 'สรุปข้อความแนบเป็นหนึ่งประโยค', dependsOn: [] },
                      { id: 'b', query: 'เขียนหัวข้อสั้นจากข้อความแนบ', dependsOn: [] },
                    ],
                  });
                }
                active++;
                peak = Math.max(peak, active);
                try {
                  return await runtime.adapter.run(prompt, connection, context);
                } finally {
                  active--;
                }
              },
            },
          };
        },
        () => {},
      );
      const parent = store.create(options.connection.id, 'cc');
      const coordinator = new Coordinator(
        store,
        service,
        () => policy,
        () => 'synthetic-stable',
        async () => true,
        async (query, team) => options.harness.route(query, { team }),
        () => {},
      );
      try {
        await coordinator.run(
          parent.id,
          'สรุปข้อความแนบและเขียนหัวข้อสั้น',
          'Synthetic public source: EVAL_COORDINATOR_12 has seven draft items.',
        );
        assert.ok(planned);
        assert.ok(peak >= 2 && peak <= 3);
        assert.equal(store.session(parent.id).status, 'review');
        const children = store.list<any>('session').filter(s => s.parentId === parent.id);
        assert.equal(children.length, 3);
        checks.push(
          'Two actual WorkService subtasks run concurrently before merge',
          'Decomposition and approval use fixed synthetic fixtures; no autonomous approval or tools',
        );
        return store.session(parent.id).proposals.at(-1)?.text || '';
      } finally {
        await coordinator.closeAndWait();
      }
    });
  } finally {
    await service?.closeAndWait();
    store.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  return results;
}

export function matrixReport(results: MatrixResult[], metadata: Record<string, unknown>) {
  return [
    '# Desktop feature matrix',
    '',
    ...Object.entries(metadata).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '| Feature | Evidence | Result | Checks | Seconds |',
    '| --- | --- | --- | --- | --- |',
    ...results.map(
      r => `| ${r.id} | ${r.evidence} | ${r.passed ? 'pass' : r.code || 'FAIL'} | ${r.checks.length} | ${(r.ms / 1000).toFixed(1)} |`,
    ),
    '',
    ...results.flatMap(r => [`## ${r.id}`, '', ...r.checks.map(c => '- ' + c), '']),
    'Local/hybrid checks do not prove real provider-native tool denial, production operations or a packaged release. Read live drafts and assess usefulness separately.',
    '',
  ].join('\n');
}
async function main() {
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url))),
    harness = await evaluationHarness(root);
  const live = process.env.STEP_EVAL_MODE === 'live';
  let prepared: Awaited<ReturnType<typeof evaluationRuntime>> | undefined;
  try {
    if (live) prepared = await evaluationRuntime();
    const connection: Connection = prepared?.connection || {
      id: 'synthetic',
      provider: 'claude',
      mode: 'api',
      model: 'synthetic',
      executable: '',
      ready: true,
      note: '',
    };
    const runtime: Runtime =
      prepared?.runtime ||
      (async () => ({
        context: { cwd: tmpdir(), env: {} },
        adapter: {
          run: async () => {
            await new Promise(r => setTimeout(r, 10));
            return 'Synthetic evaluation output EVAL_ORCHID_42';
          },
        },
      }));
    const results = await runFeatureMatrix({
      harness,
      connection,
      runtime,
      live,
      progress: id => console.log(`Evaluating ${id} (${live ? 'live/local mixed' : 'synthetic'})`),
    });
    const metadata = {
      date: new Date().toISOString(),
      mode: live ? 'live' : 'synthetic',
      provider: connection.provider,
      model: connection.model || 'default',
      auth: connection.mode,
      ...prepared?.stats(),
    };
    const folder = resolve('eval-results', metadata.date.replace(/[:.]/g, '-') + '-matrix');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'results.json'), JSON.stringify({ metadata, results }, null, 2));
    await writeFile(join(folder, 'report.md'), matrixReport(results, metadata));
    console.log(`${results.filter(r => r.passed).length}/${results.length} features passed. Report: ${join(folder, 'report.md')}`);
    process.exitCode = results.some(r => !r.passed) ? 1 : 0;
  } finally {
    await prepared?.close();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main().catch(error => {
    console.error(error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'EVAL_FAILED');
    process.exitCode = 1;
  });
