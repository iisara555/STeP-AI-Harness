import { parseThaiDate, formatThaiDate } from './thai-date';
import { stepOrganizationReference } from './organization-profile';
import { invitationSummary, invitationUrl, resolveInvitation, type InvitationRecipient } from './invitation';

/** Fixed document profiles: the host selects actual Skills and working templates from this allowlist. */
export type DocumentToolId = 'tor' | 'memo' | 'letter' | 'project' | 'minutes' | 'other';
export type DocumentAttachmentRole = 'source' | 'template';
export type DocumentField = {
  key: string;
  label: string;
  hint?: string;
  multiline?: boolean;
  invitationOnly?: boolean;
  missingAction?: 'draft-proposal' | 'omit';
};
export type DocumentTool = {
  id: DocumentToolId;
  title: string;
  description: string;
  skill: string;
  supportSkills: string[];
  template: string;
  references: string[];
  variants: { id: string; label: string }[];
  fields: DocumentField[];
};
const field = (key: string, label: string, multiline = false, hint?: string): DocumentField => ({ key, label, multiline, hint });
const draftable = (key: string, label: string, multiline = false, hint?: string): DocumentField => ({
  ...field(key, label, multiline, hint),
  missingAction: 'draft-proposal',
});
const common = [field('title', 'ชื่อเอกสาร / ชื่อโครงการ'), field('unit', 'หน่วยงานเจ้าของเรื่อง'), field('owner', 'ผู้รับผิดชอบ')];
const dateGuide = 'docs/thai-data-formatting.md';
const draftingChecks = 'skills/common/thai-official-documents/references/drafting-checks.md';
const thaiLayout = 'skills/common/thai-official-documents/references/thai-layout.md';
const sarabanGuide = 'skills/common/thai-official-documents/references/saraban-writing-guide.md';
const official = [
  field('number', 'เลขหนังสือ'),
  field('date', 'วันที่', false, 'ระบุปีเต็ม'),
  field('recipient', 'เรียน / ผู้รับ'),
  field('signer', 'ผู้ลงนามและตำแหน่ง', false, 'ระบุเฉพาะผู้ที่เจ้าของเรื่องเลือกแล้ว'),
  field('references', 'อ้างถึง / สิ่งที่ส่งมาด้วย', true),
];
export const DOCUMENT_TOOLS: DocumentTool[] = [
  {
    id: 'tor',
    title: 'ร่าง TOR',
    description: 'วัตถุประสงค์ ขอบเขตงาน คุณสมบัติ และเกณฑ์ตรวจรับ',
    skill: 'tor-government-writing',
    supportSkills: ['thai-official-documents'],
    template: 'skills/common/thai-official-documents/templates/tor-16-sections-template.md',
    references: [
      dateGuide,
      draftingChecks,
      thaiLayout,
      'skills/pm/tor-government-writing/references/tor-drafting-guide.md',
      'skills/pm/tor-government-writing/references/procurement-source-map.md',
      'skills/pm/tor-government-writing/references/tor-content-by-type.md',
      'skills/pm/tor-government-writing/examples/task-adaptations.md',
    ],
    variants: [
      { id: 'service', label: 'จ้างงาน / บริการ' },
      { id: 'goods', label: 'ซื้อพัสดุ / ครุภัณฑ์' },
      { id: 'construction', label: 'งานก่อสร้าง' },
      { id: 'consulting', label: 'งานจ้างที่ปรึกษา' },
      { id: 'design', label: 'งานจ้างออกแบบ' },
      { id: 'supervision', label: 'งานจ้างควบคุมงาน' },
      { id: 'computer', label: 'ซื้อคอมพิวเตอร์ / ระบบ' },
    ],
    fields: [
      ...common,
      {
        ...field('intendedUse', 'การใช้งานและผลสำเร็จที่ต้องการ', true, 'ระบุว่าใครใช้ ใช้ทำอะไร และต้องส่งมอบอะไรจึงใช้งานได้'),
        missingAction: 'omit',
      },
      {
        ...field('constraints', 'ข้อจำกัด / งานที่ไม่รวม', true, 'ระบุสิ่งที่ต้องใช้ร่วมกัน สิ่งที่หน่วยงานเตรียมให้ และงานที่ไม่ต้องการ'),
        missingAction: 'omit',
      },
      {
        ...field('preferences', 'รูปแบบเอกสารที่ต้องการ', true, 'ระบุแบบหน่วยงาน ลำดับหัวข้อ ความละเอียด หรือรูปแบบตารางที่ต้องการ'),
        missingAction: 'omit',
      },
      draftable('background', 'ความเป็นมา', true),
      draftable('objectives', 'วัตถุประสงค์', true),
      draftable('scope', 'ขอบเขตงาน', true),
      draftable('deliverables', 'ผลส่งมอบ', true),
      field('qualifications', 'คุณสมบัติผู้เสนอราคา', true, 'แนบแหล่งเกณฑ์คุณสมบัติที่ต้องใช้ ถ้ามี'),
      draftable('acceptance', 'เกณฑ์ตรวจรับ', true),
      field('timeline', 'ระยะเวลา / กำหนดส่งมอบ'),
      field('budget', 'งบประมาณที่มีหลักฐาน'),
      field('sources', 'แบบฟอร์ม / ระเบียบ / แหล่งอ้างอิงที่ต้องใช้', true),
    ],
  },
  {
    id: 'memo',
    title: 'ร่างบันทึกข้อความ',
    description: 'ขออนุมัติ ขอความเห็นชอบ หรือรายงานผล',
    skill: 'thai-official-documents',
    supportSkills: [],
    template: 'skills/common/thai-official-documents/templates/memo-draft.md',
    references: [dateGuide, draftingChecks, sarabanGuide, thaiLayout],
    variants: [
      { id: 'approval', label: 'ขออนุมัติ' },
      { id: 'concurrence', label: 'ขอความเห็นชอบ' },
      { id: 'report', label: 'รายงานผล' },
    ],
    fields: [
      field('unit', 'ส่วนราชการ'),
      field('subject', 'เรื่อง'),
      ...official,
      field('reviewer', 'ผู้เสนอความเห็นและตำแหน่ง (ถ้ามี)', true, 'เว้นไว้ถ้าแบบหน่วยงานไม่มีช่องนี้ ไม่ถือว่าให้ความเห็นแล้ว'),
      field('decisionSigner', 'ผู้พิจารณาและตำแหน่ง (ถ้ามี)', true, 'ระบุผู้ที่เจ้าของเรื่องเลือก ช่องคำสั่งและลายมือชื่อเว้นไว้'),
      draftable('background', 'เรื่องเดิม / ความเป็นมา', true),
      field('facts', 'ข้อเท็จจริง / ผลดำเนินการ', true),
      draftable('considerations', 'ข้อพิจารณา / เหตุผลและแหล่งเกณฑ์', true),
      draftable('request', 'ข้อเสนอ / สิ่งที่ต้องการให้พิจารณา', true),
      field('budget', 'งบประมาณที่มีหลักฐาน'),
      field('sources', 'แบบฟอร์ม / ข้อกฎหมายพร้อมแหล่งอ้างอิง', true),
    ],
  },
  {
    id: 'letter',
    title: 'ร่างหนังสือราชการ',
    description: 'หนังสือภายนอก เชิญ ตอบกลับ หรือประสานงาน',
    skill: 'thai-official-documents',
    supportSkills: [],
    template: 'skills/common/thai-official-documents/templates/letter-draft.md',
    references: [dateGuide, draftingChecks, sarabanGuide, thaiLayout],
    variants: [
      { id: 'external', label: 'หนังสือภายนอก' },
      { id: 'invitation', label: 'หนังสือเชิญ' },
      { id: 'reply', label: 'หนังสือตอบกลับ' },
      { id: 'coordination', label: 'หนังสือประสานงาน' },
    ],
    fields: [
      field('unit', 'หน่วยงาน / ที่อยู่ผู้ส่ง'),
      field('subject', 'เรื่อง'),
      ...official,
      draftable('background', 'เหตุที่มีหนังสือ / ต้นเรื่อง', true),
      draftable('content', 'สาระ / สิ่งที่ขอประสาน', true),
      field('schedule', 'วัน เวลา สถานที่ (ถ้ามี)'),
      { ...field('recipientPosition', 'ตำแหน่ง / หน่วยงานผู้รับ'), invitationOnly: true },
      { ...field('rsvpDeadline', 'วันปิดตอบรับ', false, 'ระบุปีเต็ม แยกจากวันจัดงาน'), invitationOnly: true },
      { ...field('rsvpUrl', 'ลิงก์ตอบรับเข้าร่วมงาน'), invitationOnly: true, missingAction: 'omit' },
      { ...field('venueUrl', 'ลิงก์แผนที่สถานที่จัดงาน'), invitationOnly: true, missingAction: 'omit' },
      field('contact', 'ผู้ประสานงาน / ช่องทางติดต่อ'),
      field('sources', 'แบบหน่วยงาน / แหล่งอ้างอิง', true),
    ],
  },
  {
    id: 'project',
    title: 'ร่างโครงการ',
    description: 'หลักการและเหตุผล กิจกรรม งบประมาณ และตัวชี้วัด',
    skill: 'project-plan',
    supportSkills: [],
    template: 'skills/pm/project-plan/templates/project-proposal-template.md',
    references: [dateGuide, thaiLayout, 'skills/pm/project-plan/references/project-writing-guide.md'],
    variants: [
      { id: 'proposal', label: 'ข้อเสนอโครงการเพื่อพิจารณา' },
      { id: 'policy', label: 'โครงการตามนโยบาย / ยุทธศาสตร์' },
      { id: 'problem', label: 'โครงการแก้ไขปัญหา / พัฒนา' },
      { id: 'innovation', label: 'โครงการริเริ่มสร้างสรรค์ / นวัตกรรม' },
      { id: 'logframe', label: 'ข้อเสนอโครงการแบบตารางเหตุผลต่อเนื่อง (Logframe 4×4)' },
    ],
    fields: [
      ...common,
      draftable('rationale', 'หลักการและเหตุผล', true, '3 ย่อหน้า: ที่มา/ปัญหา → แนวทางแก้ไข → จุดมุ่งหมายโครงการ'),
      draftable('objectives', 'วัตถุประสงค์', true, 'ใช้คำกริยาเชิงพฤติกรรมที่วัดผลได้'),
      field('target', 'กลุ่มเป้าหมาย / จำนวนที่มีหลักฐาน', false, 'แยกผู้เข้าร่วม (ภายใน/ภายนอก) และคณะผู้ดำเนินงาน'),
      draftable('activities', 'กิจกรรม / วิธีดำเนินงาน', true, 'แบ่ง 4 ระยะ (PDCA: เตรียมการ → ดำเนินการ → ติดตามประเมินผล → สรุปผล)'),
      field('timeline', 'ระยะเวลา / สถานที่'),
      field('budget', 'งบประมาณ / แหล่งงบที่มีหลักฐาน', true, 'แยกหมวดค่าตอบแทน ค่าใช้สอย ค่าวัสดุ พร้อมสูตรคำนวณที่มีหลักฐาน'),
      draftable(
        'indicators',
        'ตัวชี้วัด / วิธีประเมินผล',
        true,
        'ตัวชี้วัดผลผลิต (Output) และผลลัพธ์ (Outcome) เชิงปริมาณ คุณภาพ เวลา ต้นทุน',
      ),
      draftable('outcomes', 'ผลที่คาดว่าจะได้รับ', true),
      field('sources', 'แบบหน่วยงาน / เงื่อนไขแหล่งทุนพร้อมแหล่งอ้างอิง', true),
    ],
  },
  {
    id: 'minutes',
    title: 'ร่างรายงานการประชุม',
    description: 'จัดวาระ สาระสำคัญ มติ และผู้รับผิดชอบจากบันทึก',
    skill: 'meeting-summary',
    supportSkills: ['thai-official-documents'],
    template: 'skills/common/thai-official-documents/templates/minutes-draft.md',
    references: [dateGuide, draftingChecks, thaiLayout],
    variants: [{ id: 'minutes', label: 'รายงานการประชุม' }],
    fields: [
      field('title', 'ชื่อการประชุม'),
      field('number', 'ครั้งที่'),
      field('date', 'วัน เวลา และสถานที่'),
      field('attendees', 'ผู้มาประชุม / ผู้ไม่มาประชุม / ผู้เข้าร่วม', true),
      field('agendas', 'ระเบียบวาระ', true),
      field('notes', 'บันทึก / สาระสำคัญที่ประชุม', true),
      field('decisions', 'มติที่ตกลงแล้ว', true, 'ข้อเสนอที่ยังไม่ตกลงให้ระบุแยก'),
      field('owners', 'ผู้รับผิดชอบ / กำหนดเวลาที่ตกลงแล้ว', true),
      field('recorder', 'ผู้จด / ผู้ตรวจรายงาน'),
      field('sources', 'แบบหน่วยงาน / แหล่งมติหรือเอกสารอ้างอิง', true),
    ],
  },
  {
    id: 'other',
    title: 'ร่างเอกสารอื่น',
    description: 'ประกาศ คำสั่ง หนังสือรับรอง รายงาน ข้อตกลง หรือระบุแบบที่ต้องการ',
    skill: 'thai-official-documents',
    supportSkills: [],
    template: 'skills/common/thai-official-documents/templates/other-document-draft.md',
    references: [dateGuide, draftingChecks, sarabanGuide, thaiLayout],
    variants: [
      { id: 'report', label: 'รายงาน' },
      { id: 'announcement', label: 'ประกาศ' },
      { id: 'order', label: 'คำสั่งหน่วยงาน' },
      { id: 'certificate', label: 'หนังสือรับรอง' },
      { id: 'agreement', label: 'ข้อตกลง / สัญญาฉบับร่าง' },
      { id: 'custom', label: 'ระบุประเภทเอง' },
    ],
    fields: [
      ...common,
      {
        ...field('kind', 'ประเภทหรือชื่อแบบที่ต้องการ', false, 'กรอกเมื่อเลือก “ระบุประเภทเอง”'),
        missingAction: 'omit',
      },
      field('purpose', 'เอกสารนี้ใช้ทำอะไร / ใครเป็นผู้อ่าน', true),
      ...official,
      field('facts', 'ข้อเท็จจริงที่ยืนยันแล้ว', true, 'ระบุชื่อ วันที่ ตัวเลข และเงื่อนไขจากต้นเรื่อง ไม่ใช้ข้อมูลตัวอย่างแทนข้อมูลจริง'),
      draftable('content', 'สาระที่ต้องการให้ร่าง', true),
      field('requirements', 'หัวข้อ / รูปแบบ / ข้อจำกัดที่ต้องใช้', true),
      field('sources', 'แบบหน่วยงาน / ระเบียบ / แหล่งอ้างอิง', true),
    ],
  },
];
/**
 * Synthetic form-filling examples, shown in each empty field as "เช่น … (เว้นไว้ได้)". UI only: they are never sent to
 * the AI and never stand in for a fact the owner has not given.
 */
const officialExamples: Readonly<Record<string, string>> = {
  number: 'ศธ 0000/0123',
  date: '2 ตุลาคม 2569',
  recipient: 'ผู้อำนวยการสำนักงานตัวอย่าง',
  signer: 'คุณพิม ตัวอย่าง ผู้อำนวยการ',
  references: 'สิ่งที่ส่งมาด้วย กำหนดการ 1 ฉบับ',
};
const fieldExamples: Readonly<Record<DocumentToolId, Readonly<Record<string, string>>>> = {
  tor: {
    title: 'จ้างพัฒนาระบบจองห้องประชุม',
    unit: 'ฝ่ายบริหารงานทั่วไป',
    owner: 'คุณกานต์ ตัวอย่าง',
    intendedUse: 'เจ้าหน้าที่ 50 คนจองห้องผ่านเว็บ ส่งมอบพร้อมคู่มือ',
    constraints: 'ใช้เซิร์ฟเวอร์ของหน่วยงาน ไม่รวมค่าโดเมน',
    preferences: 'ใช้แบบ TOR ของหน่วยงาน มีตารางงวดงาน',
    background: 'ห้องประชุมถูกจองซ้ำบ่อยเพราะใช้สมุดจอง',
    objectives: 'เพื่อให้จองห้องประชุมได้ทันทีและไม่ซ้ำกัน',
    scope: 'ออกแบบ พัฒนา ติดตั้ง และอบรมผู้ใช้',
    deliverables: 'ระบบที่ใช้งานได้ ซอร์สโค้ด และคู่มือผู้ใช้',
    qualifications: 'มีผลงานพัฒนาระบบให้หน่วยงานรัฐ',
    acceptance: 'ทดสอบจองพร้อมกัน 20 คนโดยไม่มีข้อผิดพลาด',
    timeline: '120 วัน แบ่ง 2 งวด',
    budget: '450,000 บาท จากงบดำเนินงานปี 2570',
    sources: 'แบบ TOR ของหน่วยงาน',
  },
  memo: {
    ...officialExamples,
    unit: 'งานพัสดุ ฝ่ายบริหาร โทร. 1234',
    subject: 'ขออนุมัติจัดอบรมการใช้ AI ในงานเอกสาร',
    recipient: 'ผู้อำนวยการ',
    signer: 'คุณพิม ตัวอย่าง หัวหน้างานพัสดุ',
    reviewer: 'หัวหน้าฝ่ายบริหาร',
    decisionSigner: 'ผู้อำนวยการ',
    background: 'หน่วยงานมีแผนพัฒนาทักษะดิจิทัลของบุคลากร',
    facts: 'มีผู้สมัครเข้าอบรมแล้ว 30 คน',
    considerations: 'สอดคล้องกับแผนพัฒนาบุคลากรและมีงบรองรับ',
    request: 'อนุมัติจัดอบรมวันที่ 20 มกราคม 2570',
    budget: '15,000 บาท จากงบพัฒนาบุคลากร',
    sources: 'ระเบียบว่าด้วยค่าใช้จ่ายในการฝึกอบรม',
  },
  letter: {
    ...officialExamples,
    unit: 'หน่วยงานตัวอย่าง เลขที่ 99 ถนนตัวอย่าง',
    subject: 'ขอความอนุเคราะห์ข้อมูลสถิติผู้ใช้บริการ',
    background: 'หน่วยงานกำลังจัดทำรายงานประจำปี 2569',
    content: 'ขอข้อมูลจำนวนผู้ใช้บริการรายเดือน',
    schedule: '20 มกราคม 2570 เวลา 09.00 น. ณ ห้องประชุมตัวอย่าง',
    contact: 'คุณเมย์ ตัวอย่าง โทร. 1234',
    sources: 'แบบหนังสือภายนอกของหน่วยงาน',
  },
  project: {
    title: 'โครงการอบรมการใช้ AI ในงานเอกสาร',
    unit: 'ฝ่ายพัฒนาบุคลากร',
    owner: 'คุณกานต์ ตัวอย่าง',
    rationale: 'งานเอกสารใช้เวลามาก บุคลากรยังใช้เครื่องมือไม่คล่อง',
    objectives: 'เพื่อพัฒนาทักษะการร่างเอกสารด้วย AI ของบุคลากร',
    target: 'บุคลากร 30 คน คณะทำงาน 5 คน',
    activities: 'เตรียมหลักสูตร → อบรม 1 วัน → ติดตามผล 1 เดือน',
    timeline: 'มกราคม–มีนาคม 2570 ณ ห้องประชุมตัวอย่าง',
    budget: 'ค่าตอบแทนวิทยากร 3,600 บาท ค่าอาหารว่าง 1,500 บาท',
    indicators: 'ผู้เข้าอบรมร้อยละ 80 ร่างเอกสารได้เอง',
    outcomes: 'บุคลากรร่างเอกสารได้เร็วขึ้นและถูกแบบ',
    sources: 'แบบเสนอโครงการของหน่วยงาน',
  },
  minutes: {
    title: 'ประชุมคณะทำงานพัฒนาระบบ',
    number: '1/2570',
    date: '20 มกราคม 2570 เวลา 13.30 น. ณ ห้องประชุมตัวอย่าง',
    attendees: 'มาประชุม 8 คน ไม่มาประชุม 1 คน (ลาป่วย)',
    agendas: 'วาระที่ 1 เรื่องแจ้งเพื่อทราบ',
    notes: 'ที่ประชุมทบทวนแผนงานไตรมาสที่ 1',
    decisions: 'เห็นชอบแผนงานตามที่เสนอ',
    owners: 'คุณกานต์ สรุปผลภายใน 31 มกราคม 2570',
    recorder: 'คุณเมย์ ตัวอย่าง',
    sources: 'แบบรายงานการประชุมของหน่วยงาน',
  },
  other: {
    ...officialExamples,
    title: 'รายงานสรุปผลการอบรมประจำปี 2569',
    unit: 'ฝ่ายพัฒนาบุคลากร',
    owner: 'คุณกานต์ ตัวอย่าง',
    kind: 'รายงานสรุปผลการอบรม',
    purpose: 'รายงานผู้บริหารเพื่อวางแผนปีถัดไป',
    facts: 'อบรม 3 รุ่น ผู้เข้าร่วม 90 คน',
    content: 'สรุปผล ปัญหาที่พบ และข้อเสนอแนะ',
    requirements: 'ไม่เกิน 2 หน้า มีตารางสรุป',
    sources: 'แบบรายงานของหน่วยงาน',
  },
};
const invitationExamples: Readonly<Record<string, string>> = {
  subject: 'ขอเชิญเข้าร่วมกิจกรรมแลกเปลี่ยนผลงาน',
  recipient: 'คุณกานต์ ตัวอย่าง',
  signer: 'คุณพิม ตัวอย่าง — ผู้อำนวยการ',
  background: 'จัดเวทีแลกเปลี่ยนแนวทางทำงานระหว่างทีม',
  content: 'ขอเชิญเข้าร่วมและแลกเปลี่ยนประสบการณ์',
  schedule: '20 มกราคม 2570 เวลา 09.00–12.00 น. ณ ห้องประชุมตัวอย่าง',
  recipientPosition: 'ผู้จัดการโครงการ หน่วยงานตัวอย่าง',
  rsvpDeadline: '15 มกราคม 2570',
  contact: 'คุณเมย์ ตัวอย่าง · events@example.org',
  sources: 'กำหนดการฉบับเจ้าของงานยืนยัน',
};
/** The example for one field of a document form, or undefined if none is written yet. */
export function fieldExample(id: DocumentToolId, key: string, variant?: string): string | undefined {
  return (id === 'letter' && variant === 'invitation' && invitationExamples[key]) || fieldExamples[id]?.[key];
}
export const documentTool = (id: unknown) => DOCUMENT_TOOLS.find(p => p.id === id);
export function documentVariant(id: unknown, variant: unknown): string | undefined {
  if (variant === undefined) return undefined;
  if (typeof variant !== 'string' || !documentTool(id)?.variants.some(v => v.id === variant)) throw new Error('INVALID_DOCUMENT_VARIANT');
  return variant;
}
export function documentRequest(
  id: unknown,
  values: Record<string, string>,
  variant?: string,
  attachmentRole: DocumentAttachmentRole = 'source',
  recipients?: InvitationRecipient[],
) {
  const profile = documentTool(id);
  if (!profile) throw new Error('INVALID_DOCUMENT_TOOL');
  if (!['source', 'template'].includes(attachmentRole)) throw new Error('INVALID_DOCUMENT_SOURCE_ROLE');
  const kind = profile.variants.find(v => v.id === (variant || profile.variants[0].id));
  if (!kind) throw new Error('INVALID_DOCUMENT_VARIANT');
  const invitation = profile.id === 'letter' && kind.id === 'invitation';
  if (recipients !== undefined && !invitation) throw new Error('INVALID_DOCUMENT_PRESENTATION');
  const resolvedRecipients =
    invitation && recipients?.length ? resolveInvitation({ rsvpUrl: '', venueUrl: '', recipients }).recipients : undefined;
  if (Object.keys(values).some(key => !profile.fields.some(f => f.key === key))) throw new Error('INVALID_DOCUMENT_FIELDS');
  const fields = Object.fromEntries(
    profile.fields
      .filter(f => !f.invitationOnly || kind.id === 'invitation')
      .map(f => {
        const raw = values[f.key];
        if (raw !== undefined && typeof raw !== 'string') throw new Error('INVALID_DOCUMENT_FIELDS');
        if ((raw?.length || 0) > 6000) throw new Error('INPUT_LIMIT');
        const value = raw?.trim() || null;
        if (profile.id === 'letter' && ['rsvpUrl', 'venueUrl'].includes(f.key)) {
          const url = invitationUrl(value ?? '');
          return [
            f.key,
            {
              label: f.label,
              value: url ? (f.key === 'rsvpUrl' ? 'ใช้ QR ตอบรับท้ายหนังสือ' : 'ใช้ QR แผนที่ท้ายหนังสือ') : null,
              localOnly: true,
              ...(url ? { provenance: 'USER_INPUT' } : { missingAction: 'omit' }),
            },
          ];
        }
        // Keep the source string. Formatting is a presentation aid, not source verification.
        const isDate = value && ['date', 'rsvpDeadline'].includes(f.key) && ['memo', 'letter', 'other'].includes(profile.id);
        const date = isDate ? parseThaiDate(value) : null;
        return [
          f.key,
          {
            label: f.label,
            value,
            ...(value
              ? { provenance: 'USER_INPUT' }
              : f.missingAction
                ? { missingAction: f.missingAction }
                : { missingAction: 'confirm', ...(!invitation ? { placeholder: `[รอยืนยัน: ${f.label}]` } : {}) }),
            ...(isDate ? (date ? { formatted: formatThaiDate(date, 'official') } : { review: 'DATE_NEEDS_REVIEW' }) : {}),
          },
        ];
      }),
  );
  const registerSummary = resolvedRecipients?.length ? invitationSummary(resolvedRecipients) : undefined;
  const sourceText = JSON.stringify(
    {
      document: profile.title,
      variant: kind.label,
      attachmentRole,
      organizationReference: stepOrganizationReference,
      fields,
      ...(registerSummary
        ? {
            invitationRegister: {
              letters: registerSummary.letters,
              invitedSeats: registerSummary.invitedSeats,
              localOnly: true,
            },
          }
        : {}),
    },
    null,
    2,
  );
  if (sourceText.length > 90_000) throw new Error('INPUT_LIMIT');
  const task =
    profile.id === 'memo' ? profile.title + kind.label : profile.variants.length > 1 ? `${profile.title} (${kind.label})` : profile.title;
  const missingFacts = invitation
    ? 'เว้นข้อมูลที่ยังไม่ทราบในตัวหนังสือ ตัดบรรทัดเสริมที่ยังไม่มีข้อมูล และใช้ถ้อยคำร่างตามต้นเรื่อง'
    : 'คง [รอยืนยัน: ชื่อช่อง] เฉพาะข้อเท็จจริงหรือเงื่อนไขที่ต้องมีหลักฐาน';
  return {
    text: `${task} จากข้อมูลในฟอร์มและไฟล์ที่แนบ ใช้ Skill ที่เลือกเป็นหลักและแม่แบบที่โหลดในบริบท จัดทำตัวเอกสารที่แก้ไขและส่งออกได้ใน document_draft ช่วยขึ้นร่างเนื้อหาที่เสนอได้จากบริบทตาม Skill และแม่แบบ แม้ผู้ใช้ยังไม่ได้กรอกช่องนั้น ระบุข้อความที่เสนอเป็นร่างเพื่อพิจารณาและแยกสมมติฐานในผลตรวจ ${missingFacts} แยกผลตรวจ รายการข้อมูลและแหล่งอ้างอิงที่ต้องยืนยันไว้ใน document_review ซึ่งแสดงในแอปและไม่เป็นส่วนหนึ่งของเอกสาร${attachmentRole === 'template' ? ` ไฟล์ที่แนบเป็นแบบฟอร์ม/ตัวอย่าง ใช้${profile.id === 'tor' ? 'โครงสร้าง ชื่อช่อง แนวการเขียนและระดับรายละเอียดที่เหมาะกับงานนี้' : 'เฉพาะโครงสร้างและชื่อช่อง'} ไม่ใช้ชื่อบุคคล เลขหนังสือ วันที่ รหัสโครงการ งบ หรือข้อมูลที่กรอกเป็นตัวอย่างในไฟล์นั้นเป็นข้อเท็จจริงของงานใหม่ เติมข้อมูลของงานนี้จากฟอร์มหรือหลักฐานต้นเรื่องที่เจ้าของยืนยันแยกเท่านั้น` : ' ไฟล์ที่แนบเป็นต้นเรื่องของงานนี้ คง provenance และตรวจความขัดแย้งกับฟอร์มตาม Skill'}`,
    sourceText,
  };
}
