import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { queryStepRouter } from '../src/cli/commands/ask.js';
import {
  loadPlaybooks,
  buildRunState,
  completePlaybookStep,
  completePlaybookAction,
} from '../src/modules/playbooks/index.js';
import { PACKAGE_ROOT } from '../src/modules/role-resolver.js';

const suite = JSON.parse(await readFile('manifest/behavioral-audit-30.json', 'utf8'));
const playbooks = await loadPlaybooks(PACKAGE_ROOT);

function addFailure(failures, scenario, field, expected, actual) {
  failures.push(`${scenario.id} ${field}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}

test('Behavioral E2E Audit — 30 realistic Harness scenarios', async (t) => {
  await t.test('suite shape is stable and synthetic', () => {
    assert.equal(suite.scenarios.length, 30);
    assert.equal(new Set(suite.scenarios.map((item) => item.id)).size, 30);
    assert.deepEqual(suite.scenarios.map((item) => item.id), Array.from({ length: 30 }, (_, i) => `B${String(i + 1).padStart(2, '0')}`));
  });

  await t.test('B01–B26 traverse route → source → authority/privacy → playbook action behavior', async () => {
    const failures = [];

    for (const scenario of suite.scenarios.filter((item) => item.prompt)) {
      const result = await queryStepRouter(scenario.prompt, {
        team: scenario.team || '',
      });
      const expected = scenario.expect || {};

      if (expected.mode && result.routingMode !== expected.mode) {
        addFailure(failures, scenario, 'mode', expected.mode, result.routingMode);
      }
      if (expected.skill && result.selectedSkill?.name !== expected.skill) {
        addFailure(failures, scenario, 'skill', expected.skill, result.selectedSkill?.name || '');
      }
      if (expected.playbook && result.selectedPlaybook?.id !== expected.playbook) {
        addFailure(failures, scenario, 'playbook', expected.playbook, result.selectedPlaybook?.id || '');
      }
      if (expected.team && result.teamInfo?.id !== expected.team) {
        addFailure(failures, scenario, 'team', expected.team, result.teamInfo?.id || '');
      }
      if (expected.scope && result.scopeResult?.status !== expected.scope) {
        addFailure(failures, scenario, 'scope', expected.scope, result.scopeResult?.status || '');
      }
      if (expected.authority && result.scopeResult?.authority !== expected.authority) {
        addFailure(failures, scenario, 'authority', expected.authority, result.scopeResult?.authority || '');
      }
      if (expected.readiness && result.routingContract?.readiness?.status !== expected.readiness) {
        addFailure(failures, scenario, 'readiness', expected.readiness, result.routingContract?.readiness?.status || '');
      }
      if (expected.privacyAction && result.privacy?.privacyAction !== expected.privacyAction) {
        addFailure(failures, scenario, 'privacyAction', expected.privacyAction, result.privacy?.privacyAction || '');
      }
      if (expected.privacyRedacted !== undefined && Boolean(result.privacy?.redactionApplied) !== expected.privacyRedacted) {
        addFailure(failures, scenario, 'privacyRedacted', expected.privacyRedacted, Boolean(result.privacy?.redactionApplied));
      }
      if (expected.contextHistory && result.contextPolicy?.history !== expected.contextHistory) {
        addFailure(failures, scenario, 'contextHistory', expected.contextHistory, result.contextPolicy?.history || '');
      }
      if (expected.action) {
        const actions = (result.playbookPlan || []).filter((step) => step.type === 'action').map((step) => step.action);
        if (!actions.includes(expected.action)) addFailure(failures, scenario, 'action', expected.action, actions);
      }
      if (Array.isArray(expected.sourceIncludes)) {
        const refs = (result.routingContract?.mandatoryReferences || []).map((ref) => ref.id);
        for (const source of expected.sourceIncludes) {
          if (!refs.includes(source)) addFailure(failures, scenario, 'mandatoryReference', source, refs);
        }
      }

      // Privacy-redacted routing must never hand the original direct identifiers
      // back into the routed query or diagnostics.
      if (result.privacy?.redactionApplied) {
        for (const secret of ['081-234-5678', '0812345678', 'demo.person@example.com']) {
          if (result.query.includes(secret)) addFailure(failures, scenario, 'redacted-query', 'identifier omitted', secret);
        }
      }
    }

    assert.deepEqual(failures, []);
  });

  await t.test('B27 rejects multiple TOR sources before a run is created', () => {
    const scenario = suite.scenarios.find((item) => item.id === 'B27');
    const playbook = playbooks.find((item) => item.id === 'tor-to-project-plan');
    assert.throws(
      () => buildRunState({
        playbook,
        query: 'จาก TOR สองฉบับช่วยรวมเป็น project plan',
        matchedSignals: ['source', 'planning', 'schedule', 'spreadsheet'],
        sourceRefs: ['tor-a.pdf', 'tor-b.pdf'],
      }),
      new RegExp(scenario.expect.errorIncludes, 'i'),
    );
  });

  async function stateAtSpreadsheetAction() {
    const playbook = playbooks.find((item) => item.id === 'tor-to-project-plan');
    let state = buildRunState({
      playbook,
      query: 'จาก TOR นี้ทำ project plan timeline และ spreadsheet',
      matchedSignals: ['source', 'planning', 'schedule', 'spreadsheet'],
      sourceRefs: ['tor-a.pdf'],
    });
    state = completePlaybookStep(state, 'review-source', { facts: ['synthetic'] });
    state = completePlaybookStep(state, 'build-plan', { activities: ['synthetic'] });
    assert.equal(state.currentStep, 'create-spreadsheet');
    return state;
  }

  await t.test('B28 cannot mark an action complete without a real output reference', async () => {
    const scenario = suite.scenarios.find((item) => item.id === 'B28');
    const state = await stateAtSpreadsheetAction();
    await assert.rejects(
      completePlaybookAction(state, 'create-spreadsheet', {}),
      new RegExp(scenario.expect.errorIncludes, 'i'),
    );
  });

  await t.test('B29 cannot claim success for an empty placeholder file', async (t) => {
    const scenario = suite.scenarios.find((item) => item.id === 'B29');
    const workspace = await mkdtemp(join(tmpdir(), 'step-behavior-empty-'));
    t.after(() => rm(workspace, { recursive: true, force: true }));
    await mkdir(join(workspace, 'output'), { recursive: true });
    await writeFile(join(workspace, 'output', 'project.xlsx'), '');
    const state = await stateAtSpreadsheetAction();

    await assert.rejects(
      completePlaybookAction(
        state,
        'create-spreadsheet',
        { path: 'output/project.xlsx' },
        { workspaceDir: workspace },
      ),
      new RegExp(scenario.expect.errorIncludes, 'i'),
    );
  });

  await t.test('B30 completes only after a real non-empty output is verified', async (t) => {
    const scenario = suite.scenarios.find((item) => item.id === 'B30');
    const workspace = await mkdtemp(join(tmpdir(), 'step-behavior-valid-'));
    t.after(() => rm(workspace, { recursive: true, force: true }));
    await mkdir(join(workspace, 'output'), { recursive: true });
    await writeFile(join(workspace, 'output', 'project.xlsx'), 'synthetic spreadsheet bytes');
    const state = await stateAtSpreadsheetAction();

    const completed = await completePlaybookAction(
      state,
      'create-spreadsheet',
      { path: 'output/project.xlsx' },
      { workspaceDir: workspace },
    );
    const step = completed.steps.find((item) => item.id === 'create-spreadsheet');
    assert.equal(step.status, scenario.expect.completed ? 'completed' : 'pending');
    assert.equal(step.outputVerification?.kind, scenario.expect.verificationKind);
    assert.match(step.outputVerification?.sha256 || '', /^[a-f0-9]{64}$/);
  });
});
