/**
 * Current-turn task boundary policy.
 *
 * The latest user message is authoritative. Earlier chat/source/draft context is
 * available only when the current turn explicitly refers to it. Editing an
 * existing draft is stricter still: an ordinary new question must never be
 * converted into a revision merely because a draft already exists.
 */

const EXPLICIT_HISTORY_PATTERNS = [
  /เมื่อกี้|เมื่อครู่|ก่อนหน้านี้|ข้อความก่อน|คำตอบก่อน|ข้างบน|ด้านบน/i,
  /เรื่องเดิม|งานเดิม|อันเดิม|ไฟล์เดิม|เอกสารเดิม|แบบเดิม/i,
  /ต่อจาก|ต่อเรื่อง|ต่อยอดจาก|กลับมาที่|ย้อนกลับไป/i,
  /จากที่(?:เรา)?คุย|จากที่พูด|ตามที่(?:เรา)?คุย|ตามที่บอก|ที่ถามไป|ที่ส่งไป/i,
];

// References such as "ใบเสร็จนี้" are explicit context links even without words
// such as "เมื่อกี้". This is important for persistent reviewed sources.
const SOURCE_REFERENCE_PATTERN =
  /(?:ใบเสร็จ|เอกสาร|ไฟล์|ข้อมูล|ร่าง|ข้อความ|ตาราง|รูป|ภาพ|รายการ|งาน)(?:นี้|นั้น|เดิม|ข้างต้น|ด้านบน)/i;

const LEADING_FOLLOWUP_PATTERN =
  /^\s*(?:แล้ว(?:ถ้า|กรณี|อัน|เรื่อง|แบบ|ต้อง|ทำ|ของ|จะ|ยัง|ควร|ได้|ไหม|หรือ)?)(?:\s|$)/i;

// Only explicit edit language makes an existing draft a revision. Without this,
// a completely different task typed in the same Workspace must start fresh.
const REVISION_PATTERN =
  /^\s*(?:ช่วย\s*)?(?:ปรับ|แก้(?:ไข)?|เพิ่ม|ลด|ตัด|เปลี่ยน|ย่อ|ขยาย|เรียบเรียง|จัดรูปแบบ|เขียนใหม่|เติม|ลบ|rewrite|revise|edit)(?:\s|$)/i;

const RESUME_PATTERN = /^\s*(?:ต่อ(?:เลย|ครับ|ค่ะ|คะ)?|เหมือนเดิม|เอาแบบเดิม)\s*$/i;

/**
 * Decide whether the host may carry earlier context into the current task.
 *
 * history="ignore": do not send earlier turns, active source, draft or route as
 * task context.
 *
 * history="relevant-only": the host may carry only the task-local context the
 * user explicitly referred to.
 *
 * revision=true: the current turn explicitly asks to edit the existing draft.
 * resume=true: the current turn explicitly asks to continue the existing work.
 */
export function classifyContextPolicy(currentQuery = '') {
  const text = String(currentQuery || '').trim();
  const revision = Boolean(text && REVISION_PATTERN.test(text));
  const resume = Boolean(text && RESUME_PATTERN.test(text));
  const carryover = Boolean(
    text &&
      (revision ||
        resume ||
        EXPLICIT_HISTORY_PATTERNS.some(pattern => pattern.test(text)) ||
        SOURCE_REFERENCE_PATTERN.test(text) ||
        LEADING_FOLLOWUP_PATTERN.test(text)),
  );

  return {
    currentTurn: 'authoritative',
    history: carryover ? 'relevant-only' : 'ignore',
    carryover,
    revision,
    resume,
  };
}
