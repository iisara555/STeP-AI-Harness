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
// Names of STeP, its programmes and its approval roles. A model verdict about
// the entrepreneur's own business cannot release a request that names these.
const ORGANIZATION_REFERENCE = /(?:\bstep\b|สเต็ป|อุทยาน|science\s*park|\bafp\b|มช\.?|มหาวิทยาลัย|บ่มเพาะ|incubat|accelerator|รับทุน|ได้ทุน|ให้ทุน|\bgrant\b|สตาร์ทอัพ|startup|ผู้อำนวยการ|ผอ\.|องค์กร|ส่วนงาน|เบิกจ่าย|จัดซื้อจัดจ้าง|โครงการ(?!ของ(?:ผม|ฉัน|บริษัท))|พนักงาน\s*step)/i;
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

export function referencesOrganization(query = '') {
  return ORGANIZATION_REFERENCE.test(String(query || ''));
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
