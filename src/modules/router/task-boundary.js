/**
 * Current-turn task boundary policy.
 *
 * The router always classifies the latest user message on its own. Chat history
 * is not task input unless the user explicitly signals that the new message is
 * a continuation or refers back to earlier work. This prevents "skill
 * stickiness" where a receipt/TOR/etc. from an earlier turn leaks into a new
 * subject in the same chat session.
 */

const EXPLICIT_HISTORY_PATTERNS = [
  /เมื่อกี้|เมื่อครู่|ก่อนหน้านี้|ข้อความก่อน|คำตอบก่อน|ข้างบน|ด้านบน/i,
  /เรื่องเดิม|งานเดิม|อันเดิม|ไฟล์เดิม|เอกสารเดิม|แบบเดิม/i,
  /ต่อจาก|ต่อเรื่อง|ต่อยอดจาก|กลับมาที่|ย้อนกลับไป/i,
  /จากที่(?:เรา)?คุย|จากที่พูด|ตามที่(?:เรา)?คุย|ตามที่บอก|ที่ถามไป|ที่ส่งไป/i,
];

const LEADING_FOLLOWUP_PATTERN =
  /^\s*(?:แล้ว(?:ถ้า|กรณี|อัน|เรื่อง|แบบ|ต้อง|ทำ|ของ|จะ|ยัง|ควร|ได้|ไหม|หรือ)?|ต่อ(?:เลย|ครับ|ค่ะ|คะ)?|เหมือนเดิม|เอาแบบเดิม)(?:\s|$)/i;

/**
 * Decide whether the host may carry chat history into the current task.
 *
 * "ignore" means previous turns may remain visible to the chat host, but they
 * must not provide the active topic, Skill, source, assumptions or answer
 * content. Stable USER.md identity/team context is separate from chat history.
 *
 * "relevant-only" means the host may use only the earlier fragment the user is
 * referring to, never replay the whole conversation.
 */
export function classifyContextPolicy(currentQuery = '') {
  const text = String(currentQuery || '').trim();
  const carryover = Boolean(
    text && (
      EXPLICIT_HISTORY_PATTERNS.some((pattern) => pattern.test(text))
      || LEADING_FOLLOWUP_PATTERN.test(text)
    )
  );

  return {
    currentTurn: 'authoritative',
    history: carryover ? 'relevant-only' : 'ignore',
    carryover,
  };
}
