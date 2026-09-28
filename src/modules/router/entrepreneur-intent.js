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
// Names of STeP, the university, its programmes, public funders and approval
// roles. A model verdict about the entrepreneur's own business cannot release
// a request that names these. Names are matched on normalized copies of the
// text; anything that looks like a disguised name (mixed scripts, invisible
// characters, marks on Latin letters) counts as a name, so the gate fails
// closed instead of relying on an ever-longer list of spellings.
const ORGANIZATION_NAMES = [
  /(?:^|[^a-z]|cmu)steps?(?:[^a-z]|cmu|$)/i,
  /(?:^|[^a-z])cmu/i, /chiang\s*mai\s*univ/i, /(?:^|[^a-z])univ(?:ersity)?(?:[^a-z]|$)/i,
  /science[\s_-]*park/i, /(?:^|[^a-z])(?:afp|nia|nstda|depa)(?:[^a-z]|$)/i, /ted\s*fund/i,
  /(?:ไซ|ซาย)(?:น|เอน|แอน)?[ซส]?์?(?:ส์)?\s*(?:พาร์ค|ปาร์ค)/, /เอเอฟพี/, /ดีป้า/, /บีโอไอ|(?:^|[^a-z])boi(?:[^a-z]|$)/i, /แม่โจ้/,
  /ม\.?\s*เชียงใหม่|มหาวิทยาลัย|มหาลัย/,
  /(?:^|[^ก-๙])ม\.?\s?ช\.?(?![ก-๙])/,
  /สวทช|บพข|สนช|สสว|ทางราชการ|ภาครัฐ|รัฐบาล|กองทุนรัฐ|ทุนรัฐ|สำนักงานนวัตกรรม|นวัตกรรมแห่งชาติ/,
  /หน่วยงาน|ต้นสังกัด|ส่วนงาน|ฝ่ายการเงิน|ทุนสนับสนุน|เบิกจ่าย|จัดซื้อจัดจ้าง|งบกลาง|งบประมาณแผ่นดิน/,
  /บ่มเพาะ|incubat|accelerator/i,
  /สตาร์ทอัพ(?!\s*(?:ของ)?\s*(?:ผม|ฉัน|เรา))|(?:^|[^a-z])startups?(?![a-z])(?!\s*(?:of\s+)?(?:mine|my|our))/i,
  /องค์กร(?!\s*(?:ของ)?\s*(?:ผม|ฉัน|เรา))/,
  /(?<!เป็น)ผู้อำนวยการ(?!\s*(?:ของ)?\s*(?:บริษัท|ร้าน|กิจการ))|(?:^|[^ก-๙]|ท่าน)ผอ\.?(?![ก-๙])|ท่าน\s?ผอ/,
  /คณบดี|อธิการ|หัวหน้าศูนย์|รองผู้อำนวยการ/,
  // Grant money is an organization's decision only when someone is approving it.
  /(?:อนุมัติ|approve|เคาะ|ตัดสิน|ให้ผ่าน)[^\n]{0,30}(?:รับทุน|ได้ทุน|ให้ทุน|\bgrant\b)/i,
];
// Thai names checked with spaces, dots and tone marks removed, so "ส เต็ ป",
// "ส.เต็ป", "สเต๊ป" and "อุ ท ยาน" are caught.
const COMPACT_THAI_NAMES = /สะ?เต[็๊่้]?[ปบ]|อุทยาน|เอสทีอีพี|ซีเอ็มยู|มหาวิทยาลัย|ผู้อำนวยการ/;
// Everyday lowercase phrases that contain "step" by accident. Case-sensitive
// on purpose: "STeP", "Step" and "STEP" are never removed.
const ORGANIZATION_FALSE_FRIENDS = /step[\s-]*by[\s-]*step|next\s+steps?|first\s+step|\bsteps?\s+\d|(?:\d+|few|the|these|those|two|three|four|five)\s+steps\b/g;
// Letters from scripts a Thai/English request has no reason to mix in, marks
// on Latin letters, and invisible format characters.
const DISGUISE = /[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Armenian}\p{Script=Cherokee}]|[A-Za-z][\p{M}]|\p{Cf}/u;
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b' };

export function normalizeForScreening(query = '') {
  let text = String(query || '').normalize('NFKC')
    // NFKC splits Thai sara am (ำ) into nikhahit + sara aa; put it back.
    .replace(/\u0e4d\u0e32/g, 'ำ')
    .replace(/\p{Cf}/gu, '');
  // Collapse runs of single Latin letters written apart by any non-letter
  // ("S T e P", "S.T.e.P.", "S*T*e*P", "S🙂T🙂e🙂P") into one word.
  return text.replace(/(?<![A-Za-z])[A-Za-z](?:[^\p{L}\p{N}\n]+[A-Za-z](?![A-Za-z]))+[.]?/gu,
    (run) => run.replace(/[^A-Za-z]+/g, ''));
}

export function referencesOrganization(query = '') {
  const raw = String(query || '');
  if (DISGUISE.test(raw.normalize('NFD').replace(/[\u0e00-\u0e7f]/g, ''))) return true;
  const text = normalizeForScreening(raw).replace(ORGANIZATION_FALSE_FRIENDS, ' ');
  const leet = text.replace(/[A-Za-z0-9]+/g, (token) => (/[A-Za-z]/.test(token) && /\d/.test(token)
    ? token.replace(/\d/g, (digit) => LEET[digit] || digit) : token));
  const compact = text.replace(/[\s.\-_*·]+/g, '').replace(/[่้๊๋]/g, '');
  return ORGANIZATION_NAMES.some((pattern) => pattern.test(text) || pattern.test(leet))
    || COMPACT_THAI_NAMES.test(compact) || COMPACT_THAI_NAMES.test(compact.replace(/[็]/g, ''));
}

// Evidence that the decision belongs to the user's own business: a possessive
// on the business, or a named business owner as the decider. A bare "ทีมขาย"
// or "ในฐานะเจ้าของ" says nothing about whose budget it is.
export function hasOwnBusinessProof(query = '') {
  const text = normalizeForScreening(query);
  return isPrivateBusinessContext(text)
    || /(?:ร้าน|แบรนด์|ฟาร์ม|โรงงาน)[^\s,;?!]{0,12}(?:ของ)?(?:ผม|ฉัน|เรา)/.test(text)
    || /เจ้าของ(?:กิจการ|ธุรกิจ|ร้าน|บริษัท)/.test(text)
    || OWNER_DECIDES.test(text);
}

// Stricter proof for lifting a budget gate. Either the money itself carries a
// business possessive ("วงเงินโฆษณาของบริษัทผม", "งบลงทุนของร้านเรา") or the
// decision is handed to the owner, or the request is a question about the
// user's own business with no order in it. "ของเรา" alone is not proof: staff
// say it about their unit's money too. Money that came from somewhere else
// ("ที่ได้จาก…", "งบกลาง", "…ให้มา") is never the owner's to release.
const MONEY = '(?:งบ(?!ริษัท)(?:ประมาณ)?|วงเงิน|เงินลงทุน|เงินทุน|ทุนหมุนเวียน|เงินสด|budget)';
const BUSINESS_OWNER = '(?:บริษัท|ร้าน|กิจการ|ธุรกิจ|แบรนด์|ฟาร์ม)(?:ของ)?\\s?(?:ผม|ฉัน|เรา|หนู)';
// The money word may carry a short qualifier ("วงเงินโฆษณา") but not a
// recipient ("วงเงินศูนย์ให้เซลส์") or an agency phrase ("ในนามผม").
const OWN_MONEY = new RegExp(`${MONEY}(?:(?!ให้|แก่|สำหรับ|ในนาม|แทน)[ก-๙a-z]){0,10}\\s?(?:ของ\\s?)?${BUSINESS_OWNER}`, 'i');
const OWNER_DECIDES = /(?:ให้|เสนอ|ส่ง)\s*เจ้าของ(?:กิจการ|ธุรกิจ|ร้าน|บริษัท)?\s*(?:พิจารณา|ตัดสิน|อนุมัติ|เลือก|ตรวจ)/;
const OTHER_MONEY = /(?:เงิน|งบ(?!ริษัท)|budget)[^\n]{0,24}จาก|ที่ได้(?:รับ)?จาก|ได้รับจาก|ให้มา|งบกลาง|งบประมาณแผ่นดิน|กองทุน|ทุนสนับสนุน|คณะ|ศูนย์|สำนักงาน|ผู้บริหาร|โครงการ(?!ของ(?:บริษัท|ร้าน))/;
const MONEY_QUESTION = /(?:ควร|เท่าไร|เท่าไหร่|ดีไหม|ไหม|มั้ย|หรือไม่|ดี|\?)\s*$/;
const MONEY_ORDER = /(?:ให้เลย|ทันที|เลย(?:\s*(?:ครับ|ค่ะ|คะ|นะ|จ้ะ|จ้า))*\s*$|\bnow\b|โอน|อนุมัติ)/i;

export function hasOwnBudgetProof(query = '') {
  const text = normalizeForScreening(query).trim();
  if (OTHER_MONEY.test(text)) return false;
  if (OWN_MONEY.test(text) || OWNER_DECIDES.test(text)) return true;
  const ownerAsking = isPrivateBusinessContext(text) || /เจ้าของ(?:กิจการ|ธุรกิจ|ร้าน|บริษัท)/.test(text);
  return ownerAsking && MONEY_QUESTION.test(text) && !MONEY_ORDER.test(text);
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
