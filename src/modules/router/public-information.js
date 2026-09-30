// Public, time-sensitive requests need retrieval, not an internal policy menu.
// This is a capability hint only: authority, privacy and explicit Skills still win.
export function needsPublicWebSearch(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 2000) return false;
  if (/ไม่(?:ต้อง|ให้|ใช้)\s*(?:ค้น|หา|search)|ไม่ค้นเว็บ|offline|do not search|don't search|no web search/i.test(text)) return false;
  if (/แปล|translate|เขียนโค้ด|แก้โค้ด|implement|routing|router|fixture|unit test|ออกแบบ|สร้างรูป|สร้างภาพ|ร่างประกาศ|ร่างหนังสือ|อนุมัติ|ลงนาม|ส่งประกาศ|เผยแพร่|โอนเงิน|สั่งซื้อ/i.test(text)) return false;
  if (/ภายใน|ของเรา|บริษัท|องค์กร|พนักงาน|วันลา|สวัสดิการ|เงินเดือน|ใบเสร็จ|สัญญา|เอกสารนี้|ไฟล์นี้|ไฟล์แนบ|ข้อมูลแนบ|อุทยาน|สเต็ป|\b(?:step|cmu|afp|hd|cc|iso|qms)\b|มช\.?|password|token|api[_ -]?key/i.test(text)) return false;
  return /วันหยุดราชการ|วันหยุดนักขัตฤกษ์|government holidays|public holidays|พยากรณ์อากาศ|สภาพอากาศ|อัตราแลกเปลี่ยน|ราคาทอง|ข่าวล่าสุด|weather forecast|exchange rate|latest news/i.test(text)
    || /ค้น(?:หา)?(?:ใน)?(?:เว็บ|เวบ|อินเทอร์เน็ต)|ค้นข้อมูลข้างนอก|web search|search (?:the )?(?:web|internet)|หาข้อมูลจากเว็บ/i.test(text)
    || (/(?:ล่าสุด|วันนี้|ตอนนี้|ปัจจุบัน|latest|current)/i.test(text) && /ข่าว|ราคา|อากาศ|เวอร์ชัน|version|ประกาศรัฐบาล|กฎหมาย|ตารางบิน|เที่ยวบิน/i.test(text));
}
