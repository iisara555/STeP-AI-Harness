/**
 * Context Scanner for STeP Skill Router
 * Cheaply inspects folder paths, file extensions, and user request intent.
 * Also provides cheap context disambiguation for ambiguous scoring tiers.
 */

import { extname, basename, dirname } from 'node:path';
import { scoreSkillCandidate } from './scorer.js';
import { neutralizeDraftingPhrases } from './authority-preflight.js';

export const BRAND_REVIEW_SIGNALS = ['brand', 'tone of voice', 'น้ำเสียงแบรนด์', 'โลโก้', 'logo', 'identity', 'บุคลิกแบรนด์', 'ตราสัญลักษณ์', 'คู่มือแบรนด์', 'ci guideline'];

export const QUALIFIED_INTENT_RULES = [
  { intent: 'privacy-review', any: ['เลขบัตรประชาชน', 'เลขบัตร', 'ข้อมูลส่วนบุคคล', 'pii', 'pdpa', 'credential', 'password', 'ข้อมูลสุขภาพ'] },
  {
    intent: 'form-submit',
    allAny: [
      ['กดส่ง', 'ส่งแบบฟอร์ม', 'submit', 'กดยืนยัน', 'ส่งให้เลย'],
      ['ฟอร์ม', 'แบบฟอร์ม', 'เว็บ', 'เว็บไซต์', 'ล็อกอิน'],
    ],
  },
  {
    intent: 'social-writing',
    allAny: [
      ['เขียน', 'ร่าง', 'แคปชั่น', 'caption', 'โพสต์'],
      ['แคปชั่น', 'caption', 'โพสต์เฟซบุ๊ก', 'facebook', 'social post'],
    ],
  },
  {
    intent: 'lab-review',
    allAny: [
      ['ผลทดสอบ', 'ผลแล็บ', 'ผลวิเคราะห์', 'ใบคำขอ', 'หน่วยวัด'],
      ['ไม่ตรง', 'ไม่ตรงกัน', 'หน่วย', 'ตรวจ', 'ทบทวน'],
    ],
  },
  { intent: 'market-test', any: ['ขายได้ไหม', 'จะขายได้ไหม', 'ทดสอบตลาด', 'ทดลองตลาด', 'market test', 'test market'] },
  {
    intent: 'onboarding-plan',
    allAny: [
      ['น้องใหม่', 'พนักงานใหม่', 'คนใหม่', 'new hire', 'onboarding'],
      ['เตรียม', 'เข้ามา', 'เริ่มงาน', 'เดือนหน้า', 'onboarding'],
    ],
  },
  { intent: 'nonconformity', any: ['ไม่ได้มาตรฐาน', 'ไม่เป็นไปตามข้อกำหนด', 'ข้อไม่เป็นไปตามข้อกำหนด', 'เปิด nc', 'เปิด ncr', 'nonconformity', 'non-conformity'] },
  // Entitlement questions name an HR subject and ask for a quantity or a
  // condition. Both halves are required: "ลาออก" alone can belong to an
  // offboarding plan, and "เท่าไหร่" alone belongs to any costing question.
  {
    intent: 'hr-entitlement',
    allAny: [
      ['ลาพักผ่อน', 'ลาป่วย', 'ลากิจ', 'ลาคลอด', 'ลาบวช', 'ลาอุปสมบท', 'ลาปฏิบัติธรรม', 'วันลา', 'สิทธิลา', 'ลาออก', 'พ้นสภาพ', 'เบี้ยขยัน', 'เบี้ยเลี้ยง', 'ค่าที่พัก', 'ค่ายานพาหนะ', 'ค่าตำแหน่ง', 'ค่าความเชี่ยวชาญ', 'กองทุนสำรองเลี้ยงชีพ', 'ระเบียบวินัย', 'โทษทางวินัย', 'เลื่อนขั้น', 'ขั้นเงินเดือน', 'career path', 'เส้นทางความก้าวหน้า', 'สวัสดิการ', 'ค่ารักษาพยาบาล', 'รักษาพยาบาล', 'ระเบียบบุคคล', 'สลิปเงินเดือน', 'วันหยุดชดเชย', 'วันหยุดเพิ่มเติม', 'วันหยุดราชการ', 'บันทึกการพัฒนาบุคลากร', 'ใบลา', 'ยื่นใบลา', 'ปฏิบัติงานต่างประเทศ', 'ไปปฏิบัติงานต่างประเทศ', 'business travel', 'เบิกค่ารถ', 'เบิกค่าน้ำมัน', 'ค่ายานพาหนะ'],
      ['กี่วัน', 'กี่บาท', 'เท่าไหร่', 'เท่าไร', 'ได้ไหม', 'ได้มั้ย', 'ได้บ้าง', 'ยังไง', 'อย่างไร', 'เมื่อไหร่', 'ใครอนุมัติ', 'สิทธิ', 'เงื่อนไข', 'หลักเกณฑ์', 'ข้อไหน', 'ต้องทำ', 'ต้องมี', 'ต้องใช้', 'ล่วงหน้า', 'ที่ไหน', 'ระบบไหน', 'ยื่นที่', 'ขั้นตอน'],
    ],
  },
  // AFP operations questions name a finance or procurement subject and ask
  // about time, category or procedure. Both halves are required: 'ใบเสร็จ'
  // alone is a receipt-audit job, and 'กี่วัน' alone belongs to any planning
  // question.
  {
    intent: 'afp-operations',
    allAny: [
      ['lead time', 'leadtime', 'ระยะเวลาดำเนินงาน', 'ปิดรับเอกสาร', 'ยืมเงิน', 'เคลียร์เงิน', 'สำรองจ่าย', 'เงินอุดหนุน', 'ใบแจ้งหนี้', 'ใบเสร็จรับเงิน', 'หมวดค่าใช้จ่าย', 'หมวด b', 'หมวด bv', 'จ้างเหมารถตู้', 'เช่ารถตู้', 'รถตู้', 'ค่าตอบแทนวิทยากร', 'วิทยากร', 'จัดซื้อจัดจ้าง', 'งานพัสดุ', 'ใบสั่งซื้อ', 'ใบสั่งจ้าง', 'e-signature', 'ลายเซ็นอิเล็กทรอนิกส์', 'step mis', 'เงินชดเชยคอมพิวเตอร์', 'คอมพิวเตอร์พกพา', 'เอกสารภาษาต่างประเทศ', 'อัตราแลกเปลี่ยน'],
      ['กี่วัน', 'กี่บาท', 'เท่าไหร่', 'เท่าไร', 'นานแค่ไหน', 'ใช้เวลา', 'เสร็จเมื่อไหร่', 'ทันไหม', 'ได้ไหม', 'ได้มั้ย', 'ยังไง', 'อย่างไร', 'เมื่อไหร่', 'เงื่อนไข', 'หลักเกณฑ์', 'ต้องทำ', 'ขั้นตอน', 'ลงหมวด', 'หมวดอะไร', 'ที่ไหน', 'ระบบไหน'],
    ],
  },
];

function matchesQualifiedIntent(lower, rule) {
  if (rule.any?.some((term) => lower.includes(term))) return true;
  if (rule.allAny) return rule.allAny.every((group) => group.some((term) => lower.includes(term)));
  return false;
}

export const INTENT_KEYWORDS = {
  summarize: ['สรุป', 'ย่อ', 'ถอดมติ', 'รวบรวม', 'จัดกลุ่มความเห็น', 'จดประชุม', 'โน้ตประชุม', 'ใครต้องทำอะไร', 'summarize', 'summary', 'minutes'],
  interview: ['สัมภาษณ์ตรวจ', 'สัมภาษณ์ลูกค้า', 'customer interview', 'mom test', 'สัมภาษณ์ audit', 'audit interview', 'interview coach', 'ซ้อมตอบผู้ตรวจ', 'ซ้อมสัมภาษณ์'],
  review: ['ปรับสำนวน', 'ปรับข้อความ', 'ตรวจ', 'รีวิว', 'เช็ก', 'เช็ค', 'ตรวจสอบ', 'ทบทวน', 'ความครบถ้วน', 'ครบถ้วน', 'ครบยัง', 'ครบมั้ย', 'ครบไหม', 'ช่วยดู', 'เบิกได้', 'review', 'check', 'audit', 'evaluate'],
  fill: ['กรอก', 'จองห้อง', 'ขอใช้ห้อง', 'ลงทะเบียน', 'fill', 'book', 'register'],
  create: ['ทำ creative brief', 'คิด concept', 'จัดทำ', 'ยกร่าง', 'ร่าง', 'สร้าง', 'เขียน', 'ออกแบบ', 'ดีไซน์', 'แต่ง', 'ทำตาราง', 'ทำสไลด์', 'ทำบรีฟ', 'ทำแบบ', 'ทำ prompt', 'ทำ brief', 'ทำ tor', 'ขอ prompt ภาพ', 'ขอ prompt รูป', 'ขอ prompt ทำภาพ', 'ขอ prompt โปสเตอร์', 'prompt ภาพโปสเตอร์', 'prompt งานสัมมนา', 'key visual', 'create', 'draft', 'write', 'generate', 'design'],
  plan: ['ทำ pre-mortem', 'วางแผน', 'แผนงาน', 'กะเวลา', 'ไทม์ไลน์', 'timeline', 'milestone', 'plan', 'schedule', 'gantt', 'ไทมไลน์'],
  deploy: ['deploy', 'เดพลอย', 'ขึ้นระบบ', 'production', 'staging'],
  triage: ['คัดแยก', 'ส่งต่อ', 'รับเรื่อง', 'triage', 'inquiry', 'สอบถาม', 'ถาม', 'ติดต่อ', 'ราคา'],
  approve: ['อนุมัติ', 'ขออนุมัติ', 'เซ็น', 'ลงนาม', 'approve', 'sign', 'เคาะ'],
  evaluate: ['เลือก', 'ประเมิน', 'ตัดสิน', 'เปรียบเทียบ', 'compare', 'select', 'evaluate'],
};

/**
 * Infer intent from prompt text
 * @param {string} promptText 
 * @returns {string} Inferred intent (brand-review, review, create, summarize, plan, deploy, triage, or unknown)
 */
export function inferIntentFromText(promptText = '') {
  // Drafting a request for approval is writing, not approving: neutralise the
  // drafting phrases the authority gates also neutralise, so
  // "ร่างบันทึกข้อความขออนุมัติ" keeps its head verb instead of being outranked
  // by the longer "ขออนุมัติ".
  const lower = neutralizeDraftingPhrases(promptText).toLowerCase();

  for (const rule of QUALIFIED_INTENT_RULES) {
    if (matchesQualifiedIntent(lower, rule)) return rule.intent;
  }

  // Brand review is a qualified review intent: require both a brand-domain
  // signal and a review/check signal. A prompt that says "สร้างภาพ ... brand"
  // must remain a create task and route to image/creative generation Skills.
  const hasBrandSignal = BRAND_REVIEW_SIGNALS.some((kw) => lower.includes(kw.toLowerCase()));
  const hasReviewSignal = INTENT_KEYWORDS.review.some((kw) => lower.includes(kw.toLowerCase()));
  if (hasBrandSignal && hasReviewSignal) {
    return 'brand-review';
  }

  // Pick the intent by position first, not by the order categories happen to be
  // declared in. Thai requests lead with the head verb ("ช่วยตรวจ TOR งานจ้าง
  // ออกแบบ...") and trail with objects and subordinate clauses ("...และสรุป
  // evidence gap"), so the earliest keyword usually carries the intent.
  // A later keyword only overrides it when it is far more specific — at least
  // twice as long — which protects phrases like "สัมภาษณ์ลูกค้า" from a short
  // generic keyword ("ถาม") that merely sits inside an earlier word.
  const matches = [];
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const kw of keywords) {
      const lowerKw = kw.toLowerCase();
      if (!lowerKw) continue;
      const index = lower.indexOf(lowerKw);
      if (index === -1) continue;
      matches.push({ intent, index, length: lowerKw.length });
    }
  }

  if (matches.length === 0) return 'unknown';

  matches.sort((a, b) => a.index - b.index || b.length - a.length);
  const earliest = matches[0];
  let best = earliest;
  for (const match of matches) {
    if (match.length >= earliest.length * 2 && match.length > best.length) {
      best = match;
    }
  }

  return best.intent;
}

/**
 * Extract distinct file extensions from a list of filenames
 * @param {string[]} filenames 
 * @returns {string[]} Extensions without leading dot (e.g. ['docx', 'xlsx'])
 */
export function extractFileTypes(filenames = []) {
  const exts = new Set();
  for (const f of filenames) {
    const ext = extname(f).replace(/^\./, '').toLowerCase();
    if (ext) exts.add(ext);
  }
  return Array.from(exts);
}

/**
 * Build context object for router scoring
 * @param {object} params
 * @returns {object}
 */
export function buildContext({
  path = '',
  filenames = [],
  promptText = '',
  team = '',
  cluster = '',
}) {
  const intent = inferIntentFromText(promptText);
  const fileTypes = extractFileTypes(filenames);

  return {
    path,
    filenames,
    fileTypes,
    text: promptText,
    intent,
    team,
    cluster,
  };
}

/**
 * Inspect cheap contextual signals without loading entire files into memory:
 * - Active file name and path
 * - First 10 lines or frontmatter snippet of active document
 * - Project README title snippet or package.json description snippet
 * @param {object} params
 * @returns {{
 *   fileName: string,
 *   extraText: string,
 *   extraFileTypes: string[],
 *   pathSignal: string
 * }}
 */
export function inspectCheapContext({
  currentFile = '',
  openFiles = [],
  snippet = '',
  projectTitle = '',
  currentPath = '',
} = {}) {
  const extraFileTypes = extractFileTypes([...openFiles, currentFile].filter(Boolean));
  const fileBase = currentFile ? basename(currentFile) : '';
  const textSignals = [fileBase, snippet, projectTitle].filter(Boolean).join(' ');
  const pathSignal = currentPath || (currentFile && (currentFile.includes('/') || currentFile.includes('\\')) ? dirname(currentFile) : '');

  return {
    fileName: fileBase,
    extraText: textSignals,
    extraFileTypes,
    pathSignal,
  };
}

/**
 * Perform Cheap Context Disambiguation when a candidate is in AMBIGUOUS tier (0.50 - 0.79)
 * Instead of asking the user immediately, rescore using cheap context signals.
 * @param {object} skill
 * @param {object} baseContext
 * @param {object} cheapContextSignals
 * @param {object} scoringOptions
 * @returns {{
 *   rescored: object,
 *   disambiguated: boolean,
 *   reason: string
 * }}
 */
export function rescoreWithCheapContext(skill, baseContext, cheapContextSignals = {}, scoringOptions = {}) {
  const enrichedText = [baseContext.text, cheapContextSignals.extraText].filter(Boolean).join(' ');
  const combinedFileTypes = Array.from(new Set([
    ...(baseContext.fileTypes || []),
    ...(cheapContextSignals.extraFileTypes || []),
  ]));
  const enrichedPath = cheapContextSignals.pathSignal || baseContext.path;

  const enrichedContext = {
    ...baseContext,
    path: enrichedPath,
    text: enrichedText,
    fileTypes: combinedFileTypes,
  };

  const rescored = scoreSkillCandidate(skill, enrichedContext, scoringOptions);
  const disambiguated = rescored.tier === 'HIGH';

  return {
    rescored,
    disambiguated,
    reason: disambiguated
      ? `Disambiguated via cheap context (${cheapContextSignals.fileName || 'metadata'}) to HIGH tier (${rescored.score})`
      : `Remains in ${rescored.tier} tier (${rescored.score}) after cheap context inspection`,
  };
}
