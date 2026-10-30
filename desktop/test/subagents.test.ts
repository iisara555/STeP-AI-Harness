import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { SubagentManager } from '../electron/subagents';

test('SubagentManager spawns, runs, and completes scoped tasks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-subagent-'));
  const manager = new SubagentManager();

  try {
    const task = await manager.spawn(
      'parent-session-1',
      root,
      {
        role: 'Codebase Researcher',
        prompt: 'Search the files for authentication definitions',
        workspace: 'inherit',
      },
      async (subagent, workPath) => {
        assert.equal(subagent.role, 'Codebase Researcher');
        assert.equal(workPath, root);
        return 'Found 3 authentication modules';
      },
    );

    assert.equal(task.status, 'completed');
    assert.equal(task.result, 'Found 3 authentication modules');
    assert.equal(task.workspaceMode, 'inherit');
    assert.ok(task.completedAt);

    // Can be retrieved by ID
    const retrieved = manager.get(task.id);
    assert.equal(retrieved?.id, task.id);
    assert.equal(retrieved?.status, 'completed');

    // List by parent session
    const list = manager.list('parent-session-1');
    assert.equal(list.length, 1);
    assert.equal(list[0].id, task.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('SubagentManager handles execution errors safely', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-subagent-err-'));
  const manager = new SubagentManager();

  try {
    const task = await manager.spawn(
      'parent-session-2',
      root,
      {
        role: 'Test Runner',
        prompt: 'Run failing tests',
        workspace: 'inherit',
      },
      async () => {
        throw new Error('TEST_EXECUTION_FAILED: 2 tests failed');
      },
    );

    assert.equal(task.status, 'failed');
    assert.ok(task.error?.includes('TEST_EXECUTION_FAILED'));
    assert.ok(task.completedAt);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('SubagentManager validates input arguments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-subagent-val-'));
  const manager = new SubagentManager();

  try {
    await assert.rejects(manager.spawn('parent-session-3', root, { role: '', prompt: 'do something' }), /INVALID_INPUT/);
    await assert.rejects(manager.spawn('parent-session-3', root, { role: 'Worker', prompt: '' }), /INVALID_INPUT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
