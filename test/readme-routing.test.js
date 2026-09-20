import test from 'node:test';
import assert from 'node:assert/strict';
import { queryStepRouter } from '../src/cli/commands/ask.js';

const NO_MEMORY_WORKSPACE = 'tmp/__readme-routing-no-user-memory__';

test('README six-query routing contract', async (t) => {
  const cases = [
    {
      name: 'general pre-send document review',
      prompt: 'ช่วยตรวจเอกสารนี้ก่อนส่ง สรุปจุดที่ขาดและสิ่งที่ฉันต้องแก้เอง',
      skill: 'document-review',
    },
    {
      name: 'meeting summary',
      prompt: 'สรุปการประชุมนี้ แยกมติ งานที่ต้องทำ ผู้รับผิดชอบ วันครบกำหนด และเรื่องที่ยังรอยืนยัน',
      skill: 'meeting-summary',
    },
    {
      name: 'official correspondence',
      prompt: 'ร่างหนังสือขอความอนุเคราะห์ใช้สถานที่ด้วยภาษาสุภาพ กระชับ และให้ฉันตรวจทานก่อนส่ง',
      skill: 'thai-official-documents',
    },
    {
      name: 'TOR review',
      prompt: 'ช่วยตรวจ TOR นี้ แยกข้อเท็จจริง ความเสี่ยง และข้อมูลที่ต้องให้เจ้าของงานยืนยันก่อนส่ง AFP',
      skill: 'tor-review',
    },
    {
      name: 'privacy review',
      prompt: 'ช่วยตรวจเอกสารนี้ว่ามีข้อมูลส่วนบุคคลหรือ credential ที่ไม่ควรส่งต่อหรือไม่ และเสนอจุดที่ควรปิดบัง',
      skill: 'data-privacy-compliance',
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const result = await queryStepRouter(item.prompt, {
        workspaceDir: NO_MEMORY_WORKSPACE,
      });

      assert.equal(result.routingMode, 'SKILL');
      assert.equal(result.selectedSkill?.name, item.skill);
      assert.equal(result.routingConfidence?.tier, 'HIGH');
      assert.equal(result.routingContract?.confidenceTier, 'HIGH');
      assert.equal(result.routingContract?.matchScore, result.bestMatch?.score);
      assert.equal(result.isAmbiguous, false);
      assert.ok(
        result.routingConfidence?.reason === 'raw-score-high' ||
        result.routingConfidence?.reason === 'direct-trigger-and-intent-with-clear-margin'
      );
    });
  }

  await t.test('TOR to project plan stays composite Playbook', async () => {
    const result = await queryStepRouter(
      'เอา TOR นี้มาแตกกิจกรรม ระยะเวลา milestone และ dependency แล้วเตรียมแผนสำหรับทำ Gantt',
      { workspaceDir: NO_MEMORY_WORKSPACE }
    );

    assert.equal(result.routingMode, 'PLAYBOOK');
    assert.equal(result.selectedPlaybook?.id, 'tor-to-project-plan');
  });

  await t.test('document-review does not steal specialist document routes', async () => {
    const tor = await queryStepRouter('ช่วยตรวจ TOR นี้ว่าครบและพร้อมส่งไหม', {
      team: 'afp',
      workspaceDir: NO_MEMORY_WORKSPACE,
    });
    assert.equal(tor.selectedSkill?.name, 'tor-review');

    const official = await queryStepRouter('ช่วยตรวจหนังสือราชการนี้ก่อนส่ง ดูคำขึ้นต้นและรูปแบบด้วย', {
      team: 'ga',
      workspaceDir: NO_MEMORY_WORKSPACE,
    });
    assert.equal(official.selectedSkill?.name, 'thai-official-documents');

    const privacy = await queryStepRouter('ช่วยตรวจข้อมูลส่วนบุคคลในเอกสารนี้ก่อนส่ง', {
      team: 'qs',
      workspaceDir: NO_MEMORY_WORKSPACE,
    });
    assert.equal(privacy.selectedSkill?.name, 'data-privacy-compliance');
  });
});
