import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
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
} from '../src/modules/playbooks/index.js';
import { loadAndValidateManifests } from '../src/modules/router/index.js';
import { PACKAGE_ROOT } from '../src/modules/role-resolver.js';

test('STeP Composite Playbooks', async (t) => {
  const playbooks = await loadPlaybooks(PACKAGE_ROOT);

  await t.test('registry contains the 3 intentionally small Pilot playbooks', () => {
    assert.equal(playbooks.length, 3);
    assert.deepEqual(
      playbooks.map((p) => p.id),
      ['tor-to-project-plan', 'meeting-to-action-plan', 'iso-audit-readiness-flow']
    );
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

  await t.test('full manifest integrity includes Playbooks', async () => {
    const integrity = await loadAndValidateManifests(resolve('manifest'));
    assert.equal(integrity.valid, true, integrity.errors.join('\n'));
    assert.equal(integrity.summary.playbooksCount, 3);
  });
});
