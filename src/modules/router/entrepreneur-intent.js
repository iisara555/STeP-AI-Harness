import { createHash } from 'node:crypto';

// This module does not call a model or an external service. The already-active
// AI host may opt in by supplying a verdict for the privacy-passed request.
// Without a verdict, consequential business language stops for human review.
const BUSINESS_CONTEXT = /(?:ธุรกิจ|กิจการ|บริษัท(?:ของ|ผม|ฉัน)|ผู้ประกอบการ|เป้ารายได้|ยอดขายปีหน้า|ทีมขาย|เซลส์|ปีหน้า.{0,35}รายได้|รายได้.{0,35}ปีหน้า|(?:ร้าน|แบรนด์|ฟาร์ม)[^\s,;?!]{0,12}(?:ของ)?(?:ผม|ฉัน|เรา)|business goal)/i;
const BUSINESS_RISK = /(?:จ้าง|พนักงาน|เซลส์|\bsales\b|สั่ง|ซื้อ(?:ให้|เลย|ทันที|จริง|วัตถุดิบ|สินค้า|เครื่อง|ของ|จาก|โดย)|จัดหา|อนุมัติ|กู้|ลงทุน|เลือกเป้า|ตัดสินเป้า|ฟันธง|รับ[^\n]{0,8}เข้าทำงาน|โอนเงิน|มัดจำ|เปิดสาขา|commit|hire|purchase|invest)/i;
// Acting in the owner's name is consequential even without an annual-goal
// phrase; an owner-action verb with "for me" always needs an intent verdict.
const ON_BEHALF = /(?:แทน|ในนาม)(?:ผม|ฉัน|หนู|เรา)|on my behalf|\bfor me\b/i;
const OWNER_ACT = /(?:จ้าง|รับ[^\n]{0,8}เข้าทำงาน|สั่ง|ซื้อ|โอนเงิน|มัดจำ|จ่ายเงิน|เปิดสาขา|ลงทุน|กู้|เลือกเป้า|ตัดสินเป้า|เซ็นสัญญา|ทำสัญญา|hire|purchase|buy|order|invest|loan|sign)/i;
// Names of STeP, the university, its programmes, other public funders and
// approval roles. A model verdict about the entrepreneur's own business cannot
// release a request that names these. Checked on a normalized copy so spacing,
// dots, zero-width characters and full-width letters do not hide a name.
const ORGANIZATION_NAMES = [
  /(?:^|[^a-z])step(?:[^a-z]|cmu|$)/i,
  /ส[ะ]?เต[็]?[ปบ]/,
  /อุทยาน/, /science[\s_-]*park/i, /(?:ไซ|ซาย)น?์?(?:ส์)?\s*(?:พาร์ค|ปาร์ค)/,
  /(?:^|[^a-z])afp(?:[^a-z]|$)/i, /เอเอฟพี/,
  /(?:^|[^a-z])cmu(?:[^a-z]|$)/i, /chiang\s*mai\s*univ/i,
  /ม\.?\s*เชียงใหม่|มหาวิทยาลัยเชียงใหม่|มหาวิทยาลัย|มหาลัย/,
  /(?:^|[^ก-๙])ม\.?\s?ช\.?(?![ก-๙])/,
  /(?:^|[^a-z])(?:nia|nstda)(?:[^a-z]|$)/i, /สวทช|บพข|สนช|ทางราชการ/,
  /หน่วยงาน|ต้นสังกัด|ส่วนงาน|ฝ่ายการเงิน|ทุนสนับสนุน|เบิกจ่าย|จัดซื้อจัดจ้าง/,
  /บ่มเพาะ|incubat|accelerator/i,
  /สตาร์ทอัพ(?!\s*(?:ของ)?\s*(?:ผม|ฉัน|เรา))|(?:^|[^a-z])startups?(?![a-z])(?!\s*(?:of\s+)?(?:mine|my|our))/i,
  /องค์กร(?!\s*(?:ของ)?\s*(?:ผม|ฉัน|เรา))/,
  /(?<!เป็น)ผู้อำนวยการ(?!\s*(?:ของ)?\s*(?:บริษัท|ร้าน|กิจการ))|(?:^|[^ก-๙])ผอ\.?(?![ก-๙])/,
  // Grant money is an organization's decision only when someone is approving it.
  /(?:อนุมัติ|approve|เคาะ|ตัดสิน|ให้ผ่าน)[^\n]{0,30}(?:รับทุน|ได้ทุน|ให้ทุน|\bgrant\b)/i,
];
// Everyday phrases that contain an organization name by accident.
const ORGANIZATION_FALSE_FRIENDS = /step[\s-]*by[\s-]*step|next\s+steps?|first\s+step|\bsteps?\s+\d|ขั้นตอน/gi;

export function normalizeForScreening(query = '') {
  let text = String(query || '').normalize('NFKC')
    .replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, '');
  // Collapse runs of single letters written apart ("S T e P", "S.T.e.P.",
  // "A F P") into one word so the name checks below see them.
  return text.replace(/(?<![A-Za-z])[A-Za-z](?:[\s._-]+[A-Za-z](?![A-Za-z]))+\.?/g,
    (run) => run.replace(/[\s._-]+/g, ''));
}

export function referencesOrganization(query = '') {
  const text = normalizeForScreening(query).replace(ORGANIZATION_FALSE_FRIENDS, ' ');
  return ORGANIZATION_NAMES.some((pattern) => pattern.test(text));
}

// Evidence that the money or decision belongs to the user's own business: a
// possessive on the business, or a named business owner as the decider. A bare
// "ทีมขาย" or "ในฐานะเจ้าของ" says nothing about whose budget it is.
export function hasOwnBusinessProof(query = '') {
  const text = normalizeForScreening(query);
  return isPrivateBusinessContext(text)
    || /(?:ร้าน|แบรนด์|ฟาร์ม|โรงงาน)[^\s,;?!]{0,12}(?:ของ)?(?:ผม|ฉัน|เรา)/.test(text)
    || /เจ้าของ(?:กิจการ|ธุรกิจ|ร้าน|บริษัท)/.test(text)
    // A draft handed to the owner to decide names who holds the money.
    || /(?:ให้|เสนอ|ส่ง)\s*เจ้าของ\s*(?:พิจารณา|ตัดสิน|อนุมัติ|เลือก|ตรวจ)/.test(text);
}

// Stricter proof for lifting a budget gate: the possessive must sit on the
// money itself ("วงเงินโฆษณาของบริษัทผม", "งบลงทุนของร้านเรา"), or the
// request must hand the decision to the owner. "วงเงิน ศูนย์ ให้เซลส์ของ
// บริษัทผม" names the sales team as the business's, not the budget.
const MONEY = '(?:งบ(?!ริษัท)(?:ประมาณ)?|วงเงิน|เงินลงทุน|เงินทุน|ทุนหมุนเวียน|เงินสด|budget)';
// The money word may carry a short qualifier ("วงเงินโฆษณา") but not a
// recipient ("วงเงินศูนย์ให้เซลส์") or an agency phrase ("งบลงทุนในนามผม"
// says who acts, not whose money it is).
const OWN_MONEY = new RegExp(`${MONEY}(?:(?!ให้|แก่|สำหรับ|ในนาม|แทน)[ก-๙a-z]){0,10}\\s?(?:ของ\\s?)?(?:(?:บริษัท|ร้าน|กิจการ|ธุรกิจ|แบรนด์|ฟาร์ม)(?:ของ)?\\s?)?(?:ผม|ฉัน|เรา|หนู)`, 'i');
const OWNER_DECIDES = /(?:ให้|เสนอ|ส่ง)\s*เจ้าของ(?:กิจการ|ธุรกิจ|ร้าน|บริษัท)?\s*(?:พิจารณา|ตัดสิน|อนุมัติ|เลือก|ตรวจ)/;

export function hasOwnBudgetProof(query = '') {
  const text = normalizeForScreening(query);
  return OWN_MONEY.test(text) || OWNER_DECIDES.test(text);
}

// A request that only asks a question or asks for analysis about an owner's
// act, with no instruction to carry it out, does not need an intent verdict.
// Every clause that names an act must itself be framed as a question,
// hypothesis, negation or analysis; any command marker disqualifies it.
const ACT_VERB = /(?:จ้าง|สั่ง|ซื้อ|อนุมัติ|โอน|กู้|ลงทุน|รับ[^\s]{0,8}เข้าทำงาน|เปิดสาขา|เลือกเป้า|ตัดสินเป้า|ฟันธง|hire|purchase|buy|order|invest|loan|approve)/i;
const CLAUSE_FRAME = /(?:ไหม|มั้ย|หรือเปล่า|หรือไม่|เท่าไร|เท่าไหร่|กี่|แบบไหน|อย่างไร|ยังไง|คุ้ม|ถ้า|หาก|ควร|วิเคราะห์|คำนวณ|ประเมิน|ประมาณ|เปรียบเทียบ|ไม่ต้อง|ไม่ได้|\?|should|how many|how much|whether|\bif\b)/i;
const COMMAND_MARKER = /(?:กรุณา|โปรด|ขอให้|ให้คุณ|จากนั้น|ในนาม|แทน(?:ผม|ฉัน|หนู|เรา)|on my behalf|\bfor me\b|\bnow\b|\bplease\b|(?:ให้เลย|ทันที|ให้หน่อย|ให้ด้วย)(?!\s*(?:ไหม|มั้ย|หรือ|จะ|ดี|คุ้ม))|(?:จ้าง|สั่ง|ซื้อ|อนุมัติ|โอน|กู้|ลงทุน)[^\s]{0,15}?เลย(?!\s*(?:ไหม|มั้ย|หรือ|ดี|คุ้ม|จะ))|ช่วย\s*(?:กด)?(?:จ้าง|สั่ง|ซื้อ|อนุมัติ|โอน|กู้|ลงทุน|รับ|เลือกเป้า|ฟันธง)|แล้ว\s*(?:ก็)?\s*(?:จ้าง|สั่ง|ซื้อ|อนุมัติ|โอน|กู้|ลงทุน|รับ))/i;

export function isAnalysisOnly(query = '') {
  const text = normalizeForScreening(query);
  if (COMMAND_MARKER.test(text)) return false;
  if (!ACT_VERB.test(text)) return true;
  const clauses = text.split(/[\s,;.!?\n]+|และ|จากนั้น/).filter(Boolean);
  return clauses.every((clause) => !ACT_VERB.test(clause) || CLAUSE_FRAME.test(clause));
}
const DECISIONS = new Set(['ADVISORY', 'COMMIT', 'UNCERTAIN']);
const OWNERS = new Set(['business-owner', 'step', 'unknown']);
const ACTS = new Set(['goal', 'hire', 'invest', 'purchase', 'loan', 'other']);
const HOST_FIELDS = ['act', 'decision', 'owner'];
const CLI_FIELDS = ['act', 'decision', 'owner', 'queryHash'];
const DEFAULT_TIMEOUT_MS = 3000;

export function needsEntrepreneurIntentReview(query = '', selectedSkillName = '') {
  const text = String(query || '');
  if (ON_BEHALF.test(text) && OWNER_ACT.test(text)) return true;
  return BUSINESS_RISK.test(text)
    && (selectedSkillName === 'entrepreneur-annual-goal' || BUSINESS_CONTEXT.test(text));
}

// A reference to STeP funding does not make the entrepreneur's hiring or
// investment a STeP budget approval. Require an explicit approval of a budget
// whose owner is STeP to retain the organization's finance authority.
export function isExplicitStepBudgetApproval(query = '') {
  const text = String(query);
  return /(?:อนุมัติ(?:งบ|วงเงิน)|เคาะงบ|โอนงบ)[^,;?!\n]{0,35}(?:ของ|สำหรับ|โครงการ)\s*(?:step\b|อุทยานวิทยาศาสตร์|มช\.)/i.test(text)
    || /(?:อนุมัติงบ(?:ประมาณ)?|อนุมัติวงเงิน|เคาะงบ|โอนงบ)\s*(?:step\b|อุทยานวิทยาศาสตร์|มช\.)/i.test(text);
}

export function isPrivateBusinessContext(query = '') {
  return /(?:บริษัท|กิจการ|ธุรกิจ)(?:ของ)?(?:ผม|ฉัน|เรา)|(?:บริษัท|กิจการ|ธุรกิจ)[^,;?!\n]{0,28}(?:ของผม|ของฉัน|ของเรา)/i.test(String(query));
}

function validVerdict(value, withHash, hash) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const expected = withHash ? CLI_FIELDS : HOST_FIELDS;
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return false;
  if (withHash && value.queryHash !== hash) return false;
  return DECISIONS.has(value.decision) && OWNERS.has(value.owner) && ACTS.has(value.act);
}

/** A model verdict is a classification, never a business or STeP approval. */
export async function classifyEntrepreneurIntent(query, {
  selectedSkillName = '', privacyAction = 'pass', forceReview = false, intentAssessment,
  intentClassifier, intentTimeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!forceReview && !needsEntrepreneurIntentReview(query, selectedSkillName)) return null;
  const queryHash = createHash('sha256').update(String(query)).digest('hex');
  const pending = (reasonCode, maySendToHost = false) => ({
    status: 'NEEDS_HOST', queryHash, reasonCode,
    ...(maySendToHost ? { sanitizedQuery: query } : {}),
  });
  if (privacyAction !== 'pass') return pending('privacy-review-required');
  if (intentClassifier && intentAssessment) return pending('conflicting-classifiers', true);

  let verdict = intentAssessment;
  if (typeof intentClassifier === 'function') {
    let timer;
    try {
      const timeout = Number.isFinite(intentTimeoutMs)
        ? Math.min(10000, Math.max(1, intentTimeoutMs)) : DEFAULT_TIMEOUT_MS;
      verdict = await Promise.race([
        Promise.resolve().then(() => intentClassifier(query)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('intent-timeout')), timeout); }),
      ]);
    } catch {
      return pending('classifier-unavailable', true);
    } finally {
      clearTimeout(timer);
    }
  } else if (intentClassifier !== undefined) {
    return pending('invalid-classifier', true);
  }
  if (verdict === undefined) return pending('opt-in-required', true);
  if (!validVerdict(verdict, typeof intentClassifier !== 'function', queryHash)) {
    return pending('invalid-assessment', true);
  }
  if (verdict.decision === 'UNCERTAIN' || verdict.owner === 'unknown') {
    return pending('uncertain-intent', true);
  }
  return {
    status: 'RESOLVED', queryHash,
    decision: verdict.decision, owner: verdict.owner, act: verdict.act,
  };
}
