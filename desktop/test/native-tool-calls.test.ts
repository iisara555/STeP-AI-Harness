import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loopRequests } from '../src/tools';
import { NATIVE_TOOL, NATIVE_TOOL_RULE } from '../electron/tool-loop';
import { LOOP_TOOLS } from '../src/tools';
import { WorkService, type Harness } from '../electron/service';
import { Store } from '../electron/store';
import type { Connection } from '../src/types';
const routing: any = await import('../../src/modules/router/service.js');
const boundary: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');

test('the native function offers every loop tool by name and the step-tool fields', () => {
  assert.equal(NATIVE_TOOL.function.name, 'step_tool');
  assert.deepEqual(NATIVE_TOOL.function.parameters.properties.tool.enum, [...LOOP_TOOLS]);
  assert.deepEqual(NATIVE_TOOL.function.parameters.required, ['tool', 'input']);
  assert.ok(JSON.stringify(NATIVE_TOOL).length < 2000);
});

test('a converted call with a code fence in its content is read whole', () => {
  const content = 'ตัวอย่าง\n```js\nx\n```';
  const fence = '```step-tool\n' + JSON.stringify({ tool: 'changes', input: 'a.md', content }).replace(/`/g, '\\u0060') + '\n```';
  assert.deepEqual(loopRequests('บันทึก\n\n' + fence), [{ tool: 'changes', input: 'a.md', content }]);
});

function run(connection: Partial<Connection>, native: boolean) {
  const store = new Store(':memory:');
  store.put('connection', 'c', { id: 'c', provider: 'compatible', model: 'fixture', ready: true, ...connection } as Connection);
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
  const seen: { tools?: readonly unknown[]; system: string }[] = [];
  const harness: Harness = {
    root: resolve('..'),
    route: (query, opts) => routing.queryStepRouter(query, { autoRoute: true, authorityChecks: true, ...opts }),
    contextPolicy: boundary.classifyContextPolicy,
    privacy: privacy.evaluatePrivacyGate,
    skillMetadata: async () => null,
    documentPrivacy: async () => null,
    nextOutput: async () => null,
    toolLoop: () => true,
    nativeToolCalls: () => native,
    tools: async () => ({
      enabled: () => true,
      check: async () => {},
      readOnly: () => true,
      execute: async () => 'x',
      outgoing: async s => s,
    }),
  };
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async (_prompt, _c, context) => {
          seen.push({ tools: context.nativeTools, system: context.system || '' });
          return 'คำตอบ';
        },
      },
    }),
    () => {},
  );
  const session = store.create('c', 'cc');
  return service
    .run(session.id, 'ช่วยสรุปงานวันนี้', '', true, undefined, 'chat')
    .then(() => seen)
    .finally(() => store.close());
}

test('policy nativeToolCalls offers the function only to OpenAI-compatible connections', async () => {
  const on = await run({}, true);
  assert.deepEqual(on[0].tools, [NATIVE_TOOL]);
  assert.ok(on[0].system.includes(NATIVE_TOOL_RULE));
  const off = await run({}, false);
  assert.equal(off[0].tools, undefined);
  assert.ok(!off[0].system.includes(NATIVE_TOOL_RULE));
  const anthropic = await run({ protocol: 'anthropic' }, true);
  assert.equal(anthropic[0].tools, undefined);
  const codex = await run({ provider: 'openai' }, true);
  assert.equal(codex[0].tools, undefined);
});
