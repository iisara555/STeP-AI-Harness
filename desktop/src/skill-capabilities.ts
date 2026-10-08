// Where each capability stands: governed in the registry, reachable through the router, or a standalone tool.
export const statusTag: Record<string, { label: string; tone: string; hint: string }> = {
  routed: {
    label: 'เรียกใช้ได้',
    tone: 'routed',
    hint: 'ให้ AI เลือกตามคำขอ หรือเรียกตรงด้วย /ชื่อ',
  },
  registered: {
    label: 'ยังเรียกใช้ไม่ได้',
    tone: 'registered',
    hint: 'อยู่ในรายการ Skill แต่ยังไม่เชื่อมให้ใช้ในแชต',
  },
  unregistered: { label: 'ยังไม่พร้อม', tone: 'unregistered', hint: 'มีไฟล์ Skill แต่ยังไม่ได้ลงทะเบียนใช้งาน' },
  'missing-file': { label: 'ไฟล์ไม่พร้อม', tone: 'unregistered', hint: 'ระบบพบรายการ Skill แต่หาไฟล์ที่ต้องใช้ไม่ได้' },
  tool: { label: 'เครื่องมือเฉพาะงาน', tone: 'tool', hint: 'เปิดจากเมนูเครื่องมือและตรวจผลก่อนใช้' },
};
export const tools = [
  {
    id: 'documents',
    title: 'เครื่องมือร่างเอกสาร',
    description:
      'ร่าง TOR บันทึกข้อความ หนังสือราชการ โครงการ และรายงานประชุมด้วย Skill ที่เกี่ยวข้อง กรอกข้อมูลหรือแนบต้นเรื่อง แล้วแก้ไขและส่งออก',
    owner: 'common',
    stage: 'ทดลอง',
  },
  {
    id: 'receipt',
    title: 'ตรวจใบเสร็จก่อนส่ง AFP',
    description: 'อ่านใบเสร็จ เติมข้อมูลให้ตรวจครั้งเดียว แล้วเตรียมตรวจตามกฎ AFP',
    owner: 'afp',
    stage: 'ทดลอง',
  },
];
export const toolCount = tools.length;
export const filters = [
  ['all', 'ทั้งหมด'],
  ['routed', 'เรียกใช้ได้'],
  ['registered', 'ยังเรียกใช้ไม่ได้'],
  ['unregistered', 'ยังไม่พร้อม'],
  ['tool', 'เครื่องมือ'],
] as const;
