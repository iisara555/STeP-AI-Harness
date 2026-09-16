import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exec } from 'node:child_process';
import { header, success, info } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';
import { loadUserConfig } from '../../utils/user-config.js';

const GITHUB_ISSUES_URL = 'https://github.com/iisara555/STeP-AI-Harness/issues/new';

function openUrlInBrowser(url) {
  const startCmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;

  exec(startCmd, () => {});
}

const FEEDBACK_TEMPLATE = `# แบบฟอร์มส่งข้อเสนอแนะ / แจ้งผลลัพธ์ AI (STeP AI Feedback)

### 1. ข้อมูลผู้แจ้ง
- **ชื่อ / ทีม:** [ระบุชื่อเล่น หรือ รหัสทีม เช่น CC, QS, AFP, PITI]
- **เครื่องมือ AI ที่ใช้:** [เช่น Cursor, Claude, OpenCode, VS Code, ChatGPT]
- **วันที่พบประเด็น:** ${new Date().toLocaleDateString('th-TH')}

---

### 2. รายละเอียดกรณีศึกษา
- **คำถามที่คุณพิมพ์ถาม AI (Prompt):**
  > ตัวอย่างคำถามภาษาไทยที่คุณพิมพ์คุยกับ AI

- **สิ่งที่ AI ตอบกลับมา (Actual Response):**
  > สรุปคำตอบที่ AI ให้ หรือส่วนที่ตอบผิด / อ้างอิงระเบียบเก่า

- **คำตอบที่ถูกต้อง หรือสิ่งที่ควรจะเป็น (Expected / Suggestion):**
  > สิ่งที่ควรตอบ เช่น เลขระเบียบพัสดุปี 2567, รูปแบบบันทึกข้อความ มช. ฉบับล่าสุด หรือแนวปฏิบัติของทีม

---

### 3. เอกสารอ้างอิง (ถ้ามี)
- ระเบียบ มหาวิทยาลัยเชียงใหม่ / ประกาศอุทยานฯ ที่เกี่ยวข้อง:
- ลิงก์หรือไฟล์ตัวอย่าง SOP (ต้องไม่มีข้อมูลลับ ข้อมูลบุคคล หรืองบประมาณลับตาม PDPA)
`;

const SKILL_PROPOSAL_TEMPLATE = `---
name: [ชื่อทักษะภาษาอังกฤษ เช่น cmu-scholarship-announcement]
description: [คำอธิบายภาษาไทย สั้น กระชับ ระบุขอบเขต วัตถุประสงค์ และคำค้นหาหลัก สำหรับให้ Router จับคู่]
---

# ทักษะ: [ชื่อทักษะภาษาไทย]

## 1. บริบทและวัตถุประสงค์ (Context)
- ใช้สำหรับงาน [ระบุประเภทงาน เช่น ร่างประกาศรับสมัครทุนนวัตกรรม]
- หน่วยงานที่รับผิดชอบหลัก: [เช่น ฝ่ายพัฒนาธุรกิจนวัตกรรม (BD) หรือ อุทยานฯ]

## 2. ขั้นตอนและแนวปฏิบัติ (Guidelines & Rules)
1. ตรวจสอบเงื่อนไขผู้ขอรับทุน คุณสมบัติ และเอกสารประกอบ
2. ใช้โครงสร้างประกาศมาตรฐานตามระเบียบมหาวิทยาลัยเชียงใหม่
3. ระบุกำหนดการและขั้นตอนการส่งข้อเสนอโครงการให้ชัดเจน

## 3. ตัวอย่างการถาม-ตอบจริง (Examples)
- **ตัวอย่างคำถาม:** "ช่วยร่างประกาศรับสมัครโครงการประกวดนวัตกรรม Startup ประจำปี"
- **สิ่งที่ควรได้:** โครงร่างประกาศทางการ 4 ส่วน พร้อมตารางกำหนดการ

## 4. ขอบเขตอำนาจมนุษย์ (Scope Guard & Human Authority)
- [ALLOW] ช่วยร่างเนื้อหา จัดหมวดหมู่ และตรวจความสอดคล้องของหัวข้อ
- [HUMAN ONLY] การอนุมัติเปิดรับสมัคร และการลงนามในประกาศ เป็นอำนาจของผู้อำนวยการอุทยานฯ เท่านั้น

## 5. การตรวจสอบความปลอดภัย (PDPA & Security Checklist)
- [x] ไม่มีข้อมูลระบุตัวบุคคล (PII) เช่น เลขบัตรประชาชน หรือเบอร์โทรส่วนตัว
- [x] ไม่มีข้อมูลทางการเงิน งบประมาณลับ หรือความลับทางการค้า
`;

export async function runFeedback(args) {
  header('STeP AI Feedback & Skill Contribution');

  const config = await loadUserConfig();
  const destDir = args.dest || args.d || process.cwd();

  if (args.open) {
    info(`กำลังเปิดหน้าเว็บส่งข้อเสนอแนะผ่านเบราว์เซอร์: ${GITHUB_ISSUES_URL}`);
    openUrlInBrowser(GITHUB_ISSUES_URL);
    return;
  }

  if (args.template || args.t) {
    const filePath = join(destDir, 'FEEDBACK.md');
    await writeFile(filePath, FEEDBACK_TEMPLATE, 'utf-8');
    success(`สร้างแบบฟอร์มส่งข้อเสนอแนะเรียบร้อยแล้ว: ${colors.bold('FEEDBACK.md')}`);
    console.log(`  ท่านสามารถเปิดไฟล์ ${colors.cyan('FEEDBACK.md')} กรอกข้อมูล แล้วส่งให้ทีมงานได้ทันที\n`);
    return;
  }

  if (args.propose || args.p) {
    const filePath = join(destDir, 'SKILL_PROPOSAL_TEMPLATE.md');
    await writeFile(filePath, SKILL_PROPOSAL_TEMPLATE, 'utf-8');
    success(`สร้างเทมเพลตเสนอ Skill ใหม่เรียบร้อยแล้ว: ${colors.bold('SKILL_PROPOSAL_TEMPLATE.md')}`);
    console.log(`  ท่านสามารถแก้ไขและส่งไฟล์นี้ให้ Domain Lead หรือ AI Working Group ตรวจสอบได้ทันที\n`);
    return;
  }

  // Default display
  console.log(`ระบบรับฟังความคิดเห็นและร่วมพัฒนา Approved Skills ของ ${colors.bold('STeP AI (Pilot v0.2)')}\n`);

  console.log(colors.bold('📌 เมื่อพนักงานใช้งานแล้วพบประเด็น สามารถทำได้ 3 ระดับ:'));
  console.log(`
${colors.cyan('1. ปรับปรุงใช้งานเฉพาะตัวในเครื่อง (Local Customization):')}
   • แก้ไขหรือเพิ่มไฟล์ ${colors.bold('SKILL.md')} ในโฟลเดอร์ ${colors.dim('skills/')} ได้ทันที
   • โปรแกรม AI (Cursor, Claude, OpenCode ฯลฯ) จะโหลดเนื้อหาใหม่ไปใช้ในคำถามถัดไป
   • เมื่อกด ${colors.yellow('Update-STeP-AI.bat')} ระบบจะไม่เขียนทับไฟล์ที่ท่านแก้ไขเอง (Safe Sync)

${colors.cyan('2. แจ้ง Feedback หรือรายงานคำตอบที่ไม่ตรงระเบียบ (Feedback Loop):')}
   • สรุป 3 ข้อง่ายๆ: ${colors.yellow('Prompt ที่ถาม')} + ${colors.yellow('คำตอบของ AI')} + ${colors.yellow('สิ่งที่ถูกต้องที่ควรจะเป็น')}
   • พิมพ์ ${colors.green('step-ai feedback --template')} เพื่อสร้างไฟล์แบบฟอร์ม ${colors.bold('FEEDBACK.md')}
   • ส่งให้ ${colors.bold('AI Champion')} ประจำทีม หรือส่งในกลุ่มสื่อสารภายใน (Line / Teams)
   • หรือเปิดรายงานผ่าน GitHub: พิมพ์ ${colors.green('step-ai feedback --open')}

${colors.cyan('3. เสนอทักษะใหม่ (Skill Contribution) เพื่อให้ 22 ทีมได้ใช้งานร่วมกัน:')}
   • พิมพ์ ${colors.green('step-ai feedback --propose')} เพื่อสร้างไฟล์ ${colors.bold('SKILL_PROPOSAL_TEMPLATE.md')}
   • ร่างเนื้อหาตามเกณฑ์: มีระเบียบอ้างอิง, ขอบเขตอำนาจมนุษย์ (Scope Guard), และปราศจากข้อมูลลับ (PDPA)
   • ส่งให้ ${colors.bold('Domain Lead')} (ฝ่ายที่เกี่ยวข้อง เช่น CC, PM, AFP, Dev) ตรวจสอบความถูกต้อง
   • เมื่อทีมส่วนกลาง Merge เข้าสู่ระบบ พนักงานทุกคนทั่วอุทยานฯ เพียงกด ${colors.yellow('Update-STeP-AI.bat')}
     ก็จะได้รับ Skill ใหม่นี้พร้อมกันทันทีในคลิกเดียว!
`);

  console.log(colors.bold('ตัวเลือกคำสั่งเพิ่มเติม:'));
  console.log(`  ${colors.green('step-ai feedback --template')}   สร้างไฟล์แบบฟอร์ม FEEDBACK.md ในโฟลเดอร์ปัจจุบัน`);
  console.log(`  ${colors.green('step-ai feedback --propose')}    สร้างโครงร่างแบบฟอร์มเสนอ Skill ใหม่`);
  console.log(`  ${colors.green('step-ai feedback --open')}       เปิดหน้า GitHub Issues บนเว็บเบราว์เซอร์\n`);
}
