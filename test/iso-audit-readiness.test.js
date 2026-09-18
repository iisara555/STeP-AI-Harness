import test from 'node:test';
import assert from 'node:assert/strict';
import { queryStepRouter } from '../src/cli/commands/ask.js';

test('STeP ISO 9001 Audit Readiness Pack — Routing, Collision & Authority Suite', async (t) => {
  await t.test('External ISO audit readiness routes to iso9001-audit-readiness', async () => {
    const result = await queryStepRouter('ช่วยเตรียม External Audit ISO 9001 และตรวจ audit readiness ของทีมก่อน fieldwork', { team: 'qs' });
    assert.equal(result.selectedSkill?.name, 'iso9001-audit-readiness');
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('Evidence request routes to audit-evidence-matrix', async () => {
    const result = await queryStepRouter('ช่วยจัดทำ audit evidence matrix และรายการหลักฐาน audit พร้อม owner กับ period', { team: 'cc' });
    assert.equal(result.selectedSkill?.name, 'audit-evidence-matrix');
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('Document revision review routes to document-record-control', async () => {
    const result = await queryStepRouter('ช่วยตรวจ document control ดู revision master list และ obsolete document ก่อน audit', { team: 'ga' });
    assert.equal(result.selectedSkill?.name, 'document-record-control');
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('Mock auditor interview routes to audit-interview-coach', async () => {
    const result = await queryStepRouter('ช่วยตรวจความพร้อมโดยทำ mock audit interview ซ้อมตอบ auditor ของทีม', { team: 'piti' });
    assert.equal(result.selectedSkill?.name, 'audit-interview-coach');
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('NCR and corrective action routes to ncr-capa', async () => {
    const result = await queryStepRouter('ช่วยตรวจ NCR CAPA นี้ ทำ root cause และ corrective action plan จาก audit finding', { team: 'qs' });
    assert.equal(result.selectedSkill?.name, 'ncr-capa');
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('QMS risk review routes to qms-risk-opportunity-review', async () => {
    const result = await queryStepRouter('ช่วยทบทวน QMS risk opportunity และ risk register ISO ของ process นี้', { team: 'qs' });
    assert.equal(result.selectedSkill?.name, 'qms-risk-opportunity-review');
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('Quality objective review routes to quality-objective-kpi-review', async () => {
    const result = await queryStepRouter('ช่วยทบทวน quality objective KPI ISO ว่า formula source baseline target และ owner ชัดไหม', { team: 'qs' });
    assert.equal(result.selectedSkill?.name, 'quality-objective-kpi-review');
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('Management review prep routes to management-review-prep', async () => {
    const result = await queryStepRouter('ช่วยเตรียม management review ISO รวม KPI CAPA risk และ prior actions สำหรับ QMR meeting', { team: 'qs' });
    assert.equal(result.selectedSkill?.name, 'management-review-prep');
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('Anti-collision — SOP drafting remains sop-authoring', async () => {
    const result = await queryStepRouter('ช่วยร่าง SOP และ WI ขั้นตอนการทำงานใหม่ให้ทีม', { team: 'qs' });
    assert.equal(result.selectedSkill?.name, 'sop-authoring');
  });

  await t.test('Anti-collision — project risk remains project-pre-mortem', async () => {
    const result = await queryStepRouter('ช่วยทำ project pre-mortem ดักจับความเสี่ยงล่วงหน้าก่อนเริ่มโครงการ', { team: 'pubsec' });
    assert.equal(result.selectedSkill?.name, 'project-pre-mortem');
  });

  await t.test('Anti-collision — strategic OKR remains innovation-okr-mapping', async () => {
    const result = await queryStepRouter('ช่วยวาง OKR และ measurable key results เชื่อมยุทธศาสตร์องค์กร', { team: 'sit' });
    assert.equal(result.selectedSkill?.name, 'innovation-okr-mapping');
  });

  await t.test('Anti-collision — generic final evidence remains evidence-before-approval', async () => {
    const result = await queryStepRouter('ช่วยตรวจหลักฐานก่อนปิดงานว่า claim นี้ยืนยันได้จริงหรือยัง', { team: 'qs' });
    assert.equal(result.selectedSkill?.name, 'evidence-before-approval');
  });

  await t.test('Authority boundary — AI cannot certify ISO conformity', async () => {
    const result = await queryStepRouter('ช่วยเตรียม External Audit ISO 9001 แล้วรับรองว่าผ่าน ISO compliant ให้เลย', { team: 'qs' });
    assert.equal(result.selectedSkill?.name, 'iso9001-audit-readiness');
    assert.equal(result.scopeResult.inScope, false);
    assert.equal(result.scopeResult.status, 'BLOCK');
    assert.equal(result.scopeResult.authority, 'qms-conformity-decision');
  });

  await t.test('Authority boundary — AI cannot officially close CAPA', async () => {
    const result = await queryStepRouter('ตรวจ NCR CAPA แล้วปิด CAPA อย่างเป็นทางการให้เลย', { team: 'qs' });
    assert.equal(result.selectedSkill?.name, 'ncr-capa');
    assert.equal(result.scopeResult.inScope, false);
    assert.equal(result.scopeResult.status, 'BLOCK');
    assert.equal(result.scopeResult.authority, 'qms-conformity-decision');
  });
});
