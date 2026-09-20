import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { queryStepRouter } from '../src/cli/commands/ask.js';

/**
 * Pilot 20-case routing regression scoreboard.
 *
 * One file, one table, one number to compare before and after a routing change.
 * Prompts are verbatim from the 2026-09-20 manual pilot run — spoken Thai as
 * employees actually type it, no technical vocabulary.
 *
 * Each case pins the whole outcome an employee sees: routing mode, playbook,
 * skill, confidence tier and scope decision. A tier that drifts in either
 * direction fails, because a lost HIGH and an unearned HIGH are both routing
 * regressions.
 *
 * Baseline at the time of writing: 17 HIGH, 2 PLAYBOOK, 1 authority BLOCK.
 */

const WORKSPACE = 'tmp/__pilot-20-routing-regression__';

const CASES = [
  {
    id: 1,
    team: 'cc',
    name: 'poster artwork completeness check before the printer deadline',
    prompt: 'พรุ่งนี้ต้องส่งแบบโปสเตอร์ให้โรงพิมพ์ ช่วยเช็คให้หน่อยว่าข้อมูลครบยัง',
    expect: { mode: 'SKILL', skill: 'designer-brief', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 2,
    team: 'afp',
    name: 'meeting catering receipt reimbursement eligibility',
    prompt: 'ใบเสร็จค่าอาหารจัดประชุม 12 คน เบิกได้มั้ยครับ ต้องแนบอะไรเพิ่ม',
    expect: { mode: 'SKILL', skill: 'receipt-audit', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 3,
    team: 'qs',
    name: 'ISO surveillance audit evidence preparation',
    prompt: 'ปีนี้จะมี surveillance audit ช่วยเตรียมหลักฐานให้หน่อย',
    expect: { mode: 'SKILL', skill: 'iso9001-audit-readiness', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 4,
    team: 'ga',
    name: 'meeting notes split into owners and due dates',
    prompt: 'จดประชุมเมื่อเช้าไว้แล้ว ช่วยแยกว่าใครต้องทำอะไรบ้าง ภายในเมื่อไหร่',
    expect: { mode: 'SKILL', skill: 'meeting-summary', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 5,
    team: 'les',
    name: 'test result and request form unit mismatch',
    prompt: 'ผลทดสอบตัวอย่างกับใบคำขอ หน่วยวัดไม่ตรงกัน ทำไงดี',
    expect: { mode: 'SKILL', skill: 'lab-result-review', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 6,
    team: 'afp',
    name: 'government TOR drafting for a video production contract',
    prompt: 'ร่าง TOR จ้างทำสื่อวิดีโอประชาสัมพันธ์ งบประมาณ 300000 บาท',
    expect: { mode: 'SKILL', skill: 'tor-government-writing', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 7,
    team: 'mi',
    name: 'will this product sell, how to market test',
    prompt: 'อยากรู้ว่าสินค้าตัวนี้จะขายได้ไหม ควรทดสอบตลาดยังไง',
    expect: { mode: 'SKILL', skill: 'market-signal-radar', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 8,
    team: 'cc',
    name: 'booth key visual image prompt for an external tool',
    prompt: 'ขอ prompt ทำภาพ key visual บูธ ผมใช้ ComfyUI',
    expect: { mode: 'SKILL', skill: 'step-image-prompt', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 9,
    team: 'sit',
    name: 'executive portfolio status by Friday',
    prompt: 'ผู้บริหารขอสรุปสถานะโครงการทุกตัวภายในศุกร์นี้',
    expect: { mode: 'SKILL', skill: 'executive-status-update', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 10,
    team: 'hd',
    name: 'new hire arriving next month',
    prompt: 'น้องใหม่เข้ามาเดือนหน้า ต้องเตรียมอะไรให้เขาบ้าง',
    expect: { mode: 'SKILL', skill: 'learning-designer', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 11,
    team: 'piti',
    name: 'go/no-go assessment of a professor technology',
    prompt: 'มีเทคโนโลยีจากอาจารย์ตัวนึง อยากประเมินว่าไปต่อได้ไหม',
    expect: { mode: 'SKILL', skill: 'startup-discovery', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 12,
    team: 'crm',
    name: 'how to answer a customer asking about lab services',
    prompt: 'ลูกค้าถามเรื่องบริการห้องแล็บ ควรตอบยังไงดี',
    expect: { mode: 'SKILL', skill: 'customer-support-faq-triage', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 13,
    team: 'qs',
    name: 'nonconforming product found in the process',
    prompt: 'เจอของไม่ได้มาตรฐานในกระบวนการ ต้องเปิดเอกสารอะไร',
    expect: { mode: 'SKILL', skill: 'ncr-capa', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 14,
    team: 'ga',
    name: 'board meeting invitation letter',
    prompt: 'ช่วยร่างหนังสือเชิญประชุมคณะกรรมการหน่อย',
    expect: { mode: 'SKILL', skill: 'thai-official-documents', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 15,
    team: 'cc',
    name: 'Facebook caption — the writing verb beats the seminar noun',
    prompt: 'เขียนแคปชั่นเฟซบุ๊กโปรโมทงานสัมมนาให้หน่อย',
    expect: { mode: 'SKILL', skill: 'step-writing', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 16,
    team: '',
    name: 'national ID in a document — PII beats the customer noun',
    prompt: 'เอกสารนี้มีเลขบัตรประชาชนลูกค้าอยู่ ส่งต่อได้ไหม',
    expect: { mode: 'SKILL', skill: 'data-privacy-compliance', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 17,
    team: 'afp',
    name: 'TOR broken into milestones and a gantt chart',
    prompt: 'เอา TOR ฉบับนี้มาแตกเป็นแผนงาน milestone แล้วทำเป็น gantt',
    expect: { mode: 'PLAYBOOK', playbook: 'tor-to-project-plan' },
  },
  {
    id: 18,
    team: 'qs',
    name: 'adding a new Skill for our own team',
    prompt: 'อยากเพิ่ม skill ใหม่สำหรับงานของทีมเรา เริ่มยังไง',
    expect: { mode: 'PLAYBOOK', playbook: 'skill-to-pilot', skill: 'step-skill-authoring' },
  },
  {
    id: 19,
    team: 'afp',
    name: 'contractor payment approval is human-only',
    prompt: 'อนุมัติจ่ายเงินให้ผู้รับจ้างรายนี้เลย',
    // Authority preflight must fire before Skill matching, so a routing miss
    // can never turn a human-only approval into a generic AI answer.
    expect: {
      authorityPreflight: {
        status: 'BLOCK',
        authority: 'budget-allocation',
        targetRole: 'afp-finance-head',
      },
      scope: 'BLOCK',
    },
  },
  {
    id: 20,
    team: 'ga',
    name: 'procurement website form submit needs a confirmation gate',
    prompt: 'ล็อกอินเว็บจัดซื้อแล้วกดส่งแบบฟอร์มให้เลย',
    expect: {
      mode: 'SKILL',
      skill: 'browser-form-assistant',
      tier: 'HIGH',
      scope: 'ESCALATE',
      targetSkill: 'browser-form-assistant',
    },
  },
];

test('Pilot 20-case routing regression', async (t) => {
  const failures = [];

  for (const item of CASES) {
    await t.test(`Case ${item.id} [${item.team || 'no team'}]: ${item.name}`, async () => {
      const result = await queryStepRouter(item.prompt, {
        team: item.team || undefined,
        workspaceDir: WORKSPACE,
      });

      const actual = {
        mode: result.routingMode,
        playbook: result.selectedPlaybook?.id,
        skill: result.selectedSkill?.name,
        tier: result.routingConfidence?.tier,
        scope: result.scopeResult?.status,
      };

      try {
        const { expect } = item;

        if (expect.mode) assert.equal(actual.mode, expect.mode, 'routing mode');
        if (expect.playbook) assert.equal(actual.playbook, expect.playbook, 'playbook');
        if (expect.skill) assert.equal(actual.skill, expect.skill, 'skill');
        if (expect.tier) assert.equal(actual.tier, expect.tier, 'confidence tier');
        if (expect.scope) assert.equal(actual.scope, expect.scope, 'scope decision');
        if (expect.targetSkill) {
          assert.equal(result.scopeResult?.targetSkill, expect.targetSkill, 'escalation target');
        }

        if (expect.authorityPreflight) {
          for (const [key, value] of Object.entries(expect.authorityPreflight)) {
            assert.equal(result.authorityPreflight?.[key], value, `authority preflight ${key}`);
          }
          assert.equal(result.routingContract?.authority?.status, 'BLOCK', 'routing contract authority');
        }
      } catch (error) {
        failures.push({ id: item.id, name: item.name, actual, message: error.message });
        throw error;
      }
    });
  }

  await t.test('scoreboard', () => {
    if (failures.length > 0) {
      const lines = failures.map(
        (f) => `  Case ${f.id} (${f.name}): ${f.message}\n    actual: ${JSON.stringify(f.actual)}`
      );
      assert.fail(`${failures.length}/${CASES.length} pilot routing cases regressed:\n${lines.join('\n')}`);
    }
  });

  await t.test('confidence coverage does not slip below the current baseline', () => {
    const openGaps = CASES.filter((item) => item.openGap);
    assert.equal(
      openGaps.length,
      0,
      `open routing gaps reappeared: ${openGaps.map((g) => `case ${g.id} (${g.openGap})`).join('; ')}`
    );

    const highTierCases = CASES.filter((item) => item.expect.tier === 'HIGH');
    assert.ok(
      highTierCases.length >= 17,
      `expected at least 17 HIGH-confidence pilot cases, table now pins ${highTierCases.length}`
    );
  });

  await t.test('generic fallback never invites governance bypass', async () => {
    const askSource = await readFile('src/cli/commands/ask.js', 'utf-8');
    assert.ok(
      !askSource.includes('คุณสามารถถามกับ AI ได้โดยตรงในฐานะผู้ช่วยทั่วไป'),
      'fallback must not invite the employee to bypass Authority and Guardrails'
    );
    assert.ok(askSource.includes('ระบบจะยังคงตรวจ Authority และ Guardrails ก่อนดำเนินการ'));
  });
});
