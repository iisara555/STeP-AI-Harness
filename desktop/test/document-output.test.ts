import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocumentOutput } from '../src/document-output';
import { markdownDocument, documentText, validateDocument } from '../src/draft';
import { Store } from '../electron/store';
import { DOCUMENT_TOOLS } from '../src/document-tools';
import { readFile } from 'node:fs/promises';

const memo =
  '# บันทึกข้อความ\n\nส่วนงาน หน่วยงานสังเคราะห์\n\nที่ 0007/๖๙ วันที่ [รอยืนยัน: วันที่]\n\nเรื่อง ขอพิจารณากิจกรรมตัวอย่าง\n\nเรียน [รอยืนยัน: ผู้รับ]\n\nงบประมาณ [รอยืนยัน: จำนวนเงิน] รหัส 00123\n\nจึงเรียนมาเพื่อโปรดพิจารณา\n\n(ผู้เสนอสมมติ)\n\nผู้ดูแลโครงการ';
const checks =
  '## ตารางผลตรวจ (Skill Verification)\n\n| รายการ | ผลตรวจ |\n|---|---|\n| รูปแบบ | รอยืนยัน |\n\n## รายการข้อมูลที่ต้องยืนยันเพิ่มเติม (Unresolved Fields)\n\n- งบประมาณและอำนาจลงนาม';

test('all five document tools separate editable body from Skill checks and conversation', () => {
  for (const tool of DOCUMENT_TOOLS) {
    const body =
      tool.id === 'memo'
        ? memo
        : `# เอกสารสังเคราะห์ ${tool.id}\n\nรหัส 00123 งบประมาณ [รอยืนยัน: จำนวนเงิน]\n\n| รายการ | จำนวน |\n|---|---|\n| ตัวอย่าง | ๓ |`;
    const parsed = parseDocumentOutput(
      `ได้ครับ นี่คือร่าง\n<document_draft>\n${body}\n</document_draft>\n<document_review>\n${checks}\n</document_review>\nตรวจต้นฉบับก่อนเสนอ`,
      tool.id,
    );
    assert.equal(parsed.draft, body);
    assert.ok(parsed.review.includes('Skill Verification'));
    assert.ok(parsed.review.includes('ได้ครับ'));
    assert.ok(parsed.review.includes('ตรวจต้นฉบับก่อนเสนอ'));
    assert.ok(!parsed.draft.includes('Unresolved Fields'));
  }
});

test('legacy heading-delimited output keeps facts/placeholders and moves the complete review tail', () => {
  const parsed = parseDocumentOutput(`ได้ครับ\n\n${memo}\n\n${checks}`, 'memo');
  assert.equal(parsed.draft, memo);
  assert.ok(parsed.review.includes('ได้ครับ'));
  assert.ok(parsed.review.includes('งบประมาณและอำนาจลงนาม'));
  assert.equal(parseDocumentOutput(memo, 'memo').draft, memo);
  assert.equal(parseDocumentOutput('# โครงการสังเคราะห์\n\n## ๕. การตรวจข้อมูลผู้เข้าร่วม\n\nสาระของกิจกรรม', 'project').review, '');
});

test('multiple, empty, nested or incomplete output envelopes cannot silently become a draft', () => {
  for (const text of [
    '<document_draft>\n</document_draft>',
    '<document_draft>ร่าง',
    '<document_review>ตรวจ</document_review>',
    '<document_draft>ร่าง</document_draft><document_draft>อีกเรื่อง</document_draft>',
    '<document_draft><document_review>ตรวจ</document_review></document_draft>',
    '<document_draft layout="memo">ร่าง</document_draft>',
    '<DOCUMENT_DRAFT>ร่าง</DOCUMENT_DRAFT>',
    '## ตารางผลตรวจ (Skill Verification)\n\nไม่มีตัวเอกสาร',
  ])
    assert.throws(() => parseDocumentOutput(text, 'memo'), /DOCUMENT_OUTPUT_INVALID/);
});

test('review headings inside a mislabeled envelope still stay out of the document', () => {
  const parsed = parseDocumentOutput(`<document_draft>${memo}\n\n${checks}</document_draft>`, 'memo');
  assert.equal(parsed.draft, memo);
  assert.ok(parsed.review.includes('Skill Verification'));
  const project = parseDocumentOutput(
    '# ข้อเสนอโครงการสังเคราะห์\n\n## ๘. ผลที่คาดว่าจะได้รับ\n\nข้อเสนอ\n\n### ตรวจข้อมูลและแหล่งที่ขาดก่อนเสนอ\n\nตรวจต้นทาง',
    'project',
  );
  assert.ok(project.draft.includes('ข้อเสนอ'));
  assert.ok(!project.draft.includes('ตรวจต้นทาง'));
  assert.ok(project.review.includes('ตรวจต้นทาง'));
});

test('document-like subsection headings do not discard preceding source paragraphs or tables', () => {
  const body = 'รายละเอียดจากต้นเรื่อง\n\n| รหัส | จำนวน |\n|---|---|\n| 00123 | ๓ |\n\n## ขอบเขตของงานเพิ่มเติม\n\nตรวจรับตามรายการ';
  const parsed = parseDocumentOutput(`<document_draft>${body}</document_draft>`, 'tor');
  assert.equal(parsed.draft, body);
});

test('synthetic fixtures for all tools retain native body tables, source codes and unresolved slots', async () => {
  const fixtures = JSON.parse(await readFile(new URL('./fixtures/document-drafts.json', import.meta.url), 'utf8'));
  assert.equal(fixtures.synthetic, true);
  for (const tool of DOCUMENT_TOOLS) {
    const original = fixtures.documents[tool.id];
    const parsed = parseDocumentOutput(
      `<document_draft>${original}</document_draft><document_review>${fixtures.review}</document_review>`,
      tool.id,
    );
    assert.equal(parsed.draft, original);
    assert.ok(parsed.draft.includes('[รอยืนยัน:'));
    assert.ok(!parsed.draft.includes('Skill Verification'));
    const doc = markdownDocument(parsed.draft);
    if (['project', 'minutes'].includes(tool.id)) assert.ok(doc.content?.some(n => n.type === 'table'));
  }
});

test('legacy proposal acceptance excludes commentary from the editable draft and retains review separately', () => {
  const store = new Store(':memory:');
  try {
    const session = store.create('', 'ga');
    session.documentTool = 'memo';
    session.proposals.push({ id: 'old', text: `${memo}\n\n${checks}`, baseRevision: 0, sources: ['synthetic'], at: '2026-10-08' });
    store.save(session);
    const accepted = store.accept(session.id, 'old');
    assert.ok(!accepted.draft.includes('Skill Verification'));
    assert.ok(accepted.documentReview?.text.includes('Skill Verification'));
    assert.equal(accepted.documentReview?.revision, accepted.revision);
    assert.ok(accepted.draft.includes('00123'));
    assert.ok(accepted.draft.includes('[รอยืนยัน: จำนวนเงิน]'));
  } finally {
    store.close();
  }
});

test('HTML break tokens map to safe native line breaks in paragraphs and table cells', () => {
  const doc = validateDocument(markdownDocument('ชื่อ<br/>ตำแหน่ง\n\n| หัวข้อ |\n|---|\n| ค่า<br>อีกบรรทัด |'));
  assert.equal(documentText(doc.content![0]), 'ชื่อ\nตำแหน่ง');
  assert.equal(documentText(doc.content![1].content![1].content![0]), 'ค่า\nอีกบรรทัด');
  assert.ok(!documentText(doc).includes('<br'));
  const code = markdownDocument('```\n<br/>\n```');
  assert.equal(documentText(code), '<br/>');
  assert.equal(documentText(markdownDocument('`<br/>`')), '<br/>');
});
