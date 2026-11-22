// The travel reason for a category BV (ค่าพาหนะ) claim. AFP procurement asked on 2026-11-20 that every BV reason name
// who travels, what for, when, from where to where and for which activity, because it goes into the approval report for
// hiring a van under ว 119 (docs/knowledge/afp-bv-travel-reason.md). These are fixed local checks: they
// look for each part in the words, they never judge whether the trip is allowed.

export type BvPart = 'who' | 'what' | 'when' | 'route' | 'activity';
export const BV_PARTS: BvPart[] = ['who', 'what', 'when', 'route', 'activity'];
export const BV_PART_LABELS: Record<BvPart, string> = {
  who: 'ใครเดินทาง',
  what: 'ไปทำอะไร',
  when: 'เมื่อไร',
  route: 'จากไหนไปไหน',
  activity: 'เพื่อกิจกรรมอะไร',
};
export const BV_SOURCE = 'เหตุผลการเดินทาง หมวด BV (งานพัสดุ AFP 20 พ.ย. 2569)';
export const BV_FORMULA = 'ใคร + ทำอะไร + เมื่อไร + จากไหนไปไหน + เพื่อกิจกรรมอะไร';
export const BV_TEMPLATE =
  'เพื่อ[รับ/ส่ง/อำนวยความสะดวกในการเดินทาง][วิทยากร/บุคลากร/ผู้เข้าร่วมกิจกรรม] วันที่ [วันเดินทาง] จาก [ต้นทาง] ไปยัง [ปลายทาง] เพื่อ [ชื่อกิจกรรม/โครงการ]';
/** Placeholders the draft keeps for a part the person did not know yet. */
const PLACEHOLDER: Record<BvPart, string> = {
  who: '[ผู้เดินทาง]',
  what: '[รับ/ส่ง]',
  when: '[วันเดินทาง]',
  route: 'จาก [ต้นทาง] ไปยัง [ปลายทาง]',
  activity: '[ชื่อกิจกรรมหรือโครงการ]',
};

const MONTH =
  'ม\\.?ค|ก\\.?พ|มี\\.?ค|เม\\.?ย|พ\\.?ค|มิ\\.?ย|ก\\.?ค|ส\\.?ค|ก\\.?ย|ต\\.?ค|พ\\.?ย|ธ\\.?ค|มกรา|กุมภา|มีนา|เมษา|พฤษภา|มิถุนา|กรกฎา|สิงหา|กันยา|ตุลา|พฤศจิกา|ธันวา';
const DIGIT = '[0-9๐-๙]';
const PATTERNS: Record<BvPart, RegExp> = {
  who: /วิทยากร|บุคลากร|ผู้เข้าร่วม|ผู้เดินทาง|พนักงาน|เจ้าหน้าที่|ผู้บริหาร|ผู้อำนวยการ|คณะ|ทีม|นักศึกษา|นักเรียน|แขก|ผู้ประกอบการ|ผู้ติดตาม|กรรมการ|ผู้เชี่ยวชาญ|อาจารย์|ผู้แทน|ผู้ร่วม|ผู้ประสานงาน|speaker|guest|participant|staff/i,
  what: /รับ|ส่ง|อำนวยความสะดวก|เดินทาง|ปฏิบัติงาน|ขนย้าย|ขนส่ง|ลงพื้นที่/,
  when: new RegExp(
    `${DIGIT}{1,2}\\s*(?:[-–]\\s*${DIGIT}{1,2}\\s*)?(?:${MONTH})|${DIGIT}{1,2}\\/${DIGIT}{1,2}\\/${DIGIT}{2,4}|วันที่\\s*${DIGIT}`,
  ),
  // Both ends, or one area the whole trip stays in. "ไปกรุงเทพฯ" alone names no starting point.
  route: /จาก\s*\S.*?(?:ไป|ถึง|มา)|ภายใน\s*\S|ระหว่าง(?!วันที่|\s*วันที่|\s*[0-9๐-๙])\s*\S.*?(?:กับ|และ|-|–)|→|->/,
  activity: /กิจกรรม|โครงการ|ประชุม|อบรม|สัมมนา|ศึกษาดูงาน|นิทรรศการ|แถลง|พิธี|(?<!ปฏิบัติ|ทำ)งาน|workshop|event|training|forum/i,
};
/** AFP's own examples of a reason that is too short; under this many letters a reason reads as one of them. */
const SHORT = 30;

export type BvReasonCheck = { missing: BvPart[]; short: boolean; empty: boolean; placeholder: boolean; ok: boolean };

export function checkBvReason(text: string): BvReasonCheck {
  // A placeholder left in a draft does not count as the part it stands for, and still has to be filled.
  const placeholder = /\[[^\]]*\]/.test(text);
  const body = text.replace(/\[[^\]]*\]/g, ' ').trim();
  const missing = BV_PARTS.filter(part => !PATTERNS[part].test(body));
  const letters = body.replace(/\s+/g, '').length;
  const empty = !letters;
  const short = !empty && letters < SHORT;
  return { missing, short, empty, placeholder, ok: !empty && !short && !placeholder && !missing.length };
}

type Translate = (text: string, ...args: string[]) => string;
const plain: Translate = (text, ...args) => text.replace(/\{(\d+)\}/g, (_, index) => args[Number(index)] ?? '');

/** One line on what a BV reason still lacks, in the UI language; null when it has all five parts. */
export function bvReasonProblem(text: string, translate: Translate = plain): string | null {
  const check = checkBvReason(text);
  if (check.ok) return null;
  if (check.empty) return translate('ยังไม่ได้เขียนเหตุผลการเดินทาง');
  const missing = check.missing.map(part => translate(BV_PART_LABELS[part])).join(', ');
  if (!missing && check.placeholder) return translate('ยังมีช่องในวงเล็บ [ ] ที่ต้องเติม');
  if (check.short)
    return missing
      ? translate('เหตุผลสั้นเกินไป ยังไม่พบ: {0}', missing)
      : translate('เหตุผลสั้นเกินไป เขียนให้ครบ: {0}', translate(BV_FORMULA));
  return translate('ยังไม่พบ: {0}', missing);
}

export type BvAnswers = Partial<Record<BvPart, string>>;

const THAI = /^[฀-๿]/;
/** Thai runs on without a space; a Latin name or a number after a Thai word gets one. */
const join = (head: string, tail: string) => (THAI.test(tail) ? head + tail : `${head} ${tail}`);
const strip = (value: string | undefined, lead: RegExp) => (value || '').replace(/\s+/g, ' ').trim().replace(lead, '').trim();
const PICK_UP = /^(?:รับ|ส่ง|รับ-ส่ง|รับส่ง)$/;

/** The recommended sentence from AFP's template; an unknown part keeps its bracketed placeholder for the person to fill. */
export function draftBvReason(answers: BvAnswers): string {
  const who = strip(answers.who, /^ของ/) || PLACEHOLDER.who;
  const what = strip(answers.what, /^เพื่อ/) || PLACEHOLDER.what;
  const lead = PICK_UP.test(what) || what === PLACEHOLDER.what ? join(`เพื่อ${what}`, who) : join(`เพื่อ${what}ของ`, who);
  const whenText = strip(answers.when, /^$/);
  const when = !whenText ? `วันที่ ${PLACEHOLDER.when}` : /^(?:วันที่|ระหว่าง|ช่วง)/.test(whenText) ? whenText : `วันที่ ${whenText}`;
  const routeText = strip(answers.route, /^$/);
  const ends = routeText.split(/\s*(?:→|->|ไปยัง|ถึง)\s*|\s+[-–]\s+|\s+ไป\s+/).filter(Boolean);
  const route = !routeText
    ? PLACEHOLDER.route
    : /^(?:จาก|ภายใน|ระหว่าง|ที่)/.test(routeText)
      ? routeText
      : ends.length === 2
        ? `จาก${ends[0]}ไปยัง${ends[1]}`
        : routeText;
  const activityText = strip(answers.activity, /^เพื่อ/);
  const activity = !activityText
    ? `เพื่อ ${PLACEHOLDER.activity}`
    : /^(?:เข้าร่วม|ปฏิบัติงาน|ร่วม|จัด|ใช้ใน)/.test(activityText)
      ? join('เพื่อ', activityText)
      : // A bare name ("Frontier Technology 2569") is said to be the activity, as AFP's examples do.
        join(PATTERNS.activity.test(activityText) ? 'สำหรับ' : 'สำหรับกิจกรรม', activityText);
  return `${lead} ${when} ${route} ${activity}`.replace(/\s+/g, ' ').trim();
}
