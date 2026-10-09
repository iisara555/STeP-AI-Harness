/** Explicit language requests only; uncertain, mixed or context-dependent requests keep the full harness. */
const language = '(?:English|Thai|Japanese|Chinese|Korean|French|German|Spanish|อังกฤษ|ไทย|ญี่ปุ่น|จีน|เกาหลี|ฝรั่งเศส|เยอรมัน|สเปน)';
const polite = '(?:\\s*(?:ให้หน่อย|ให้ที|ด้วย|หน่อย|ที|ครับ|ค่ะ|คะ|please))*';
const thai = `(?:ช่วย\\s*)?(?:แปล(?:ข้อความ(?:นี้|ต่อไปนี้)?)?(?:(?:ไป)?เป็น(?:ภาษา)?${language}|จาก(?:ภาษา)?${language}(?:เป็น(?:ภาษา)?${language})?)?|(?:ตรวจ|เช็ก|เช็ค|แก้)(?:คำผิด|คำสะกด|การสะกด|ไวยากรณ์)(?:ข้อความนี้|ให้ถูกต้อง)?|สรุป(?:ข้อความ|เนื้อหา)(?:นี้|ต่อไปนี้)?)${polite}`;
const english = `(?:please\\s+)?(?:translate(?:\\s+(?:this|the following)(?:\\s+text)?)?(?:\\s+(?:to|into|from)\\s+${language}(?:\\s+(?:to|into)\\s+${language})?)?|summari[sz]e(?:\\s+(?:this|the following)(?:\\s+text)?)?|(?:check|correct|fix)\\s+(?:spelling|grammar)(?:\\s+(?:in|of)\\s+(?:this|the following)\\s+text)?)(?:\\s+please)?`;
const header = new RegExp(`^(?:${thai}|${english})$`, 'i');
const inline = new RegExp(`^(${thai}|${english})\\s+([\\s\\S]+)$`, 'i');
const mixed =
  /(?:และ|พร้อม|แล้ว).{0,20}(?:ส่ง|เผยแพร่|บันทึก|ค้น|อนุมัติ|ลงนาม)|\b(?:and|then|also)\b.{0,30}\b(?:send|email|publish|save|upload|search|approve|sign)\b|\b(?:previous|earlier|above|attached|last|file|document|policy)\b|เมื่อกี้|ก่อนหน้า|ด้านบน|ที่แนบ|อันนี้|อันนั้น|ข้อความเดิม|ไฟล์|เอกสาร|ระเบียบ/i;
export function selfContainedText(query: string) {
  const text = query.trim();
  // A delimiter clearly separates instructions from quoted source; organization/action words in that source remain data.
  const split = /^([^:\n：]{1,140})[:：\n]\s*([\s\S]+)$/.exec(text);
  if (split) return Boolean(split[2].trim()) && header.test(split[1].trim());
  // A bare language request can ask for its missing source without registry discovery.
  if (header.test(text)) return true;
  const supplied = inline.exec(text);
  return Boolean(supplied && supplied[2].trim() && !mixed.test(text));
}
