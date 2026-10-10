import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOP_TOOLS, loopRequests } from '../src/tools';
import { TOOL_REGISTRY, discoverTools, validateToolRequest } from '../src/tool-registry';
import { defaultPolicy } from '../electron/policy';

test('canonical registry covers every reachable protocol tool with schemas and effects', () => {
  assert.deepEqual(Object.keys(TOOL_REGISTRY).sort(), [...LOOP_TOOLS].sort());
  for (const [name, entry] of Object.entries(TOOL_REGISTRY)) {
    assert.equal(entry.inputSchema.properties.tool.const, name);
    assert.deepEqual(entry.inputSchema.required, ['tool', 'input']);
    assert.ok(entry.effects.length);
  }
  assert.ok(TOOL_REGISTRY.tool_search.effects.includes('conditional-external-discovery'));
  const result = discoverTools({ tool: 'tool_describe', input: 'tasks' }, defaultPolicy(), 'ask', true);
  assert.equal(result.tools[0].name, 'tasks');
  assert.ok(result.tools[0].inputSchema?.properties?.args.properties?.action.enum?.includes('cancel'));
});

test('malformed discovery fields and recursive wrappers are inert in parser and direct validation', () => {
  const invalid = [
    { tool: 'tool_search', input: '', args: { server: '', scope: 'mcp' } },
    { tool: 'tool_search', input: '', args: { server: 'managed', scope: 'core' } },
    { tool: 'tool_search', input: '', args: { scope: 'elsewhere' } },
    { tool: 'tool_search', input: '', args: { limit: 1.5 } },
    { tool: 'tool_search', input: '', args: { limit: 0 } },
    { tool: 'tool_search', input: '', args: { tool: 'terminal', input: 'bad' } },
    { tool: 'tool_describe', input: 'files', content: 'execute' },
    { tool: 'tool_describe', input: 'files', args: { arguments: { tool: 'terminal' } } },
    { tool: 'tool_describe', input: 'constructor' },
    { tool: 'files', input: null },
    { tool: 'files', input: 'a', args: { offset: '0' } },
    { tool: 'tasks', input: 'a', args: { timeoutMs: 30001 } },
  ];
  for (const value of invalid) {
    assert.throws(() => validateToolRequest(value), /INVALID_INPUT|TOOL_UNAVAILABLE/);
    assert.deepEqual(loopRequests(JSON.stringify(value)), []);
  }
});

test('managed availability never exposes secrets or infers installed cloud connectors', () => {
  const policy = defaultPolicy();
  policy.mcpServers = [
    { name: 'synthetic', transport: 'http', url: 'https://fixture.invalid/secret-path', headers: { Authorization: 'SYNTHETIC_SECRET' } },
  ];
  const disabled = discoverTools({ tool: 'tool_search', input: '', args: { scope: 'mcp' } }, policy, 'ask', true);
  assert.deepEqual(disabled.managedMcp?.servers, []);
  policy.features.mcp = true;
  const visible = discoverTools({ tool: 'tool_search', input: '', args: { scope: 'mcp' } }, policy, 'ask', true);
  assert.deepEqual(visible.managedMcp?.servers, [{ name: 'synthetic', transport: 'http' }]);
  assert.doesNotMatch(JSON.stringify(visible), /SYNTHETIC_SECRET|secret-path|fixture.invalid/);
  const core = discoverTools({ tool: 'tool_search', input: '', args: { scope: 'core' } }, policy, 'plan', true);
  assert.equal(core.managedMcp, undefined);
  assert.equal(core.tools.find(t => t.name === 'patch')?.availability.reason, 'plan-mode-action-restricted');
  assert.equal(core.tools.find(t => t.name === 'tasks')?.scope, 'current-session-and-canonical-workspace');
  assert.equal(
    core.tools.some(t => t.name === 'google_workspace'),
    false,
  );
});

test('search is concise while describe retains the canonical schema', () => {
  const policy = defaultPolicy();
  const result = discoverTools({ tool: 'tool_search', input: '' }, policy, 'ask', true);
  assert.equal(result.tools.length, LOOP_TOOLS.length);
  assert.equal(result.tools[0].inputSchema, undefined);
  assert.equal(result.executionGranted, false);
});
