import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_BUDGETS,
  estimateTextTokens,
  buildCompactRoutingContract,
  buildContextBudgetPlan,
  buildStructuredHandoff,
} from '../src/modules/context-budget/index.js';
import { buildRouterGuidelines } from '../src/modules/router/index.js';
import { queryStepRouter } from '../src/cli/commands/ask.js';
import {
  loadPlaybooks,
  buildRunState,
  completePlaybookStep,
  getPlaybookStepContext,
  recordRunUsage,
} from '../src/modules/playbooks/index.js';
import { PACKAGE_ROOT } from '../src/modules/role-resolver.js';

test('Context efficiency — progressive disclosure without architecture changes', async (t) => {
  await t.test('token telemetry is explicitly estimated unless provider usage is supplied', () => {
    const estimate = estimateTextTokens('ช่วยตรวจ TOR ก่อนส่ง AFP');
    assert.equal(estimate.actualTokens, null);
    assert.equal(estimate.method, 'char-estimate-v1');
    assert.ok(estimate.estimatedTokens > 0);
  });

  await t.test('compact routing contract never carries router inventory or trigger lists', () => {
    const contract = buildCompactRoutingContract({
      selectedSkill: {
        name: 'tor-review',
        processId: 'procurement.tor',
        triggers: Array.from({ length: 100 }, (_, i) => `trigger-${i}`),
      },
      teamInfo: { id: 'afp' },
      scopeResult: { status: 'ALLOW', inScope: true },
      bestMatch: { score: 0.91 },
      skillMetadata: { path: 'skills/pm/tor-review/SKILL.md' },
    });

    const text = JSON.stringify(contract);
    assert.equal(contract.routingEngine, 'local-deterministic');
    assert.equal(contract.routerRegistrySentToModel, false);
    assert.ok(!text.includes('trigger-99'));
    assert.ok(!Object.hasOwn(contract, 'ranked'));
  });

  await t.test('real TOR route returns only compact route metadata plus a bounded context plan', async () => {
    const result = await queryStepRouter('ช่วยตรวจ TOR นี้ก่อนส่ง AFP', { team: 'afp' });

    assert.equal(result.selectedSkill?.name, 'tor-review');
    assert.equal(result.routingContract.routerRegistrySentToModel, false);
    assert.equal(result.routingContract.skillPath, 'skills/pm/tor-review/SKILL.md');
    assert.equal(result.contextPlan.routerRegistryIncluded, false);
    assert.equal(result.contextPlan.fullSkillInventoryIncluded, false);
    assert.equal(result.contextPlan.unrelatedRulesIncluded, false);
    assert.ok(result.contextPlan.components.routing.estimatedTokens <= DEFAULT_BUDGETS.routing);
  });

  await t.test('mandatory reference metadata is resolved locally without loading unrelated references', async () => {
    const result = await queryStepRouter('ช่วยตรวจใบเสร็จก่อนส่ง AFP', { team: 'afp' });
    const ids = result.routingContract.mandatoryReferences.map((item) => item.id);

    assert.equal(result.selectedSkill?.name, 'receipt-audit');
    assert.ok(ids.includes('human-approval-rule'));
    assert.ok(ids.includes('data-classification-rule'));
    assert.ok(!ids.includes('creative-brief-template'));
  });

  await t.test('compact bootstrap tells adapters to use local JSON routing and forbids full router registry context', () => {
    const compact = buildRouterGuidelines({ format: 'compact' });
    assert.ok(compact.includes('step-ai ask'));
    assert.ok(compact.includes('--json'));
    assert.ok(compact.includes('ห้ามโหลด'));
    assert.ok(compact.includes('router-index.yaml'));
    assert.ok(compact.includes('ทั้งไฟล์'));
  });

  await t.test('context plan exposes over-budget components instead of silently pretending they fit', () => {
    const plan = buildContextBudgetPlan({
      routingContract: { skill: 'receipt-audit' },
      skillText: 'ก'.repeat(10000),
      startupText: 's'.repeat(2500),
      governanceText: 'g'.repeat(1000),
    });

    assert.equal(plan.components.skill.overBudget, true);
    assert.ok(plan.components.skill.estimatedTokens > plan.components.skill.budget);
    assert.equal(plan.components.startup.overBudget, true);
    assert.ok(plan.components.startup.estimatedTokens > plan.components.startup.budget);
    assert.equal(plan.components.governance.overBudget, true);
    assert.ok(plan.components.governance.estimatedTokens > plan.components.governance.budget);
  });

  await t.test('small structured handoffs preserve every item without a false truncation result', () => {
    const facts = Array.from({ length: 31 }, (_, index) => `fact-${index + 1}`);
    const handoff = buildStructuredHandoff(
      { id: 'review-source', produces: ['source-facts'] },
      { 'source-facts': facts }
    );

    assert.equal(handoff.truncated, false);
    assert.equal(handoff.data['source-facts'].length, 31);
    assert.equal(handoff.data['source-facts'].at(-1), 'fact-31');
  });

  await t.test('structured handoff keeps full step output in state but bounds next-step context', async () => {
    const playbooks = await loadPlaybooks(PACKAGE_ROOT);
    const playbook = playbooks.find((item) => item.id === 'tor-to-project-plan');

    let state = buildRunState({
      playbook,
      query: 'TOR แตกกิจกรรม timeline google sheet',
      team: 'pubsec',
      matchedSignals: ['source', 'planning', 'schedule', 'spreadsheet'],
      sourceRefs: [{ id: 'tor-1', name: 'TOR.pdf' }],
    });

    const largeFacts = Array.from({ length: 80 }, (_, i) => ({
      id: i,
      detail: `Fact ${i} ` + 'รายละเอียด'.repeat(100),
    }));

    state = completePlaybookStep(state, 'review-source', {
      'source-facts': largeFacts,
      requirements: ['A'],
      deliverables: ['B'],
    });

    assert.equal(state.context.outputs['review-source']['source-facts'].length, 80);
    assert.ok(state.context.handoffs['review-source']);
    assert.equal(state.context.handoffs['review-source'].truncated, true);
    assert.ok(Object.hasOwn(state.context.handoffs['review-source'].data, 'source-facts'));
    assert.equal(state.context.handoffs['review-source'].truncation['source-facts'].originalItems, 80);
    assert.ok(
      state.context.handoffs['review-source'].telemetry.estimatedTokens
        <= DEFAULT_BUDGETS.handoff + 50
    );
    assert.ok(state.events.some((event) => event.type === 'handoff-created'));

    const next = getPlaybookStepContext(state, 'build-plan');
    assert.equal(next.stepId, 'build-plan');
    assert.ok(next.telemetry.estimatedTokens <= DEFAULT_BUDGETS.handoff + 100);
  });

  await t.test('run state stores estimated usage first and accepts provider-reported actual usage later', async () => {
    const playbooks = await loadPlaybooks(PACKAGE_ROOT);
    const playbook = playbooks.find((item) => item.id === 'meeting-to-action-plan');

    let state = buildRunState({
      playbook,
      query: 'สรุปประชุมแล้วทำ action plan timeline',
      matchedSignals: ['source', 'action', 'planning'],
      routingContract: { mode: 'PLAYBOOK', playbook: 'meeting-to-action-plan' },
    });

    assert.equal(state.usage.accounting, 'estimated');
    assert.equal(state.usage.inputTokens, null);
    assert.equal(state.usage.outputTokens, null);
    assert.ok(state.usage.harnessContext.estimatedTokens >= 0);

    state = recordRunUsage(state, { inputTokens: 1234, outputTokens: 321 });
    assert.equal(state.usage.inputTokens, 1234);
    assert.equal(state.usage.outputTokens, 321);
    assert.equal(state.usage.accounting, 'provider-reported-partial');
    assert.ok(state.events.some((event) => event.type === 'usage-recorded'));
  });
});
