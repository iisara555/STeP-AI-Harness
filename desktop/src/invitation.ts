import { documentText, type DraftNode } from './draft';
import { parseThaiDate } from './thai-date';

/** Only current-task URLs enter a QR. Formatting never follows or fetches a URL. */
export type InvitationPresentation = { rsvpUrl: string; venueUrl: string };
export function invitationUrl(value: unknown): string {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string') throw new Error('INVALID_INVITATION_URL');
  const text = value.trim();
  if (!text) return '';
  if (!/^https?:\/\//i.test(text) || new TextEncoder().encode(text).length > 2048 || /[\s\u0000-\u001f\u007f]/.test(text))
    throw new Error('INVALID_INVITATION_URL');
  try {
    const url = new URL(text);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
  } catch {
    throw new Error('INVALID_INVITATION_URL');
  }
  return text;
}
export function resolveInvitation(value: unknown): InvitationPresentation {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['rsvpUrl', 'venueUrl'].includes(key)))
    throw new Error('INVALID_DOCUMENT_PRESENTATION');
  const input = value as Partial<InvitationPresentation>;
  return { rsvpUrl: invitationUrl(input.rsvpUrl), venueUrl: invitationUrl(input.venueUrl) };
}

/** Physical measurements shared by both exporters; the original PDFs remain private. */
export const INVITATION_LAYOUT = {
  frontHangCm: 0.9,
  dateBeforeCm: 0.4,
  dateAfterCm: 0.2,
  points: 16,
  line: 1.13,
  indent: 2.5,
  after: 8,
  margins: { top: 1.5, bottom: 1.5, left: 3, right: 2 },
  headerColumnsCm: [6, 3, 7],
  qrCm: 2.5,
  signatureGapCm: 1.2,
} as const;

/** Classify the latest editable blocks, never cached form prose. Every block is retained exactly once. */
export function invitationParts(document: DraftNode) {
  const blocks = document.content || [];
  const subject = blocks.findIndex(n => /^เรื่อง(?:\s|$)/.test(documentText(n).trim()));
  const front = subject >= 0 ? blocks.slice(0, subject) : [];
  const number = front.filter(n => /^ที่\s/.test(documentText(n).trim()));
  const date = front.filter(n =>
    /^(?:วันที่\s|[\d๐-๙]{1,2}\s+(?:มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม))/.test(
      documentText(n).trim(),
    ),
  );
  const sender = front.filter(n => !number.includes(n) && !date.includes(n));
  const rest = subject >= 0 ? blocks.slice(subject) : blocks;
  const signatureStart = rest.findIndex(n => /^ขอแสดงความนับถือ/.test(documentText(n).trim()));
  const contactStart =
    signatureStart >= 0
      ? rest.findIndex(
          (n, i) =>
            i > signatureStart &&
            /^(?:ผู้ประสานงาน|ส่วนงานเจ้าของเรื่อง|ติดต่อ|โทร\.|โทรศัพท์|E-mail\s*:|อีเมล)/i.test(documentText(n).trim()),
        )
      : -1;
  return {
    number,
    sender,
    date,
    body: signatureStart < 0 ? rest : rest.slice(0, signatureStart),
    signature: signatureStart < 0 ? [] : rest.slice(signatureStart, contactStart < 0 ? undefined : contactStart),
    contact: contactStart < 0 ? [] : rest.slice(contactStart),
  };
}

const MISSING_VALUE = /\[รอยืนยัน:[ \t]*([^\]\n]+)\]/g;
const PROPOSED_WORDING = /\[AI_PROPOSED\][ \t]*/g;
const EMPTY_FIELD_LINE =
  /^(?:(?:ที่|วันที่|เรียน|อ้างถึง|สิ่งที่ส่งมาด้วย|ผู้ประสานงาน|โทรศัพท์|โทร\.|ไปรษณีย์อิเล็กทรอนิกส์|อีเมล)\s*:?\s*)?(?:\(\s*\))?\s*\\?$/;

/** A new model draft may still use the general letter's status markers. Keep any inline gap editable. */
export function invitationDraft(draft: string): string {
  const wording = draft.replace(PROPOSED_WORDING, '');
  if (!wording.includes('[รอยืนยัน:')) return wording.trim();
  return wording
    .split('\n')
    .map(line => {
      const blank = line.replace(MISSING_VALUE, '');
      if (blank === line) return line;
      return EMPTY_FIELD_LINE.test(blank.trim()) ? '' : line.replace(MISSING_VALUE, '________');
    })
    .join('\n')
    .replace(/\\(?=\n(?:\n|$)|$)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Local consistency hints are evidence for review, never edits or a certification of the source. */
export function invitationReview(draft: string): string[] {
  const notes: string[] = [];
  const pending = [...new Set([...draft.matchAll(MISSING_VALUE)].map(match => match[1].trim()).filter(Boolean))];
  if (pending.length) notes.push('ข้อมูลที่ยังต้องยืนยัน: ' + pending.join(', '));
  if (draft.match(PROPOSED_WORDING)) notes.push('ถ้อยคำที่ AI เสนอเป็นร่างสำหรับเจ้าของเรื่องพิจารณา');
  const months = 'มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม';
  const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const matches = [
    ...draft.matchAll(
      new RegExp(`(?:วัน(${days.join('|')})(?:ที่)?\\s*)?([\\d๐-๙]{1,2}\\s+(?:${months})\\s+(?:พ\\.?ศ\\.?\\s*)?[\\d๐-๙]{4})`, 'g'),
    ),
  ];
  let event: Date | null = null,
    deadline: Date | null = null;
  for (const match of matches) {
    const date = parseThaiDate(match[2]);
    if (!date) {
      notes.push('ตรวจวันที่ที่อ่านไม่ได้: ' + match[0]);
      continue;
    }
    if (match[1] && days[date.getUTCDay()] !== match[1]) notes.push('วันในสัปดาห์ไม่ตรงกับวันที่: ' + match[0]);
    const before = draft.slice(Math.max(0, match.index! - 100), match.index);
    if (/ตอบรับ[^\n]*?(?:ภายใน|ถึง|ปิด)|ปิดตอบรับ\s*(?:วันที่)?\s*$/.test(before)) deadline = date;
    else if (/(?:ในวัน(?:ที่)?|จัดงาน|จัดกิจกรรม|กำหนดจัด)[\s\S]{0,80}$/.test(before)) event = date;
  }
  if (event && deadline && deadline > event) notes.push('วันปิดตอบรับอยู่หลังวันจัดงาน ต้องยืนยันกำหนดการกับเจ้าของเรื่อง');
  const attachment = /^สิ่งที่ส่งมาด้วย\s+(.+)$/m.exec(draft);
  if (attachment) notes.push('ตรวจไฟล์สิ่งที่ส่งมาด้วยให้ครบตามรายการก่อนออกหนังสือ: ' + attachment[1]);
  return notes;
}
