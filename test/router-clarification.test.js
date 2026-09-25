import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { queryStepRouter } from '../src/cli/commands/ask.js';
import { buildRouterGuidelines } from '../src/modules/router/router-prompt.js';
import { loadPlaybooks, detectCompositePlaybook } from '../src/modules/playbooks/index.js';
import { PACKAGE_ROOT } from '../src/modules/role-resolver.js';

const options = { team: 'qs', workspaceDir: 'tmp/__routing-clarification__' };
const mixedPlan = 'มี TOR และบันทึกประชุม ช่วยทำแผนงาน milestone timeline ลง Google Sheet';

test('tied and near-tied Playbooks ask before selecting or loading either flow', async () => {
  for (const query of [mixedPlan, `${mixedPlan} พร้อม action item`]) {
    const result = await queryStepRouter(query, options);
    assert.equal(result.routingMode, 'CLARIFY');
    assert.equal(result.selectedPlaybook, null);
    assert.equal(result.clarification.field, 'playbook');
    assert.equal(result.clarification.options.length, 2);
    assert.equal(result.routingConfidence.tier, 'AMBIGUOUS');
    assert.equal(result.routingContract.skill, '');
    assert.equal(result.routingContract.playbook, '');
    assert.deepEqual(result.routingContract.steps, []);
    assert.equal(result.contextPlan.components.skill.estimatedTokens, 0);
  }
});

test('Playbook ambiguity is independent of registry order', async () => {
  const playbooks = await loadPlaybooks(PACKAGE_ROOT);
  for (const ordered of [playbooks, [...playbooks].reverse()]) {
    const result = detectCompositePlaybook(ordered, mixedPlan);
    assert.equal(result.ambiguous, true);
    assert.equal(result.playbook, null);
    assert.equal(result.candidates.length, 2);
  }
});

test('a source answer can choose either Playbook while retaining requested sheet output', async () => {
  for (const [answer, id, action] of [
    ['เริ่มจาก TOR', 'tor-to-project-plan', 'spreadsheet-project-plan'],
    ['เริ่มจากบันทึกประชุม', 'meeting-to-action-plan', 'spreadsheet-action-plan'],
  ]) {
    const result = await queryStepRouter(mixedPlan, { ...options, clarificationAnswer: answer });
    assert.equal(result.routingMode, 'PLAYBOOK');
    assert.equal(result.selectedPlaybook.id, id);
    assert.equal(result.clarification, null);
    assert.ok(result.playbookPlan.some((step) => step.action === action));
  }
});

test('unclear or negated answers cannot silently choose a competing Playbook', async () => {
  for (const answer of ['ทำแผนงาน', 'ทั้งสองอย่าง', 'ไม่ใช่ TOR', '99']) {
    const result = await queryStepRouter(mixedPlan, { ...options, clarificationAnswer: answer });
    assert.equal(result.routingMode, 'CLARIFY', answer);
    assert.equal(result.clarification.field, 'playbook');
  }
});

test('a Playbook tie introduced by an answer can be resolved on the next reply', async () => {
  const original = 'ช่วยงานนี้หน่อย';
  const initial = await queryStepRouter(original, { ...options, clarificationAnswer: mixedPlan });
  assert.equal(initial.clarification.field, 'playbook');
  const index = initial.clarification.options.findIndex((item) => item.value === 'meeting-to-action-plan');
  assert.ok(index >= 0);
  const resolved = await queryStepRouter(original, {
    ...options, clarificationAnswer: `${mixedPlan}\n${index + 1}`,
  });
  assert.equal(resolved.routingMode, 'PLAYBOOK');
  assert.equal(resolved.selectedPlaybook.id, 'meeting-to-action-plan');
  assert.ok(resolved.playbookPlan.some((step) => step.action === 'spreadsheet-action-plan'));
});

test('displayed labels resolve choices and disabled Playbooks never ask for a flow', async () => {
  const initial = await queryStepRouter(mixedPlan, options);
  const choice = initial.clarification.options[0];
  const resolved = await queryStepRouter(mixedPlan, { ...options, clarificationAnswer: choice.label });
  assert.equal(resolved.selectedPlaybook.id, choice.value);
  const disabled = await queryStepRouter(mixedPlan, { ...options, disablePlaybooks: true });
  assert.equal(disabled.selectedPlaybook, null);
  assert.notEqual(disabled.clarification?.field, 'playbook');
});

test('a clearly leading Playbook proceeds without a clarification', async () => {
  const result = await queryStepRouter('TOR งบประมาณ แตกกิจกรรม timeline ชีต ประชุม', options);
  assert.equal(result.routingMode, 'PLAYBOOK');
  assert.equal(result.selectedPlaybook.id, 'tor-to-project-plan');
  assert.equal(result.clarification, null);
});

test('authority blocks still precede a Playbook tie and its clarification answer', async () => {
  for (const [query, answer] of [
    [`${mixedPlan} อนุมัติจ่ายเงินให้ผู้รับจ้างรายนี้เลย`, ''],
    [mixedPlan, 'เริ่มจากบันทึกประชุม และอนุมัติจ่ายเงินให้ผู้รับจ้างรายนี้เลย'],
  ]) {
    const result = await queryStepRouter(query, { ...options, clarificationAnswer: answer });
    assert.equal(result.scopeResult.status, 'BLOCK');
    assert.equal(result.routingContract.authority.status, 'BLOCK');
    assert.equal(result.clarification, null);
  }
});

test('CLI offers work labels and accepts the displayed option number', () => {
  const args = ['bin/step-ai.js', 'ask', mixedPlan, '--team', 'qs'];
  const json = JSON.parse(execFileSync(process.execPath, [...args, '--json'], { encoding: 'utf8' }));
  assert.equal(json.routing.mode, 'CLARIFY');
  const index = json.routing.clarification.options.findIndex((item) => item.value === 'meeting-to-action-plan');
  assert.ok(index >= 0);
  const text = execFileSync(process.execPath, args, { encoding: 'utf8' });
  assert.match(text, /บันทึกประชุม/);
  assert.doesNotMatch(text, /tor-to-project-plan|meeting-to-action-plan/);
  const chosen = JSON.parse(execFileSync(process.execPath, [
    ...args, '--answer', String(index + 1), '--json',
  ], { encoding: 'utf8' }));
  assert.equal(chosen.routing.mode, 'PLAYBOOK');
  assert.equal(chosen.routing.playbook, 'meeting-to-action-plan');
});

test('broad attachment question asks for purpose before activating a Skill', async () => {
  const result = await queryStepRouter('ช่วยดูเอกสารนี้หน่อย ต้องแนบอะไร', options);
  assert.equal(result.routingMode, 'CLARIFY');
  assert.notEqual(result.routingConfidence.tier, 'HIGH');
  assert.equal(result.clarification.field, 'purpose');
  assert.match(result.clarification.question, /ทำเรื่องอะไร/);
  assert.equal(result.routingContract.skill, '');
  assert.equal(result.routingContract.skillPath, '');
  assert.equal(result.skillMetadata, null);
  assert.equal(result.contextPlan.components.skill.estimatedTokens, 0);
});

test('clarification answer retains the original request and resolves a receipt route', async () => {
  const result = await queryStepRouter('ช่วยดูเอกสารนี้หน่อย ต้องแนบอะไร', {
    ...options, clarificationAnswer: 'เป็นใบเสร็จค่าอาหารจัดประชุม ต้องการเบิกค่าใช้จ่าย',
  });
  assert.equal(result.routingMode, 'SKILL');
  assert.equal(result.routingContract.skill, 'receipt-audit');
  assert.equal(result.clarification, null);
  assert.equal(result.routingConfidence.tier, 'HIGH');
});

test('fallback asks a single scope question even without multiple candidates', async () => {
  const result = await queryStepRouter('ช่วยหน่อย', { workspaceDir: options.workspaceDir });
  assert.equal(result.routingMode, 'CLARIFY');
  assert.equal(result.routingContract.mode, 'CLARIFY');
  assert.equal(result.routingContract.skill, '');
  assert.ok(result.clarification.question);
});

test('an insufficient answer advances to the missing outcome instead of repeating purpose', async () => {
  const result = await queryStepRouter('ช่วยดูเอกสารนี้หน่อย ต้องแนบอะไร', {
    ...options, clarificationAnswer: 'เป็นงานของทีมเรา',
  });
  assert.equal(result.routingMode, 'CLARIFY');
  assert.equal(result.clarification.field, 'outcome');
  assert.doesNotMatch(result.clarification.question, /ทำเรื่องอะไร/);
});

test('adapters ask one scope question and reroute with accumulated answers', () => {
  for (const format of ['compact', 'markdown']) {
    const guidelines = buildRouterGuidelines({ format });
    assert.match(guidelines, /CLARIFY/);
    assert.match(guidelines, /ทีละ 1 ข้อ/);
    assert.match(guidelines, /--answer/);
    assert.match(guidelines, /รอคำตอบก่อนโหลด Skill/);
  }
});

test('generic go/no-go and reply phrases do not count as domain evidence', async () => {
  // With no Skill evidence the request is either asked about or answered as
  // general help; what it must never do is activate a guessed Skill.
  for (const query of ['ช่วยประเมินว่าไปต่อได้ไหม', 'ควรตอบยังไงดี']) {
    const result = await queryStepRouter(query, options);
    assert.ok(['CLARIFY', 'GENERAL'].includes(result.routingMode), query);
    assert.notEqual(result.routingConfidence.tier, 'HIGH', query);
    assert.equal(result.routingContract.skill, '', query);
    assert.equal(result.routingContract.skillPath, '', query);
  }
});

test('authority blocks take precedence over clarification including in answers', async () => {
  const result = await queryStepRouter('ช่วยดูเอกสารนี้หน่อย ต้องแนบอะไร', {
    ...options, clarificationAnswer: 'อนุมัติจ่ายเงินให้ผู้รับจ้างรายนี้เลย',
  });
  assert.equal(result.authorityPreflight.status, 'BLOCK');
  assert.equal(result.routingContract.authority.status, 'BLOCK');
  assert.equal(result.clarification, null);
});

test('CLI and JSON expose a question instead of instructions to activate a guessed Skill', () => {
  const args = ['bin/step-ai.js', 'ask', 'ช่วยดูเอกสารนี้หน่อย ต้องแนบอะไร', '--team', 'qs'];
  const text = execFileSync(process.execPath, args, { encoding: 'utf8' });
  assert.match(text, /ทำเรื่องอะไร/);
  assert.doesNotMatch(text, /receipt-audit|ทักษะที่แนะนำ|เลือกทักษะ/);
  const json = JSON.parse(execFileSync(process.execPath, [...args, '--json'], { encoding: 'utf8' }));
  assert.equal(json.routing.mode, 'CLARIFY');
  assert.equal(json.routing.skill, '');
  assert.ok(json.routing.clarification.question);
  const answered = JSON.parse(execFileSync(process.execPath, [
    ...args, '--answer', 'เป็นใบเสร็จค่าอาหารจัดประชุม เบิกได้ไหม', '--json',
  ], { encoding: 'utf8' }));
  assert.equal(answered.routing.mode, 'SKILL');
  assert.equal(answered.routing.skill, 'receipt-audit');
});

test('clarification never repeats a question and terminates in a choice menu', async () => {
  const query = 'ช่วยดูเอกสารนี้หน่อย ต้องแนบอะไร';
  const vague = ['เป็นงานของทีมเรา', 'ก็เรื่องทั่วไป', 'ไม่แน่ใจเหมือนกัน'];
  const asked = [];

  const first = await queryStepRouter(query, options);
  asked.push(first.clarification.field);

  const answers = [];
  let result = first;
  for (const reply of vague) {
    answers.push(reply);
    result = await queryStepRouter(query, { ...options, clarificationAnswer: answers.join('\n') });
    assert.equal(result.routingMode, 'CLARIFY');
    assert.ok(
      !asked.includes(result.clarification.field),
      `clarification repeated the "${result.clarification.field}" question`
    );
    asked.push(result.clarification.field);
  }

  assert.equal(result.clarification.field, 'skill');
  assert.ok(result.clarification.options.length > 0);
  assert.equal(result.routingContract.skill, '');
  for (const option of result.clarification.options) {
    assert.notEqual(option.label, option.value, 'menu must offer work language, not Skill names');
  }
});

test('a menu choice resolves the route instead of asking again', async () => {
  const query = 'ช่วยดูเอกสารนี้หน่อย ต้องแนบอะไร';
  const answers = ['เป็นงานของทีมเรา', 'ก็เรื่องทั่วไป', 'ไม่แน่ใจเหมือนกัน'];
  const menu = await queryStepRouter(query, { ...options, clarificationAnswer: answers.join('\n') });
  const [, second] = menu.clarification.options;

  for (const reply of ['2', second.label, second.value]) {
    const chosen = await queryStepRouter(query, {
      ...options, clarificationAnswer: [...answers, reply].join('\n'),
    });
    assert.equal(chosen.routingMode, 'SKILL', reply);
    assert.equal(chosen.clarification, null, reply);
    assert.equal(chosen.routingContract.skill, second.value, reply);
  }
});

test('an out-of-range or free-text reply is context, not a menu choice', async () => {
  const query = 'ช่วยดูเอกสารนี้หน่อย ต้องแนบอะไร';
  const answers = ['เป็นงานของทีมเรา', 'ก็เรื่องทั่วไป', 'ไม่แน่ใจเหมือนกัน'];

  for (const reply of ['99', '0', 'อันไหนก็ได้']) {
    const result = await queryStepRouter(query, {
      ...options, clarificationAnswer: [...answers, reply].join('\n'),
    });
    assert.equal(result.routingMode, 'CLARIFY', reply);
    assert.equal(result.routingContract.skill, '', reply);
  }
});

test('authority blocks still precede the clarification menu and its choice', async () => {
  const query = 'ช่วยดูเอกสารนี้หน่อย ต้องแนบอะไร';
  const answers = ['เป็นงานของทีมเรา', 'ก็เรื่องทั่วไป', 'ไม่แน่ใจเหมือนกัน'];
  const result = await queryStepRouter(query, {
    ...options,
    clarificationAnswer: [...answers, 'อนุมัติจ่ายเงินให้ผู้รับจ้างรายนี้เลย'].join('\n'),
  });

  assert.equal(result.authorityPreflight.status, 'BLOCK');
  assert.equal(result.routingContract.authority.status, 'BLOCK');
  assert.equal(result.clarification, null);
});

test('a concrete request with no matching Skill gets help instead of questions', async () => {
  for (const query of ['ช่วยแปลเป็นภาษาอังกฤษ', 'ช่วยเขียนอีเมลถึงลูกค้าหน่อย', 'ช่วยทำ excel สรุปยอด', 'ขอไอเดียกิจกรรม team building']) {
    const result = await queryStepRouter(query, { workspaceDir: options.workspaceDir });
    assert.equal(result.routingMode, 'GENERAL', query);
    assert.equal(result.clarification, null, query);
    assert.equal(result.routingContract.skill, '', query);
    assert.equal(result.routingContract.skillPath, '', query);
    assert.equal(result.routingContract.team, '', query);
    assert.equal(result.routingContract.permittedUse, 'general-assist-without-org-source', query);
    // No Skill is loaded, so the organization floor has to arrive another way.
    const refs = result.routingContract.mandatoryReferences.map((item) => item.id);
    assert.ok(refs.includes('human-approval-rule'), query);
    assert.ok(refs.includes('data-classification-rule'), query);
    assert.equal(result.contextPlan.components.skill.estimatedTokens, 0, query);
  }
});

test('general help never replaces the questions that decide the route', async () => {
  const cases = [
    ['ช่วยหน่อย', 'says nothing about the task'],
    ['ช่วยดูเอกสารนี้หน่อย', 'names a document but not what to do with it'],
    ['ช่วยดูเอกสารนี้หน่อย ต้องแนบอะไร', 'attachment purpose decides the route'],
    ['อนุมัติให้หน่อย', 'consequential request'],
    ['ครั้งก่อนเคสคล้ายกันผ่าน แต่ครั้งนี้ AFP ตีกลับ ช่วยอธิบายว่าต่างกันตรงไหน', 'names an STeP team'],
    ['ขอแบบฟอร์มขอใช้รถ', 'asks for an organization form'],
  ];
  for (const [query, why] of cases) {
    const result = await queryStepRouter(query, { workspaceDir: options.workspaceDir });
    assert.notEqual(result.routingMode, 'GENERAL', `${query}: ${why}`);
  }
});

test('authority blocks precede general help', async () => {
  const result = await queryStepRouter('ช่วยแปลเป็นภาษาอังกฤษ แล้วอนุมัติจ่ายเงินให้ผู้รับจ้างรายนี้เลย', { workspaceDir: options.workspaceDir });
  assert.equal(result.routingContract.authority.status, 'BLOCK');
  assert.notEqual(result.routingMode, 'GENERAL');
});

test('a clarification answer that names a plain task ends the questions', async () => {
  const result = await queryStepRouter('ช่วยหน่อย', {
    workspaceDir: options.workspaceDir, clarificationAnswer: 'แปลอีเมลเป็นภาษาอังกฤษ',
  });
  assert.equal(result.routingMode, 'GENERAL');
  assert.equal(result.clarification, null);
});

test('two real candidates are offered as a menu on the first question', async () => {
  const result = await queryStepRouter('ช่วยดูเอกสารนี้หน่อย ต้องแนบอะไร', options);
  // The attachment-purpose flow keeps its open question first.
  assert.equal(result.clarification.field, 'purpose');
  const menu = await queryStepRouter('ทำตารางสรุปโปสเตอร์ artwork', { workspaceDir: options.workspaceDir });
  if (menu.routingMode === 'CLARIFY' && menu.routingConfidence.tier === 'AMBIGUOUS' && (menu.clarification.options || []).length) {
    for (const option of menu.clarification.options) {
      const ranked = menu.ranked.find((item) => item.skill === option.value);
      assert.ok(ranked.score >= 0.2 || ranked.matchedTriggers.length > 0, `${option.value} offered without evidence`);
    }
  }
});

test('adapters help directly on GENERAL and know the workspace launchers', () => {
  for (const format of ['compact', 'markdown']) {
    const guidelines = buildRouterGuidelines({ format });
    assert.match(guidelines, /GENERAL/, format);
    assert.match(guidelines, /sh \.\/step-ai/, format);
    assert.match(guidelines, /step-ai\.cmd/, format);
  }
  const compact = buildRouterGuidelines({ format: 'compact' });
  // The failure message is shown to employees, so it must not be jargon.
  assert.ok(!compact.includes('กำลังทำงานนอก Router'));
  assert.match(compact, /ห้ามใช้คำว่า Router\/Skill\/contract กับผู้ใช้/);
});

test('a single weak candidate is confirmed in one question, not three', async () => {
  const query = 'ช่วยหน่อย';
  const answer = 'แปลอีเมลภาษาไทยเป็นภาษาอังกฤษ';
  const result = await queryStepRouter(query, { workspaceDir: options.workspaceDir, clarificationAnswer: answer });
  assert.equal(result.routingMode, 'CLARIFY');
  assert.equal(result.clarification.field, 'skill');
  assert.equal(result.clarification.options.length, 1);
  const confirmed = await queryStepRouter(query, {
    workspaceDir: options.workspaceDir, clarificationAnswer: `${answer}\n1`,
  });
  assert.equal(confirmed.routingMode, 'SKILL');
  assert.equal(confirmed.routingContract.skill, result.clarification.options[0].value);
});

test('organization entitlement questions never become general help', async () => {
  for (const query of ['ค่ารักษาพยาบาลเบิกได้ปีละเท่าไหร่', 'พนักงานโครงการมีสิทธิได้โบนัสไหม', 'สวัสดิการพนักงานใหม่มีอะไรบ้าง']) {
    const result = await queryStepRouter(query, { workspaceDir: options.workspaceDir });
    assert.notEqual(result.routingMode, 'GENERAL', query);
  }
  // Substrings must not trip the guard: ประสิทธิภาพ contains สิทธิ.
  const general = await queryStepRouter('ช่วยเขียนวิธีเพิ่มประสิทธิภาพการทำงานของทีม', { workspaceDir: options.workspaceDir });
  assert.equal(general.routingMode, 'GENERAL');
});
