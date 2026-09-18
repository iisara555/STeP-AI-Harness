import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { header, success, info } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';


export const FEEDBACK_TEMPLATE = `# แจ้งปัญหา / AI ตอบไม่ถูก (STeP AI Feedback)

### 1. ข้อมูลผู้แจ้ง
- **ชื่อเล่น / ทีม:** [ระบุชื่อเล่น หรือ รหัสทีม เช่น แนท ฝ่ายสื่อสารองค์กร (CC)]
- **โปรแกรม AI ที่ใช้:** [เช่น Cursor, Claude, OpenCode, VS Code, ChatGPT]
- **วันที่:** ${new Date().toLocaleDateString('th-TH')}
- **Run ID (ถ้ามี):** [คัดลอกจาก AI ได้ ไม่ต้องหาเอง]
- **ความเห็นต่อผลลัพธ์:** [ใช้ได้ / ต้องแก้ / ใช้ไม่ได้]

---

### 2. รายละเอียด
- **คำถามที่คุณพิมพ์ถาม AI:**
  > ตัวอย่างคำถามภาษาไทยที่คุณพิมพ์คุยกับ AI

- **สิ่งที่ AI ตอบผิด:**
  > สรุปคำตอบที่ AI ให้ หรือส่วนที่ผิด / อ้างอิงระเบียบเก่า

- **สิ่งที่ถูกต้องที่ควรจะเป็น:**
  > สิ่งที่ควรตอบ เช่น เลขระเบียบ มช. ฉบับปี 2567 หรือแนวปฏิบัติที่ถูกต้องของทีม

---

### 3. เอกสารอ้างอิง (ถ้ามี)
- ระเบียบ มหาวิทยาลัยเชียงใหม่ / ประกาศอุทยานฯ ที่เกี่ยวข้อง:
- ลิงก์หรือไฟล์แนบ (ห้ามมีข้อมูลลับ รหัสผ่าน หรือข้อมูลส่วนบุคคลตาม PDPA)
`;

export const TASK_REQUEST_TEMPLATE = `# อยากให้ STeP AI ช่วยงานอะไรเพิ่ม?

### 1. ข้อมูลผู้เสนอ
- **ชื่อเล่น / ทีม:** [ระบุชื่อเล่น หรือ รหัสทีม เช่น บอย ฝ่ายบริหารงานคลังและพัสดุ (AFP)]
- **วันที่:** ${new Date().toLocaleDateString('th-TH')}

---

### 2. รายละเอียดงาน
- **งานที่อยากให้ AI ช่วยคืออะไร:**
  > อธิบายงานที่ต้องการ เช่น ช่วยร่างบันทึกข้อความขออนุมัติจัดซื้อตามแบบฟอร์มใหม่ของ มช.

- **ปกติงานนี้มีขั้นตอนอย่างไร:**
  > 1. ตรวจสอบคุณสมบัติและใบเสนอราคา
  > 2. สรุปรายละเอียดลงในตารางเปรียบเทียบ
  > 3. จัดทำร่างบันทึกข้อความเสนอหัวหน้าฝ่าย

- **มีตัวอย่างเอกสารหรือข้อความอ้างอิงไหม:**
  > วางข้อความตัวอย่างที่นี่ หรือระบุชื่อไฟล์แบบฟอร์มที่แนบมา (ไม่มีข้อมูลลับตาม PDPA)
`;

export async function runFeedback(args) {
  header('STeP AI Feedback & Task Requests');

  const destDir = args.dest || args.d || process.cwd();

  if (args.open) {
    info('พนักงานทั่วไปไม่ต้องใช้ GitHub');
    console.log('  พิมพ์ในแชทว่า "เมื่อกี้ตอบไม่ถูก ช่วยแจ้งทีม STeP AI ให้หน่อย"');
    console.log('  หรือดับเบิลคลิก Feedback-STeP-AI แล้วส่งไฟล์ให้ AI Champion / ห้องแชทองค์กร\n');
    return;
  }

  // 1. Employee: AI ตอบไม่ถูก / แจ้งปัญหา
  if (args.issue || args.template || args.t) {
    const filePath = join(destDir, 'FEEDBACK.md');
    await writeFile(filePath, FEEDBACK_TEMPLATE, 'utf-8');
    success(`สร้างแบบฟอร์มเรียบร้อยแล้ว: ${colors.bold('FEEDBACK.md')}`);
    console.log(`  เปิดไฟล์ ${colors.cyan('FEEDBACK.md')} กรอกข้อมูล แล้วส่งให้ AI Champion หรือส่งในห้องแชทองค์กรได้ทันที\n`);
    return;
  }

  // 2. Employee: อยากให้ AI ช่วยงานเพิ่ม
  if (args.request || args.propose || args.p) {
    const filePath = join(destDir, 'REQUEST_NEW_TASK.md');
    await writeFile(filePath, TASK_REQUEST_TEMPLATE, 'utf-8');
    // Also write alias SKILL_PROPOSAL_TEMPLATE.md if specifically requested by test or legacy callers
    if (args.propose || args.p) {
      const legacyPath = join(destDir, 'SKILL_PROPOSAL_TEMPLATE.md');
      await writeFile(legacyPath, TASK_REQUEST_TEMPLATE, 'utf-8');
    }
    success(`สร้างแบบฟอร์มเรียบร้อยแล้ว: ${colors.bold('REQUEST_NEW_TASK.md')}`);
    console.log(`  เปิดไฟล์ ${colors.cyan('REQUEST_NEW_TASK.md')} กรอกข้อมูล แล้วส่งให้หัวหน้าฝ่ายหรือ AI Champion ได้ทันที\n`);
    return;
  }

  // Admin / Champion Mode
  if (args.admin || args.champion) {
    console.log(`${colors.yellow(colors.bold('=== CHAMPION & ADMIN MODE ==='))}\n`);
    console.log(`ศูนย์ควบคุมการจัดการ Approved Skills และ Governance สำหรับทีมผู้ดูแล:\n`);
    console.log(`  • โฟลเดอร์ทักษะ:         ${colors.cyan('skills/')} (จัดกลุ่มตาม 22 ทีมและส่วนกลาง)`);
    console.log(`  • ผังองค์กรและทีม:       ${colors.cyan('manifest/teams.yaml')}`);
    console.log(`  • เกณฑ์ความปลอดภัย:      ${colors.cyan('docs/knowledge-policy.md')}`);
    console.log(`  • อำนาจการตัดสินใจ:      ${colors.cyan('docs/roles-and-ownership.md')}`);
    console.log(`  • รอบการดูแล (Cycles):    ${colors.cyan('docs/pilot-operations.md')}\n`);
    console.log(colors.bold('คำสั่งสำหรับผู้ดูแล:'));
    console.log(`  ${colors.green('step-ai doctor')}             ตรวจความพร้อมของระบบและเครื่องมือ AI`);
    console.log(`  ${colors.green('step-ai status')}             ตรวจเช็กความสมบูรณ์ของไฟล์เทียบกับ Manifest`);
    console.log(`  ${colors.green('step-ai sync')}               ซิงก์ไฟล์และกู้คืนไฟล์มาตรฐาน`);
    console.log(`  ${colors.green('npm test')}                   รันชุดทดสอบความถูกต้องทั้งหมด 70+ เคส\n`);
    return;
  }

  // Default Employee View: Zero technical jargon, 2 simple choices
  console.log(`ระบบรับฟังข้อเสนอแนะและรับคำของานใหม่ ${colors.bold('STeP AI (Employee Mode)')}\n`);

  console.log(colors.bold('💬 วิธีที่ 1: คุยกับ AI ตามปกติในแชท (ง่ายและสะดวกที่สุด)'));
  console.log(`   • ${colors.cyan('เมื่อ AI ตอบไม่ถูก:')} พิมพ์บอกว่า ${colors.yellow('"เมื่อกี้ตอบไม่ถูก ช่วยแจ้งทีม STeP AI ให้หน่อย"')}`);
  console.log(`     AI จะสรุปข้อผิดพลาด และถามยืนยันเพื่อเตรียมส่งให้ทันที`);
  console.log(`   • ${colors.cyan('อยากให้ช่วยงานเพิ่ม:')} พิมพ์บอกว่า ${colors.yellow('"อยากให้ STeP AI ช่วยงานนี้..."')}`);
  console.log(`     AI จะสอบถามขั้นตอนและบันทึกความต้องการให้อัตโนมัติ\n`);

  console.log(colors.bold('🖱️  วิธีที่ 2: ดับเบิลคลิกไฟล์ Feedback-STeP-AI'));
  console.log(`   เปิดไฟล์ ${colors.green('Feedback-STeP-AI.bat')} (Windows) หรือ ${colors.green('Feedback-STeP-AI.command')} (Mac)`);
  console.log(`   แล้วเลือกกดเพียง 2 ตัวเลือก:`);
  console.log(`     ${colors.cyan('[1]')} AI ตอบไม่ถูก / อยากแจ้งปัญหา   ${colors.dim('(เปิดไฟล์ FEEDBACK.md ใน Notepad ทันที)')}`);
  console.log(`     ${colors.cyan('[2]')} อยากให้ AI ช่วยงานเพิ่ม        ${colors.dim('(เปิดไฟล์ REQUEST_NEW_TASK.md ใน Notepad ทันที)')}`);
  console.log(`     ${colors.dim('[0] ปิดโปรแกรม')}\n`);

  console.log(colors.bold('ตัวเลือกคำสั่ง:'));
  console.log(`  ${colors.green('step-ai feedback --issue')}     สร้างแบบฟอร์มแจ้งปัญหา (FEEDBACK.md)`);
  console.log(`  ${colors.green('step-ai feedback --request')}   สร้างแบบฟอร์มของานเพิ่ม (REQUEST_NEW_TASK.md)`);
  console.log(`  ${colors.green('step-ai feedback --admin')}     เข้าสู่โหมดผู้ดูแลระบบ (Champion / Admin Mode)\n`);
}
