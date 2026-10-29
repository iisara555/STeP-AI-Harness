import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORKFLOWS, assistantPolicyError, isWorkflow, parsePlan, workflowRule } from '../electron/workflows';
import { defaultPolicy } from '../electron/policy';

test('a submitted plan becomes a goal and tasks; checklist, numbered and bulleted lines all count', () => {
  const plan = parsePlan(
    [
      '# เป้าหมาย: จัดงานสัมมนา AI Harness ภายในเดือนธันวาคม',
      '',
      'บริบท: ผู้เข้าร่วม 80 คน',
      '- [ ] ร่างกำหนดการ — เสร็จเมื่อมีกำหนดการครึ่งวัน',
      '- [x] จองห้อง D203 — เสร็จเมื่อได้เลขการจอง',
      '3. ขออนุมัติงบ (ผู้มีอำนาจ) — เสร็จเมื่อผู้อำนวยการลงนาม',
      '* ส่งหนังสือเชิญ',
    ].join('\n'),
  );
  assert.equal(plan.goal, 'จัดงานสัมมนา AI Harness ภายในเดือนธันวาคม');
  assert.deepEqual(
    plan.tasks.map(t => [t.status, t.title.split(' ')[0]]),
    [
      ['todo', 'ร่างกำหนดการ'],
      ['done', 'จองห้อง'],
      ['todo', 'ขออนุมัติงบ'],
      ['todo', 'ส่งหนังสือเชิญ'],
    ],
  );
  assert.equal(parsePlan('# ไม่มีขั้นงาน\nแค่ข้อความ').tasks.length, 0);
  assert.equal(parsePlan(Array.from({ length: 30 }, (_, i) => `- งาน ${i}`).join('\n')).tasks.length, 20, 'at most 20 tasks');
});

test('each workflow gives the assistant its own way of working; execute follows the approved plan', () => {
  assert.deepEqual([...WORKFLOWS], ['assistant', 'plan', 'execute', 'requirements', 'diagnose', 'coding']);
  assert.ok(isWorkflow('plan') && !isWorkflow('approve') && !isWorkflow(undefined));
  assert.match(workflowRule('assistant'), /host-governed file, document and web tools/);
  assert.match(workflowRule('assistant'), /untrusted evidence[\s\S]*run terminal or sandbox commands/);
  assert.match(workflowRule('plan'), /ask_user[\s\S]*plan tool[\s\S]*- \[ \]/);
  assert.match(workflowRule('plan'), /Do not do the work itself/);
  assert.match(workflowRule('requirements'), /ความต้องการ[\s\S]*testable/);
  assert.match(workflowRule('diagnose'), /hypotheses[\s\S]*root cause only with evidence/);
  assert.match(workflowRule('coding'), /staged proposal is not applied code[\s\S]*code_diagnostics[\s\S]*terminal and tasks/);
  assert.match(workflowRule('execute'), /no approved plan/);
  const rule = workflowRule('execute', {
    goal: 'จัดสัมมนา',
    tasks: [
      { title: 'ร่างกำหนดการ', status: 'done', note: 'ส่งให้ทีมแล้ว' },
      { title: 'ขออนุมัติงบ (ผู้มีอำนาจ)', status: 'todo' },
    ],
  });
  assert.match(rule, /1\. \[done\] ร่างกำหนดการ \(note: ส่งให้ทีมแล้ว\)/);
  assert.match(rule, /2\. \[todo\] ขออนุมัติงบ/);
  assert.match(rule, /plan_update[\s\S]*never done by the assistant/);
});

test('work assistant requires both governed tools and the full personal-data gate', () => {
  const policy = defaultPolicy();
  assert.equal(assistantPolicyError(policy), 'ASSISTANT_PRIVACY_REQUIRED');
  policy.checks.privacy = true;
  assert.equal(assistantPolicyError(policy), undefined);
  policy.features.toolLoop = false;
  assert.equal(assistantPolicyError(policy), 'TOOL_LOOP_DISABLED');
});
