import type { SkillEntry } from './types';
import { language } from './i18n';

/**
 * How the staff screens (Skill hub, the "/" menu, the document tool) name a Skill. The Skills themselves are not
 * changed: SKILL.md headings stay English for maintainers and the slash id stays the command. Skill metadata has no
 * Thai display-name field, so the Thai names live here; a Skill missing from this list, or the English UI, shows the
 * Skill's own (English) title.
 * Descriptions already come from the router or registry, which are written in Thai.
 */
const THAI_NAMES: Record<string, string> = {
  'afp-operations-lookup': 'ถามขั้นตอนงานการเงินและพัสดุ (AFP)',
  'audit-evidence-matrix': 'ตารางหลักฐานสำหรับการตรวจประเมิน',
  'audit-interview-coach': 'ซ้อมตอบคำถามผู้ตรวจประเมิน',
  'brand-tone-of-voice': 'อัตลักษณ์และน้ำเสียงของแบรนด์',
  'browser-form-assistant': 'ผู้ช่วยกรอกแบบฟอร์มออนไลน์',
  'customer-support-faq-triage': 'คัดแยกคำถามลูกค้า',
  'data-privacy-compliance': 'ตรวจข้อมูลส่วนบุคคลก่อนเผยแพร่',
  'document-record-control': 'ควบคุมเอกสารและบันทึกคุณภาพ',
  'document-review': 'ตรวจเอกสารทั่วไปก่อนส่ง',
  'evidence-before-approval': 'ตรวจหลักฐานก่อนอนุมัติ',
  'google-workspace': 'ทำงานกับ Google Workspace',
  'hr-policy-lookup': 'ถามสิทธิและระเบียบงานบุคคล',
  'iso9001-audit-readiness': 'เตรียมตรวจประเมิน ISO 9001',
  'lab-result-review': 'ทบทวนผลทดสอบในห้องปฏิบัติการ',
  'learning-designer': 'ออกแบบการเรียนรู้และอบรม',
  'management-review-prep': 'เตรียมประชุมทบทวนฝ่ายบริหาร',
  'market-signal-radar': 'ติดตามสัญญาณตลาด',
  'ncr-capa': 'จัดการข้อบกพร่องและการแก้ไข (NCR/CAPA)',
  'qms-risk-opportunity-review': 'ทบทวนความเสี่ยงและโอกาสของระบบคุณภาพ',
  'quality-objective-kpi-review': 'ทบทวนวัตถุประสงค์คุณภาพและตัวชี้วัด',
  'receipt-audit': 'ตรวจใบเสร็จและหลักฐานเบิกจ่าย',
  'sop-authoring': 'เขียนขั้นตอนปฏิบัติงานมาตรฐาน (SOP)',
  'spreadsheet-work': 'ทำงานกับไฟล์ Excel',
  'stakeholder-questionnaire': 'ชุดคำถามถึงเจ้าของข้อมูล',
  'step-brand': 'ตรวจการใช้ตราสัญลักษณ์ STeP',
  'step-writing': 'ตรวจสำนวนภาษาไทยของ STeP',
  'team-weekly-review': 'สรุปงานประจำสัปดาห์',
  'thai-english-translation': 'แปลไทย–อังกฤษ',
  'thai-official-documents': 'เอกสารราชการไทย',
  'voice-of-customer': 'สรุปเสียงของลูกค้า',
  'creative-art-director': 'กำหนดแนวทางงานสร้างสรรค์',
  'designer-brief': 'บรีฟงานออกแบบ',
  'event-concept': 'ออกแบบแนวคิดงานอีเวนต์',
  'event-run-of-show': 'ลำดับงานบนเวที (Run of Show)',
  'presentation-design': 'ออกแบบงานนำเสนอ',
  'step-image-prompt': 'เขียน Prompt สร้างภาพ',
  'assumption-challenger': 'ทดสอบสมมติฐาน',
  'decision-memo': 'บันทึกประกอบการตัดสินใจ',
  'entrepreneur-annual-goal': 'ตั้งเป้ารายได้ผู้ประกอบการรายปี',
  'executive-status-update': 'รายงานสถานะโครงการต่อผู้บริหาร',
  'expert-resource-matching': 'จับคู่ผู้เชี่ยวชาญและเครื่องมือ',
  'industry-problem-discovery': 'ถอดโจทย์ปัญหาของโรงงานและชุมชน',
  'innovation-okr-mapping': 'ถ่ายทอดเป้าหมายเป็น OKR',
  'meeting-summary': 'สรุปการประชุม',
  'project-plan': 'ร่างข้อเสนอโครงการ',
  'project-pre-mortem': 'วิเคราะห์ความเสี่ยงก่อนเริ่มโครงการ',
  'startup-discovery': 'ทดสอบตลาดสำหรับสตาร์ทอัพ',
  'tor-government-writing': 'ร่าง TOR ภาครัฐ',
  'tor-review': 'ตรวจ TOR ก่อนส่ง AFP',
};

/**
 * Developer-only Skills: the dev category (Git, GitHub, Vercel) and the AI-admin Skills that maintain the harness
 * itself (router, Skill authoring). They stay out of the staff hub and "/" menu unless Dev mode is on; typing the
 * full "/name" still works, and the router still routes to them as before.
 */
export const isDeveloperSkill = (s: Pick<SkillEntry, 'category' | 'owner'>) =>
  s.category === 'dev' || s.owner === 'developer' || s.owner === 'ai-admin';

/** The Thai name of a Skill by its id, for places that only know the id. */
export const skillDisplayName = (name: string) => (language() === 'th' && THAI_NAMES[name]) || name;

/** The catalog as staff see it: Thai names, and developer Skills only in Dev mode. */
export function skillsForStaff(skills: SkillEntry[], developerMode: boolean): SkillEntry[] {
  return skills
    .filter(s => developerMode || !isDeveloperSkill(s))
    .map(s => (language() === 'th' && THAI_NAMES[s.name] ? { ...s, title: THAI_NAMES[s.name] } : s));
}
