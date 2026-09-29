import test from 'node:test';
import assert from 'node:assert/strict';
import { queryStepRouter } from '../src/cli/commands/ask.js';

// Requests typed by CC staff in the desktop usability walkthrough (2026-09-29). Clear drafting
// requests must reach a Skill directly; a vague one gets numbered choices, not an open question.
const DIRECT = [
  ['ช่วยคิด Event Concept จาก TOR และข้อจำกัดพื้นที่นี้', 'event-concept'],
  ['ช่วยจัดโครง Presentation นี้ให้ message ชัด', 'presentation-design'],
  ['ช่วยร่างโพสต์ประชาสัมพันธ์งาน Open House ของ STeP สำหรับ Facebook', 'step-writing'],
  ['ช่วยทำ Designer Brief สำหรับงาน Open House', 'designer-brief'],
];

for (const [prompt, skill] of DIRECT) {
  test(`CC staff request routes directly: ${prompt}`, async () => {
    const result = await queryStepRouter(prompt, { team: 'cc', disableMemory: true });
    assert.equal(result.routingContract.mode, 'SKILL');
    assert.equal(result.routingContract.skill, skill);
  });
}

// A plain email is general help by design (no organization source needed), but never a question.
test('a plain drafting request gets help, not a question', async () => {
  const result = await queryStepRouter('ช่วยร่างอีเมลแจ้งผู้สมัครว่าผ่านการคัดเลือก', { team: 'cc', disableMemory: true });
  assert.notEqual(result.routingContract.mode, 'CLARIFY');
});

test('a vague request that names a topic offers numbered choices, and a number answers it', async () => {
  const asked = await queryStepRouter('ช่วยทำงานอีเวนต์หน่อย', { team: 'cc', disableMemory: true });
  assert.equal(asked.routingContract.mode, 'CLARIFY');
  assert.equal(asked.routingContract.clarification.options[0].value, 'event-concept');
  const answered = await queryStepRouter('ช่วยทำงานอีเวนต์หน่อย', { team: 'cc', disableMemory: true, clarificationAnswer: '1' });
  assert.equal(answered.routingContract.mode, 'SKILL');
  assert.equal(answered.routingContract.skill, 'event-concept');
});
