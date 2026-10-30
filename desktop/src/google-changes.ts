// What an answer changed in Google Workspace, listed under it so the employee sees every file, email, event or
// message the AI made or changed without reading the whole chat (like a walkthrough at the end of an agent's task).
// Only completed writes are recorded; nothing here is sent to the AI.
import { GOOGLE_PAGES } from './google-services';

export type GooglePage = keyof typeof GOOGLE_PAGES;
export type GoogleChange = {
  operation: string;
  /** The Google service the change was made in, opened when there is no link to the item itself. */
  service: GooglePage;
  /** The item's own name as Google returned it (a document title, an event summary), if any. */
  title?: string;
  /** A link to the changed item, only in the fixed shapes googleResourceUrl accepts. */
  url?: string;
  at: string;
};

/** Changes kept on one answer; a longer task lists its first ones. */
export const GOOGLE_CHANGE_LIMIT = 50;

const SERVICE_OF_FAMILY: Record<string, GooglePage> = {
  drive: 'drive',
  docs: 'docs',
  sheets: 'sheets',
  slides: 'slides',
  gmail: 'gmail',
  calendar: 'calendar',
  tasks: 'tasks',
  chat: 'chat',
  meet: 'meet',
  forms: 'forms',
  appscript: 'scripts',
};

const ID = '[A-Za-z0-9_-]{1,200}';
const RESOURCE_URL = new RegExp(
  `^https://(?:docs\\.google\\.com/(?:document|spreadsheets|presentation|forms)/d/${ID}/edit` +
    `|drive\\.google\\.com/file/d/${ID}/view` +
    `|script\\.google\\.com/home/projects/${ID}/edit` +
    `|www\\.google\\.com/calendar/event\\?eid=[A-Za-z0-9_-]{1,400})$`,
);

/** The only links the app opens for a change: Google's own pages for one item, built from an id. */
export function googleResourceUrl(url: unknown): url is string {
  return typeof url === 'string' && url.length <= 500 && RESOURCE_URL.test(url);
}

function titleOf(data: any): string | undefined {
  const value = [data?.title, data?.properties?.title, data?.info?.title, data?.summary, data?.name].find(
    candidate => typeof candidate === 'string' && candidate.trim(),
  );
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return clean.length > 120 ? clean.slice(0, 119) + '…' : clean;
}

/** The receipt of one completed Google write, from the operation and the result GoogleWorkspace.execute returned. */
export function googleChange(operation: string, result: any, at = new Date().toISOString()): GoogleChange | undefined {
  if (!result || result.status !== 'completed' || typeof operation !== 'string') return undefined;
  const service = SERVICE_OF_FAMILY[operation.split('.')[0]];
  if (!service) return undefined;
  const data = result.data;
  // A Google Doc's batchUpdate or a Sheet's values update echoes no name; a created item does.
  const name = /^(?:docs|sheets|slides|forms|drive|calendar|tasks)\./.test(operation) ? titleOf(data) : undefined;
  const link = googleResourceUrl(result.resourceUrl) ? result.resourceUrl : googleResourceUrl(data?.htmlLink) ? data.htmlLink : undefined;
  return { operation, service, ...(name ? { title: name } : {}), ...(link ? { url: link } : {}), at };
}

const LABELS: [RegExp, string][] = [
  [/^docs\.create$/, 'สร้าง Google Doc'],
  [/^docs\./, 'แก้ Google Doc'],
  [/^sheets\.create$/, 'สร้าง Google Sheet'],
  [/^sheets\.values\.clear$/, 'ล้างข้อมูลใน Google Sheet'],
  [/^sheets\./, 'แก้ Google Sheet'],
  [/^slides\.create$/, 'สร้าง Google Slides'],
  [/^slides\./, 'แก้ Google Slides'],
  [/^forms\.create$/, 'สร้าง Google Form'],
  [/^forms\.setPublishSettings$/, 'ตั้งค่าการเผยแพร่ Google Form'],
  [/^forms\./, 'แก้ Google Form'],
  [/^gmail\.send$/, 'ส่งอีเมล'],
  [/^gmail\.(?:draft|drafts\.update)$/, 'บันทึกร่างอีเมล'],
  [/^gmail\.drafts\.delete$/, 'ลบร่างอีเมล'],
  [/^gmail\.trash$/, 'ย้ายอีเมลไปถังขยะ'],
  [/^gmail\.untrash$/, 'กู้อีเมลจากถังขยะ'],
  [/^gmail\.labels\.create$/, 'สร้างป้ายกำกับ Gmail'],
  [/^gmail\./, 'จัดป้ายกำกับอีเมล'],
  [/^calendar\./, 'ลงนัดใน Google Calendar'],
  [/^tasks\.complete$/, 'ทำเครื่องหมายงานเสร็จใน Google Tasks'],
  [/^tasks\./, 'เพิ่มงานใน Google Tasks'],
  [/^chat\./, 'ส่งข้อความใน Google Chat'],
  [/^drive\.createFolder$/, 'สร้างโฟลเดอร์ใน Drive'],
  [/^drive\.copy$/, 'คัดลอกไฟล์ใน Drive'],
  [/^drive\.uploadText$/, 'อัปโหลดไฟล์ไป Drive'],
  [/^drive\.permissions\.create$/, 'แชร์ไฟล์ใน Drive'],
  [/^drive\.permissions\.delete$/, 'ยกเลิกการแชร์ไฟล์ใน Drive'],
  [/^drive\./, 'แก้ไฟล์ใน Drive'],
  [/^appscript\.run$/, 'รัน Apps Script'],
  [/^appscript\.deployments\./, 'เผยแพร่ Apps Script'],
  [/^appscript\./, 'แก้ Apps Script'],
];

/** The Thai label of a change (wrap it in t() to show it); every write has one. */
export function googleChangeLabel(operation: string): string {
  return LABELS.find(([pattern]) => pattern.test(operation))?.[1] || 'เปลี่ยนข้อมูลใน Google';
}
