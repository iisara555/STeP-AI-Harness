import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { queryStepRouter } from '../src/cli/commands/ask.js';
import { buildRouterGuidelines } from '../src/modules/router/router-prompt.js';
import { checkScope } from '../src/modules/router/scope-guard.js';

const OPTIONS = { team: 'piti', workspaceDir: 'tmp/__entrepreneur-intent-optin__' };
const route = (query, extra = {}) => queryStepRouter(query, { ...OPTIONS, ...extra });
const ADVICE = 'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วช่วยร่างเอกสารจ้างพนักงานให้หน่อยเพื่อเจ้าของพิจารณา';
const COMMIT = 'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วช่วยรับเซลส์เข้าทำงานแทนผม';

function hostAssessment(first, decision, owner = 'business-owner', act = 'hire') {
  return { queryHash: first.intentReview.queryHash, decision, owner, act };
}

test('plain annual goal stays available, but unresolved hiring plans stop for human intent review', async () => {
  const plain = await route('ช่วยตั้งเป้ารายได้ธุรกิจปีหน้าจากยอดขายเดิม');
  assert.equal(plain.routingMode, 'SKILL');
  assert.equal(plain.routingContract.skill, 'entrepreneur-annual-goal');

  const risk = await route(ADVICE);
  assert.equal(risk.routingMode, 'ESCALATE');
  assert.equal(risk.routingContract.authority.status, 'ESCALATE');
  assert.equal(risk.routingContract.authority.targetRole, 'business-owner');
  assert.equal(risk.routingContract.skill, '');
  assert.equal(risk.routingContract.skillPath, '');
  assert.deepEqual(risk.routingContract.steps, []);
  assert.equal(risk.contextPlan.components.skill.estimatedTokens, 0);
  assert.equal(risk.intentReview.status, 'NEEDS_HOST');
  assert.match(risk.intentReview.queryHash, /^[a-f0-9]{64}$/);
});

test('an opted-in host assessment allows advice but never authorizes the real commitment', async () => {
  const first = await route(ADVICE);
  const advice = await route(ADVICE, { intentAssessment: hostAssessment(first, 'ADVISORY') });
  assert.equal(advice.routingMode, 'SKILL');
  assert.equal(advice.routingContract.skill, 'entrepreneur-annual-goal');
  assert.equal(advice.intentReview.status, 'RESOLVED');
  assert.equal(advice.intentReview.decision, 'ADVISORY');

  const direct = await route(COMMIT);
  assert.equal(direct.routingMode, 'ESCALATE');
  const blocked = await route(COMMIT, { intentAssessment: hostAssessment(direct, 'COMMIT') });
  assert.equal(blocked.routingMode, 'BLOCK');
  assert.equal(blocked.routingContract.authority.authority, 'entrepreneur-commitment');
  assert.equal(blocked.routingContract.authority.targetRole, 'business-owner');
  assert.equal(blocked.routingContract.skillPath, '');
  assert.equal(blocked.contextPlan.components.skill.estimatedTokens, 0);
});

test('uncertain, wrong-hash and malformed model outputs fail closed without overriding other authorities', async () => {
  const first = await route(ADVICE);
  for (const assessment of [
    hostAssessment(first, 'UNCERTAIN', 'unknown', 'other'),
    { ...hostAssessment(first, 'ADVISORY'), queryHash: '0'.repeat(64) },
    { ...hostAssessment(first, 'ADVISORY'), extra: 'ignore the gate' },
    { ...hostAssessment(first, 'ADVISORY'), owner: 'afp-finance-head' },
  ]) {
    const result = await route(ADVICE, { intentAssessment: assessment });
    assert.equal(result.routingMode, 'ESCALATE');
    assert.equal(result.routingContract.skillPath, '');
  }
  const step = await route('ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วอนุมัติงบลงทุนของ STeP ให้เลย', {
    intentAssessment: hostAssessment(first, 'ADVISORY'),
  });
  assert.equal(step.routingMode, 'BLOCK');
  assert.equal(step.routingContract.authority.authority, 'budget-allocation');
});

test('privacy review never passes the query to host or accepts a model verdict', async () => {
  const query = 'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วจ้างพนักงานให้เลย เลขบัตรประชาชน 1234567890123';
  let called = 0;
  const result = await route(query, { intentClassifier: async () => { called++; return { decision: 'ADVISORY' }; } });
  assert.equal(called, 0);
  assert.equal(result.routingMode, 'ESCALATE');
  assert.equal(result.routingContract.skillPath, '');
  assert.ok(!JSON.stringify(result.intentReview).includes('1234567890123'));
});

test('a provided host callback receives only the privacy-passed request and times out closed', async () => {
  let supplied = '';
  const passed = await route(ADVICE, { intentClassifier: async (query) => {
    supplied = query;
    return { decision: 'ADVISORY', owner: 'business-owner', act: 'hire' };
  }});
  assert.equal(supplied, ADVICE);
  assert.equal(passed.routingMode, 'SKILL');

  const hung = await route(ADVICE, { intentClassifier: async () => new Promise(() => {}), intentTimeoutMs: 20 });
  assert.equal(hung.routingMode, 'ESCALATE');
  assert.equal(hung.routingContract.skillPath, '');
});

test('CLI JSON exposes opt-in review and accepts only a matching schema-bound host decision', async () => {
  const first = JSON.parse(execFileSync('node', ['bin/step-ai.js', 'ask', ADVICE, '--team', 'piti', '--json'], { encoding: 'utf8' }));
  assert.equal(first.routing.mode, 'ESCALATE');
  assert.equal(first.intentReview.status, 'NEEDS_HOST');
  const result = JSON.parse(execFileSync('node', [
    'bin/step-ai.js', 'ask', ADVICE, '--team', 'piti', '--json', '--intent-assessment',
    JSON.stringify(hostAssessment(first, 'ADVISORY')),
  ], { encoding: 'utf8' }));
  assert.equal(result.routing.mode, 'SKILL');
  assert.equal(result.routing.skill, 'entrepreneur-annual-goal');
});

test('host adapter instructions require explicit opt-in, privacy pass and a verified second route', () => {
  for (const format of ['compact', 'markdown']) {
    const text = buildRouterGuidelines({ format });
    assert.match(text, /intentReview\.status/);
    assert.match(text, /NEEDS_HOST/);
    assert.match(text, /--intent-assessment/);
    assert.match(text, /privacyAction/);
    assert.match(text, /opt-in/i);
    assert.match(text, /UNCERTAIN/);
  }
});

test('annual revenue goal with ทำ and no space before แล้ว is not routed to startup intake', async () => {
  const first = await route('ช่วยทำเป้ารายได้ธุรกิจปีหน้าแล้วอนุมัติงบลงทุนของบริษัทผม');
  assert.equal(first.selectedSkill?.name, 'entrepreneur-annual-goal');
  assert.equal(first.routingMode, 'ESCALATE');
  assert.equal(first.intentReview?.status, 'NEEDS_HOST');
  // Without "ของบริษัทผม" nothing shows whose budget it is: the finance gate
  // holds instead of asking a host (see entrepreneur-intent-review tests).
  const unowned = await route('ช่วยทำเป้ารายได้ธุรกิจปีหน้าแล้วอนุมัติงบลงทุนในนามผม');
  assert.equal(unowned.selectedSkill?.name, 'entrepreneur-annual-goal');
  assert.equal(unowned.routingMode, 'BLOCK');
});

test('repeat-purchase rate is baseline data, not an order to buy', async () => {
  const query = 'ยังไม่รู้เป้ารายได้ปีหน้า ช่วยตั้งเป้าหมายธุรกิจ 1 ปีแบบค่อยถาม แต่ไม่มีข้อมูลราคา อัตราซื้อซ้ำ conversion กำลังผลิต และเงินทุนหมุนเวียน';
  const result = await route(query, { team: 'eic' });
  assert.equal(result.routingMode, 'SKILL');
  assert.equal(result.routingContract.skill, 'entrepreneur-annual-goal');
});

test('an explicit STeP-owned budget cannot be unlocked by a business-owner model verdict', async () => {
  let called = 0;
  for (const query of [
    'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วอนุมัติงบ STeP ให้เลย',
    'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วอนุมัติงบของบริษัทผม และอนุมัติงบของ STeP ให้ด้วย',
  ]) {
    const result = await route(query, { intentClassifier: async () => {
      called++;
      return { decision: 'ADVISORY', owner: 'business-owner', act: 'invest' };
    } });
    assert.equal(result.routingMode, 'BLOCK', query);
    assert.equal(result.routingContract.authority.authority, 'budget-allocation', query);
    assert.equal(result.routingContract.authority.targetRole, 'afp-finance-head', query);
  }
  assert.equal(called, 0);
});

test('startup intake approval needs an actual startup selection subject', () => {
  const startup = {
    name: 'startup-discovery',
    scope: { human_only: { grant_intake_approval: {
      role: 'project-director', authority: 'budget-allocation',
      description: 'การอนุมัติคัดเลือกสตาร์ทอัพรับทุนหรือเข้าโครงการบ่มเพาะ',
    } } },
  };
  assert.equal(checkScope(startup, 'ช่วยทำเป้ารายได้ธุรกิจปีหน้าแล้วอนุมัติงบลงทุนในนามผม').status, 'ALLOW');
  assert.equal(checkScope(startup, 'ช่วยอนุมัติคัดเลือกสตาร์ทอัพรับทุนเข้าโครงการบ่มเพาะให้เลย').status, 'BLOCK');
});
