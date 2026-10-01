import test from 'node:test';
import assert from 'node:assert/strict';
import { queryStepRouter } from '../src/modules/router/service.js';

test('employee audit requests retain their action instead of a reference URL topic', async () => {
  const query = 'ขอลองเอาแนวคิด https://github.com/browser-use/browser-harness มาใช้กับ STeP AI Harness Browser-use ให้ Agent ทำงานบน Web Browser ได้';
  for (const suffix of ['', ' https://github.com/browser-use/browser-harness']) {
    const r = await queryStepRouter('พัฒนาตัวเชื่อมเบราว์เซอร์ใน STeP' + suffix, { team: 'developer' });
    assert.equal(r.routingContract.mode, 'SKILL');
    assert.equal(r.selectedSkill.name, 'coding-git-workflow');
  }
  const clarified = await queryStepRouter(query, { clarificationAnswer: 'พัฒนาตัวเชื่อมเบราว์เซอร์ใน STeP' });
  assert.equal(clarified.selectedSkill.name, 'coding-git-workflow');
  assert.equal(clarified.clarification, null);
});

test('QS first tasks select useful work while preserving authority checks', async () => {
  const cases = [
    ['ช่วยสรุปบันทึกประชุมเป็นรายการงาน', 'SKILL', 'meeting-summary'],
    ['ช่วยเตรียม checklist ตรวจติดตามคุณภาพภายใน ISO 9001', 'SKILL', 'iso9001-audit-readiness'],
    ['ช่วยร่างอีเมลเชิญประชุมทีม', 'GENERAL', undefined],
  ];
  for (const [query, mode, skill] of cases) {
    const r = await queryStepRouter(query, { team: 'qs' });
    assert.equal(r.routingContract.mode, mode);
    assert.equal(r.selectedSkill?.name, skill);
  }
  const denied = await queryStepRouter('ช่วยร่างอีเมลเชิญประชุมทีม และอนุมัติงบประมาณ 500000 บาท', { team: 'qs' });
  assert.notEqual(denied.routingContract.authority.status, 'ALLOW');
});
