import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { queryStepRouter } from '../src/cli/commands/ask.js';

test('AFP Demo — Thai-first, routing, and human-authority smoke tests', async (t) => {
  await t.test('Demo 1: receipt pre-check routes to AFP receipt-audit', async () => {
    const result = await queryStepRouter('ช่วยตรวจใบเสร็จและเอกสารชุดนี้ก่อนส่ง AFP ว่าพร้อมหรือยัง', { team: 'afp' });
    assert.equal(result.selectedSkill?.name, 'receipt-audit');
    assert.equal(result.teamInfo.id, 'afp');
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('Demo 2: TOR pre-check routes to tor-review', async () => {
    const result = await queryStepRouter('ช่วยตรวจ TOR งานจ้างออกแบบและติดตั้งบูธนี้ก่อนส่ง AFP ว่ามีจุดเสี่ยงอะไร', { team: 'afp' });
    assert.equal(result.selectedSkill?.name, 'tor-review');
    assert.equal(result.teamInfo.id, 'afp');
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('Demo 3: document-preparation question stays in AFP/procurement context', async () => {
    const result = await queryStepRouter('ผมจะจ้างทำสื่อสำหรับงาน Event ต้องเตรียมเอกสารอะไรส่ง AFP บ้าง', { team: 'afp' });
    assert.ok(result.selectedSkill, 'Selected skill exists');
    assert.equal(result.teamInfo.id, 'afp');
    assert.ok(['ALLOW', 'ESCALATE'].includes(result.scopeResult.status));
  });

  await t.test('Demo 4: conflict-style question does not grant decision authority', async () => {
    const result = await queryStepRouter('ครั้งก่อนเคสคล้ายกันผ่าน แต่ครั้งนี้ AFP ตีกลับ ช่วยอธิบายว่าต่างกันตรงไหน', { team: 'afp' });
    assert.ok(result.selectedSkill, 'Selected skill exists');
    assert.equal(result.teamInfo.id, 'afp');
    assert.notEqual(result.scopeResult.status, 'BLOCK', 'Explanation itself should remain assistive');
  });

  await t.test('vendor winner selection remains human-only', async () => {
    const result = await queryStepRouter('ตรวจ TOR แล้วเลือกบริษัทผู้ชนะให้เลย', { team: 'afp' });
    assert.equal(result.selectedSkill?.name, 'tor-review');
    assert.equal(result.scopeResult.status, 'BLOCK');
    assert.equal(result.scopeResult.inScope, false);
    assert.equal(result.scopeResult.authority, 'procurement-approval');
  });

  await t.test('actual disbursement approval remains human-only', async () => {
    const result = await queryStepRouter('ตรวจใบเสร็จแล้วอนุมัติเบิกจ่ายเงินจริงให้เลย', { team: 'afp' });
    assert.equal(result.selectedSkill?.name, 'receipt-audit');
    assert.equal(result.scopeResult.status, 'BLOCK');
    assert.equal(result.scopeResult.inScope, false);
    assert.equal(result.scopeResult.authority, 'budget-allocation');
  });

  await t.test('AFP demo materials are Thai-first and source-aware', async () => {
    const source = await readFile('docs/afp-demo-source-register.md', 'utf-8');
    const concepts = await readFile('docs/afp-demo-concepts.md', 'utf-8');
    const run = await readFile('docs/afp-demo-run-sheet.md', 'utf-8');
    const start = await readFile('docs/afp-demo-start.md', 'utf-8');

    assert.ok(source.includes('ทะเบียนแหล่งอ้างอิงสำหรับสาธิต AFP'));
    assert.ok(source.includes('รอ AFP ยืนยัน'));
    assert.ok(source.includes('พระราชบัญญัติการจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560'));
    assert.ok(concepts.includes('สถานะ'));
    assert.ok(concepts.includes('ผู้มีอำนาจตัดสิน'));
    assert.ok(concepts.includes('กรณีที่ 4 — อธิบายเหตุผลที่เอกสารถูกตีกลับ'));
    assert.ok(run.includes('Demo 1'));
    assert.ok(run.includes('Demo 2'));
    assert.ok(run.includes('Demo 3'));
    assert.ok(run.includes('Demo 4'));
    assert.ok(start.includes('ตอบภาษาไทยเป็นหลัก'));
    assert.ok(start.includes('พร้อมสาธิต AFP — เลือก Demo 1–4'));
  });
});
