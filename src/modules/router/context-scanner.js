/**
 * Context Scanner for STeP Skill Router
 * Cheaply inspects folder paths, file extensions, and user request intent.
 * Also provides cheap context disambiguation for ambiguous scoring tiers.
 */

import { extname, basename, dirname } from 'node:path';
import { scoreSkillCandidate } from './scorer.js';

export const BRAND_REVIEW_SIGNALS = ['brand', 'tone of voice', 'น้ำเสียงแบรนด์', 'โลโก้', 'logo', 'identity', 'บุคลิกแบรนด์', 'ตราสัญลักษณ์', 'คู่มือแบรนด์', 'ci guideline'];

export const QUALIFIED_INTENT_RULES = [
  {
    intent: 'privacy-review',
    any: ['เลขบัตรประชาชน', 'เลขบัตร', 'ข้อมูลส่วนบุคคล', 'pii', 'pdpa', 'credential', 'password', 'ข้อมูลสุขภาพ'],
  },
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
  {
    intent: 'market-test',
    any: ['ขายได้ไหม', 'จะขายได้ไหม', 'ทดสอบตลาด', 'ทดลองตลาด', 'market test', 'test market'],
  },
  {
    intent: 'onboarding-plan',
    allAny: [
      ['น้องใหม่', 'พนักงานใหม่', 'คนใหม่', 'new hire', 'onboarding'],
      ['เตรียม', 'เข้ามา', 'เริ่มงาน', 'เดือนหน้า', 'onboarding'],
    ],
  },
  {
    intent: 'nonconformity',
    any: ['ไม่ได้มาตรฐาน', 'ไม่เป็นไปตามข้อกำหนด', 'ข้อไม่เป็นไปตามข้อกำหนด', 'เปิด nc', 'เปิด ncr', 'nonconformity', 'non-conformity'],
  },
];

function matchesQualifiedIntent(lower, rule) {
  if (rule.any?.some((term) => lower.includes(term))) return true;
  if (rule.allAny) {
    return rule.allAny.every((group) => group.some((term) => lower.includes(term)));
  }
  return false;
}

export const INTENT_KEYWORDS = {
  summarize: ['สรุป', 'ย่อ', 'ถอดมติ', 'รวบรวม', 'summarize', 'summary', 'minutes'],
  interview: ['สัมภาษณ์ลูกค้า', 'customer interview', 'mom test', 'สัมภาษณ์ audit', 'audit interview', 'interview coach'],
  review: ['ตรวจ', 'รีวิว', 'เช็ก', 'ตรวจสอบ', 'ทบทวน', 'ความครบถ้วน', 'ครบถ้วน', 'ช่วยดู', 'review', 'check', 'audit', 'evaluate'],
  fill: ['กรอก', 'จองห้อง', 'ขอใช้ห้อง', 'ลงทะเบียน', 'fill', 'book', 'register'],
  create: ['จัดทำ', 'ยกร่าง', 'ร่าง', 'สร้าง', 'เขียน', 'ออกแบบ', 'ดีไซน์', 'แต่ง', 'ทำสไลด์', 'ทำบรีฟ', 'ทำแบบ', 'ขอ prompt ภาพ', 'ขอ prompt รูป', 'ขอ prompt โปสเตอร์', 'prompt ภาพโปสเตอร์', 'prompt งานสัมมนา', 'create', 'draft', 'write', 'generate', 'design'],
  plan: ['วางแผน', 'แผนงาน', 'กะเวลา', 'ไทม์ไลน์', 'milestone', 'plan', 'schedule', 'gantt', 'ไทมไลน์'],
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
  const lower = promptText.toLowerCase();

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

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return intent;
    }
  }

  return 'unknown';
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
