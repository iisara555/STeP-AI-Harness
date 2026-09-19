import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { evaluatePrivacyGate, sanitizeRunData } from '../src/modules/privacy/index.js';
import { loadActionRegistry, evaluateActionGate, requestActionApproval } from '../src/modules/actions/index.js';
import { verifyActionOutput } from '../src/modules/actions/output-verification.js';
import {
  loadPlaybooks, buildRunState, completePlaybookStep, completePlaybookAction,
  createPlaybookRun, readPlaybookRun, updatePlaybookRun, addRunProvenance, recordRunFeedback,
  resolvePlaybookAction, markPlaybookActionState,
} from '../src/modules/playbooks/index.js';
import { PACKAGE_ROOT } from '../src/modules/role-resolver.js';

const playbooks = await loadPlaybooks(PACKAGE_ROOT);
const actions = await loadActionRegistry(PACKAGE_ROOT);
const tor = playbooks.find((p) => p.id === 'tor-to-project-plan');
const meeting = playbooks.find((p) => p.id === 'meeting-to-action-plan');

function pendingAction(playbook = tor) {
  let state = buildRunState({ playbook, query: 'synthetic regression', matchedSignals: ['source', 'planning', 'schedule', 'spreadsheet'] });
  for (const step of state.steps.filter((item) => item.type === 'skill')) {
    state = completePlaybookStep(state, step.id, { facts: ['Synthetic fact only'] });
  }
  return state;
}

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'step-hardening-'));
  await mkdir(join(root, 'output'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('name-only text is masked, not silently passed as public', () => {
  for (const text of ['ชื่อพนักงาน: นายทดสอบ สมมติ', 'นายทดสอบ สมมติ', 'Employee name: Synthetic Person']) {
    const result = evaluatePrivacyGate(text);
    assert.equal(result.classification, 'restricted');
    assert.equal(result.redactionApplied, true);
    assert.equal(result.detectionScope, 'text-patterns-only');
    assert.ok(!result.redactedText.includes('สมมติ'));
    assert.ok(!result.redactedText.includes('Synthetic Person'));
  }
});

test('health with email or name is blocked; unresolved confirmation cannot transmit', () => {
  for (const text of ['test@example.invalid ประวัติการรักษา: synthetic', 'นายทดสอบ สมมติ ผลตรวจสุขภาพ']) {
    const result = evaluatePrivacyGate(text);
    assert.equal(result.action, 'block-external');
    assert.equal(result.canSendToExternalAI, false);
  }
  const pending = evaluatePrivacyGate('แนวทางทั่วไปสำหรับข้อมูลสุขภาพ');
  assert.equal(pending.action, 'human-confirm');
  assert.equal(pending.canSendToExternalAI, false);
});

test('credentials, structured PII and object keys are minimized without changing source facts', () => {
  const secret = ['synthetic', 'password'].join('-');
  const value = sanitizeRunData({
    credentials: { access_token: secret, password: secret },
    employee: { name: 'Synthetic Person', national_id: '1234567890123' },
    rows: [{ note: `password=${secret}`, contact: 'test@example.invalid' }],
    'test@example.invalid': 'phone 0812345678',
    facts: { budget: 10000, dueDate: '2026-10-15', sourceRef: 'TOR-SYN-01' },
  });
  const serialized = JSON.stringify(value);
  for (const privateValue of [secret, 'Synthetic Person', '1234567890123', 'test@example.invalid', '0812345678']) {
    assert.ok(!serialized.includes(privateValue));
  }
  assert.deepEqual(value.facts, { budget: 10000, dueDate: '2026-10-15', sourceRef: 'TOR-SYN-01' });
});

test('step outputs, handoffs, provenance and feedback are redacted before persistence', () => {
  let state = buildRunState({ playbook: tor, query: 'TOR', matchedSignals: ['source', 'planning', 'schedule'] });
  state = completePlaybookStep(state, 'review-source', { 'source-facts': [{ contact: 'test@example.invalid' }] });
  state = addRunProvenance(state, { type: 'SOURCE_FACT', value: 'โทร 0812345678', sourceRef: 'TOR-SYN-01', note: 'ชื่อพนักงาน: นายทดสอบ สมมติ' });
  state = recordRunFeedback(state, { rating: 'needs-fix', category: 'test@example.invalid', note: 'โทร 0812345678' });
  const serialized = JSON.stringify(state);
  for (const value of ['test@example.invalid', '0812345678', 'นายทดสอบ', 'สมมติ']) assert.ok(!serialized.includes(value));
  assert.equal(state.context.provenance[0].sourceRef, 'TOR-SYN-01');
});

test('state write boundary also sanitizes direct updater data and protects run identity', async (t) => {
  const root = await workspace(t);
  const run = await createPlaybookRun(root, { playbook: tor, query: 'TOR', matchedSignals: ['source', 'planning', 'schedule'] });
  await updatePlaybookRun(root, run.runId, (state) => ({ ...state, extra: { employeeName: 'Synthetic Person', note: 'test@example.invalid' } }));
  const disk = await readFile(run.statePath, 'utf8');
  assert.ok(!disk.includes('Synthetic Person'));
  assert.ok(!disk.includes('test@example.invalid'));
  if (process.platform !== 'win32') assert.equal((await stat(run.statePath)).mode & 0o777, 0o600);
  await assert.rejects(readPlaybookRun(root, '../outside'), /Invalid run ID/);
  await assert.rejects(updatePlaybookRun(root, run.runId, { runId: 'different' }), /Cannot change run ID/);
});

test('same-second runs have distinct IDs and model/source revisions remain explicit', () => {
  const args = { playbook: tor, now: new Date('2026-09-19T00:00:00Z') };
  const first = buildRunState(args);
  const second = buildRunState(args);
  assert.notEqual(first.runId, second.runId);
  assert.equal(first.execution.modelId, null);
  const recorded = buildRunState({ ...args, execution: { modelId: 'synthetic-model', harnessRevision: 'a'.repeat(40), sourceVersions: { 'TOR-SYN-01': '1' } } });
  assert.equal(recorded.execution.modelId, 'synthetic-model');
  assert.equal(recorded.execution.sourceVersions['TOR-SYN-01'], '1');
});

test('unregistered action and missing confirmation fail closed', () => {
  const step = { id: 'submit', type: 'action', action: 'browser-form-submit' };
  assert.equal(resolvePlaybookAction(step, ['browser']).status, 'blocked');
  const result = resolvePlaybookAction(step, ['browser'], actions);
  assert.equal(result.status, 'waiting-confirmation');
  const state = buildRunState({ playbook: { id: 'browser-test', steps: [step] } });
  assert.equal(markPlaybookActionState(state, 'submit', result).status, 'waiting-confirmation');
});

test('approval is bound to exact operation and cannot be forged as JSON or cross human-only authority', async (t) => {
  const action = actions['browser-form-submit'];
  const operation = { runId: 'run-1', stepId: 'submit', target: 'https://example.invalid/form', payload: { answer: 'synthetic' } };
  const approval = await requestActionApproval(action.id, operation, async () => true);
  assert.equal(evaluateActionGate(action, { operation, approval }).status, 'allowed');
  assert.equal(evaluateActionGate(action, { operation, approval: { ...approval } }).status, 'waiting-confirmation');
  for (const changed of [
    { ...operation, runId: 'run-2' },
    { ...operation, target: 'https://example.invalid/other' },
    { ...operation, payload: { answer: 'changed' } },
  ]) assert.equal(evaluateActionGate(action, { operation: changed, approval }).status, 'waiting-confirmation');
  assert.equal(evaluateActionGate({ ...action, confirmation: 'human-only', risk: 'restricted' }, { operation, approval }).status, 'blocked');
  assert.equal(await requestActionApproval(action.id, operation, async () => false), null);
  await assert.rejects(requestActionApproval(action.id, operation, async ({ operation: snapshot }) => {
    snapshot.payload.answer = 'modified';
    return true;
  }), /changed during confirmation/);
  const differentRun = buildRunState({ playbook: { id: 'browser-test', steps: [{ id: 'submit', type: 'action', action: action.id }] } });
  await assert.rejects(completePlaybookAction(differentRun, 'submit', { url: 'https://example.invalid/receipt' }, {
    authorization: { operation, approval },
  }), /confirmation must match this run and step/);
  t.mock.method(Date, 'now', () => approval.expiresAt + 1);
  assert.equal(evaluateActionGate(action, { operation, approval }).status, 'waiting-confirmation');
});

test('TOR and meeting flows cannot complete with a fabricated path, empty file or missing verifier', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, 'output', 'empty.xlsx'), '');
  for (const flow of [tor, meeting]) {
    const state = pendingAction(flow);
    assert.throws(() => completePlaybookStep(state, state.currentStep, { path: 'output/fake.xlsx' }), /verified output/);
    await assert.rejects(completePlaybookAction(state, state.currentStep, { path: 'output/fake.xlsx' }, { workspaceDir: root }), /ENOENT/);
    await assert.rejects(completePlaybookAction(state, state.currentStep, { path: 'output/empty.xlsx' }, { workspaceDir: root }), /non-empty/);
    await assert.rejects(completePlaybookAction(state, state.currentStep, { url: 'https://example.invalid/sheet' }), /trusted connector/);
    assert.equal(state.status, 'active');
  }
});

test('verified local output completes once with a content hash, without inventing semantic validation', async (t) => {
  const root = await workspace(t);
  // Physical-file verification only: semantic spreadsheet checks are host work.
  const contents = 'Synthetic action\towner\tdue date\nDraft\tTeam A\t2026-10-01\n';
  await writeFile(join(root, 'output', 'tracker.tsv'), contents);
  const state = pendingAction(meeting);
  const done = await completePlaybookAction(state, state.currentStep, { path: 'output/tracker.tsv' }, { workspaceDir: root });
  assert.equal(done.status, 'completed');
  const evidence = done.steps.at(-1).outputVerification;
  assert.equal(evidence.sha256, createHash('sha256').update(contents).digest('hex'));
  assert.equal(evidence.bytes, Buffer.byteLength(contents));
  await assert.rejects(completePlaybookAction(done, state.currentStep, { path: 'output/tracker.tsv' }, { workspaceDir: root }), /already completed/);
});

test('remote verifier must return identity and revision for the same canonical reference', async () => {
  const state = pendingAction();
  const reference = 'https://example.invalid/sheets/synthetic';
  await assert.rejects(completePlaybookAction(state, state.currentStep, { url: reference }, {
    verifyRemoteOutput: async () => ({ verified: true, reference: 'https://example.invalid/wrong', resourceId: '1', revision: 'v1' }),
  }), /verification failed/);
  const done = await completePlaybookAction(state, state.currentStep, { url: reference }, {
    verifyRemoteOutput: async (ref) => ({ verified: true, reference: ref, resourceId: 'synthetic-sheet', revision: 'v1' }),
  });
  assert.equal(done.status, 'completed');
  assert.equal(done.steps.at(-1).outputVerification.resourceId, 'synthetic-sheet');
});

test('output verification rejects traversal, symlink escape, credentials and conflicting references', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, 'outside.txt'), 'synthetic');
  await assert.rejects(verifyActionOutput({ path: 'outside.txt' }, { workspaceDir: root }), /inside the workspace/);
  if (process.platform !== 'win32') {
    await symlink(join(root, 'outside.txt'), join(root, 'output', 'escape.txt'));
    await assert.rejects(verifyActionOutput({ path: 'output/escape.txt' }, { workspaceDir: root }), /inside the workspace/);
  }
  for (const url of ['http://example.invalid/a', 'https://user:pass@example.invalid/a', 'https://example.invalid/a?token=synthetic']) {
    await assert.rejects(verifyActionOutput({ url }), /canonical HTTPS/);
  }
  await assert.rejects(verifyActionOutput({ path: 'a', url: 'https://example.invalid/a' }), /conflicting/);
});

test('direct state updates cannot label unverified actions completed; verified transition can persist', async (t) => {
  const root = await workspace(t);
  const run = await createPlaybookRun(root, { playbook: meeting, matchedSignals: ['spreadsheet'] });
  await assert.rejects(updatePlaybookRun(root, run.runId, (state) => ({
    ...state, steps: state.steps.map((step) => step.type === 'action' ? { ...step, status: 'completed' } : step),
  })), /requires completePlaybookAction/);
  await assert.rejects(updatePlaybookRun(root, run.runId, (state) => {
    state.steps.at(-1).status = 'completed';
    return state;
  }), /requires completePlaybookAction/);
  let state = await readPlaybookRun(root, run.runId);
  for (const step of state.steps.filter((s) => s.type === 'skill')) state = completePlaybookStep(state, step.id, {});
  await updatePlaybookRun(root, run.runId, () => state);
  await writeFile(join(root, 'output', 'synthetic.tsv'), 'synthetic');
  const done = await completePlaybookAction(state, state.currentStep, { path: 'output/synthetic.tsv' }, { workspaceDir: root });
  const unmodified = done.steps.at(-1).outputVerification.reference;
  done.steps.at(-1).outputVerification.reference = 'output/fake.tsv';
  await assert.rejects(updatePlaybookRun(root, run.runId, () => done), /requires completePlaybookAction/);
  done.steps.at(-1).outputVerification.reference = unmodified;
  await updatePlaybookRun(root, run.runId, () => done);
  assert.equal((await readPlaybookRun(root, run.runId)).status, 'completed');
});
