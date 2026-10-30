import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractStructuredJson, stripReasoningBlocks, jsonSchemaInstruction } from '../electron/json-schema';
import {
  sanitizeModelOutput,
  checkUnverifiedToolClaims,
  checkOrganizationDocCodes,
  checkMarkdownTableTotals,
  evaluateOutputQuality,
  buildRepairPrompt,
} from '../electron/output-quality';
import { loopRequests, visibleStream } from '../src/tools';

test('stripReasoningBlocks and extractStructuredJson handle <think> blocks, fences and surrounding prose', () => {
  const withThink =
    '<think>\nLet me analyze the request.\n{"skillId":"wrong"}\n</think>\nHere is the JSON:\n```json\n{"skillId":"document-review","reason":"Review draft"}\n```\nHope this helps!';
  assert.equal(extractStructuredJson(withThink), '{"skillId":"document-review","reason":"Review draft"}');
  assert.equal(sanitizeModelOutput('สวัสดีครับ\n<think>unclosed trailing thought'), 'สวัสดีครับ');

  // Preserves literal <think> inside markdown code fences
  const codeExample = 'Example:\n```xml\n<think>keep me</think>\n```\n<think>drop me</think>\nFinal text';
  const stripped = stripReasoningBlocks(codeExample);
  assert.match(stripped, /<think>keep me<\/think>/);
  assert.doesNotMatch(stripped, /drop me/);

  const schemaPrompt = jsonSchemaInstruction({ type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] });
  assert.match(schemaPrompt, /Respond with a single valid JSON object/);
});

test('loopRequests and visibleStream strip <think> blocks from local and reasoning models', () => {
  const raw = '<think>Need to read the welfare document first</think>\n{"tool":"reference","input":"hr-personnel-welfare-2569"}';
  assert.deepEqual(loopRequests(raw), [{ tool: 'reference', input: 'hr-personnel-welfare-2569' }]);
  assert.equal(visibleStream('<think>streaming thought...'), '');
  assert.equal(visibleStream('<think>done thinking</think>\nกำลังตรวจสอบข้อมูลครับ'), 'กำลังตรวจสอบข้อมูลครับ');
});

test('Gate A (checkUnverifiedToolClaims) flags unverified file creation and Google Workspace action claims', () => {
  const claimFile = 'ผมได้สร้างไฟล์ budget.xlsx เรียบร้อยแล้ว สามารถเปิดดูได้เลยครับ';
  const fileFindings = checkUnverifiedToolClaims(claimFile, [], 0);
  assert.equal(fileFindings.length, 1);
  assert.equal(fileFindings[0].code, 'UNVERIFIED_ACTION_CLAIM');

  // Allowed when sheet_create actually ran
  assert.equal(checkUnverifiedToolClaims(claimFile, ['sheet_create'], 1).length, 0);

  const claimMail = 'ส่งอีเมลให้เรียบร้อยแล้วครับ';
  assert.equal(checkUnverifiedToolClaims(claimMail, [], 0).length, 1);
  assert.equal(checkUnverifiedToolClaims(claimMail, ['google_workspace'], 0).length, 0);
});

test('Gate B (checkOrganizationDocCodes) flags fabricated STeP ISO/form codes not in grounding corpus', () => {
  const corpus = 'เอกสารอ้างอิง: QP-HR-01 และแบบฟอร์ม FM-HR-02 สำหรับการลา';
  const good = checkOrganizationDocCodes('กรุณาใช้แบบฟอร์ม FM-HR-02 ตามขั้นตอน QP-HR-01', corpus);
  assert.equal(good.length, 0);

  const bad = checkOrganizationDocCodes('กรุณากรอกแบบฟอร์ม FM-HR-99 และ WI-IT-77', corpus);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].code, 'UNGROUNDED_DOC_CODE');
  assert.match(bad[0].detail, /FM-HR-99/);
  assert.match(bad[0].detail, /WI-IT-77/);
});

test('Gate D1 (checkMarkdownTableTotals) detects arithmetic mismatches in Markdown summary rows', () => {
  const badTable = [
    '| รายการ | จำนวนเงิน (บาท) |',
    '| --- | --- |',
    '| ค่าอาหารว่าง | 1,500.00 |',
    '| ค่าเอกสาร | 2,500.00 |',
    '| **รวมทั้งสิ้น** | **4,500.00** |',
  ].join('\n');
  const mismatch = checkMarkdownTableTotals(badTable);
  assert.equal(mismatch.length, 1);
  assert.equal(mismatch[0].code, 'TABLE_TOTAL_MISMATCH');

  const goodTable = badTable.replace('4,500.00', '4,000.00');
  assert.equal(checkMarkdownTableTotals(goodTable).length, 0);
});

test('evaluateOutputQuality and buildRepairPrompt validate document envelopes, headings and table totals', () => {
  const brokenDraft = '<think>drafting memo</think>\n# บันทึกข้อความ\nเนื้อหา ללאซอง XML';
  const report = evaluateOutputQuality(brokenDraft, { documentTool: 'memo' });
  assert.equal(report.validEnvelope, false);
  assert.equal(report.needsRepair, true);
  assert.ok(report.findings.some(f => f.code === 'MISSING_DOCUMENT_ENVELOPE'));

  const prompt = buildRepairPrompt(report.sanitizedText, report.findings, 'memo');
  assert.match(prompt, /<quality_repair_request>/);
  assert.match(prompt, /MISSING_DOCUMENT_ENVELOPE/);

  const validMemo = [
    '<think>reasoning</think>',
    '<document_draft>',
    '## ส่วนหัวบันทึก',
    'ส่วนงาน: STeP',
    '## เรื่อง',
    'ขออนุมัติจัดประชุม',
    '## เรียน',
    'ผู้อำนวยการ',
    '## เนื้อหา',
    'รายละเอียดการประชุม [รอยืนยัน: วันที่จัดประชุม]',
    '</document_draft>',
    '<document_review>',
    '- รอยืนยันวันที่จัดประชุม',
    '</document_review>',
  ].join('\n');
  const okReport = evaluateOutputQuality(validMemo, {
    documentTool: 'memo',
    strictHeadings: true,
    missingConfirmLabels: ['วันที่จัดประชุม'],
  });
  assert.equal(okReport.validEnvelope, true);
  assert.equal(okReport.needsRepair, false);
  assert.doesNotMatch(okReport.sanitizedText, /<think>/);
});
