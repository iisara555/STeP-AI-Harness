import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../electron/store';
import { Approvals } from '../electron/approvals';
import { ToolGate } from '../electron/tool-gate';
import { defaultPolicy, type PermissionMode } from '../electron/policy';
import type { ApprovalRequest } from '../src/types';

function fixture() {
  const store = new Store(':memory:');
  let policy = defaultPolicy(),
    mode: PermissionMode = 'ask',
    root = '/workspace',
    blocked = false;
  const events: string[] = [];
  let approval: ApprovalRequest | undefined;
  const approvals = new Approvals(store, request => {
    approval = request;
  });
  const gate = new ToolGate(
    () => policy,
    () => mode,
    async () => root,
    approvals,
    async payload => {
      events.push(`${payload.event}:${payload.ok ?? ''}`);
      return { blocked: blocked && payload.event === 'pre_tool_use', reason: '', results: [] };
    },
  );
  return {
    store,
    gate,
    approvals,
    events,
    get approval() {
      return approval;
    },
    set policy(value: ReturnType<typeof defaultPolicy>) {
      policy = value;
    },
    get policy() {
      return policy;
    },
    set mode(value: PermissionMode) {
      mode = value;
    },
    set root(value: string) {
      root = value;
    },
    set blocked(value: boolean) {
      blocked = value;
    },
    close() {
      approvals.close();
      store.close();
    },
  };
}
const request = { tool: 'write', readOnly: false, path: 'notes.md' };
const detail = { title: 'Write file', body: 'notes.md', key: 'notes.md' };
const pending = async () => {
  await new Promise(resolve => setImmediate(resolve));
};

test('reads run without consent; rejected writes do not execute; approved targets can be remembered and revoked', async () => {
  const f = fixture();
  let writes = 0;
  try {
    assert.equal(await f.gate.run({ tool: 'read', readOnly: true }, detail, () => 'read'), 'read');
    let run = f.gate.run(request, detail, () => ++writes);
    await pending();
    assert.equal(writes, 0);
    assert.throws(() => f.approvals.respond('wrong-id', 'once'), /APPROVAL_EXPIRED/);
    f.approvals.respond(f.approval!.id, 'cancel');
    assert.equal(await run, null);
    run = f.gate.run(request, detail, () => ++writes);
    await pending();
    f.approvals.respond(f.approval!.id, 'workspace');
    assert.equal(await run, 1);
    assert.equal(await f.gate.run(request, detail, () => ++writes), 2);
    assert.equal(f.approvals.list().length, 1);
    const stored = JSON.stringify(f.approvals.list());
    assert.doesNotMatch(stored, /notes\.md|\/workspace/);
    const rule = f.approvals.list()[0];
    assert.notEqual(f.approvals.rule('/different', 'write', detail.key).id, rule.id);
    assert.notEqual(f.approvals.rule('/workspace', 'terminal', detail.key).id, rule.id);
    f.approvals.remove(rule.id);
    run = f.gate.run(request, detail, () => ++writes);
    await pending();
    assert.ok(f.approval);
    f.approvals.close();
    assert.equal(await run, null);
    assert.equal(writes, 2);
  } finally {
    f.close();
  }
});

test('organization denials, plan mode and blocking hooks override remembered approvals', async () => {
  const f = fixture();
  try {
    f.store.put('approval', f.approvals.rule('/workspace', 'write', detail.key).id, { approved: true });
    f.policy.permission.pathRules = [{ pattern: 'notes.md', allow: false }];
    await assert.rejects(
      f.gate.run(request, detail, () => assert.fail('must not write')),
      /PATH_RULE_DENIED/,
    );
    f.policy.permission.pathRules = [];
    f.mode = 'plan';
    await assert.rejects(
      f.gate.run(request, detail, () => assert.fail('must not write')),
      /PLAN_MODE_BLOCKED/,
    );
    f.mode = 'ask';
    f.blocked = true;
    await assert.rejects(
      f.gate.run(request, detail, () => assert.fail('must not write')),
      /HOOK_BLOCKED/,
    );
  } finally {
    f.close();
  }
});

test('a workspace, policy or mode change while approval is pending aborts the action', async () => {
  for (const change of ['workspace', 'policy', 'mode']) {
    const f = fixture();
    try {
      const run = f.gate.run(request, detail, () => assert.fail('must not write'));
      const failure = assert.rejects(run, /WORKSPACE_CHANGED|POLICY_CHANGED|PLAN_MODE_BLOCKED/);
      await pending();
      if (change === 'workspace') f.root = '/new-workspace';
      if (change === 'policy') f.policy = defaultPolicy();
      if (change === 'mode') f.mode = 'plan';
      f.approvals.respond(f.approval!.id, 'once');
      await failure;
    } finally {
      f.close();
    }
  }
});

test('failed tools fire post hooks; completion reports success only after the action resolves', async () => {
  const f = fixture();
  try {
    await assert.rejects(
      f.gate.run({ tool: 'read', readOnly: true }, detail, async () => {
        throw new Error('FILE_LIMIT');
      }),
      /FILE_LIMIT/,
    );
    assert.deepEqual(f.events, ['pre_tool_use:', 'post_tool_use:false']);
  } finally {
    f.close();
  }
});
