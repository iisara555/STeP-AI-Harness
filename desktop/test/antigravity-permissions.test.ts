import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  ANTIGRAVITY_DENY,
  STEP_HOST_PERMISSION,
  antigravityHome,
  antigravityPermissions,
  antigravityToolPermission,
  governedBridgeStep,
  stepHostSchemaFile,
} from '../electron/antigravity';

type Permissions = { allow: string[]; ask: string[]; deny: string[] };

/**
 * agy's documented rule evaluation (antigravity.google/docs/permissions, CLI): rules are checked Deny > Ask > Allow;
 * `action(*)` matches every target of that action, `mcp(server/*)` every tool of one server; an unconfigured MCP call
 * asks, and a headless run cannot answer, so it is soft-denied. This models the documentation, not the real binary:
 * the real CLI still has to be checked on a signed-in device (see docs/antigravity-adapter.md).
 */
function headlessDecision(permissions: Permissions, action: string): 'allowed' | 'denied' {
  const [, kind, target] = /^(\w+)\((.*)\)$/.exec(action)!;
  const matches = (rule: string) => {
    const [, ruleKind, ruleTarget] = /^(\w+)\((.*)\)$/.exec(rule)!;
    if (ruleKind !== kind) return false;
    if (ruleTarget === '*' || ruleTarget === target) return true;
    return ruleTarget.endsWith('/*') && target.startsWith(ruleTarget.slice(0, -1));
  };
  if (permissions.deny.some(matches)) return 'denied';
  if (permissions.ask.some(matches)) return 'denied';
  if (permissions.allow.some(matches)) return 'allowed';
  return 'denied';
}

const NATIVE = [
  'read_file(notes.txt)',
  'write_file(notes.txt)',
  'read_url(https://example.com)',
  'execute_url(https://example.com)',
  'command(ls)',
  'unsandboxed(ls)',
];

test('with the governed bridge only step_host is allowed; other MCP tools and every native action stay refused', () => {
  const permissions = antigravityPermissions(true);
  assert.deepEqual(permissions.allow, [STEP_HOST_PERMISSION]);
  assert.deepEqual(permissions.ask, []);
  assert.equal(headlessDecision(permissions, 'mcp(step_host/step_host)'), 'allowed');
  for (const action of ['mcp(step_host/other_tool)', 'mcp(google_drive/search)', 'mcp(filesystem/read_file)', ...NATIVE])
    assert.equal(headlessDecision(permissions, action), 'denied', action);
  // Only the MCP rule leaves the deny list; every native action namespace is still denied outright.
  assert.deepEqual(
    permissions.deny,
    ANTIGRAVITY_DENY.filter(rule => rule !== 'mcp(*)'),
  );
  for (const action of ['read_file', 'write_file', 'read_url', 'execute_url', 'command', 'unsandboxed'])
    assert.ok(permissions.deny.includes(`${action}(*)`), action);
});

test('without the bridge every MCP tool, step_host included, is denied', () => {
  const permissions = antigravityPermissions(false);
  assert.deepEqual(permissions, { allow: [], ask: [], deny: ANTIGRAVITY_DENY });
  for (const action of ['mcp(step_host/step_host)', 'mcp(other/tool)', ...NATIVE])
    assert.equal(headlessDecision(permissions, action), 'denied', action);
});

test('the 0.6.24 rules denied the bridge they allowed: deny mcp(*) wins over allow step_host', () => {
  // Regression record for the audit finding: allow named step_host while deny held mcp(*).
  const old = { allow: [STEP_HOST_PERMISSION], ask: [], deny: ANTIGRAVITY_DENY };
  assert.equal(headlessDecision(old, 'mcp(step_host/step_host)'), 'denied');
});

test('the isolated settings file carries the bridge permissions only while the bridge runs', async () => {
  const base = await mkdtemp(join(tmpdir(), 'step-agy-permissions-'));
  const context = { cwd: base, env: { PATH: process.env.PATH }, system: 'Synthetic standing instructions' };
  const profile = { home: '', platform: process.platform };
  try {
    for (const bridge of [true, false]) {
      const home = await antigravityHome({ ...context, ...(bridge ? { nativeBridge: async () => ({ ok: true }) } : {}) }, profile);
      try {
        const root = dirname(home.cwd);
        const settings = JSON.parse(await readFile(join(root, '.gemini', 'antigravity-cli', 'settings.json'), 'utf8'));
        // Headless strict auto-denies every MCP call (agy 1.3.2), so only a bridge run uses request-review.
        assert.equal(settings.toolPermission, bridge ? 'request-review' : 'strict');
        assert.equal(settings.toolPermission, antigravityToolPermission(bridge));
        assert.equal(home.schemaFile, bridge ? stepHostSchemaFile(root) : undefined);
        assert.equal(settings.allowNonWorkspaceAccess, false);
        assert.deepEqual(settings.permissions, antigravityPermissions(bridge));
        const agent = await readFile(join(root, '.gemini', 'config', 'agents', 'step-draft', 'agent.md'), 'utf8');
        assert.match(agent, bridge ? /^mcpServers: \[step_host\]$/m : /^mcpServers: \[\]$/m);
        if (bridge) {
          // The only MCP server agy can start is the governed bridge.
          const mcp = JSON.parse(await readFile(join(root, '.gemini', 'antigravity-cli', 'mcp_config.json'), 'utf8'));
          assert.deepEqual(Object.keys(mcp.mcpServers), ['step_host']);
        }
      } finally {
        await home.close();
      }
    }
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('a bridge run lets through only call_mcp_tool for step_host and the read of its own schema file', () => {
  const schema = stepHostSchemaFile(join(tmpdir(), 'antigravity-synthetic'));
  const step = (tool_name: string, parameters: unknown) => ({
    step_type: 'tool',
    state: 'ACTIVE',
    tool_name,
    tool_info: { name: tool_name, parameters },
  });
  const call = (ServerName: string, ToolName: string) =>
    step('call_mcp_tool', { ServerName, ToolName, Arguments: { tool: 'files', input: '.' } });
  assert.equal(governedBridgeStep(call('step_host', 'step_host'), schema), true);
  assert.equal(governedBridgeStep(call('other', 'step_host'), schema), false);
  assert.equal(governedBridgeStep(call('step_host', 'other'), schema), false);
  assert.equal(governedBridgeStep(step('call_mcp_tool', undefined), schema), false);
  // Arguments may arrive as JSON text.
  assert.equal(
    governedBridgeStep(
      { step_type: 'tool', tool_call: { name: 'call_mcp_tool', args: JSON.stringify({ ServerName: 'step_host', ToolName: 'step_host' }) } },
      schema,
    ),
    true,
  );
  // agy refuses this read itself (read_file(*) stays denied); the host only declines to stop the run for it.
  assert.equal(governedBridgeStep(step('view_file', { AbsolutePath: schema }), schema), true);
  assert.equal(governedBridgeStep(step('view_file', { AbsolutePath: join(dirname(schema), 'other.json') }), schema), false);
  assert.equal(governedBridgeStep(step('view_file', { AbsolutePath: schema, StartLine: 1 }), schema), false);
  assert.equal(governedBridgeStep(step('view_file', { AbsolutePath: join(schema, '..', '..', '..', 'settings.json') }), schema), false);
  for (const name of ['search_web', 'read_url_content', 'run_command', 'list_dir', 'write_to_file', 'browser_subagent'])
    assert.equal(governedBridgeStep(step(name, { AbsolutePath: schema }), schema), false, name);
  // The fixed bridge tool names still pass.
  assert.equal(governedBridgeStep({ step_type: 'tool', tool_name: 'mcp:step_host:step_host' }, schema), true);
});
