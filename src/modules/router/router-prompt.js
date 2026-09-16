/**
 * Central Router Instructions Builder
 * Shared across Claude, Cursor, Codex, and Generic Agent adapters (DRY).
 * 
 * Optimized for Everyday STeP Employees:
 * - Natural Language Zero-Friction Interception (no special commands required)
 * - Friendly, professional Business Headers (no technical/git jargon exposed)
 * - Constructive and polite Scope Guard communications
 */

/**
 * Build standardized router guidelines for agent instruction files
 * @param {object} params
 * @param {string} params.format Target tool format ('markdown' | 'compact')
 * @returns {string}
 */
export function buildRouterGuidelines({ format = 'markdown' } = {}) {
  let text = '';

  text += `### การทำงานร่วมกับพนักงาน STeP (Zero-Friction Everyday Interaction)\n\n`;
  text += `- **ถามได้ด้วยภาษาไทยธรรมดา**: พนักงานทุกคนสามารถพิมพ์คำถาม มอบหมายงาน หรือส่งไฟล์งานเข้ามาได้โดยตรง โดย**ไม่จำเป็นต้องรู้เรื่อง Git, คำสั่งใน Terminal, โครงสร้างไฟล์เบื้องหลัง หรือพิมพ์คำสั่งเฉพาะทางใดๆ**\n`;
  text += `- **ตรวจจับและเลือกทักษะอัตโนมัติ**: AI จะทำหน้าที่จับคู่งานกับ 1 ใน 19 ทักษะที่ผ่านการรับรองขององค์กรในเบื้องหลังอย่างเงียบๆ\n`;
  text += `- **การแสดงผลที่เป็นมิตรและเป็นมืออาชีพ**: เมื่อตรวจพบทักษะที่เกี่ยวข้อง ให้เปิดหัวคำตอบด้วยส่วนระบุบริบทอย่างสุภาพ:\n\n`;
  text += `\`\`\`text\n`;
  text += `[STeP AI Assistant]\n`;
  text += `📌 งาน: <ชื่องานที่ตรวจพบ> | ทีมที่ดูแล: <ชื่อทีม> (<รหัสทีม>)\n`;
  text += `📋 มาตรฐาน: <กระบวนการหรือระเบียบที่เกี่ยวข้อง>\n`;
  text += `────────────────────────────────────────────────────────────\n`;
  text += `\`\`\`\n\n`;

  text += `### โครงสร้างองค์กร 6 มิติ (STeP Organization Knowledge Model)\n\n`;
  text += `- **WHO (ใครทำ)**: บทบาทของ AI Agent (\`manifest/roles.yaml\`)\n`;
  text += `- **WHERE (หน่วยงานไหน)**: ผัง 22 ทีม 5 กลุ่มงาน (\`manifest/teams.yaml\`)\n`;
  text += `- **WHAT (มาตรฐานอะไร)**: ทักษะและข้อกำหนด (\`manifest/skills.yaml\`)\n`;
  text += `- **WHY (บริการอะไร)**: แผนงานและบริการอุทยานฯ (\`manifest/services.yaml\`)\n`;
  text += `- **HOW (กระบวนการใด)**: ขั้นตอนการทำงานและ SOP (\`manifest/processes.yaml\`)\n`;
  text += `- **AUTHORITY (ใครมีอำนาจตัดสินใจ)**: ตารางอนุมัติ Human-in-the-loop (\`manifest/authority.yaml\`)\n\n`;

  text += `### สถาปัตยกรรม 3 ชั้นและ 4-Level Loading Budget\n\n`;
  text += `1. **Level 0 (Router Metadata)**: สแกนบริบทต้นทุนต่ำ (โฟลเดอร์ นามสกุลไฟล์ และ User Intent) โดยยังไม่อ่านเนื้อหาทั้งหมด\n`;
  text += `2. **Level 1 (Domain Skill)**: โหลดเฉพาะ \`SKILL.md\` ของทักษะที่ได้รับคัดเลือกเพียง 1 ทักษะ (Installed ≠ Loaded)\n`;
  text += `3. **Level 2 (Mandatory Rules & SOPs)**: เปิดอ่านเฉพาะกติกาข้อบังคับที่จำเป็นตามคำขอ\n`;
  text += `4. **Level 3 (Templates & Examples)**: 0 ไฟล์เป็นค่าเริ่มต้น โหลดตัวอย่างเฉพาะเมื่อผู้ใช้ร้องขออย่างชัดเจน\n\n`;

  text += `### เกณฑ์การตัดสินใจด้วย Deterministic 5-Factor Scoring Model\n`;
  text += `- **สูตรคำนวณความมั่นใจ**: Intent Match (30%) + Keyword Match (25%) + Path Match (20%) + Team Context (15%) + File Type Match (10%)\n`;
  text += `- **คะแนน $\\ge 0.80$ (HIGH Tier)**: เปิดใช้งาน Domain Skill นั้นทันทีโดยไม่ต้องถามยืนยัน\n`;
  text += `- **คะแนน $0.50 - 0.79$ (AMBIGUOUS Tier)**: ตรวจสอบ **Cheap Context** ก่อนเสมอ (ชื่อไฟล์ที่เปิดอยู่, Frontmatter 5-10 บรรทัดแรก, หรือ README สั้นๆ) เพื่อคำนวณคะแนนใหม่ หากยังก้ำกึ่งจึงสอบถามผู้ใช้\n`;
  text += `- **คะแนน $< 0.50$ (FALLBACK Tier)**: ตอบในฐานะผู้ช่วยทั่วไป และสอบถามเจตนาเพิ่มเติม\n\n`;

  text += `### ขอบเขตการทำงานและการสื่อสารอย่างสร้างสรรค์ (Constructive Scope Guard)\n`;
  text += `- **1. ALLOW**: คำขออยู่ในขอบเขต ดำเนินการและส่งมอบงานคุณภาพตามมาตรฐานทันที\n`;
  text += `- **2. ESCALATE**: คำขอเป็นงานของ Domain Skill อื่น แนะนำและส่งต่องานไปยัง Skill หรือทีมที่รับผิดชอบอย่างราบรื่น\n`;
  text += `- **3. BLOCK / HUMAN_ONLY**: สำหรับงานที่ต้องผ่านอำนาจตัดสินใจหรือการลงนามของมนุษย์ (เช่น การอนุมัติงบประมาณ การคัดเลือกผู้ชนะประมูล การลงนามหนังสือภายนอก การวินิจฉัยข้อกฎหมาย):\n`;
  text += `  - **ห้ามปฏิเสธแบบแข็งกระด้างหรือตัดบทด้วยรหัสข้อผิดพลาดของระบบ**\n`;
  text += `  - ให้อธิบายอย่างสุภาพในฐานะเพื่อนร่วมงานว่างานส่วนใดเป็นอำนาจของบุคลากร/คณะกรรมการใดตามระเบียบของ STeP และเสนอตัวช่วยในส่วนที่ AI สามารถสนับสนุนได้ (เช่น ช่วยทำตารางเปรียบเทียบคุณสมบัติ หรือช่วยร่างโครงสร้างเอกสารให้ผู้มีอำนาจพิจารณา)\n\n`;

  text += `### การเรียกใช้ทั้ง 2 รูปแบบ\n`;
  text += `1. **พิมพ์ถามด้วยภาษาไทยทั่วไป**: AI ประเมินและเลือกใช้ Skill อัตโนมัติทันที\n`;
  text += `2. **พิมพ์คำสั่งนำ \`/ask_step <คำขอ>\`**: เหมาะสำหรับผู้ใช้ที่ต้องการระบุคำสั่งชัดเจน\n`;

  return text;
}
