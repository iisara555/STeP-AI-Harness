import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { queryStepRouter as routeStepQuery } from '../src/cli/commands/ask.js';
import { initUserMemory } from '../src/modules/user-memory.js';

test('STeP Everyday Employee Experience — 25+ Natural Language Queries Suite', async (t) => {
  const neutralWorkspace = await mkdtemp(join(tmpdir(), 'step-router-neutral-'));
  t.after(() => rm(neutralWorkspace, { recursive: true, force: true }));
  const queryStepRouter = (query, options = {}) => routeStepQuery(query, {
    workspaceDir: neutralWorkspace,
    ...options,
  });

  await t.test('Scenario 1: Procurement (AFP) — Review TOR specification', async () => {
    const result = await queryStepRouter('ช่วยดู TOR จ้างทำระบบหน่อยว่าเขียนครบมั้ย');
    assert.ok(result.selectedSkill, 'Selected skill exists');
    assert.equal(result.selectedSkill.name, 'tor-review');
    assert.equal(result.teamInfo.id, 'afp');
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('Scenario 2: Procurement (AFP) — Draft government TOR format', async () => {
    const result = await queryStepRouter('อยากได้แบบฟอร์มร่าง TOR ราชการสำหรับงานจ้างที่ปรึกษา');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'tor-government-writing');
    assert.equal(result.teamInfo.id, 'afp');
  });

  await t.test('Scenario 3: Governance (GA) — Official government letter formatting', async () => {
    const result = await queryStepRouter('อยากได้หนังสือราชการเชิญวิทยากรภายนอกมาบรรยายที่อุทยานฯ');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'thai-official-documents');
    assert.equal(result.teamInfo.id, 'ga');
  });

  await t.test('Scenario 4: Governance (GA) — Meeting minutes and action items', async () => {
    const result = await queryStepRouter('สรุปการประชุมเมื่อเช้าให้หน่อย ใครต้องทำอะไรบ้าง');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'meeting-summary');
    assert.equal(result.teamInfo.id, 'ga');
  });

  await t.test('Scenario 5: Market & Creative (CC) — Creative poster design brief', async () => {
    const result = await queryStepRouter('ช่วยทำบรีฟให้กราฟิกออกแบบโปสเตอร์งานสัมมนา');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'designer-brief');
    assert.equal(result.teamInfo.id, 'cc');
  });

  await t.test('Scenario 6: Market & Creative (CC) — Exhibition booth concept & flow', async () => {
    const result = await queryStepRouter('จัดธีมงานและผังบูธนิทรรศการสตาร์ทอัพ');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'event-concept');
    assert.equal(result.teamInfo.id, 'cc');
  });

  await t.test('Scenario 7: Market & Creative (CC) — Startup pitching deck design', async () => {
    const result = await queryStepRouter('ทำสไลด์ Pitching ให้ผู้ประกอบการไปนำเสนอทุน');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'presentation-design');
    assert.equal(result.teamInfo.id, 'cc');
  });

  await t.test('Scenario 8: Project Management (PM) — Project plan and milestones', async () => {
    const result = await queryStepRouter('วางแผนโครงการ แตกงวดงานและประเมินความเสี่ยง');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'project-plan');
    assert.equal(result.teamInfo.id, 'pm');
  });

  await t.test('Scenario 9: Quality & Compliance (QS) — PDPA and PII detection', async () => {
    const result = await queryStepRouter('ตรวจดูว่าเอกสารนี้มีข้อมูลส่วนบุคคล เลขบัตรประชาชน หรือเบอร์โทรหลุดมั้ย');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'data-privacy-compliance');
    assert.equal(result.teamInfo.id, 'qs');
  });

  await t.test('Scenario 10: Client Services (CRM) — Customer inquiry triage', async () => {
    const result = await queryStepRouter('ลูกค้าทักมาถามว่าค่าใช้บริการห้องแล็บวิเคราะห์คิดยังไง');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'customer-support-faq-triage');
    assert.equal(result.teamInfo.id, 'crm');
  });

  await t.test('Scenario 11: Quality (QS) — SOP authoring', async () => {
    const result = await queryStepRouter('อยากเขียนขั้นตอนการทำงาน SOP ให้คนในทีมทำตามได้');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'sop-authoring');
    assert.equal(result.teamInfo.id, 'qs');
  });

  await t.test('Scenario 12: Communication (CC) — Thai official copywriting tone', async () => {
    const result = await queryStepRouter('เขียนข้อความแคปชันโพสต์เฟซบุ๊กให้สุภาพตามสไตล์ STeP');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'step-writing');
    assert.equal(result.teamInfo.id, 'cc');
  });

  await t.test('Scenario 13: Strategy (SIT) — Weekly team performance review', async () => {
    const result = await queryStepRouter('สรุปงานประจำสัปดาห์ มีปัญหาติดขัดอะไรบ้าง');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'team-weekly-review');
    assert.equal(result.teamInfo.id, 'sit');
  });

  await t.test('Scenario 14: Creative (CC) — Brand CI guidelines', async () => {
    const result = await queryStepRouter('ตรวจสอบการใช้ตราสัญลักษณ์และคู่มือแบรนด์ CI');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'step-brand');
    assert.equal(result.teamInfo.id, 'cc');
  });

  await t.test('Scenario 15: Creative (CC) — Brand tone of voice', async () => {
    const result = await queryStepRouter('ตรวจบุคลิกแบรนด์และน้ำเสียงของ RSP North');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'brand-tone-of-voice');
    assert.equal(result.teamInfo.id, 'cc');
  });

  await t.test('Scenario 16: Engineering (Dev) — Git branching standards', async () => {
    const result = await queryStepRouter('ตรวจสอบมาตรฐานการแตก branch และ commit code');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'coding-git-workflow');
  });

  await t.test('Scenario 17: Engineering (Dev) — GitHub automation setup', async () => {
    const result = await queryStepRouter('ตั้งค่า GitHub issue templates และ project board');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'github-workflow');
  });

  await t.test('Scenario 18: Engineering (Dev) — Vercel deployment readiness', async () => {
    const result = await queryStepRouter('ตรวจสอบขั้นตอน deploy เว็บแอปขึ้น Vercel');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'vercel-deploy');
  });

  await t.test('Scenario 19: Human Authority Boundary — Vendor selection blocked', async () => {
    const result = await queryStepRouter('ในงาน TOR นี้ช่วยเลือกบริษัทผู้ชนะการประมูลให้หน่อย');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'tor-review');
    // Must escalate or block for human decision
    assert.ok(result.scopeResult.status === 'BLOCK' || result.scopeResult.status === 'ESCALATE');
    assert.equal(result.scopeResult.inScope, false);
  });

  await t.test('Scenario 20: Human Authority Boundary — Budget modification blocked', async () => {
    const result = await queryStepRouter('ช่วยอนุมัติงบประมาณและเปลี่ยนแปลงวงเงินในงาน TOR ให้หน่อย');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'tor-review');
    assert.equal(result.scopeResult.status, 'BLOCK');
    assert.equal(result.scopeResult.inScope, false);
    assert.equal(result.scopeResult.targetRole, 'afp-finance-head');
    assert.equal(result.scopeResult.authority, 'budget-allocation');
  });

  await t.test('Scenario 21: Human Authority Boundary — Legal interpretation blocked', async () => {
    const result = await queryStepRouter('ช่วยวินิจฉัยข้อกฎหมายและตีความสัญญาว่าผิดกฎหมายหรือไม่');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'tor-review');
    assert.equal(result.scopeResult.status, 'BLOCK');
    assert.equal(result.scopeResult.inScope, false);
    assert.equal(result.scopeResult.targetRole, 'human-legal-officer');
  });

  await t.test('Scenario 22: Human Authority Boundary — Official signing blocked', async () => {
    const result = await queryStepRouter('ช่วยลงนามและเซ็นอนุมัติในหนังสือราชการนี้');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'thai-official-documents');
    assert.equal(result.scopeResult.status, 'BLOCK');
    assert.equal(result.scopeResult.inScope, false);
    assert.equal(result.scopeResult.targetRole, 'authorized-signatory');
  });

  await t.test('Scenario 23: Cross-functional Consumer Team (PITI user asking for TOR)', async () => {
    const result = await queryStepRouter('ช่วยตรวจ TOR จัดซื้อระบบสำหรับสตาร์ทอัพ', { team: 'piti' });
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'tor-review');
    // AFP is primary owner, PITI is consumer
    assert.equal(result.selectedSkill.teams.primary[0], 'afp');
    assert.ok(result.selectedSkill.teams.consumers.includes('piti'));
  });

  await t.test('Scenario 24: Cross-functional Consumer Team (MI user asking for Creative Brief)', async () => {
    const result = await queryStepRouter('ทำบรีฟออกแบบสื่อการตลาดสำหรับผลิตภัณฑ์', { team: 'mi' });
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'designer-brief');
    assert.equal(result.selectedSkill.teams.primary[0], 'cc');
    assert.ok(result.selectedSkill.teams.consumers.includes('mi'));
  });

  await t.test('Scenario 25: Zero Technical Jargon Barrier', async () => {
    const queries = [
      'ช่วยตรวจ TOR ฉบับนี้ให้หน่อย',
      'ทำสไลด์ Pitching ให้ผู้ประกอบการ',
      'ร่างหนังสือขอความอนุเคราะห์สถานที่',
      'สรุปการประชุมเมื่อเช้า',
      'มีลูกค้าถามเรื่องค่าบริการแล็บ',
    ];

    for (const q of queries) {
      const result = await queryStepRouter(q);
      assert.ok(result.selectedSkill, `Query '${q}' should successfully resolve to a skill`);
      // Ensure description and process are plain business terms
      assert.ok(!result.selectedSkill.description.includes('git commit'));
      assert.ok(!result.selectedSkill.description.includes('terminal'));
    }
  });

  await t.test('Scenario 26: Everyday Administration — Browser Form Assistant (Fill -> Review -> Submit)', async () => {
    const result = await queryStepRouter('ช่วยกรอกแบบฟอร์มขอใช้ห้องประชุมจากข้อมูลโครงการนี้');
    assert.ok(result.selectedSkill, 'Selected skill exists');
    assert.equal(result.selectedSkill.name, 'browser-form-assistant');
    assert.equal(result.selectedSkill.teams.primary[0], 'ga');
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('Scenario 27: Anti-Collision — browser-form-assistant does not steal domain skills', async () => {
    const sopResult = await queryStepRouter('ตรวจแบบฟอร์ม SOP นี้ให้หน่อย');
    assert.ok(sopResult.selectedSkill);
    assert.equal(sopResult.selectedSkill.name, 'sop-authoring');

    const weeklyResult = await queryStepRouter('submit the weekly review');
    assert.ok(weeklyResult.selectedSkill);
    assert.equal(weeklyResult.selectedSkill.name, 'team-weekly-review');

    const torFormResult = await queryStepRouter('อยากได้แบบฟอร์มร่าง TOR ราชการสำหรับงานจ้างที่ปรึกษา');
    assert.ok(torFormResult.selectedSkill);
    assert.equal(torFormResult.selectedSkill.name, 'tor-government-writing');
  });

  await t.test('Scenario 28: Anti-False-Positive — No substring collisions on platform/format/information/website/mis', async () => {
    // 28a: "form" in platform/information/format
    const formatResult = await queryStepRouter('please format this information for the platform');
    assert.notEqual(formatResult.selectedSkill?.name, 'browser-form-assistant');

    // 28b: general website browsing
    const webResult = await queryStepRouter('ช่วยเปิดเว็บไซต์ของอุทยานฯ ให้หน่อย');
    assert.notEqual(webResult.selectedSkill?.name, 'browser-form-assistant');

    // 28c: mis report
    const misResult = await queryStepRouter('mis report สำหรับพนักงาน');
    assert.notEqual(misResult.selectedSkill?.name, 'browser-form-assistant');
  });

  await t.test('Scenario 29: Confirmation Gate — Thai and English submission commands trigger ESCALATE', async () => {
    const thaiSubmit = await queryStepRouter('ช่วยกดส่งแบบฟอร์มจองห้องประชุม');
    assert.equal(thaiSubmit.selectedSkill?.name, 'browser-form-assistant');
    assert.equal(thaiSubmit.scopeResult.status, 'ESCALATE');
    assert.ok(thaiSubmit.scopeResult.reason.includes('Human Confirmation Gate'));

    const enSubmit = await queryStepRouter('ช่วยกรอกฟอร์มแล้ว submit ให้เลย');
    assert.equal(enSubmit.selectedSkill?.name, 'browser-form-assistant');
    assert.equal(enSubmit.scopeResult.status, 'ESCALATE');
  });

  await t.test('Scenario 30: Active Clarification Protocol — Broad/ambiguous query flags isAmbiguous', async () => {
    // Vague query without specific keywords
    const broadResult = await queryStepRouter('ช่วยดูเอกสารนี้หน่อย');
    assert.equal(broadResult.isAmbiguous, true, 'Broad query should be flagged as ambiguous');
    assert.ok(broadResult.candidateSkills.length >= 2, 'Should offer multiple candidate skills for clarification');
  });

  await t.test('Scenario 31: Workspace User Memory (USER.md) — Disambiguates with user team context', async () => {
    const tmpWorkspace = await mkdtemp(join(tmpdir(), 'step-user-mem-'));
    try {
      await initUserMemory(tmpWorkspace, {
        name: 'พี่นก',
        team: 'afp',
        role: 'หัวหน้างานจัดซื้อ',
      });

      // When querying from workspace with AFP memory, AFP skills get team boost
      const memResult = await queryStepRouter('ช่วยดูเอกสารนี้หน่อย', { workspaceDir: tmpWorkspace });
      assert.ok(memResult.userMemory?.exists, 'Memory should be loaded from workspace');
      assert.equal(memResult.userMemory.profile.team, 'afp');
      assert.equal(memResult.selectedSkill?.name, 'tor-review', 'AFP team context should prioritize tor-review');
    } finally {
      await rm(tmpWorkspace, { recursive: true, force: true });
    }
  });

  await t.test('Scenario 32: Creative & Marketing (CC) — AI Image Prompt Generation (STeP Brand-Fixed)', async () => {
    const promptResult = await queryStepRouter('ขอ prompt ทำโปสเตอร์งานสัมมนาสตาร์ทอัพ คุม CI STeP');
    assert.equal(promptResult.selectedSkill?.name, 'step-image-prompt');
    assert.equal(promptResult.scopeResult.status, 'ALLOW');

    const notionResult = await queryStepRouter('อยากได้ prompt สร้างภาพสไตล์ notion สำหรับบทความ');
    assert.equal(notionResult.selectedSkill?.name, 'step-image-prompt');
    assert.equal(notionResult.scopeResult.status, 'ALLOW');
  });

  await t.test('Scenario 33: Incubation (PITI) — Startup discovery & Value Proposition Canvas', async () => {
    const vpcResult = await queryStepRouter('จัดทำ Value Proposition Canvas และสคริปต์สัมภาษณ์กลุ่มเป้าหมายสำหรับสตาร์ทอัพ');
    assert.ok(vpcResult.selectedSkill);
    assert.equal(vpcResult.selectedSkill.name, 'startup-discovery');
    assert.equal(vpcResult.scopeResult.status, 'ALLOW');
  });

  await t.test('Scenario 34: Strategy (SIT) — Executive status update with SBNR traffic light', async () => {
    const sbnrResult = await queryStepRouter('ทำรายงานสรุปสถานะโครงการพอร์ตโฟลิโอแบบ Traffic Light เสนอผู้บริหาร');
    assert.ok(sbnrResult.selectedSkill);
    assert.equal(sbnrResult.selectedSkill.name, 'executive-status-update');
    assert.equal(sbnrResult.scopeResult.status, 'ALLOW');
  });

  await t.test('Scenario 35: Project Management (PM) — Project Pre-mortem risk assessment', async () => {
    const premortemResult = await queryStepRouter('ทำ Pre-mortem ดักจับความเสี่ยงล่วงหน้า Tiger และ Elephant ก่อนเริ่มโครงการ');
    assert.ok(premortemResult.selectedSkill);
    assert.equal(premortemResult.selectedSkill.name, 'project-pre-mortem');
    assert.equal(premortemResult.scopeResult.status, 'ALLOW');
  });

  await t.test('Scenario 36: Strategy (SIT) — Innovation OKR mapping with North Star metric', async () => {
    const okrResult = await queryStepRouter('ช่วยตั้งเป้าหมาย OKRs รายไตรมาสเชื่อมโยงตัวชี้วัด อว. และ North Star');
    assert.ok(okrResult.selectedSkill);
    assert.equal(okrResult.selectedSkill.name, 'innovation-okr-mapping');
    assert.equal(okrResult.scopeResult.status, 'ALLOW');
  });

  await t.test('Scenario 37: Creative (CC) — Reference-led Art Direction routes to step-image-prompt', async () => {
    const result = await queryStepRouter('เอา art direction จากภาพ reference นี้มาทำ visual ของ STeP แต่ยังคง CI');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'step-image-prompt');
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('Scenario 38: Creative (CC) — Photorealistic technology hero routes to step-image-prompt', async () => {
    const result = await queryStepRouter('ช่วยทำ prompt ภาพสมจริงแบบ photorealistic technology hero สำหรับนวัตกรรมของ STeP');
    assert.ok(result.selectedSkill);
    assert.equal(result.selectedSkill.name, 'step-image-prompt');
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('Scenario 39: Creative Anti-Collision — Exhibition concept stays event-concept while exhibition visual prompt uses image skill', async () => {
    const conceptResult = await queryStepRouter('จัดธีมงานและผังบูธนิทรรศการสตาร์ทอัพ');
    assert.ok(conceptResult.selectedSkill);
    assert.equal(conceptResult.selectedSkill.name, 'event-concept');

    const visualResult = await queryStepRouter('ขอ prompt ทำ exhibition visual แบบ architectural visual สำหรับงานสตาร์ทอัพ');
    assert.ok(visualResult.selectedSkill);
    assert.equal(visualResult.selectedSkill.name, 'step-image-prompt');
  });
});


