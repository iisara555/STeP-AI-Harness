import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  loadActionRegistry,
  validateActionRegistry,
} from '../src/modules/actions/index.js';
import {
  STANDARD_PROVENANCE_TYPES,
  parseProvenanceYaml,
  validateProvenanceTypes,
} from '../src/modules/provenance/index.js';
import {
  loadPlaybooks,
  buildRunState,
  addRunProvenance,
  recordRunFeedback,
  resolvePlaybookAction,
  validatePlaybookRegistry,
} from '../src/modules/playbooks/index.js';
import { loadAndValidateManifests } from '../src/modules/router/index.js';
import { PACKAGE_ROOT } from '../src/modules/role-resolver.js';

test('Lightweight Organization AI Harness foundation', async (t) => {
  const actions = await loadActionRegistry(PACKAGE_ROOT);
  const playbooks = await loadPlaybooks(PACKAGE_ROOT);

  await t.test('Action Registry stays small and validates current Pilot actions', () => {
    assert.deepEqual(Object.keys(actions), [
      'spreadsheet-project-plan',
      'spreadsheet-action-plan',
      'browser-form-submit',
    ]);

    const result = validateActionRegistry(actions);
    assert.equal(result.valid, true, result.errors.join('\n'));

    assert.equal(actions['spreadsheet-project-plan'].capability, 'spreadsheet-write');
    assert.equal(actions['browser-form-submit'].confirmation, 'user-confirm');
    assert.equal(actions['browser-form-submit'].risk, 'high');
  });

  await t.test('Playbook actions must resolve to the central Action Registry', () => {
    const result = validatePlaybookRegistry(playbooks, {
      skills: new Set([
        'tor-review',
        'project-plan',
        'meeting-summary',
        'iso9001-audit-readiness',
        'audit-evidence-matrix',
        'document-record-control',
        'audit-interview-coach',
        'quality-objective-kpi-review',
        'ncr-capa',
        'management-review-prep',
      ]),
      teams: new Set(['pm', 'qs']),
      actions: new Set(Object.keys(actions)),
    });
    assert.equal(result.valid, true, result.errors.join('\n'));
  });

  await t.test('Action resolution exposes capability, risk and confirmation metadata', () => {
    const playbook = playbooks.find((p) => p.id === 'tor-to-project-plan');
    const action = playbook.steps.find((s) => s.type === 'action');
    const resolved = resolvePlaybookAction(action, ['google-sheets'], actions);

    assert.equal(resolved.status, 'ready');
    assert.equal(resolved.tool, 'google-sheets');
    assert.equal(resolved.capability, 'spreadsheet-write');
    assert.equal(resolved.risk, 'low');
    assert.equal(resolved.confirmation, 'none');
  });

  await t.test('Provenance registry matches the six shared labels', async () => {
    const text = await readFile(resolve('manifest/provenance.yaml'), 'utf-8');
    const types = parseProvenanceYaml(text);
    const result = validateProvenanceTypes(types);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.deepEqual(types.map((t) => t.id), STANDARD_PROVENANCE_TYPES);
  });

  await t.test('Run State v3 adds provenance, event log and feedback without a new service', () => {
    const playbook = playbooks.find((p) => p.id === 'tor-to-project-plan');
    let state = buildRunState({
      playbook,
      query: 'ช่วยทำ Action Plan จาก TOR',
      team: 'pubsec',
      matchedSignals: ['source', 'planning', 'schedule'],
      sourceRefs: [{ id: 'tor-1', name: 'TOR.pdf' }],
      now: new Date('2026-09-18T08:00:00Z'),
    });

    assert.equal(state.version, 3);
    assert.equal(state.events[0].type, 'run-created');
    assert.deepEqual(state.context.provenance, []);
    assert.deepEqual(state.feedback, []);

    state = addRunProvenance(state, {
      type: 'SOURCE_FACT',
      value: 'งบประมาณรวม 2,500,000 บาท',
      sourceRef: 'tor-1',
      sourceLocation: 'หน้า 12',
      createdAt: '2026-09-18T08:01:00.000Z',
    });

    state = recordRunFeedback(state, {
      rating: 'needs-fix',
      category: 'source',
      note: 'อ้างหน้าผิด',
      createdAt: '2026-09-18T08:02:00.000Z',
    });

    assert.equal(state.context.provenance[0].type, 'SOURCE_FACT');
    assert.equal(state.context.provenance[0].sourceLocation, 'หน้า 12');
    assert.equal(state.feedback[0].rating, 'needs-fix');
    assert.ok(state.events.some((e) => e.type === 'provenance-added'));
    assert.ok(state.events.some((e) => e.type === 'feedback-recorded'));
  });

  await t.test('Full manifest integrity includes actions and provenance', async () => {
    const integrity = await loadAndValidateManifests(resolve('manifest'));
    assert.equal(integrity.valid, true, integrity.errors.join('\n'));
    assert.equal(integrity.summary.actionsCount, 3);
    assert.equal(integrity.summary.provenanceTypesCount, 6);
  });
});
