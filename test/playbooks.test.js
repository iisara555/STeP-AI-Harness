import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { queryStepRouter } from '../src/cli/commands/ask.js';
import {
  loadPlaybooks,
  parsePlaybooksYaml,
  detectCompositePlaybook,
  buildPlaybookPlan,
  buildRunState,
  createPlaybookRun,
  readPlaybookRun,
  updatePlaybookRun,
  validatePlaybookRegistry,
  validatePlaybookSources,
  resolvePlaybookAction,
  completePlaybookStep,
  markPlaybookActionState,
} from '../src/modules/playbooks/index.js';
import { loadAndValidateManifests } from '../src/modules/router/index.js';
import { PACKAGE_ROOT } from '../src/modules/role-resolver.js';
import { loadActionRegistry } from '../src/modules/actions/index.js';

test('STeP Composite Playbooks', async (t) => {
  const playbooks = await loadPlaybooks(PACKAGE_ROOT);
  const actions = await loadActionRegistry(PACKAGE_ROOT);

  await t.test('registry contains the 3 intentionally small Pilot playbooks', () => {
    assert.equal(playbooks.length, 3);
    assert.deepEqual(
      playbooks.map((p) => p.id),
      ['tor-to-project-plan', 'meeting-to-action-plan', 'iso-audit-readiness-flow']
    );
  });


  await t.test('TOR Playbook carries source, fact, budget, parameter and output policies', () => {
    const playbook = playbooks.find((p) => p.id === 'tor-to-project-plan');
    assert.equal(playbook.sourcePolicy, 'one-tor-per-run');
    assert.equal(playbook.factPolicy, 'facts-and-assumptions-separated');
    assert.equal(playbook.budgetPolicy, 'source-only-no-auto-allocation');
    assert.equal(playbook.schedulePolicy, 'source-dates-first');
    assert.deepEqual(playbook.parameters, ['contract-start', 'event-start', 'event-end', 'contract-end']);
    assert.equal(playbook.outputSchema, 'project-master-plan-v1');
    assert.equal(playbook.specPath, 'docs/tor-to-project-plan.md');
  });

  await t.test('exact staff phrasing routes TOR Action Plan + Grantt + Google Sheet to Playbook', async () => {
    const result = await queryStepRouter(
      'นี่คือ TOR ของSTeP ที่ Bidding มาได้ ขอช่วยทำ Action Plan พร้อมแตกกิจกรรม เพื่อนำไปทำ Grantt Charts ใน Google Sheet',
      { team: 'pubsec' }
    );

    assert.equal(result.routingMode, 'PLAYBOOK');
    assert.equal(result.selectedPlaybook?.id, 'tor-to-project-plan');
    assert.equal(result.selectedSkill?.name, 'tor-review');
    assert.ok(result.playbookMatch.matchedSignals.includes('source'));
    assert.ok(result.playbookMatch.matchedSignals.includes('planning'));
    assert.ok(result.playbookMatch.matchedSignals.includes('schedule'));
    assert.ok(result.playbookMatch.matchedSignals.includes('spreadsheet'));
  });

  await t.test('atomic TOR review remains a single Skill', async () => {
    const result = await queryStepRouter('ช่วยตรวจ TOR นี้ก่อนส่ง', { team: 'afp' });
    assert.equal(result.routingMode, 'SKILL');
    assert.equal(result.selectedPlaybook, null);
    assert.equal(result.selectedSkill?.name, 'tor-review');
  });

  await t.test('TOR + activities + budget + timeline + Google Sheet becomes a Playbook', async () => {
    const result = await queryStepRouter(
      'เอา TOR นี้มาแตกกิจกรรม งบประมาณ ระยะเวลา แล้วทำ Gantt ลง Google Sheet',
      { team: 'pubsec' }
    );

    assert.equal(result.routingMode, 'PLAYBOOK');
    assert.equal(result.selectedPlaybook?.id, 'tor-to-project-plan');
    assert.equal(result.selectedSkill?.name, 'tor-review');
    assert.deepEqual(result.playbookMatch.matchedSignals.sort(), ['budget', 'planning', 'schedule', 'source', 'spreadsheet']);
    assert.deepEqual(
      result.playbookPlan.map((s) => [s.type, s.skill || s.action]),
      [
        ['skill', 'tor-review'],
        ['skill', 'project-plan'],
        ['action', 'spreadsheet-project-plan'],
      ]
    );
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('TOR composite flow still blocks procurement decisions', async () => {
    const result = await queryStepRouter(
      'เอา TOR นี้มาแตกกิจกรรม งบประมาณ timeline แล้วเลือกบริษัทผู้ชนะและให้คะแนนผู้ยื่นข้อเสนอให้เลย',
      { team: 'afp' }
    );

    assert.equal(result.routingMode, 'PLAYBOOK');
    assert.equal(result.selectedPlaybook?.id, 'tor-to-project-plan');
    assert.equal(result.scopeResult.status, 'BLOCK');
    assert.equal(result.scopeResult.targetRole, 'procurement-committee');
    assert.equal(result.scopeResult.authority, 'procurement-approval');
    assert.equal(result.scopeResult.playbookStep, 'review-source');
  });

  await t.test('simple meeting summary stays atomic', async () => {
    const result = await queryStepRouter('สรุปประชุมเมื่อเช้า แยกสิ่งที่ต้องทำต่อ', { team: 'ga' });
    assert.equal(result.routingMode, 'SKILL');
    assert.equal(result.selectedSkill?.name, 'meeting-summary');
  });

  await t.test('meeting + action plan + timeline + Sheet becomes a Playbook', async () => {
    const result = await queryStepRouter(
      'จากประชุมนี้ช่วยสรุป action plan พร้อม timeline และ owner ลง Google Sheet',
      { team: 'ga' }
    );
    assert.equal(result.routingMode, 'PLAYBOOK');
    assert.equal(result.selectedPlaybook?.id, 'meeting-to-action-plan');
    assert.deepEqual(
      result.playbookPlan.map((s) => s.skill || s.action),
      ['meeting-summary', 'project-plan', 'spreadsheet-action-plan']
    );
  });

  await t.test('simple ISO audit readiness stays on its orchestrator Skill', async () => {
    const result = await queryStepRouter('ช่วยเตรียม External Audit ISO 9001 ของทีม', { team: 'qs' });
    assert.equal(result.routingMode, 'SKILL');
    assert.equal(result.selectedSkill?.name, 'iso9001-audit-readiness');
  });

  await t.test('multi-output ISO request selects only relevant conditional steps', async () => {
    const result = await queryStepRouter(
      'เตรียม External Audit ISO 9001 ทำ evidence matrix ซ้อมตอบ auditor และเตรียม management review',
      { team: 'qs' }
    );
    assert.equal(result.routingMode, 'PLAYBOOK');
    assert.equal(result.selectedPlaybook?.id, 'iso-audit-readiness-flow');
    assert.deepEqual(
      result.playbookPlan.map((s) => s.skill || s.action),
      ['iso9001-audit-readiness', 'audit-evidence-matrix', 'audit-interview-coach', 'management-review-prep']
    );
  });

  await t.test('TOR Run State separates facts and assumptions and creates parameter slots', () => {
    const playbook = playbooks.find((p) => p.id === 'tor-to-project-plan');
    const state = buildRunState({
      playbook,
      query: 'TOR action plan gantt google sheet',
      team: 'pubsec',
      matchedSignals: ['source', 'planning', 'schedule', 'spreadsheet'],
      sourceRefs: [{ id: 'tor-ethnic-lampang', name: 'TOR มหกรรมชาติพันธุ์นครลำปาง.pdf' }],
      now: new Date('2026-09-18T05:00:00Z'),
    });

    assert.equal(state.version, 3);
    assert.equal(state.sourceRefs.length, 1);
    assert.deepEqual(state.context.facts, {});
    assert.deepEqual(state.context.assumptions, {});
    assert.deepEqual(state.context.missingInformation, []);
    assert.deepEqual(state.parameters, {
      'contract-start': null,
      'event-start': null,
      'event-end': null,
      'contract-end': null,
    });
    assert.equal(state.policies.budgetPolicy, 'source-only-no-auto-allocation');
    assert.equal(state.outputSchema, 'project-master-plan-v1');
  });

  await t.test('multiple TOR sources are rejected from one run instead of being merged silently', () => {
    const playbook = playbooks.find((p) => p.id === 'tor-to-project-plan');
    const sourceCheck = validatePlaybookSources(playbook, [
      { id: 'tor-a', name: 'TOR A.pdf' },
      { id: 'tor-b', name: 'TOR B.pdf' },
    ]);
    assert.equal(sourceCheck.valid, false);
    assert.match(sourceCheck.error, /one TOR source per run/i);

    assert.throws(
      () =>
        buildRunState({
          playbook,
          query: 'รวม TOR สองไฟล์ทำ gantt',
          sourceRefs: [{ id: 'tor-a' }, { id: 'tor-b' }],
        }),
      /one TOR source per run/i
    );
  });

  await t.test('TOR-to-Project-Plan specification locks budget and Gantt schema rules', async () => {
    const spec = await readFile('docs/tor-to-project-plan.md', 'utf-8');
    assert.ok(spec.includes('ห้าม AI กระจายวงเงินรวมเป็นงบรายกิจกรรมเอง'));
    assert.ok(spec.includes('Budget Amount (Source Only)'));
    assert.ok(spec.includes('Project Parameters'));
    assert.ok(spec.includes('Project Master Plan'));
    assert.ok(spec.includes('Gantt'));
    assert.ok(spec.includes('TOR Fact'));
    assert.ok(spec.includes('Planning Assumption'));
  });

  await t.test('run state can be persisted and resumed without becoming a workflow engine', async () => {
    const root = await mkdtemp(join(tmpdir(), 'step-playbook-'));
    try {
      const playbook = playbooks.find((p) => p.id === 'tor-to-project-plan');
      const run = await createPlaybookRun(root, {
        playbook,
        query: 'TOR แตกกิจกรรม งบ timeline google sheet',
        team: 'pubsec',
        matchedSignals: ['source', 'planning', 'budget', 'schedule', 'spreadsheet'],
        now: new Date('2026-09-18T05:00:00Z'),
      });

      assert.ok(run.statePath.includes(join('.step-ai', 'runs')));
      assert.equal(run.currentStep, 'review-source');

      const loaded = await readPlaybookRun(root, run.runId);
      assert.equal(loaded.playbookId, 'tor-to-project-plan');

      const updated = await updatePlaybookRun(root, run.runId, (state) => ({
        ...state,
        currentStep: 'build-plan',
        context: { requirements: ['A'], deliverables: ['B'] },
        steps: state.steps.map((step) =>
          step.id === 'review-source' ? { ...step, status: 'completed' } : step
        ),
      }));

      assert.equal(updated.currentStep, 'build-plan');
      assert.equal(updated.steps[0].status, 'completed');
      assert.deepEqual(updated.context.deliverables, ['B']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test('playbook registry validation catches unknown Skill and signal', () => {
    const bad = parsePlaybooksYaml(`version: 1
playbooks:
  - id: bad-flow
    name: "Bad"
    owner: qs
    requiredSignals: [source]
    minSignals: 1
    signals:
      source: [test]
    steps:
      - id: one
        type: skill
        skill: missing-skill
        when: missing-signal
      - id: two
        type: action
        action: output
`);

    const result = validatePlaybookRegistry(bad, {
      skills: new Set(['tor-review']),
      teams: new Set(['qs']),
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("unknown Skill 'missing-skill'")));
    assert.ok(result.errors.some((e) => e.includes("unknown signal 'missing-signal'")));
  });

  await t.test('Google Sheets preferred tool resolves to ready', () => {
    const playbook = playbooks.find((p) => p.id === 'tor-to-project-plan');
    const action = buildPlaybookPlan(playbook, ['source', 'planning', 'schedule', 'spreadsheet'])
      .find((step) => step.type === 'action');

    const resolved = resolvePlaybookAction(action, ['google-sheets'], actions);
    assert.equal(resolved.status, 'ready');
    assert.equal(resolved.tool, 'google-sheets');
  });

  await t.test('missing Google Sheets falls back to XLSX without losing the plan', () => {
    const playbook = playbooks.find((p) => p.id === 'tor-to-project-plan');
    const state = buildRunState({
      playbook,
      query: 'TOR action plan gantt google sheet',
      team: 'pubsec',
      matchedSignals: ['source', 'planning', 'schedule', 'spreadsheet'],
      sourceRefs: [{ id: 'tor-a', name: 'TOR A.pdf' }],
      now: new Date('2026-09-18T05:00:00Z'),
    });

    const action = state.steps.find((step) => step.type === 'action');
    const resolved = resolvePlaybookAction(action, ['xlsx'], actions);
    assert.equal(resolved.status, 'fallback');
    assert.equal(resolved.tool, 'xlsx');

    const marked = markPlaybookActionState(state, action.id, resolved);
    assert.equal(marked.steps.find((step) => step.id === action.id).actionState.tool, 'xlsx');
    assert.equal(marked.status, 'active');
  });


  await t.test('real TOR spreadsheet action waits when neither Google Sheets nor XLSX is available', () => {
    const playbook = playbooks.find((p) => p.id === 'tor-to-project-plan');
    let state = buildRunState({
      playbook,
      query: 'TOR action plan gantt google sheet',
      team: 'pubsec',
      matchedSignals: ['source', 'planning', 'schedule', 'spreadsheet'],
      sourceRefs: [{ id: 'tor-a', name: 'TOR A.pdf' }],
      now: new Date('2026-09-18T05:00:00Z'),
    });

    state = completePlaybookStep(state, 'review-source', { facts: ['A'] });
    state = completePlaybookStep(state, 'build-plan', { activities: ['A'] });

    const action = state.steps.find((step) => step.id === 'create-spreadsheet');
    const resolved = resolvePlaybookAction(action, [], actions);
    assert.equal(resolved.status, 'blocked');

    state = markPlaybookActionState(state, action.id, resolved);
    assert.equal(state.status, 'waiting-tool');
    assert.equal(state.currentStep, 'create-spreadsheet');
    assert.equal(state.steps[0].status, 'completed');
    assert.equal(state.steps[1].status, 'completed');
  });

  await t.test('action can wait for a tool without restarting completed Skill steps', () => {
    const playbook = {
      id: 'tool-test',
      name: 'Tool Test',
      parameters: [],
      steps: [
        { id: 'skill-step', type: 'skill', skill: 'tor-review' },
        { id: 'action-step', type: 'action', action: 'sheet', preferredTool: 'google-sheets' },
      ],
    };
    let state = buildRunState({
      playbook,
      query: 'test',
      matchedSignals: [],
      now: new Date('2026-09-18T05:00:00Z'),
    });
    state = completePlaybookStep(state, 'skill-step', { plan: ['A'] });
    assert.equal(state.currentStep, 'action-step');
    assert.equal(state.steps[0].status, 'completed');

    const resolved = resolvePlaybookAction(state.steps[1], []);
    assert.equal(resolved.status, 'blocked');
    state = markPlaybookActionState(state, 'action-step', resolved);
    assert.equal(state.status, 'waiting-tool');
    assert.equal(state.currentStep, 'action-step');
    assert.equal(state.steps[0].status, 'completed');
    assert.deepEqual(state.context.outputs['skill-step'], { plan: ['A'] });
  });

  await t.test('spreadsheet action contract requires real output reference and 3 tabs', async () => {
    const spec = await readFile('docs/spreadsheet-project-plan.md', 'utf-8');
    assert.ok(spec.includes('Project Parameters'));
    assert.ok(spec.includes('Project Master Plan'));
    assert.ok(spec.includes('Gantt'));
    assert.ok(spec.includes('waiting-tool'));
    assert.ok(spec.includes('ห้ามบอกว่าสร้าง Google Sheet สำเร็จ'));
    assert.ok(spec.includes('output reference'));
  });

  await t.test('full manifest integrity includes Playbooks', async () => {
    const integrity = await loadAndValidateManifests(resolve('manifest'));
    assert.equal(integrity.valid, true, integrity.errors.join('\n'));
    assert.equal(integrity.summary.playbooksCount, 3);
  });
});
