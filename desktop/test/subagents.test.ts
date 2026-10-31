import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { SubagentManager, SUBAGENT_TOOLS, subagentSystem } from '../electron/subagents';
import { WorkService, type Harness } from '../electron/service';
import { Store } from '../electron/store';
import type { Connection } from '../src/types';
const routing: any = await import('../../src/modules/router/service.js');
const boundary: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');
const catalog: any = await import('../../src/modules/skills/catalog.js');
const root = resolve('..');

test('SubagentManager records a completed run with the delegate’s answer', async () => {
  const manager = new SubagentManager();
  const task = await manager.spawn('parent-1', { role: 'Codebase Researcher', prompt: 'Find the login handler' }, async subagent => {
    assert.equal(subagent.role, 'Codebase Researcher');
    assert.equal(subagent.status, 'running');
    return 'Found it in src/auth.ts';
  });
  assert.equal(task.status, 'completed');
  assert.equal(task.result, 'Found it in src/auth.ts');
  assert.ok(task.completedAt);
  assert.equal(manager.get(task.id)?.status, 'completed');
  assert.deepEqual(
    manager.list('parent-1').map(t => t.id),
    [task.id],
  );
});

test('SubagentManager reports failures and empty answers as failed, never as completed', async () => {
  const manager = new SubagentManager();
  const failed = await manager.spawn('p', { role: 'Tester', prompt: 'Check' }, async () => {
    throw new Error('PROVIDER_TIMEOUT');
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'PROVIDER_TIMEOUT');
  const empty = await manager.spawn('p', { role: 'Tester', prompt: 'Check' }, async () => '  ');
  assert.equal(empty.status, 'failed');
  assert.equal(empty.error, 'EMPTY_RESULT');
  // Free-form error text from a provider never reaches the result.
  const odd = await manager.spawn('p', { role: 'Tester', prompt: 'Check' }, async () => {
    throw new Error('secret detail in a message');
  });
  assert.equal(odd.error, 'TOOL_FAILED');
  // Cancelling the task stops the loop above too.
  await assert.rejects(
    manager.spawn('p', { role: 'Tester', prompt: 'Check' }, async () => {
      throw new Error('CANCELLED');
    }),
    /CANCELLED/,
  );
  await assert.rejects(
    manager.spawn('p', { role: '', prompt: 'x' }, async () => 'x'),
    /INVALID_INPUT/,
  );
  await assert.rejects(
    manager.spawn('p', { role: 'x', prompt: '' }, async () => 'x'),
    /INVALID_INPUT/,
  );
});

test('the subagent system prompt names its role and only read-only tools', () => {
  const system = subagentSystem('Policy Reader');
  assert.match(system, /Your role: Policy Reader/);
  for (const tool of ['terminal', 'changes', 'patch', 'repl_eval', 'invoke_subagent', 'web_fetch', 'google_workspace', 'ask_user'])
    assert.equal(SUBAGENT_TOOLS.has(tool), false, tool);
  assert.ok(SUBAGENT_TOOLS.has('files') && SUBAGENT_TOOLS.has('reference'));
});

const step = (tool: string, input: string, args?: Record<string, unknown>) =>
  '```step-tool\n' + JSON.stringify({ tool, input, ...(args ? { args } : {}) }) + '\n```';

test('invoke_subagent in a real run calls the AI again with the subagent role and runs only read-only tools', async () => {
  const store = new Store(':memory:');
  store.put('connection', 'c', { id: 'c', provider: 'openai', model: 'fixture', ready: true } as Connection);
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
  const executed: string[] = [];
  const subagentPrompts: string[] = [];
  let subagentResult: any;
  const harness: Harness = {
    root,
    route: (query, opts) => routing.queryStepRouter(query, { autoRoute: true, authorityChecks: true, ...opts }),
    contextPolicy: boundary.classifyContextPolicy,
    privacy: privacy.evaluatePrivacyGate,
    skillMetadata: async id => {
      const metadata = await routing.loadSkillContextMetadata(id);
      return { ...metadata, mandatoryReferences: await routing.loadDocumentContextMetadata(metadata.mandatory) };
    },
    documentCatalog: async () => routing.loadDocumentCatalog(),
    catalog: async () => catalog.loadSkillCatalog(root),
    documentPrivacy: async () => null,
    nextOutput: async () => null,
    toolLoop: () => true,
    // Stands in for DesktopTools: invoke_subagent hands the request to the service's delegate, as tools.ts does.
    tools: async scope => ({
      enabled: () => true,
      check: async () => {},
      readOnly: () => false,
      execute: async request => {
        executed.push(request.tool);
        if (request.tool === 'invoke_subagent') {
          subagentResult = await scope.delegate!(String(request.args?.role), String(request.args?.prompt));
          return { status: 'completed', result: subagentResult };
        }
        if (request.tool === 'files') return { path: 'policy.md', text: 'วันลาพักร้อน 10 วัน' };
        throw new Error('UNEXPECTED_TOOL');
      },
      outgoing: async s => s,
    }),
  };
  let main = 0;
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async (prompt: string, _connection: unknown, context: any) => {
          if (/You are a subagent/.test(context.system || '')) {
            subagentPrompts.push(prompt);
            assert.equal(context.session, undefined, 'the subagent does not share the main conversation');
            if (subagentPrompts.length === 1) return step('files', 'policy.md');
            if (subagentPrompts.length === 2) return step('terminal', 'rm -rf .');
            return 'ระเบียบให้ลาพักร้อน 10 วัน (policy.md)';
          }
          main++;
          return main === 1
            ? step('invoke_subagent', '', { role: 'Policy Reader', prompt: 'อ่าน policy.md แล้วสรุปวันลาพักร้อน' })
            : 'สรุป: ลาพักร้อนได้ 10 วัน';
        },
      },
    }),
    () => {},
  );
  const session = store.create('c', 'cc');
  try {
    await service.run(session.id, 'ทำสไลด์ HTML สรุปงาน', '', true, undefined, 'chat');
    const done = store.session(session.id);
    assert.equal(done.status, 'review');
    assert.equal(subagentPrompts.length, 3, 'the subagent ran its own tool loop');
    assert.match(subagentPrompts[0], /อ่าน policy\.md/);
    assert.match(subagentPrompts[1], /วันลาพักร้อน 10 วัน/, 'the read-only tool result reached the subagent');
    assert.match(subagentPrompts[2], /SUBAGENT_TOOL_DENIED/, 'a command request was refused, not run');
    assert.deepEqual(executed, ['invoke_subagent', 'files']);
    assert.equal(subagentResult, 'ระเบียบให้ลาพักร้อน 10 วัน (policy.md)');
    const calls = done.runs!.at(-1)!.steps.flatMap(s => s.providerCalls || []);
    assert.equal(calls.filter(c => c.kind === 'subagent').length, 3);
    assert.ok(calls.filter(c => c.kind === 'subagent').every(c => c.outcome === 'completed'));
  } finally {
    store.close();
  }
});
