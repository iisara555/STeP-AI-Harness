import type { DocumentToolId } from './document-tools';
import type { Session } from './types';

const ACTION =
  /ยกร่าง|ร่าง|เขียน|จัดทำ|เรียบเรียง|(?:สรุป|แปลง)[^\n]{0,80}?เป็น|ทำเป็น|ทำ\s*(?=เอกสาร|tor\b|ทีโออาร์|บันทึก|หนังสือ|รายงาน|โครงการ)|สร้าง(?:เอกสาร)?|\b(?:draft|write|compose|prepare|create|convert)\b/gi;
const CANCEL = /(?:ยังไม่ต้อง|อย่าเพิ่ง|ไม่ต้อง|ห้าม)\s*(?:ให้\s*)?(?:ยกร่าง|ร่าง|เขียน|จัดทำ|สร้าง|draft|write|create)/i;
const EXPLANATION =
  /^\s*(?:(?:ช่วย|กรุณา|รบกวน|ขอ)\s*)?(?:อธิบาย|บอก|แนะนำ|ตรวจ|ทบทวน|วิเคราะห์|เปรียบเทียบ|วิธี|ขั้นตอน|ต้อง|ควร|ทำไม|อะไร|how\b|what\b|why\b|explain\b|review\b)/i;
const QUESTION = /(?:อย่างไร|ยังไง|หมายถึงอะไร|คืออะไร|อะไรบ้าง|หรือเปล่า|หรือไม่)(?:\s*(?:ครับ|ค่ะ|คะ))?\s*[?？]?$/i;
const DIRECT = /(?:ช่วย|กรุณา|รบกวน|ขอให้)\s*(?:ยกร่าง|ร่าง|เขียน|จัดทำ|สร้าง)/i;
const LATER_DRAFT =
  /(?:แล้ว|จากนั้น|ต่อจากนั้น|\bthen\b)\s*(?:(?:ช่วย|กรุณา|รบกวน)\s*)?(?:ยกร่าง|ร่าง|เขียน|จัดทำ|สร้าง|draft|write|create)/i;
const PARTIAL =
  /(?:เฉพาะ|แค่)\s*(?:หัวข้อ|ข้อ|ส่วน|วัตถุประสงค์|หลักการ|คุณสมบัติ)|(?:ยกร่าง|ร่าง|เขียน|จัดทำ)\s*(?:หัวข้อ|ข้อ\s*\d|วัตถุประสงค์|หลักการและเหตุผล|คุณสมบัติ)/i;
const GENERIC =
  /^(?:(?:ช่วย|ขอ|ขอให้|รบกวน|กรุณา)\s*)?(?:ยกร่าง|ร่าง|เขียน|จัดทำ|สรุปเป็น|ทำเป็น)\s*(?:(?:เอกสาร|ให้(?:หน่อย|ที|ด้วย)?|จากที่คุยกัน|ตามที่คุยกัน|ตามข้อสรุป|เลย|หน่อย|ที|ด้วย)\s*)+(?:ครับ|ค่ะ|คะ)?$/i;

const TYPES: { id: DocumentToolId; pattern: RegExp }[] = [
  { id: 'tor', pattern: /\btor\b|ทีโออาร์|ขอบเขตของงาน/gi },
  { id: 'memo', pattern: /บันทึกข้อความ|หนังสือภายใน|บันทึกราชการ/gi },
  { id: 'letter', pattern: /หนังสือราชการ|หนังสือภายนอก|จดหมายราชการ|หนังสือเชิญ|หนังสือตอบกลับ|หนังสือประสานงาน/gi },
  { id: 'minutes', pattern: /รายงานการประชุม|บันทึกการประชุม/gi },
  { id: 'project', pattern: /(?:ข้อเสนอ|เอกสาร)โครงการ|(?<!ชื่อ)โครงการ/gi },
  { id: 'other', pattern: /หนังสือรับรอง|ประกาศ|คำสั่ง|ข้อตกลง|สัญญา|รายงาน(?:ผล|ความคืบหน้า|สรุปผล)/gi },
];

function mentionedTypes(value: string) {
  return TYPES.flatMap(({ id, pattern }) =>
    [...value.matchAll(pattern)].map(match => ({ id, start: match.index!, end: match.index! + match[0].length, name: match[0] })),
  ).filter(match => !(match.name === 'คำสั่ง' && /(?:sql|shell|terminal|command|โค้ด|โปรแกรม)/i.test(value)));
}

/** Subtypes come from user requests, never from generated prose or attached examples. */
export function requestedLetterVariant(text: string, priorUserMessages: string[] = []): string | undefined {
  const values = [text, ...(GENERIC.test(text.trim()) ? priorUserMessages.slice(-20).reverse() : [])];
  for (const value of values) {
    const found = [...value.matchAll(/หนังสือ(เชิญ|ตอบกลับ|ประสานงาน|ภายนอก)/g)];
    if (found.length) {
      const kinds = [
        ...new Set(found.map(m => ({ เชิญ: 'invitation', ตอบกลับ: 'reply', ประสานงาน: 'coordination', ภายนอก: 'external' })[m[1]])),
      ];
      return kinds.length === 1 ? kinds[0] : undefined;
    }
  }
  return undefined;
}

/** The conversation fields sent for drafting, excluding status and mutable UI/check metadata. */
export function documentConversationContext(session: Pick<Session, 'messages' | 'files'>): string {
  return JSON.stringify({
    messages: session.messages
      .filter(message => message.role !== 'status')
      .slice(-1000)
      .map(message => ({
        role: message.role,
        text: message.text,
        ...(message.files?.length ? { files: message.files.map(file => file.name) } : {}),
      })),
    files: (session.files || []).map(file => ({ name: file.name, text: file.text, at: file.at })),
  });
}

/** Recognize an explicit request for a supported document, not ordinary discussion about one. */
export function requestedDocumentTool(text: string, priorUserMessages: string[] = []): DocumentToolId | undefined {
  const value = text.trim();
  if (
    !value ||
    CANCEL.test(value) ||
    PARTIAL.test(value) ||
    (EXPLANATION.test(value) && !LATER_DRAFT.test(value)) ||
    (QUESTION.test(value) && !DIRECT.test(value) && !LATER_DRAFT.test(value))
  )
    return undefined;
  const actions = [...value.matchAll(ACTION)];
  if (!actions.length) return undefined;
  const action = EXPLANATION.test(value) ? actions.at(-1)! : actions[0];
  const types = mentionedTypes(value);
  const following = types.filter(match => match.start >= action.index!).sort((a, b) => a.start - b.start || b.end - a.end);
  const previous = types.filter(match => match.end <= action.index!).sort((a, b) => b.end - a.end || b.end - b.start - (a.end - a.start));
  const explicit = following[0] || previous[0];
  if (explicit) return explicit.id;
  if (!GENERIC.test(value)) return undefined;
  for (const prior of priorUserMessages.slice(-20).reverse()) {
    const mentioned = [...new Set(mentionedTypes(prior).map(match => match.id))];
    if (mentioned.length) return mentioned.length === 1 ? mentioned[0] : undefined;
  }
  return undefined;
}
