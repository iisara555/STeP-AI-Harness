import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeFixtureText } from './helpers/text-fixtures.js';

test('STeP Quality Layer v0.1 foundation', async (t) => {
  const documents = normalizeFixtureText(await readFile('manifest/documents.yaml', 'utf-8'));
  const skills = normalizeFixtureText(await readFile('manifest/skills.yaml', 'utf-8'));
  const qualityLayer = await readFile('docs/quality-layer.md', 'utf-8');
  const smoke = await readFile('docs/quality-pilot-smoke-test.md', 'utf-8');

  await t.test('registers current standard and current organization policy metadata', () => {
    assert.ok(documents.includes('iso-9001-2015:'));
    assert.ok(documents.includes('ISO 9001:2015 Quality management systems'));
    assert.ok(documents.includes('step-quality-policy-v2:'));
    assert.ok(documents.includes('version: "2"'));
    assert.ok(documents.includes('effectiveDate: "2026-09-08"'));
    assert.ok(documents.includes('verification: user-confirmed-current'));
  });

  // Expectation changed on 2026-10-18: the owner approved shipping the STeP MIS texts in this public repository, so the
  // Quality Manual, the team Master Lists and the QS/QM/DC procedures are readable here. STeP MIS stays the source of
  // truth for the current REV, which every converted file says in its header.
  await t.test('ships Quality Manual, Master Lists and QP text converted from STeP MIS', async () => {
    const blockFor = (id) => {
      const lines = documents.split(/\r?\n/);
      const start = lines.findIndex((line) => line === `  ${id}:`);
      assert.ok(start >= 0, `missing ${id}`);
      let end = start + 1;
      while (end < lines.length && !/^  [a-z0-9_-]+:$/.test(lines[end])) end += 1;
      return lines.slice(start, end).join('\n');
    };

    for (const [id, file, code] of [
      ['qs-doc-control-procedure', 'qp-dc-001.md', 'QP-DC-001'],
      ['qms-quality-record-control', 'qp-dc-002.md', 'QP-DC-002'],
      ['qms-risk-management', 'qp-qs-001.md', 'QP-QS-001'],
      ['qms-nonconformity', 'qp-qs-002.md', 'QP-QS-002'],
      ['qms-corrective-preventive-action', 'qp-qm-001.md', 'QP-QM-001'],
      ['qms-internal-audit', 'qp-qm-002.md', 'QP-QM-002'],
      ['qms-management-review', 'qp-qm-003.md', 'QP-QM-003'],
      ['qms-complaint-management', 'qp-qm-004.md', 'QP-QM-004'],
      ['qms-quality-manual', 'qm-qm-001.md', 'QM-QM-001'],
      ['qms-master-document-list', 'mis-master-lists.md', 'Master List'],
      ['afp-procurement-procedure', 'qp-af-001.md', 'QP-AF-001'],
      ['afp-annual-inventory-procedure', 'qp-af-002.md', 'QP-AF-002'],
      ['afp-advance-procedure', 'qp-af-003.md', 'QP-AF-003'],
      ['afp-payment-procedure', 'qp-af-004.md', 'QP-AF-004'],
    ]) {
      const block = blockFor(id);
      assert.ok(block.includes(`path: docs/knowledge/${file}`), `${id} must point at its text`);
      assert.ok(block.includes('verification: text-from-step-mis-pdf-2026-10-18'), `${id} must record where its text came from`);
      assert.ok(block.includes('status: active'), `${id} text is shipped`);
      const text = await readFile(`docs/knowledge/${file}`, 'utf-8');
      assert.ok(text.split('\n')[0].includes(code), `${file} must open with its code`);
      assert.ok(text.includes('STeP MIS'), `${file} must name STeP MIS as the controlled copy`);
      assert.doesNotMatch(text, /[\uF700-\uF8FF]/, `${file} must not keep PDF presentation-form characters`);
    }
    assert.ok(blockFor('qms-master-document-list').includes('authority: revision-source-of-truth'));

    const workingList = await readFile('docs/knowledge/qms-working-master-list.md', 'utf-8');
    const workingRef = await readFile('docs/knowledge/qms-working-reference.md', 'utf-8');
    for (const [id, file] of [['qms-working-master-list', 'docs/knowledge/qms-working-master-list.md'], ['qms-working-reference', 'docs/knowledge/qms-working-reference.md']]) {
      const block = blockFor(id);
      assert.ok(block.includes(`path: ${file}`));
      assert.ok(block.includes('status: active-reference'));
      assert.doesNotMatch(block, /verification: .*(pending|unverified)/i);
    }
    for (const rev of ['QP-DC-001', 'QP-DC-002', 'QP-QS-001', 'QP-QS-002', 'QP-QM-001', 'QP-QM-002', 'QP-QM-003', 'QP-QM-004']) {
      assert.ok(workingList.includes(rev), `working list must cover ${rev}`);
    }
    assert.ok(workingList.includes('ไม่ใช่เอกสารควบคุม'), 'the working list must not pose as a controlled document');
    assert.ok(workingList.includes('STeP MIS'));
    assert.ok(workingRef.includes('4.3'), 'QMS scope gap must stay explicit');
    assert.ok(workingRef.includes('stakeholder-questionnaire'));
    assert.ok(!skills.includes('qms-quality-manual') && !skills.includes('qms-master-document-list'),
      'Skills keep pointing at the working references; the shipped QM and Master List are found by search');
  });

  await t.test('AFP falls back to the higher-level regulation hierarchy without regulation text', async () => {
    const hierarchy = await readFile('docs/knowledge/afp-regulation-hierarchy.md', 'utf-8');
    for (const id of ['procurement-policy', 'finance-disbursement-policy']) {
      const block = documents.slice(documents.indexOf(`  ${id}:`), documents.indexOf('\n\n', documents.indexOf(`  ${id}:`)));
      assert.ok(block.includes('status: not-provided'), `${id} must record that AFP did not provide it`);
      assert.ok(block.includes('workingSubstitute: afp-regulation-hierarchy'));
      assert.ok(!block.includes('path:'), `${id} has no text, so AFP Skills stay draft-with-source-gaps`);
    }
    assert.ok(documents.includes('path: docs/knowledge/afp-regulation-hierarchy.md'));
    assert.ok(hierarchy.includes('ข้อบังคับมหาวิทยาลัยเชียงใหม่ ว่าด้วยการบริหารการเงิน'));
    assert.ok(hierarchy.includes('ห้ามอ้างเลขข้อ วงเงิน อัตรา หรือเงื่อนไขจากความจำ'));
    for (const skill of ['tor-review', 'tor-government-writing', 'receipt-audit', 'afp-operations-lookup']) {
      const block = skills.slice(skills.indexOf(`\n  ${skill}:\n`), skills.indexOf('\n\n', skills.indexOf(`\n  ${skill}:\n`)));
      assert.match(block, /optional: \[[^\]]*afp-regulation-hierarchy/, `${skill} must see the hierarchy`);
    }
  });

  await t.test('existing QMS skills use Quality Layer sources instead of creating duplicate skills', () => {
    assert.ok(skills.includes('mandatory: [iso-9001-2015, step-quality-policy-v2, human-approval-rule]'));
    assert.ok(skills.includes('mandatory: [qs-doc-control-procedure, qms-quality-record-control, human-approval-rule, data-classification-rule]'));
    assert.ok(skills.includes('mandatory: [qms-nonconformity, qms-corrective-preventive-action, human-approval-rule]'));
    assert.ok(skills.includes('mandatory: [qms-risk-management, human-approval-rule]'));
    assert.ok(skills.includes('mandatory: [step-quality-policy-v2, human-approval-rule]'));
    assert.ok(skills.includes('mandatory: [qms-management-review, step-quality-policy-v2, human-approval-rule]'));
  });

  await t.test('Quality Layer documents source boundaries and missing-source behavior', () => {
    assert.ok(qualityLayer.includes('ISO REQUIREMENT'));
    assert.ok(qualityLayer.includes('QUALITY RECORD'));
    assert.ok(qualityLayer.includes('revision status unverified'));
    assert.ok(qualityLayer.includes('qms-working-master-list.md'));
    assert.ok(qualityLayer.includes('P0 — Quality Manual'));
    assert.ok(qualityLayer.includes('P0 — Master Document List'));
    assert.ok(qualityLayer.includes('ไม่ block Pilot'));
  });

  await t.test('staff Pilot checklist has 15 scenarios and records real usage signals', () => {
    const rows = smoke.match(/^\|\s*\d+\s*\|/gm) || [];
    assert.equal(rows.length, 15);
    assert.ok(smoke.includes('Prompt จริง'));
    assert.ok(smoke.includes('useful / needs-fix / not-useful'));
    assert.ok(smoke.includes('Correction effort'));
    assert.ok(smoke.includes('Source traceable?'));
    assert.ok(smoke.includes('Authority safe?'));
    assert.ok(smoke.includes('Time saved?'));
    assert.ok(smoke.includes('ถ้า authority fail'));
    assert.ok(smoke.includes('ไม่เพิ่ม architecture'));
  });
});
