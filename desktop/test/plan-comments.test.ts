import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../electron/store';
import { Workbench } from '../electron/workbench';
import { workflowRule } from '../electron/workflows';
import { commentedTasks, maskedPlan, revisionRequest, PLAN_COMMENT_LIMIT } from '../src/plan-comments';
import { planCommentsEn } from '../src/locales/plan-comments-en';
import type { WorkPlan } from '../src/types';

const plan = (): WorkPlan => ({
  goal: 'จัดสัมมนา',
  approvedAt: '2026-10-30T09:00:00Z',
  tasks: [
    { title: 'ร่างกำหนดการ', status: 'done', note: 'ส่งให้ทีมแล้ว' },
    { title: 'จองห้องประชุม', status: 'todo' },
    { title: 'ขออนุมัติงบ (ผู้มีอำนาจ)', status: 'todo' },
  ],
});

test('a comment is kept on its task, replaced, removed when empty and refused for unknown tasks', () => {
  const store = new Store(':memory:');
  try {
    const workbench = new Workbench(store);
    const session = store.create('plan task', 'cc');
    assert.throws(() => workbench.commentWorkTask(session.id, 1, 'ไม่มีแผน'), /PLAN_TASK_UNKNOWN/);
    workbench.setWorkPlan(session.id, plan(), '');
    workbench.commentWorkTask(session.id, 2, '  ใช้ห้อง D203 ถ้าว่าง  ');
    assert.deepEqual(store.session(session.id).workPlan!.tasks[1], {
      title: 'จองห้องประชุม',
      status: 'todo',
      comment: 'ใช้ห้อง D203 ถ้าว่าง',
    });
    workbench.commentWorkTask(session.id, 2, 'ใช้ห้อง D204');
    assert.equal(store.session(session.id).workPlan!.tasks[1].comment, 'ใช้ห้อง D204');
    // Ticking the task off keeps the comment; an empty comment removes it.
    workbench.updateWorkTask(session.id, 2, 'doing', '');
    assert.equal(store.session(session.id).workPlan!.tasks[1].comment, 'ใช้ห้อง D204');
    workbench.commentWorkTask(session.id, 2, '   ');
    assert.equal('comment' in store.session(session.id).workPlan!.tasks[1], false);
    assert.throws(() => workbench.commentWorkTask(session.id, 9, 'x'), /PLAN_TASK_UNKNOWN/);
    assert.throws(() => workbench.commentWorkTask(session.id, 1, 'x'.repeat(PLAN_COMMENT_LIMIT + 1)), /INVALID_INPUT/);
    // A revised plan the employee approves replaces the commented one.
    workbench.commentWorkTask(session.id, 1, 'เพิ่มช่วงถามตอบ');
    workbench.setWorkPlan(session.id, { goal: 'จัดสัมมนา', tasks: [{ title: 'ร่างกำหนดการพร้อมช่วงถามตอบ', status: 'todo' }] }, '');
    assert.deepEqual(commentedTasks(store.session(session.id).workPlan), []);
  } finally {
    store.close();
  }
});

test('the revise request lists each comment, and the plan workflow revises instead of starting over', () => {
  const commented = plan();
  commented.tasks[1].comment = 'ใช้ห้อง D203';
  commented.tasks[2].comment = 'แยกเป็นขอใบเสนอราคาก่อน';
  assert.deepEqual(
    commentedTasks(commented).map(task => task.number),
    [2, 3],
  );
  assert.equal(
    revisionRequest(commented, 'ปรับแผนตามความเห็น'),
    'ปรับแผนตามความเห็น\n- ข้อ 2 «จองห้องประชุม»: ใช้ห้อง D203\n- ข้อ 3 «ขออนุมัติงบ (ผู้มีอำนาจ)»: แยกเป็นขอใบเสนอราคาก่อน',
  );
  assert.doesNotMatch(workflowRule('plan', plan()), /REVISE/, 'no comments: a fresh plan');
  const revise = workflowRule('plan', commented);
  assert.match(revise, /PLAN BEFORE DOING[\s\S]*REVISE THE CURRENT PLAN/);
  assert.match(revise, /2\. \[todo\] จองห้องประชุม \(employee comment: ใช้ห้อง D203\)/);
  assert.match(revise, /1\. \[done\] ร่างกำหนดการ \(note: ส่งให้ทีมแล้ว\)/);
  assert.match(revise, /- \[x\] <task>/);
  const execute = workflowRule('execute', commented);
  assert.match(execute, /3\. \[todo\] ขออนุมัติงบ \(ผู้มีอำนาจ\) \(employee comment: แยกเป็นขอใบเสนอราคาก่อน\)/);
  assert.match(execute, /"employee comment" on a task is the employee's own instruction/);
});

test('comments are masked before the plan is sent, and the stored plan keeps them as written', () => {
  const commented = plan();
  commented.tasks[1].comment = 'ติดต่อคุณสมชาย 081-234-5678';
  const sent = maskedPlan(commented, text => text.replace(/\d{3}-\d{3}-\d{4}/g, '[เบอร์โทรถูกปิดบัง]'))!;
  assert.equal(sent.tasks[1].comment, 'ติดต่อคุณสมชาย [เบอร์โทรถูกปิดบัง]');
  assert.equal(commented.tasks[1].comment, 'ติดต่อคุณสมชาย 081-234-5678');
  assert.deepEqual(sent.tasks[0], commented.tasks[0], 'tasks without comments are passed as they are');
  assert.equal(
    maskedPlan(undefined, text => text),
    undefined,
  );
});

test('the comment controls have English', () => {
  for (const key of ['บันทึกความเห็น', 'ความเห็นของคุณ: {0}', 'แสดงความเห็นข้อ {0}', 'ให้ผู้ช่วยแก้แผนตามความเห็น ({0})', 'ข้อ {0}'])
    assert.ok(planCommentsEn[key], key);
});
