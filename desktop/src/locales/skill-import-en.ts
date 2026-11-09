// English text for "เพิ่ม Skill ของฉัน" (src/packs.tsx, the packInstall dialog in electron/main.ts and pack errors).
export const skillImportEn: Record<string, string> = {
  'ผ่านการตรวจความปลอดภัย พร้อมใช้': 'Passed the safety checks. Ready to use',
  'พร้อมใช้ มีคำแนะนำ {0} ข้อ': 'Ready to use, with {0} suggestions',
  'ต้องแก้ {0} ข้อก่อนใช้': 'Fix {0} items before use',
  'ตัดบรรทัด {0} ออกจากหัวไฟล์ เพราะ Skill ของพนักงานกำหนดสิทธิ์เครื่องมือเองไม่ได้':
    'Removed {0} from the file header: staff Skills cannot grant tool permissions',
  'ตั้งชื่อ Skill เป็น {0} ให้อัตโนมัติ': 'Named the Skill {0} automatically',
  'มี Skill ชื่อเดียวกันอยู่แล้ว จึงตั้งชื่อเป็น {0}': 'A Skill with that name already exists, so this one is named {0}',
  'ใช้บรรทัดแรกของไฟล์เป็นคำอธิบาย Skill': "Used the file's first line as the Skill description",
  'เพิ่ม Skill ของฉัน': 'Add my Skill',
  'Skill คือคู่มือที่บอก AI ว่างานหนึ่งทำอย่างไร เลือกไฟล์ Skill (.md) จากเครื่อง ระบบตรวจความปลอดภัยให้ แล้วใช้เองบนเครื่องนี้ได้ทันที':
    'A Skill is a guide that tells the AI how to do a piece of work. Choose a Skill file (.md); it is checked for safety, then you can use it on this computer right away.',
  'เลือกไฟล์ Skill (.md)': 'Choose a Skill file (.md)',
  เลือกทั้งโฟลเดอร์: 'Choose a whole folder',
  'เลือกโฟลเดอร์ Skill': 'Choose a Skill folder',
  'นำเข้า {0} แล้ว': 'Imported {0}',
  'ชุดที่มีคำสั่งอัตโนมัติ ผู้ช่วยสำเร็จรูป หรือจะแชร์ให้ทั้งทีม ต้องให้ผู้ดูแลรับรองก่อน รับไฟล์ pack.json โฟลเดอร์ที่มี SKILL.md และ .claude/skills คำสั่งอัตโนมัติคือ Hooks ผู้ช่วยสำเร็จรูปคือ Agent templates ทั้งสองเปิดได้เฉพาะชุดที่มี digest อยู่ในรายการรับรองของ managed policy':
    'Packs with hooks or agent templates, or shared with a team, need admin approval first. Accepts pack.json, folders with SKILL.md and .claude/skills. Hooks and agent templates turn on only for packs whose digest is in the managed policy approval list.',
  'ชื่อชุด (เฉพาะโฟลเดอร์ที่มีหลาย Skill และไม่มี pack.json)': 'Pack name (only for a folder with several Skills and no pack.json)',
  'ยังไม่มี Skill ของคุณบนเครื่องนี้': 'No Skills of yours on this computer yet',
  ยังไม่ได้ใช้: 'Not in use',
  'ใช้ผู้ช่วย: {0}': 'Use assistant: {0}',
  'ใช้ Skill: {0}': 'Use Skill: {0}',
  เพิ่มเติม: 'More',
  'โฟลเดอร์นี้มีหลาย Skill ใส่ชื่อชุดใน "สำหรับผู้ดูแล" ด้วยอักษรอังกฤษตัวเล็กและขีดกลาง':
    'This folder has several Skills. Enter a pack name under "For admins" in lowercase English letters and hyphens',
  'นำเข้า Skill นี้ไว้แล้ว ดูได้ในรายการด้านล่าง': 'This Skill is already imported. See the list below',
  'ไม่พบเนื้อหา Skill ในไฟล์นี้ เขียนวิธีทำงานอย่างน้อยหนึ่งบรรทัดแล้วลองใหม่':
    'No Skill content found in this file. Write at least one line about how the work is done, then try again',
  'เลือกไฟล์ข้อความ Skill (.md หรือ .txt) ไฟล์ Word หรือ PDF ยังนำเข้าเป็น Skill ไม่ได้':
    'Choose a Skill text file (.md or .txt). Word and PDF files cannot be imported as Skills yet',
  'ไฟล์ Skill ใหญ่หรือมีไฟล์ย่อยมากเกินกำหนด ลองเลือกเฉพาะไฟล์ Skill':
    'The Skill is too large or has too many files. Try choosing only the Skill file',
};
