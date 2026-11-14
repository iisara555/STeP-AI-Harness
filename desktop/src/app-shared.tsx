import { BookOpen, FileText, Sparkles } from './icons';
import { lazyScreen } from './lazy-screen';

// Export formats by the app staff know them by; the value stays the file extension.
export const EXPORT_FORMAT_LABELS: Record<string, string> = {
  docx: 'Word (.docx)',
  pdf: 'PDF (.pdf)',
  md: 'Markdown (.md)',
  xlsx: 'Excel (.xlsx)',
  pptx: 'PowerPoint (.pptx)',
};

export const ReceiptApp = lazyScreen(async () => ({ default: (await import('./receipt')).ReceiptApp }));
export const DocumentTools = lazyScreen(async () => ({ default: (await import('./document-tool-app')).DocumentTools }));
export const InternalMedia = lazyScreen(async () => ({ default: (await import('./internal-media-app')).InternalMedia }));
export const ScheduledTasks = lazyScreen(async () => ({ default: (await import('./schedules-app')).ScheduledTasks }));
export const SkillsHub = lazyScreen(async () => ({ default: (await import('./skills')).SkillsHub }));

// Short words for the composer's permission pill; the list itself keeps the full descriptions.
export const PERMISSION_SHORT: Record<string, string> = {
  ask: 'ถามก่อน',
  acceptEdits: 'แก้ไฟล์ได้',
  auto: 'อัตโนมัติ',
  plan: 'อ่านอย่างเดียว',
};

export const CHAT_STARTERS = [
  {
    label: 'สรุปเอกสาร',
    request: 'ช่วยสรุปเอกสารที่แนบเป็นประเด็นสำคัญ พร้อมสิ่งที่ต้องทำต่อ',
    Icon: BookOpen,
  },
  {
    label: 'ร่างเอกสาร',
    request: 'ช่วยร่างเอกสารให้หน่อย ถามข้อมูลที่จำเป็นก่อนเริ่มร่าง',
    Icon: FileText,
  },
  {
    label: 'ช่วยคิดไอเดีย',
    request: 'ช่วยคิดไอเดียสำหรับงานนี้ ถามเป้าหมายและข้อจำกัดก่อนเสนอแนวทาง',
    Icon: Sparkles,
  },
];

export const TOOLS_KEY = 'step.sidebarTools';
/** A background answer check that started within its step budget; a stale mark (the app closed mid-check) shows nothing. */
export const checkStillRunning = (startedAt?: string) => Boolean(startedAt) && Date.now() - Date.parse(startedAt!) < 10 * 60_000;
