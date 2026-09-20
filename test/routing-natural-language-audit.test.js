import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { queryStepRouter } from '../src/cli/commands/ask.js';

const NO_MEMORY_WORKSPACE = 'tmp/__natural-language-routing-no-user-memory__';

test('Natural-language routing audit regressions', async (t) => {
  const cases = [
    {
      name: 'LES unit mismatch',
      team: 'les',
      prompt: 'หน่วยวัดในผลทดสอบกับใบคำขอไม่ตรงกัน',
      skill: 'lab-result-review',
    },
    {
      name: 'MI market test',
      team: 'mi',
      prompt: 'สินค้าจะขายได้ไหม ทดสอบตลาดยังไง',
      skill: 'market-signal-radar',
    },
    {
      name: 'HD new hire onboarding',
      team: 'hd',
      prompt: 'น้องใหม่เข้ามาเดือนหน้า เตรียมอะไรบ้าง',
      skill: 'learning-designer',
    },
    {
      name: 'QS nonconformity',
      team: 'qs',
      prompt: 'เจอของไม่ได้มาตรฐาน ต้องเปิดเอกสารอะไร',
      skill: 'ncr-capa',
    },
    {
      name: 'PII beats customer noun',
      team: 'crm',
      prompt: 'เอกสารนี้มีเลขบัตรประชาชนลูกค้าอยู่ ส่งต่อได้ไหม',
      skill: 'data-privacy-compliance',
    },
    {
      name: 'caption writing beats seminar noun',
      team: 'cc',
      prompt: 'เขียนแคปชั่นเฟซบุ๊กโปรโมทงานสัมมนา',
      skill: 'step-writing',
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const result = await queryStepRouter(item.prompt, {
        team: item.team,
        workspaceDir: NO_MEMORY_WORKSPACE,
      });
      assert.equal(result.selectedSkill?.name, item.skill, `wrong route for "${item.prompt}"`);
      assert.notEqual(result.routingConfidence?.tier, 'FALLBACK');
    });
  }

  await t.test('AFP payment approval is blocked before skill fallback', async () => {
    const result = await queryStepRouter(
      'อนุมัติจ่ายเงินให้ผู้รับจ้างรายนี้เลย',
      { team: 'afp', workspaceDir: NO_MEMORY_WORKSPACE }
    );

    assert.equal(result.authorityPreflight?.status, 'BLOCK');
    assert.equal(result.authorityPreflight?.authority, 'budget-allocation');
    assert.equal(result.authorityPreflight?.targetRole, 'afp-finance-head');
    assert.equal(result.scopeResult?.status, 'BLOCK');
    assert.equal(result.routingContract?.authority?.status, 'BLOCK');
    assert.equal(result.routingContract?.authority?.authority, 'budget-allocation');
  });

  await t.test('procurement website submit uses browser assistant + confirmation gate', async () => {
    const result = await queryStepRouter(
      'ล็อกอินเว็บจัดซื้อแล้วกดส่งแบบฟอร์มให้เลย',
      { team: 'afp', workspaceDir: NO_MEMORY_WORKSPACE }
    );

    assert.equal(result.selectedSkill?.name, 'browser-form-assistant');
    assert.equal(result.scopeResult?.status, 'ESCALATE');
    assert.equal(result.scopeResult?.targetSkill, 'browser-form-assistant');
  });

  await t.test('TOR milestone/gantt phrasing selects composite playbook', async () => {
    const result = await queryStepRouter(
      'เอา TOR ฉบับนี้มาแตกเป็นแผนงาน milestone แล้วทำเป็น gantt',
      { workspaceDir: NO_MEMORY_WORKSPACE }
    );
    assert.equal(result.routingMode, 'PLAYBOOK');
    assert.equal(result.selectedPlaybook?.id, 'tor-to-project-plan');
  });

  await t.test('generic fallback never invites governance bypass', async () => {
    const askSource = await readFile('src/cli/commands/ask.js', 'utf-8');
    assert.ok(!askSource.includes('คุณสามารถถามกับ AI ได้โดยตรงในฐานะผู้ช่วยทั่วไป'));
    assert.ok(askSource.includes('ระบบจะยังคงตรวจ Authority และ Guardrails ก่อนดำเนินการ'));
  });
});
