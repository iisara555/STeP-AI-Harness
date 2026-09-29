import { createHash } from 'node:crypto';

// This module does not call a model or an external service. The already-active
// AI host may opt in by supplying a verdict for the privacy-passed request.
// Without a verdict, consequential business language stops for human review.
const BUSINESS_CONTEXT = /(?:ธุรกิจ|กิจการ|บริษัท(?:ของ|ผม|ฉัน)|ผู้ประกอบการ|โรงงาน|\bsme\b|เป้ารายได้|ยอดขายปีหน้า|ทีมขาย|เซลส์|ปีหน้า.{0,35}รายได้|รายได้.{0,35}ปีหน้า|(?:ร้าน|แบรนด์|ฟาร์ม)[^\s,;?!]{0,12}(?:ของ)?(?:ผม|ฉัน|เรา)|business goal|(?:เพจ|ร้าน|แบรนด์|โรงงาน)[^\s,;?!]{0,16}ของ(?:ผม|ฉัน|เรา)|\b(?:my|our)\s+(?:company|business|shop|store|startup|firm|factory)\b)/i;
const BUSINESS_RISK = /(?:จ้าง|พนักงาน|เซลส์|\bsales\b|สั่ง|ซื้อ(?:ให้|เลย|ทันที|จริง|วัตถุดิบ|สินค้า|เครื่อง|ของ|จาก|โดย)|จัดหา|อนุมัติ|กู้|สินเชื่อ|เบิกเงินเกินบัญชี|ลงทุน|เล่นหุ้น|ชำระ|ขึ้นเงินเดือน|เพิ่มคน|ปิดดีล|จ่าย(?:เงิน|ค่า)|เช่า(?:โกดัง|ที่|อาคาร|พื้นที่|ตึก|ร้าน|เครื่อง|รถ)|เลือกเป้า|ตัดสินเป้า|กำหนดเป้า|เป้าจริง|ฟันธง|รับ[^\n]{0,8}เข้าทำงาน|โอนเงิน|มัดจำ|เปิดสาขา|commit|hire|purchase|\bbuy\b|\bpay\b|invest|\bloan\b)/i;
// Acting in the owner's name is consequential even without an annual-goal
// phrase; an owner-action verb with "for me" always needs an intent verdict.
const ON_BEHALF = /(?:แทน|ในนาม)(?:ผม|ฉัน|หนู|เรา|เค้า|เขา|เจ้าของ|บริษัท)|on my behalf|\bfor me\b/i;
const OWNER_ACT = /(?:จ้าง|เพิ่มคน|ขึ้นเงินเดือน|ปิดดีล|รับ[^\n]{0,8}เข้าทำงาน|สั่ง|ซื้อ|โอนเงิน|มัดจำ|จ่าย|ชำระ|สินเชื่อ|เช่า|เปิดสาขา|ลงทุน|กู้|เลือกเป้า|ตัดสินเป้า|เซ็นสัญญา|ทำสัญญา|hire|purchase|buy|order|invest|loan|sign|\bpay\b)/i;
// Names of STeP, the university, its programmes and approvers, and any
// outside source of money. After an ADVISORY verdict a request that names one
// of these still goes to a human (review round 4): the list errs towards
// over-blocking, and position in the sentence does not matter.
const ORGANIZATION_NAMES = [
  /(?:^|[^a-z])(?:steps?|stp|stepark|cmu|afp|nia|nstda|depa|boi|ted|nrct|univ(?:ersity)?)(?:[^a-z]|$)/i,
  /step(?:cmu|park)|cmustep/i, /chiang\s*mai\s*univ/i, /sci(?:ence)?[\s_-]*park|(?:^|[^a-z])park(?:[^a-z]|$)/i,
  /ted\s*fund|\bgrants?\b|\bfunding\b|\bsubsid/i,
  /พาร์ค|ปาร์ค|เอเอฟพี|ดีป้า|บีโอไอ|แม่โจ้|มอชอ|(?<![ก-๙])มอ(?![ก-๙])|ทุนมอ(?!บ|เตอร์)/,
  /ม\.?\s*เชียงใหม่|มหาวิทยาลัย|มหาลัย/,
  // Keep punctuated/spaced university abbreviations as well as contiguous มช;
  // the latter alone cannot see "ม.ช." or "ม ช" after normalization.
  /ม\s*[.\-]\s*ช(?:\.(?![ก-๙])|(?![.ก-๙]))|(?<![ก-๙])ม\s+ช(?![\u0e30-\u0e3a\u0e47-\u0e4eอวยรลนา])|มช(?![\u0e30-\u0e3a\u0e47-\u0e4eอวยรลนา])/,
  /สวทช|บพข|บพท|สนช|สสว|สกสว|วช\.|อว\.|(?<![ก-๙])(?:อว|วช)(?![ก-๙])|กระทรวง|กรม(?!ธรรม์)|ราชการ|(?<!สห)รัฐ|สำนักงานนวัตกรรม|นวัตกรรมแห่งชาติ/,
  /หน่วยงาน|ต้นสังกัด|ส่วนงาน|ฝ่ายการเงิน|เบิกจ่าย|จัดซื้อจัดจ้าง|งบกลาง|งบประมาณแผ่นดิน/,
  // Outside money: prizes, grants, subsidies, money someone else gave.
  /รางวัล|ให้เปล่า|อุดหนุน|สนับสนุน|แกรนต์|ที่ได้(?:รับ)?มา|ได้รับจาก|ที่ได้จาก|ให้มา|(?<!ต้น|ลง|เงิน|คืน|คุ้ม|ร่วม|ระดม|ทำ)ทุน(?!หมุนเวียน|จดทะเบียน|นิยม|ส่วนตัว|ของ(?:ผม|ฉัน|เรา|บริษัท|ร้าน))/,
  /บ่มเพาะ|incubat|accelerator/i,
  /โครงการ(?!ของ(?:ผม|ฉัน|เรา|บริษัท|ร้าน)|คอนโด|บ้าน|หมู่บ้าน)/,
  /สตาร์ทอัพ(?!\s*(?:ของ)?\s*(?:ผม|ฉัน|เรา))|(?:^|[^a-z])startups?(?![a-z])(?!\s*(?:of\s+)?(?:mine|my|our))(?!\s*(?:ของ)?\s*(?:ผม|ฉัน|เรา))/i,
  /องค์กร(?!\s*(?:ของ)?\s*(?:ผม|ฉัน|เรา))/,
  /(?<!เป็น)ผู้อำนวยการ(?!\s*(?:ของ)?\s*(?:บริษัท|ร้าน|กิจการ))|ผอ(?!ม)|คณบดี|อธิการ|หัวหน้าศูนย์/,
];
// Thai names checked with spaces, dots and tone marks removed, so "ส เต็ ป",
// "ส.เต็ป", "สเต๊ป", "สแตป", "เอสเทป", "อทุยาน" are caught.
const COMPACT_THAI_NAMES = /[สซ]ะ?[เแ]ต็?[ปบพ]|เอส(?:ที|เท)(?:อี)?(?:พี|ป)?|อุ?ทุ?ยา[นณ]|อทุยา[นณ]|ซีเอ็มยู|มหาวิทยาลัย|ผู้อำนวยการ/;
// Everyday phrases that contain "step" by accident. Only "step"/"Step" is
// removed; "STeP", "STEP" and other mixed case always count as the name.
const ORGANIZATION_FALSE_FRIENDS = /[Ss]tep[\s-]*by[\s-]*[Ss]tep|next\s+[Ss]teps?|first\s+[Ss]tep|\b[Ss]teps?\s+\d|(?:\d+|few|the|these|those|two|three|four|five)\s+steps\b/g;
// Look-alike letters folded to Latin before names are checked.
const CONFUSABLES = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', Ѕ: 'S', І: 'I', Ј: 'J',
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', ѕ: 's', і: 'i', ј: 'j', т: 't', п: 'n',
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X',
  ο: 'o', ρ: 'p', τ: 't', ε: 'e', ι: 'i', κ: 'k', ν: 'v', υ: 'u', χ: 'x', α: 'a', μ: 'u',
  ꜱ: 's', ᴛ: 't', ᴇ: 'e', ᴘ: 'p', ᴄ: 'c', ᴍ: 'm', ᴜ: 'u', ᴀ: 'a', ꜰ: 'f', ɴ: 'n', ɪ: 'i', ʙ: 'b', ᴏ: 'o', ᴅ: 'd',
  $: 's', '@': 'a',
};
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b' };
const FOREIGN_LETTER = /[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Armenian}\p{Script=Cherokee}\u1d00-\u1dbf\ua720-\ua7ff]/u;

export function normalizeForScreening(query = '') {
  const text = String(query || '')
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(Number(dec)))
    // Percent-encoded letters ("%53TeP") are decoded like HTML entities.
    .replace(/%([46][1-9a-f]|[57][0-9a])/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .normalize('NFKC')
    // NFKC splits Thai sara am (ำ) into nikhahit + sara aa; put it back.
    .replace(/\u0e4d\u0e32/g, 'ำ')
    // Invisible format characters (ZWSP, ZWJ in emoji, soft hyphen, BOM) are
    // removed, not treated as a disguise: they arrive from copy-paste.
    .replace(/\p{Cf}/gu, '');
  // Join short Latin pieces split by spaces or symbols ("S TeP", "S.Te.P",
  // "S*T*e*P", "ST eP") so the name checks see one word. Longer words are
  // left alone so ordinary English ("best episode") is not glued together.
  return text.replace(/(?<![A-Za-z])[A-Za-z$]{1,3}(?:[^\p{L}\p{N}\n]{1,3}[A-Za-z$]{1,3}(?![A-Za-z]))+/gu,
    (run) => run.replace(/[^A-Za-z$]+/g, ''));
}

// Fold one Latin-looking word to a plain-ASCII skeleton: marks removed,
// look-alikes and leet digits mapped, doubled letters squeezed.
function skeleton(word) {
  return word.normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/./gu, (char) => CONFUSABLES[char] || char)
    .replace(/\d/g, (digit) => LEET[digit])
    .toLowerCase()
    .replace(/([a-z])\1+/g, '$1');
}
const NAME_SKELETONS = /^(?:steps?|stp|stepark|stepcmu|cmustep|cmu|afp|nia|nstda|depa|boi|ted|nrct|park|scipark|sciencepark|grants?|univ(?:ersity)?)$/;

function disguisedName(text) {
  // Non-Thai runs only, so "ด้วย$TEP" still yields "$TEP".
  const words = text.match(/[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\u1d00-\u1dbf\ua720-\ua7ff\d$@][\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\u1d00-\u1dbf\ua720-\ua7ff\p{Mn}\d$@]*/gu) || [];
  return words.some((word) => {
    if (!/[\p{L}$@]/u.test(word)) return false;
    const folded = skeleton(word);
    if (NAME_SKELETONS.test(folded) || NAME_SKELETONS.test([...folded].reverse().join(''))) return true;
    // Latin mixed with look-alike letters inside one word is a disguise; a
    // Greek symbol on its own ("Δ", "μ") or an accented word ("café") is not.
    return FOREIGN_LETTER.test(word) && /[A-Za-z]/.test(word);
  });
}

export function referencesOrganization(query = '') {
  const text = normalizeForScreening(query).replace(ORGANIZATION_FALSE_FRIENDS, ' ');
  if (disguisedName(text)) return true;
  const compact = text.replace(/[\s.\-_*·]+/g, '').replace(/[่้๊๋]/g, '');
  return ORGANIZATION_NAMES.some((pattern) => pattern.test(text))
    || COMPACT_THAI_NAMES.test(compact) || COMPACT_THAI_NAMES.test(compact.replace(/็/g, ''));
}

// Evidence that the request concerns the user's own business: a possessive on
// the business, or a named business owner. It never releases a budget gate;
// scope-guard uses it only to keep an owner's own plan out of startup intake.
export function hasOwnBusinessProof(query = '') {
  const text = normalizeForScreening(query);
  return isPrivateBusinessContext(text)
    || /(?:ร้าน|แบรนด์|ฟาร์ม|โรงงาน)[^\s,;?!]{0,12}(?:ของ)?(?:ผม|ฉัน|เรา)/.test(text)
    || /เจ้าของ(?:กิจการ|ธุรกิจ|ร้าน|บริษัท)/.test(text);
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
