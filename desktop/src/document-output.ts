import { documentTool, type DocumentToolId } from './document-tools';

export type DocumentOutput = { draft: string; review: string };
const OUTPUT_TAG = /<\/?document_(?:draft|review)\b[^>]*>/gi;
const REVIEW_HEADING =
  /^(?:ตรวจข้อมูล(?:และแหล่งที่ขาด)?(?:ก่อนเสนอ)?|ผลตรวจ(?:ร่าง|เอกสาร|รูปแบบ)?|ตารางผลตรวจ|ตารางการตรวจสอบความสอดคล้องตามมาตรฐานงานสารบรรณ|รายการข้อมูลที่ต้องยืนยัน(?:เพิ่มเติม)?(?:ก่อนเสนองาน)?|ข้อมูลที่ต้องยืนยัน|ประเด็นค้าง\s*\/\s*ตรวจข้อมูล|Skill Verification|Unresolved Fields|Next Steps)(?:\s|\(|$)/i;

function separateLegacy(text: string): DocumentOutput {
  const lines = text.split('\n');
  const start = lines.findIndex(line => /^\s*#{1,3}\s+(?:ร่าง|บันทึกข้อความ|รายงานการประชุม|ขอบเขตของงาน|ข้อเสนอโครงการ)/.test(line));
  // A later document-like heading is not permission to discard real opening paragraphs or tables.
  const preface =
    start > 0 &&
    lines.slice(0, start).every(line => !line.trim() || /^(?:ได้ครับ|ได้ค่ะ|นี่คือ|ต่อไปนี้|จัดทำร่าง|แน่นอน)/.test(line.trim()));
  const from = preface ? start : 0;
  const check = lines.findIndex(
    (line, index) =>
      index > from &&
      REVIEW_HEADING.test(
        line
          .replace(/^\s*#{1,6}\s+/, '')
          .replace(/^\*\*(.*?)\*\*$/, '$1')
          .trim(),
      ),
  );
  return {
    draft: lines
      .slice(from, check < 0 ? undefined : check)
      .join('\n')
      .trim(),
    review: [...lines.slice(0, from), ...(check < 0 ? [] : lines.slice(check))].join('\n').trim(),
  };
}

/** A document and its source/authority checks are different deliverables. Never drop the latter. */
export function parseDocumentOutput(output: string, id: DocumentToolId): DocumentOutput {
  if (!documentTool(id)) throw new Error('INVALID_DOCUMENT_TOOL');
  const text = output.replace(/\r\n?/g, '\n').trim();
  let draft = '',
    review = '';
  const tags = [...text.matchAll(OUTPUT_TAG)].map(m => m[0]);
  if (tags.length) {
    const expected = ['<document_draft>', '</document_draft>'];
    if (tags.length === 4) expected.push('<document_review>', '</document_review>');
    if (tags.length !== expected.length || tags.some((tag, index) => tag !== expected[index])) throw new Error('DOCUMENT_OUTPUT_INVALID');
    const body = /<document_draft>([\s\S]*?)<\/document_draft>/.exec(text)!;
    const separated = separateLegacy(body[1].trim());
    draft = separated.draft;
    // Surrounding explanations belong to review too, even when a model ignores the no-preface rule.
    review = [
      separated.review,
      text
        .replace(body[0], '')
        .replace(/<\/?document_review>/g, '')
        .replace(/^\s*```(?:markdown|xml)?\s*$/gm, '')
        .trim(),
    ]
      .filter(Boolean)
      .join('\n\n');
  } else {
    // Existing saved proposals and providers without envelopes: split only explicit review headings.
    ({ draft, review } = separateLegacy(text));
  }
  if (!draft) throw new Error('DOCUMENT_OUTPUT_INVALID');
  if (
    REVIEW_HEADING.test(
      draft
        .split('\n')[0]
        .replace(/^\s*#{1,6}\s+/, '')
        .trim(),
    )
  )
    throw new Error('DOCUMENT_OUTPUT_INVALID');
  // The draft's review status belongs in the application, not in an official title.
  if (id === 'memo') draft = draft.replace(/^(?:#{1,3}[ \t]+)?(?:ร่าง[^\n]*[—–-][ \t]*)?บันทึกข้อความ[ \t]*(?=\n|$)/, '# บันทึกข้อความ');
  if (id === 'letter')
    draft = draft.replace(/^#{1,3}\s+(?:ร่างเพื่อพิจารณา(?:\s*[—–-]\s*หนังสือราชการ)?|ร่างหนังสือราชการ)\s*\n/, '').trim();
  return { draft, review };
}
