import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { queryStepRouter } from '../src/cli/commands/ask.js';

test('STeP High-Leverage Skills — Routing & Anti-Collision Suite', async (t) => {
  await t.test('Creative direction routes to creative-art-director', async () => {
    const result = await queryStepRouter('งานโปสเตอร์นี้ยังดู AI มาก ช่วยหา visual hammer และ creative direction ใหม่', { team: 'cc' });
    assert.equal(result.selectedSkill?.name, 'creative-art-director');
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('Evidence verification routes to evidence-before-approval', async () => {
    const result = await queryStepRouter('ตรวจหลักฐานก่อนปิดงานว่า claim นี้ยืนยันได้จริงหรือยัง', { team: 'qs' });
    assert.equal(result.selectedSkill?.name, 'evidence-before-approval');
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('HD learning design routes to learning-designer', async () => {
    const result = await queryStepRouter('ช่วยออกแบบการเรียนรู้ onboarding พนักงานใหม่ มี learning outcome และกิจกรรมฝึกจริง', { team: 'hd' });
    assert.equal(result.selectedSkill?.name, 'learning-designer');
    assert.equal(result.teamInfo.id, 'hd');
  });

  await t.test('PITI assumption stress-test routes to assumption-challenger', async () => {
    const result = await queryStepRouter('ช่วยท้าทายสมมติฐานธุรกิจ หา critical assumption และ stress test idea นี้ก่อนลงทุนทำจริง', { team: 'piti' });
    assert.equal(result.selectedSkill?.name, 'assumption-challenger');
    assert.equal(result.teamInfo.id, 'piti');
  });

  await t.test('IMO decision support routes to decision-memo', async () => {
    const result = await queryStepRouter('ทำ decision memo เปรียบเทียบทางเลือกเพื่อผู้บริหาร พร้อม trade-off และสิ่งที่ต้องตัดสินใจ', { team: 'imo' });
    assert.equal(result.selectedSkill?.name, 'decision-memo');
    assert.equal(result.teamInfo.id, 'imo');
  });

  await t.test('LINC factory problem discovery routes to industry-problem-discovery', async () => {
    const result = await queryStepRouter('ช่วยถอดโจทย์โรงงานเรื่องของเสียสูง แยก pain point และ current workaround ก่อนเสนอเทคโนโลยี', { team: 'linc' });
    assert.equal(result.selectedSkill?.name, 'industry-problem-discovery');
    assert.equal(result.teamInfo.id, 'linc');
  });

  await t.test('LINC expert and resource search routes to expert-resource-matching', async () => {
    const result = await queryStepRouter('ช่วยหา expert และห้องแล็บที่เหมาะกับโจทย์นี้ พร้อมดูเครื่องมือใน NSTIS', { team: 'linc' });
    assert.equal(result.selectedSkill?.name, 'expert-resource-matching');
    assert.equal(result.teamInfo.id, 'linc');
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('equipment matching resolves the owner-confirmed facility inventory with live availability guards', async () => {
    const skill = await readFile('skills/pm/expert-resource-matching/SKILL.md', 'utf-8');
    const services = await readFile('manifest/services.yaml', 'utf-8');
    const documents = await readFile('manifest/documents.yaml', 'utf-8');
    const index = await readFile('docs/facility-equipment-index.md', 'utf-8');

    assert.ok(skill.includes('docs/facility-equipment-index.md'));
    assert.ok(skill.includes('owner-confirmed-reference-2026-09-20'));
    assert.ok(services.includes('facility-equipment-inventory-2020'));
    assert.ok(documents.includes('step-facility-equipment-inventory-2020'));
    assert.ok(documents.includes('owner-confirmed-current'));
    assert.ok(documents.includes('active-reference'));
    assert.ok(index.includes('124 รายการตามหมวดในเอกสาร'));
    assert.ok(index.includes('ไม่ใช่คำสั่งให้ AI ดำเนินการ'));
    assert.ok(index.includes('NSP Central Laboratory คือ INFRI'));
    assert.ok(index.includes('ทีม LES ดูแล CIMO, INFRI และ RF'));
    assert.ok(index.includes('ทีม FOODFABR ดูแล Innovative Food Fabrication Pilot Plant'));
    assert.ok(index.includes('FABLAB ไม่มีบริการแล้ว'));
    assert.ok(services.includes('food-lab-testing-infri'));
    assert.match(services, /rf-technology-pilot-plant:[\s\S]*?leadTeam: les[\s\S]*?ownershipStatus: owner-confirmed/);
    assert.match(services, /cimo-ion-beam-and-analysis:[\s\S]*?leadTeam: les[\s\S]*?ownershipStatus: owner-confirmed/);
    assert.match(services, /food-pilot-production:[\s\S]*?leadTeam: foodfabr[\s\S]*?ownershipStatus: owner-confirmed/);
    assert.ok(documents.includes('owner: les'));
    assert.ok(documents.includes('coOwners: [foodfabr]'));
    assert.ok(services.includes('recommendationPolicy: do-not-recommend-as-current-service'));
  });

  await t.test('natural equipment inventory questions route to expert-resource-matching', async () => {
    for (const prompt of [
      'มีเครื่อง Freeze Dryer หรือ Spray Dryer ไหม',
      'ช่วยหาเครื่อง HPLC สำหรับวิเคราะห์อาหาร',
      'ต้องการใช้เครื่องพลาสมาหรือ AFM',
      'มีเครื่อง 3D printer และ laser cutter อะไรบ้าง',
    ]) {
      const result = await queryStepRouter(prompt);
      assert.equal(result.selectedSkill?.name, 'expert-resource-matching', prompt);
      assert.equal(result.scopeResult.status, 'ALLOW', prompt);
    }
  });

  await t.test('MI recent market research routes to market-signal-radar', async () => {
    const result = await queryStepRouter('ช่วยดู trend ล่าสุดและสัญญาณตลาดว่าคู่แข่งล่าสุดกำลังพูดเรื่องอะไร', { team: 'mi' });
    assert.equal(result.selectedSkill?.name, 'market-signal-radar');
    assert.equal(result.teamInfo.id, 'mi');
  });

  await t.test('CRM feedback synthesis routes to voice-of-customer', async () => {
    const result = await queryStepRouter('สรุป voice of customer จาก survey feedback และ complaint themes ชุดนี้', { team: 'crm' });
    assert.equal(result.selectedSkill?.name, 'voice-of-customer');
    assert.equal(result.teamInfo.id, 'crm');
  });

  await t.test('LES test result review routes to lab-result-review', async () => {
    const result = await queryStepRouter('ทบทวนผลทดสอบ lab result ชุดนี้ ดู QC replicate และ outlier ก่อนออกผล', { team: 'les' });
    assert.equal(result.selectedSkill?.name, 'lab-result-review');
    assert.equal(result.teamInfo.id, 'les');
  });

  await t.test('Anti-collision — image production remains step-image-prompt', async () => {
    const result = await queryStepRouter('ช่วยทำ prompt ภาพสมจริงแบบ photorealistic technology hero สำหรับ STeP', { team: 'cc' });
    assert.equal(result.selectedSkill?.name, 'step-image-prompt');
  });

  await t.test('Anti-collision — event circulation remains event-concept', async () => {
    const result = await queryStepRouter('จัดธีมงานและผังบูธนิทรรศการ พร้อมเส้นทางเดินผู้เข้าร่วม', { team: 'cc' });
    assert.equal(result.selectedSkill?.name, 'event-concept');
  });

  await t.test('Anti-collision — startup VPC remains startup-discovery', async () => {
    const result = await queryStepRouter('จัดทำ Value Proposition Canvas และสคริปต์สัมภาษณ์ลูกค้าสำหรับสตาร์ทอัพ', { team: 'piti' });
    assert.equal(result.selectedSkill?.name, 'startup-discovery');
  });

  await t.test('Anti-collision — AFP TOR readiness remains tor-review with team context', async () => {
    const result = await queryStepRouter('ช่วยดู TOR ฉบับนี้ว่าครบและพร้อมส่งไหม', { team: 'afp' });
    assert.equal(result.selectedSkill?.name, 'tor-review');
  });

  await t.test('Authority boundary — decision memo cannot approve budget', async () => {
    const result = await queryStepRouter('ทำ decision memo แล้วอนุมัติงบให้ทางเลือกนี้เลย', { team: 'imo' });
    assert.equal(result.selectedSkill?.name, 'decision-memo');
    assert.equal(result.scopeResult.inScope, false);
    assert.ok(result.scopeResult.status === 'BLOCK' || result.scopeResult.status === 'ESCALATE');
    assert.equal(result.scopeResult.authority, 'budget-allocation');
  });

  await t.test('Authority boundary — lab skill cannot release official result', async () => {
    const result = await queryStepRouter('ทบทวนผลทดสอบแล้วออกผลรับรองอย่างเป็นทางการให้เลย', { team: 'les' });
    assert.equal(result.selectedSkill?.name, 'lab-result-review');
    assert.equal(result.scopeResult.inScope, false);
    assert.ok(result.scopeResult.status === 'BLOCK' || result.scopeResult.status === 'ESCALATE');
    assert.equal(result.scopeResult.authority, 'official-signing');
  });
});
