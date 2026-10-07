import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrialPlan, scoreUsability } from '../src/modules/evals/tool-usability.js';

test('trial plans randomize deterministically, counterbalance arms and require fresh sessions', () => {
  assert.deepEqual(buildTrialPlan(['sheet-read', 'slide-create'], 42), buildTrialPlan(['sheet-read', 'slide-create'], 42));
  const plan = buildTrialPlan(['sheet-read', 'slide-create'], 42);
  assert.equal(new Set(plan.map(x => x.sessionId)).size, 4);
  for (const id of ['sheet-read', 'slide-create']) assert.deepEqual(plan.filter(x => x.taskId === id).map(x => x.arm).sort(), ['with-tools', 'without-tools']);
});

test('score actual artifacts separately from discovery and refuse model-declared success', () => {
  const tasks = [{ id: 'sheet-read', tools: ['sheet_read'], expected: { path: 'rows.0.0', equals: '00123' } }];
  const trials = [
    { taskId: 'sheet-read', arm: 'with-tools', sessionId: 'a', calls: [{ tool: 'sheet_read', result: { rows: [['00123']] } }] },
    { taskId: 'sheet-read', arm: 'without-tools', sessionId: 'b', answer: 'success', calls: [] },
  ];
  const report = scoreUsability(tasks, trials, 'controlled-contract');
  assert.equal(report.pairedTasks, 1);
  assert.equal(report.arms['with-tools'].successes, 1);
  assert.equal(report.arms['without-tools'].successes, 0);
  assert.equal(report.modelBenefitEstablished, false);
  assert.equal(report.observedDifference, 1);
  assert.throws(() => scoreUsability(tasks, [{ ...trials[0], sessionId: 'same' }, { ...trials[1], sessionId: 'same' }], 'recorded-model-run'), /SESSION_REUSED/);
  assert.throws(() => scoreUsability(tasks, [trials[0]], 'recorded-model-run'), /UNPAIRED_TRIALS/);
});
