// What changed in each version, in words for STeP staff. Shown once after the app updates (src/whats-new-dialog.tsx);
// CHANGELOG.md keeps the technical detail. Add the new version at the top before each release.
import { t } from './i18n';

export type ReleaseNote = { version: string; items: () => string[] };

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.5.18',
    items: () => [
      t('แนบไฟล์ Word ที่มีรูป เช่น ตราครุฑหรือหัวกระดาษ ในเครื่องมือร่างเอกสารได้แล้ว ข้อความในไฟล์ส่งให้ AI ครบ ส่วนรูปไม่ได้ส่ง'),
      t('ถ้าแนบไฟล์ไม่ผ่าน ระบบบอกเหตุผลและวิธีแก้ เช่น ไฟล์มีกราฟหรือตาราง Excel ที่ฝังไว้'),
      t('Mac: ตั้งแต่การอัปเดตครั้งถัดไป กดอัปเดตแล้วแอปดาวน์โหลดและติดตั้งเอง ไม่ต้องไปหน้า GitHub'),
      t('หน้าตั้งค่าเริ่มต้นมี Gemini via Antigravity ให้เลือกทันที ใช้บัญชี Google ได้โดยไม่ต้องมีคีย์'),
      t('หน้าต่าง "มีอะไรใหม่" นี้จะขึ้นหลังอัปเดตทุกครั้ง เปิดดูอีกได้จากคำสั่ง (Ctrl+K หรือ ⌘K บน Mac)'),
    ],
  },
  {
    version: '0.5.17',
    items: () => [
      t('Antigravity บน Mac: วางรหัสจากหน้าเว็บ Google ในแอปได้ และไม่ค้างที่ "กำลังเชื่อมต่อ"'),
      t('ไฟล์ติดตั้งสำหรับ Mac มีคู่มือเปิดแอปครั้งแรกเป็นภาษาไทย'),
    ],
  },
  {
    version: '0.5.16',
    items: () => [
      t('เชื่อมต่อ Antigravity แล้วหน้าลงชื่อ Google เปิดในเบราว์เซอร์ให้เลย'),
      t('เครื่องมือร่างเอกสาร หน้าตรวจใบเสร็จแบบใหม่ และหน้าดูการใช้งาน AI'),
      t('กล่องบทเรียนบอกได้ว่าบทเรียนที่อนุมัติไว้ช่วยงานจริงหรือไม่'),
    ],
  },
];

/** -1, 0 or 1, comparing dotted version numbers (a pre-release suffix is ignored). */
export function compareVersions(a: string, b: string) {
  const parts = (v: string) =>
    v
      .split('-')[0]
      .split('.')
      .map(n => Number(n) || 0);
  const x = parts(a),
    y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1;
  }
  return 0;
}

/**
 * The notes to show after an update: versions newer than `seen` up to `current`, newest first. Someone who updated
 * from a version before this window existed (`seen` unset) sees the current version's notes only.
 */
export function unseenNotes(seen: string | undefined, current: string, notes = RELEASE_NOTES) {
  if (!current) return [];
  if (!seen) return notes.filter(n => compareVersions(n.version, current) === 0);
  if (compareVersions(seen, current) >= 0) return [];
  return notes.filter(n => compareVersions(n.version, seen) > 0 && compareVersions(n.version, current) <= 0);
}
