import { parseThaiDate, formatThaiDate } from './thai-date';

/** Fixed document profiles: the host selects actual Skills and working templates from this allowlist. */
export type DocumentToolId = 'tor' | 'memo' | 'letter' | 'project' | 'minutes';
export type DocumentField = { key: string; label: string; hint?: string; multiline?: boolean };
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
const common = [field('title', 'ชื่อเอกสาร / ชื่อโครงการ'), field('unit', 'หน่วยงานเจ้าของเรื่อง'), field('owner', 'ผู้รับผิดชอบ')];
const dateGuide = 'docs/thai-data-formatting.md';
const draftingChecks = 'skills/common/thai-official-documents/references/drafting-checks.md';
const official = [
  field('number', 'เลขหนังสือ', false, 'เว้นไว้หากยังไม่ได้ออกเลข'),
  field('date', 'วันที่', false, 'ระบุปีเต็ม เช่น 2 ตุลาคม 2569'),
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
    references: [dateGuide, draftingChecks],
    variants: [
      { id: 'service', label: 'จ้างงาน / บริการ' },
      { id: 'goods', label: 'ซื้อพัสดุ / ครุภัณฑ์' },
    ],
    fields: [
      ...common,
      field('background', 'ความเป็นมา', true),
      field('objectives', 'วัตถุประสงค์', true),
      field('scope', 'ขอบเขตงาน', true),
      field('deliverables', 'ผลส่งมอบ', true),
      field('qualifications', 'คุณสมบัติผู้เสนอราคา', true, 'แนบแหล่งเกณฑ์คุณสมบัติที่ต้องใช้ ถ้ามี'),
      field('acceptance', 'เกณฑ์ตรวจรับ', true),
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
    references: [dateGuide, draftingChecks],
    variants: [
      { id: 'approval', label: 'ขออนุมัติ' },
      { id: 'concurrence', label: 'ขอความเห็นชอบ' },
      { id: 'report', label: 'รายงานผล' },
    ],
    fields: [
      field('unit', 'ส่วนราชการ'),
      field('subject', 'เรื่อง'),
      ...official,
      field('background', 'เรื่องเดิม / ความเป็นมา', true),
      field('facts', 'ข้อเท็จจริง / ผลดำเนินการ', true),
      field('considerations', 'ข้อพิจารณา / เหตุผลและแหล่งเกณฑ์', true),
      field('request', 'ข้อเสนอ / สิ่งที่ต้องการให้พิจารณา', true),
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
    references: [dateGuide, draftingChecks],
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
      field('background', 'เหตุที่มีหนังสือ / ต้นเรื่อง', true),
      field('content', 'สาระ / สิ่งที่ขอประสาน', true),
      field('schedule', 'วัน เวลา สถานที่ (ถ้ามี)'),
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
    references: [dateGuide],
    variants: [{ id: 'proposal', label: 'ข้อเสนอโครงการเพื่อพิจารณา' }],
    fields: [
      ...common,
      field('rationale', 'หลักการและเหตุผล', true),
      field('objectives', 'วัตถุประสงค์', true),
      field('target', 'กลุ่มเป้าหมาย / จำนวนที่มีหลักฐาน'),
      field('activities', 'กิจกรรม / วิธีดำเนินงาน', true),
      field('timeline', 'ระยะเวลา / สถานที่'),
      field('budget', 'งบประมาณ / แหล่งงบที่มีหลักฐาน', true),
      field('indicators', 'ตัวชี้วัด / วิธีประเมินผล', true),
      field('outcomes', 'ผลที่คาดว่าจะได้รับ', true),
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
    references: [dateGuide, draftingChecks],
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
];
export const documentTool = (id: unknown) => DOCUMENT_TOOLS.find(p => p.id === id);
export function documentRequest(id: unknown, values: Record<string, string>, variant?: string) {
  const profile = documentTool(id);
  if (!profile) throw new Error('INVALID_DOCUMENT_TOOL');
  const kind = profile.variants.find(v => v.id === (variant || profile.variants[0].id));
  if (!kind) throw new Error('INVALID_DOCUMENT_VARIANT');
  if (Object.keys(values).some(key => !profile.fields.some(f => f.key === key))) throw new Error('INVALID_DOCUMENT_FIELDS');
  const fields = Object.fromEntries(
    profile.fields.map(f => {
      const raw = values[f.key];
      if (raw !== undefined && typeof raw !== 'string') throw new Error('INVALID_DOCUMENT_FIELDS');
      if ((raw?.length || 0) > 6000) throw new Error('INPUT_LIMIT');
      const value = raw?.trim() || null;
      // Keep the source string. Formatting is a presentation aid, not source verification.
      const isDate = value && f.key === 'date' && ['memo', 'letter'].includes(profile.id);
      const date = isDate ? parseThaiDate(value) : null;
      return [
        f.key,
        {
          label: f.label,
          value,
          ...(value ? { provenance: 'USER_INPUT' } : { placeholder: `[รอยืนยัน: ${f.label}]` }),
          ...(isDate ? (date ? { formatted: formatThaiDate(date, 'official') } : { review: 'DATE_NEEDS_REVIEW' }) : {}),
        },
      ];
    }),
  );
  const sourceText = JSON.stringify({ document: profile.title, variant: kind.label, fields }, null, 2);
  if (sourceText.length > 90_000) throw new Error('INPUT_LIMIT');
  const task =
    profile.id === 'memo' ? profile.title + kind.label : profile.variants.length > 1 ? `${profile.title} (${kind.label})` : profile.title;
  return {
    text: `${task} จากข้อมูลในฟอร์มและไฟล์ต้นเรื่องที่แนบ ใช้ Skill ที่เลือกเป็นหลักและแม่แบบที่โหลดในบริบท จัดทำร่างเพื่อพิจารณาที่แก้ไขและส่งออกได้ เว้นข้อมูลที่ขาดเป็น [รอยืนยัน: ชื่อช่อง] พร้อมรายการข้อมูลและแหล่งอ้างอิงที่ต้องตรวจท้ายร่าง`,
    sourceText,
  };
}
