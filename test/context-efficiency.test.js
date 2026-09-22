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
    assert.equal(estimate.method, 'script-aware-estimate-v2');
    assert.ok(estimate.estimatedTokens > 0);

    // Thai costs far more tokens per character than Latin. A single ratio hid
    // that, so equal-length samples must not estimate equally.
    const thai = estimateTextTokens('ก'.repeat(400));
    const latin = estimateTextTokens('a'.repeat(400));
    assert.ok(thai.estimatedTokens > latin.estimatedTokens * 3);
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

  await t.test('compact bootstrap makes local routing a gate, not an option the agent may skip', () => {
    const compact = buildRouterGuidelines({ format: 'compact' });

    // Context efficiency removed the inline Rule and Skill listings, so the CLI call is
    // now the only path back into the harness. Phrasing it as a condition the agent
    // evaluates ("when a runtime is available") let agents answer straight from model
    // knowledge and never consult the Router at all.
    assert.ok(compact.includes('Routing Gate'), 'bootstrap must name the gate');
    assert.ok(compact.includes('ก่อนลงมือกับคำขอที่เป็นงานจริงทุกครั้ง'), 'gate must apply to every real task');
    assert.ok(compact.includes('ห้ามตอบงานจากความรู้ของโมเดลเองโดยไม่ผ่าน gate'), 'bootstrap must forbid bypassing the gate');

    // A gate with no defined failure path is a gate agents quietly drop.
    assert.ok(compact.includes('ถ้า gate ใช้ไม่ได้'), 'bootstrap must define what to do when the CLI fails');
    assert.ok(compact.includes('ห้ามเงียบแล้วตอบเอง'), 'CLI failure must not fall through to unrouted answers');

    // Skipping onboarding is about not blocking the user, not about skipping governance.
    assert.ok(compact.includes('ข้าม onboarding ไม่ได้แปลว่าข้าม Router'), 'skipping onboarding must not read as skipping the Router');
    assert.ok(!compact.includes('เมื่อมี local runtime/CLI ให้ route'), 'routing must not be phrased as conditional again');

    // Rules stay un-enumerated by design, so the floor has to be stated as behaviour.
    assert.ok(compact.includes('มีผลกับทุกคำตอบเสมอ'), 'organization rules must apply with or without the Router');
    assert.ok(!compact.includes('rules/human-approval.md'), 'the floor must not re-introduce Rule inventory');
  });

  await t.test('context plan exposes over-budget components instead of silently pretending they fit', () => {
    const plan = buildContextBudgetPlan({
      routingContract: { skill: 'receipt-audit' },
      skillText: 'ก'.repeat(10000),
      // Latin budgets roughly four characters per token, so an over-budget Latin
      // sample needs more than four times its token budget in characters.
      startupText: 's'.repeat(4000),
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
