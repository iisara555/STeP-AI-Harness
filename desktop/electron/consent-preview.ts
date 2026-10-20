import { tm } from './i18n';

const labels: Record<string, string> = {
  path: 'ไฟล์',
  name: 'ชื่อ',
  title: 'ชื่อเรื่อง',
  label: 'ชื่อเรียก',
  url: 'เว็บไซต์',
  origin: 'เว็บไซต์',
  destination: 'ปลายทาง',
  command: 'คำสั่ง',
  query: 'คำขอ',
  text: 'ข้อความ',
  content: 'เนื้อหา',
  entries: 'รายการ',
  files: 'ไฟล์',
  results: 'ผลลัพธ์',
  accounts: 'บัญชี',
  items: 'รายการ',
  username: 'บัญชีผู้ใช้',
  identifier: 'บัญชีผู้ใช้',
  status: 'สถานะ',
  subject: 'เรื่อง',
  body: 'เนื้อหา',
};

/** A readable view of the reviewed payload. Exact reviewed JSON remains available as technical detail. */
export function consentPreview(text: string): string {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return text;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const v = value as Record<string, any>;
    if (
      Array.isArray(v.diagnostics) &&
      v.diagnostics.every((d: unknown) => d && typeof d === 'object' && typeof (d as Record<string, unknown>).message === 'string')
    ) {
      return [
        tm('ผลตรวจโค้ด: {0}', v.path || ''),
        tm('พบข้อสังเกต {0} รายการ', v.diagnostics.length),
        ...v.diagnostics.map((d: any) => tm('บรรทัด {0} ตำแหน่ง {1}: {2}', d.line, d.column, d.message)),
        ...(v.incomplete ? [tm('ตรวจได้บางส่วน ควรใช้คำสั่งตรวจของโครงการต่อ')] : []),
      ].join('\n');
    }
    if (typeof v.text === 'string') return consentPreview(v.text);
    if (typeof v.content === 'string') return consentPreview(v.content);
    if (typeof v.answer === 'string') return consentPreview(v.answer);
    if (typeof v.path === 'string' && v.status === 'staged-for-human-review') return tm('ไฟล์ {0} รอคุณตรวจในรายการแก้ไข', v.path);
    if (typeof v.path === 'string' && v.status === 'applied') return tm('บันทึกไฟล์ {0} แล้ว', v.path);
  }
  const render = (v: unknown, depth = 0): string => {
    if (depth < 8 && typeof v === 'string' && /^\s*[\[{]/.test(v)) {
      try {
        return render(JSON.parse(v), depth + 1);
      } catch {
        /* Reviewed plain text stays intact. */
      }
    }
    if (v === null) return tm('ไม่มีข้อมูล');
    if (typeof v === 'boolean') return v ? tm('ใช่') : tm('ไม่');
    if (typeof v !== 'object') return String(v);
    if (depth >= 8) return tm('ดูข้อมูลเพิ่มเติมในรายละเอียดสำหรับผู้ดูแล');
    if (Array.isArray(v)) return v.length ? v.map((item, i) => `${i + 1}. ${render(item, depth + 1)}`).join('\n') : tm('ไม่มีรายการ');
    return (
      Object.entries(v as Record<string, unknown>)
        .map(
          ([key, item]) => `${tm(labels[key] || key)}: ${key === 'command' && typeof item === 'string' ? item : render(item, depth + 1)}`,
        )
        .join('\n') || tm('ไม่มีข้อมูล')
    );
  };
  return render(value);
}
