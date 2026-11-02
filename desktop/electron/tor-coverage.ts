type TorSection = { number: number; title: string };

// Titles vary slightly in model output. Pair each number with its subject so a numbered subclause or list is not
// mistaken for a main section; the canonical display names still come from the working template.
const SUBJECTS = [
  /หลักการ|ความเป็นมา|เหตุผล/,
  /วัตถุประสงค์/,
  /กลุ่มเป้าหมาย|ผู้มีส่วนได้ส่วนเสีย/,
  /สถานที่|พื้นที่ดำเนิน/,
  /ระยะเวลา|กำหนดเวลา/,
  /งบประมาณ|วงเงิน|ราคากลาง/,
  /ผลผลิต|ส่งมอบ|deliverables/i,
  /ผลลัพธ์|ประโยชน์/,
  /คุณลักษณะ|ขอบเขต/,
  /จ่ายเงิน|งวดเงิน|payment/i,
  /คุณสมบัติ/,
  /จัดซื้อ|จัดจ้าง|พิจารณา/,
  /ส่งมอบ|ค่าปรับ/,
  /ประกัน|ระดับการให้บริการ|sla/i,
  /จัดเตรียม|ทรัพย์สินทางปัญญา/,
  /หน่วยงาน|รับผิดชอบ/,
];

function sectionNumber(value: string): number {
  return Number(value.replace(/[๐-๙]/g, digit => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit))));
}

/** Compare numbered main headings with the current working outline; null means the template could not be checked. */
export function missingTorSections(draft: string, template: string): TorSection[] | null {
  const sections = [...template.matchAll(/^([๐-๙]+)\.\s+(.+)$/gm)].map(match => ({
    number: sectionNumber(match[1]),
    title: match[2].trim(),
  }));
  if (sections.length !== 16 || sections.some((section, index) => section.number !== index + 1)) return null;

  const present = new Set<number>();
  let fenced = false;
  for (const raw of draft.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const line = raw.replace(/\*\*|__/g, '');
    const match = /^\s{0,3}(?:#{1,6}\s+)?(?:ข้อ(?:ที่)?\s*)?([0-9๐-๙]{1,2})\s*(?:[.):](?![0-9๐-๙])|(?=\s))\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    const number = sectionNumber(match[1]);
    if (number >= 1 && number <= 16 && SUBJECTS[number - 1].test(match[2])) present.add(number);
  }
  return sections.filter(section => !present.has(section.number));
}
