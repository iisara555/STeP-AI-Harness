import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { queryStepRouter } from '../src/cli/commands/ask.js';
import { runBenchmark } from '../src/cli/commands/benchmark.js';

test('Pilot 30-task benchmark suite', async (t) => {
  const suite = JSON.parse(await readFile('manifest/pilot-benchmark.json', 'utf-8'));

  await t.test('suite contains exactly 30 synthetic tasks with unique IDs', () => {
    assert.equal(suite.tasks.length, 30);
    const ids = suite.tasks.map((task) => task.id);
    assert.equal(new Set(ids).size, 30);
    assert.ok(ids.every((id) => /^P\d{2}$/.test(id)));
    assert.ok(suite.notes.some((note) => note.includes('synthetic')));
  });

  await t.test('all 30 tasks match their expected route / authority preflight', async () => {
    const failures = [];

    for (const task of suite.tasks) {
      const result = await queryStepRouter(task.prompt, {
        team: task.inputTeam || '',
      });
      const expected = task.expected || {};

      if (expected.mode && result.routingMode !== expected.mode) {
        failures.push(`${task.id}: mode expected=${expected.mode} actual=${result.routingMode}`);
      }
      if (expected.skill && result.selectedSkill?.name !== expected.skill) {
        failures.push(`${task.id}: skill expected=${expected.skill} actual=${result.selectedSkill?.name || ''}`);
      }
      if (expected.playbook && result.selectedPlaybook?.id !== expected.playbook) {
        failures.push(`${task.id}: playbook expected=${expected.playbook} actual=${result.selectedPlaybook?.id || ''}`);
      }
      if (expected.team && result.teamInfo?.id !== expected.team) {
        failures.push(`${task.id}: team expected=${expected.team} actual=${result.teamInfo?.id || ''}`);
      }
      if (expected.scope && result.scopeResult?.status !== expected.scope) {
        failures.push(`${task.id}: scope expected=${expected.scope} actual=${result.scopeResult?.status || ''}`);
      }
      if (expected.authority && result.scopeResult?.authority !== expected.authority) {
        failures.push(`${task.id}: authority expected=${expected.authority} actual=${result.scopeResult?.authority || ''}`);
      }
    }

    assert.deepEqual(failures, []);
  });

  await t.test('benchmark runner returns 30 rows and preserves estimate/actual distinction', async () => {
    const originalLog = console.log;
    console.log = () => {};
    try {
      const report = await runBenchmark({ json: true });
      assert.equal(report.total, 30);
      assert.equal(report.failed, 0);
      assert.equal(report.passed, 30);
      assert.equal(report.passRate, 100);
      assert.equal(report.mode, 'router-context-preflight');
      assert.ok(report.timingMs.average >= 0);
      assert.ok(report.context.averageEstimatedHarnessTokens >= 0);
      assert.equal(report.rows.length, 30);
    } finally {
      console.log = originalLog;
    }
  });

  await t.test('suite includes fast, document, composite, authority, and decision-support cases', () => {
    const groups = new Set(suite.tasks.map((task) => task.group));
    for (const group of ['fast-atomic', 'document-atomic', 'composite', 'authority', 'decision-support']) {
      assert.ok(groups.has(group), `missing group ${group}`);
    }
  });
});
