function normalizeDigits(text: string): string {
  return text.replace(/[๐-๙]/g, ch => String(ch.charCodeAt(0) - 0x0e50));
}

function extractSection(draft: string, headingPattern: string): string {
  const re = new RegExp(
    `(?:^|\\n)\\s*#{1,6}\\s*(?:[๐-๙0-9]+\\.\\s*)?(?:${headingPattern})[^\\n]*\\n([\\s\\S]*?)(?=\\n\\s*#{1,6}\\s+|\\s*$)`,
    'i',
  );
  return re.exec(draft)?.[1]?.trim() || '';
}

const VAGUE_OBJECTIVE_RE =
  /เพื่อ(?:ให้(?:ผู้เข้าร่วม(?:โครงการ|กิจกรรม|อบรม)?|กลุ่มเป้าหมาย|บุคลากร|นักศึกษา|ผู้รับบริการ|ผู้ประกอบการ|ผู้เรียน)?)?\s*(เข้าใจ(?:ถึง)?|ทราบ(?:ถึง)?|คุ้นเคย(?:กับ)?|ซาบซึ้ง(?:ใน)?|รู้ซึ้ง(?:ถึง)?|สนใจ(?:ใน)?|สำนึก(?:ใน)?|เชื่อถือ(?:ใน)?|ตระหนัก(?:ถึง|ใน)?)/g;

const PER_PERSON_BUDGET_LINE_RE =
  /(ค่าอาหารว่าง(?:และเครื่องดื่ม)?|ค่าอาหาร(?:กลางวัน|เย็น|เช้า)?|ค่าเครื่องดื่ม|ค่าวัสดุ(?:ฝึกอบรม|สัมมนา|ประกอบการอบรม)|เอกสารประกอบการ(?:อบรม|สัมมนา))/;

function parsePersonCounts(line: string): number[] {
  const withoutPlaceholders = normalizeDigits(line).replace(/\[รอยืนยัน[^\]]*\]/g, '');
  const counts: number[] = [];
  for (const match of withoutPlaceholders.matchAll(/(\d[\d,]*)\s*(?:คน|ท่าน|ราย)(?![ก-๙])/g)) {
    const n = Number(match[1].replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) counts.push(n);
  }
  return counts;
}

/**
 * Deterministic review checks for STeP project proposals based on CMU & public-sector project writing standards:
 * 1. Flags vague/non-behavioral objective verbs (เข้าใจ/ทราบ/คุ้นเคย/ซาบซึ้ง/รู้ซึ้ง/สนใจ/สำนึก/เชื่อถือ/ตระหนัก) and recommends measurable action verbs.
 * 2. Checks that the 3-paragraph rationale formula (ที่มา/สภาพปัญหา → แนวทางแก้ไข/พัฒนา → สรุปเข้าสู่จุดมุ่งหมายโครงการ) is complete when substantive prose is drafted.
 * 3. Cross-checks target group headcounts against per-person budget multipliers (ค่าอาหาร/อาหารว่าง/วัสดุฝึกอบรม).
 */
export function projectProposalReview(draft: string): string[] {
  const notes: string[] = [];
  const text = String(draft || '').replace(/\r\n?/g, '\n');

  // 1. Check objective verbs
  const objectivesSection = extractSection(text, 'วัตถุประสงค์');
  if (objectivesSection) {
    const vagueVerbs = new Set<string>();
    for (const match of objectivesSection.matchAll(VAGUE_OBJECTIVE_RE)) {
      vagueVerbs.add(`เพื่อ${match[1]}`);
    }
    if (vagueVerbs.size > 0) {
      notes.push(
        `วัตถุประสงค์มีคำกริยาที่เป็นนามธรรมและวัดผลโดยตรงได้ยาก (${[...vagueVerbs].join(', ')}) แนะนำให้ปรับเป็นคำกริยาเชิงพฤติกรรมที่สังเกตหรือวัดผลได้ เช่น เพื่ออธิบายถึง เพื่อระบุ เพื่อจำแนกแยกแยะ เพื่อประเมิน เพื่อสร้างเสริม เพื่อกำหนดรูปแบบ เพื่อแก้ปัญหา เพื่อส่งเสริม หรือเพื่อพัฒนาศักยภาพ`,
      );
    }
  }

  // 2. Check 3-paragraph rationale structure when substantive prose is present
  const rationaleSection = extractSection(text, 'หลักการและเหตุผล|ที่มาและความสำคัญ');
  if (rationaleSection) {
    const paragraphs = rationaleSection
      .split(/\n\s*\n+/)
      .map(p => p.replace(/\[รอยืนยัน[^\]]*\]/g, '').trim())
      .filter(p => p.length >= 20 && !/^[-*]\s*\*\*วรรคที่/.test(p));
    const totalLength = paragraphs.reduce((sum, p) => sum + p.length, 0);
    if (paragraphs.length > 0 && paragraphs.length < 3 && totalLength >= 100) {
      notes.push(
        `หลักการและเหตุผลมี ${paragraphs.length} ย่อหน้า แนะนำให้เรียบเรียงครบ 3 ย่อหน้าตามแนวทางมาตรฐาน มช. (วรรคที่ 1 ที่มา/สภาพปัญหา วรรคที่ 2 แนวทางแก้ไขหรือพัฒนา วรรคที่ 3 สรุปเข้าสู่จุดมุ่งหมายและผลสัมฤทธิ์ของโครงการ)`,
      );
    }
  }

  // 3. Cross-check target group headcounts against per-person budget multipliers
  const targetSection = extractSection(text, 'กลุ่มเป้าหมาย|ผู้เข้าร่วมโครงการ');
  const budgetSection = extractSection(text, 'งบประมาณ(?:และแหล่งงบ(?:ประมาณ)?)?');
  if (targetSection && budgetSection) {
    const targetLines = targetSection.split('\n').filter(line => line.trim());
    const statedCounts: number[] = [];
    const subgroupCounts: number[] = [];
    for (const line of targetLines) {
      const counts = parsePersonCounts(line);
      if (!counts.length) continue;
      statedCounts.push(...counts);
      if (!/รวม(?:จำนวน)?(?:ทั้งสิ้น)?/.test(line)) {
        subgroupCounts.push(...counts);
      }
    }
    if (statedCounts.length > 0) {
      const validTargets = new Set<number>(statedCounts);
      if (subgroupCounts.length > 1) {
        validTargets.add(subgroupCounts.reduce((a, b) => a + b, 0));
      }
      const mismatches: string[] = [];
      for (const line of budgetSection.split('\n')) {
        const itemMatch = PER_PERSON_BUDGET_LINE_RE.exec(line);
        if (!itemMatch) continue;
        const budgetCounts = parsePersonCounts(line);
        for (const count of budgetCounts) {
          if (!validTargets.has(count)) {
            mismatches.push(`${itemMatch[1]} (${count} คน)`);
          }
        }
      }
      if (mismatches.length > 0) {
        const expectedList = [...validTargets].sort((a, b) => a - b).join(' หรือ ');
        notes.push(
          `ตัวคูณจำนวนคนในหมวดงบประมาณไม่ตรงกับจำนวนกลุ่มเป้าหมาย: ${[...new Set(mismatches)].join(', ')} (ในกลุ่มเป้าหมายระบุ ${expectedList} คน) กรุณาตรวจสอบว่านับรวมคณะผู้ดำเนินงานและวิทยากรตรงกันหรือไม่`,
        );
      }
    }
  }

  return notes;
}
