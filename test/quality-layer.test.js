import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('STeP Quality Layer v0.1 foundation', async (t) => {
  const documents = await readFile('manifest/documents.yaml', 'utf-8');
  const skills = await readFile('manifest/skills.yaml', 'utf-8');
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

  await t.test('keeps Quality Manual and Master Document List as explicit missing sources', () => {
    const qm = documents.slice(documents.indexOf('qms-quality-manual:'), documents.indexOf('qms-master-document-list:'));
    assert.ok(qm.includes('verification: missing-source'));
    assert.ok(qm.includes('status: missing'));

    const master = documents.slice(documents.indexOf('qms-master-document-list:'), documents.indexOf('qms-quality-record-control:'));
    assert.ok(master.includes('authority: revision-source-of-truth'));
    assert.ok(master.includes('verification: missing-source'));
    assert.ok(master.includes('status: missing'));
  });

  await t.test('provided QPs remain unverified until Master List arrives', () => {
    const blockFor = (id) => {
      const lines = documents.split(/\r?\n/);
      const start = lines.findIndex((line) => line === `  ${id}:`);
      assert.ok(start >= 0, `missing ${id}`);
      let end = start + 1;
      while (end < lines.length && !/^  [a-z0-9_-]+:$/.test(lines[end])) end += 1;
      return lines.slice(start, end).join('\n');
    };

    for (const id of [
      'qs-doc-control-procedure',
      'qms-quality-record-control',
      'qms-risk-management',
      'qms-nonconformity',
      'qms-corrective-preventive-action',
      'qms-internal-audit',
      'qms-management-review',
      'qms-complaint-management',
    ]) {
      const block = blockFor(id);
      assert.ok(block.includes('verification: pending-master-list'), `${id} must await Master List`);
      assert.ok(block.includes('status: provided-unverified'), `${id} must not be treated as current automatically`);
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
