import { createHash } from 'node:crypto';

const scanCache = new Map();
export const PRIVACY_CACHE_LIMIT = 256;

const DATE_DIGIT = '[0-9๐-๙]';
const DATE_MONTH = '(?:มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|ม\\.ค\\.|ก\\.พ\\.|มี\\.ค\\.|เม\\.ย\\.|พ\\.ค\\.|มิ\\.ย\\.|ก\\.ค\\.|ส\\.ค\\.|ก\\.ย\\.|ต\\.ค\\.|พ\\.ย\\.|ธ\\.ค\\.|January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
const DATE_YEAR = `(?:(?:พ\\.ศ\\.|ค\\.ศ\\.)[ \\t]*)?${DATE_DIGIT}{4}`;
// Consume an explicit date only. Unrecognized birth-date values retain their
// label and go to human review instead of consuming the next field.
const BIRTH_DATE_PATTERN = new RegExp(
  `(?:วัน(?:เดือนปี)?เกิด|\\bdate[ \\t]*of[ \\t]*birth\\b|\\bdob\\b)[ \\t]*[:：=]?[ \\t]*(?:`
  + `${DATE_DIGIT}{4}[-/.]${DATE_DIGIT}{1,2}[-/.]${DATE_DIGIT}{1,2}`
  + `|${DATE_DIGIT}{1,2}[-/.]${DATE_DIGIT}{1,2}[-/.]${DATE_DIGIT}{4}`
  + `|${DATE_DIGIT}{1,2}[ \\t]+${DATE_MONTH}[ \\t]+${DATE_YEAR}`
  + `|${DATE_MONTH}[ \\t]+${DATE_DIGIT}{1,2},?[ \\t]+${DATE_YEAR}`
  + `)(?!${DATE_DIGIT}|[-/.]${DATE_DIGIT}|\\p{L})`, 'giu');

const PATTERNS = [
  {
    id: 'person-name',
    label: 'ชื่อบุคคล',
    class: 'restricted',
    regex: /(?:ชื่อ(?:พนักงาน|ผู้รับบริการ|บุคคล|ผู้ติดต่อ|จริง|[ -]นามสกุล)?|นามสกุล|ผู้เข้าอบรม|ผู้สมัคร)\s*[:：]\s*[^\r\n,;|\t]{1,120}|\b(?:employee\s*name|full\s*name|contact\s*name|first\s*name|last\s*name|surname)\s*[:：]\s*[^\r\n,;|\t]{1,120}/gi,
    replacement: '[ชื่อบุคคลถูกปิดบัง]',
  },
  {
    id: 'thai-titled-name',
    label: 'ชื่อบุคคลพร้อมคำนำหน้า',
    class: 'restricted',
    regex: /(?<![ก-๙])(?:นาย(?!ทะเบียน|จ้าง|ก|หน้า|อำเภอ)|นางสาว|นาง|น\.ส\.)[ \t]*[ก-๙]{2,}(?:[ \t]+[ก-๙]{2,})?/g,
    replacement: '[ชื่อบุคคลถูกปิดบัง]',
  },
  {
    id: 'passport', label: 'หนังสือเดินทาง', class: 'restricted',
    regex: /(?:\bpassport(?:\s*(?:number|no\.?))?|หนังสือเดินทาง)\s*[:：#]?\s*[A-Z0-9]{6,12}\b/gi,
    replacement: '[หนังสือเดินทางถูกปิดบัง]',
  },
  {
    id: 'driving-license', label: 'ใบขับขี่', class: 'restricted',
    regex: /(?:ใบ(?:อนุญาต)?ขับขี่|driver'?s?\s*licen[cs]e(?:\s*(?:number|no\.?))?)\s*[:：#]?\s*[A-Z0-9][A-Z0-9 -]{4,24}[A-Z0-9]/gi,
    replacement: '[ใบขับขี่ถูกปิดบัง]',
  },
  {
    id: 'line-id', label: 'Line ID', class: 'restricted',
    regex: /(?:\bline\s*(?:id|ไอดี)|ไลน์(?:ไอดี)?)\s*[:：=]?\s*[a-z0-9._-]{2,30}/gi,
    replacement: '[Line ID ถูกปิดบัง]',
  },
  {
    id: 'date-of-birth', label: 'วันเกิด', class: 'restricted',
    regex: BIRTH_DATE_PATTERN,
    replacement: '[วันเกิดถูกปิดบัง]',
  },
  {
    id: 'credit-card', label: 'หมายเลขบัตรที่ผ่าน Luhn', class: 'restricted',
    regex: /(?<![\dA-Za-z-])(?:\d[ -]?){12,18}\d(?![\dA-Za-z-])/g, // not inside a UUID or hex identifier
    validate: (value) => isLuhnCard(value),
    replacement: '[หมายเลขบัตรถูกปิดบัง]',
  },
  {
    id: 'credential',
    label: 'ข้อมูลรับรองตัวตน',
    class: 'sensitive',
    regex: /\b(?:password|passwd|pwd|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|cookie|authorization|mfa[_-]?code|recovery[_-]?code)["']?\s*[:=]\s*["']?[^\r\n,;}]+|Bearer\s+[A-Za-z0-9._~+\/-]+=*|\b(?:gh[pousr]_|sk-)[A-Za-z0-9_-]{20,}|[?&](?:token|key|sig|signature|code|x-amz-signature)=[^\s&#]+/gi,
    replacement: '[credential-redacted]',
  },
  {
    id: 'email',
    label: 'อีเมล',
    class: 'restricted',
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: '[อีเมลถูกปิดบัง]',
  },
  {
    id: 'thai-phone',
    label: 'หมายเลขโทรศัพท์',
    class: 'restricted',
    // Thai numbers are grouped 0XX-XXX-XXXX, 0X-XXXX-XXXX or with dots. Digits inside a UUID or hex identifier
    // (a task id ending -027766844efc) are not a phone number.
    regex: /(?<!\d|[\dA-Fa-f]-)(?:\+66[-\s.]?|(?<![A-Za-z])0)\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}(?![\dA-Za-z])/g,
    replacement: '[หมายเลขโทรศัพท์ถูกปิดบัง]',
  },
  {
    id: 'id-13-digit',
    label: 'เลขประจำตัว 13 หลัก',
    class: 'restricted',
    // Dots are allowed only in the complete 1.2345.67890.12.1 grouping,
    // not as one optional separator in a plain decimal like 0.123456789012.
    regex: /(?<![\d.])(?:\d[-\s]?\d{4}[-\s]?\d{5}[-\s]?\d{2}[-\s]?\d|\d\.\d{4}\.\d{5}\.\d{2}\.\d)(?!\d)/g,
    replacement: '[เลขประจำตัวถูกปิดบัง]',
  },
  {
    id: 'bank-account',
    label: 'เลขบัญชีธนาคาร',
    class: 'restricted',
    regex: /(?:เลขบัญชี|บัญชีธนาคาร|account(?:\s*no\.?)?)\s*[:：]?\s*[0-9][0-9\-\s]{7,18}[0-9]/gi,
    replacement: 'เลขบัญชี: [ถูกปิดบัง]',
  },
  {
    id: 'address-line',
    label: 'ที่อยู่',
    class: 'restricted',
    regex: /(?:ที่อยู่|address)[ \t]*[:：](?![ \t]*\[ถูกปิดบัง\][ \t]*\r?$)[ \t]*[^\r\n]{6,160}/gim,
    replacement: 'ที่อยู่: [ถูกปิดบัง]',
  },
];

const PATTERN_IDS = new Set(PATTERNS.map((pattern) => pattern.id));

const SENSITIVE_KEYWORDS = [
  'ข้อมูลสุขภาพ',
  'ประวัติการรักษา',
  'โรคประจำตัว',
  'ผลตรวจสุขภาพ',
  'ความพิการ',
  'ประวัติอาชญากรรม',
  'ข้อมูลชีวภาพ',
  'ลายนิ้วมือ',
  'ศาสนา',
  'เชื้อชาติ',
  'ชาติพันธุ์',
  'ความคิดเห็นทางการเมือง',
  'สหภาพแรงงาน',
  'พฤติกรรมทางเพศ',
  'รสนิยมทางเพศ',
];
const ENGLISH_SENSITIVE = /\b(?:medical\s+record|medical\s+history|health\s+record|diagnosis|diabetes|hiv|depression|disability|criminal\s+record|biometric|fingerprint|religion|ethnicity|racial(?:\s+origin)?|race\s+or\s+ethnicity|political\s+opinion|trade\s+union|sexual\s+orientation|sexual\s+behavior)\b/gi;
const NAME_TABLE_HEADER = /ชื่อ\s*[-–]?\s*(?:นามสกุล|สกุล)|(?:^|[\r\n|,\t])\s*(?:ชื่อ|นามสกุล|full\s*name|first\s*name|last\s*name|surname)\s*(?=[|,\t\r\n]|$)/im;
// "ชื่อ" is only a personal-name signal when it labels a value ("ชื่อ:", "ชื่อ สมชาย") or names a person
// ("ชื่อผู้…", "ชื่อพนักงาน"). Naming things ("ตั้งชื่อแคมเปญ", "ชื่อโครงการ") is ordinary drafting work.
const NOT_PERSON_NOUN = 'โครงการ|บริษัท|องค์กร|หน่วยงาน|เรื่อง|เอกสาร|ไฟล์|แคมเปญ|งาน|สินค้า|บริการ|แบรนด์|หลักสูตร|กิจกรรม';
const PERSON_NAME_LABEL = `(?<!ตั้ง|คิด|เปลี่ยน)ชื่อ(?:\\s*[:：=]|\\s+(?!(?:${NOT_PERSON_NOUN}))(?=[\\u0E01-\\u0E2EA-Za-z])|\\s*[-–]|จริง|เล่น|สกุล|ผู้|นัก|พนักงาน|ลูกค้า|บุคคล|เจ้าหน้าที่|อาจารย์|ครู|วิทยากร|บิดา|มารดา|คู่สมรส|บุตร)`;
const UNRESOLVED_ID_LABEL = new RegExp(String.raw`นามสกุล|ผู้(?:เข้าอบรม|สมัคร)\s*[:：]|` + PERSON_NAME_LABEL + String.raw`|หนังสือเดินทาง|ใบ(?:อนุญาต)?ขับขี่|บัตรเครดิต|วัน(?:เดือนปี)?เกิด|\b(?:passport|line\s*id|credit\s*card|date\s*of\s*birth|dob|surname|full\s*name|first\s*name|last\s*name)\b`, 'i');

function isLuhnCard(value) {
  const digits = normalizeDigits(value);
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = digits.length - 1, double = false; i >= 0; i--, double = !double) {
    let n = Number(digits[i]);
    if (double && (n *= 2) > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

function isAllowedMatch(pattern, value, allowed) {
  return ((pattern.id === 'id-13-digit' || pattern.id === 'credit-card') && allowed.has(normalizeDigits(value)))
    || (pattern.validate && !pattern.validate(value));
}

function hashText(text) {
  return createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function normalizeDigits(value = '') {
  return normalizeForScan(String(value)).text.replace(/\D/g, '');
}

// Characters that render as nothing but split a number or address in two.
const INVISIBLE = /^[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]$/;

/**
 * Build the text the patterns run on, plus a map back to the original.
 * - Thai digits become ASCII digits (๐๘๑ → 081).
 * - Other characters are NFKC-normalized (full-width １２３ and ＠ → 123 and @).
 *   Thai letters are left alone: NFKC splits ำ into two code points.
 * - Invisible characters (zero-width space, word joiner, BOM) are dropped.
 * starts[i]/ends[i] give the original span of normalized character i, so a
 * match can be redacted in the original text without rewriting anything else.
 */
function normalizeForScan(input) {
  let text = '';
  const starts = [];
  const ends = [];
  for (let i = 0; i < input.length;) {
    const cp = input.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    const next = i + ch.length;
    let piece;
    if (INVISIBLE.test(ch)) piece = '';
    else if (cp >= 0x0e50 && cp <= 0x0e59) piece = String(cp - 0x0e50);
    else if (cp >= 0x0e00 && cp <= 0x0e7f) piece = ch;
    else piece = ch.normalize('NFKC');
    for (let k = 0; k < piece.length; k++) {
      starts.push(i);
      ends.push(next);
    }
    text += piece;
    i = next;
  }
  return { text, starts, ends };
}

function replaceInOriginal(original, pattern, allowed) {
  const view = normalizeForScan(original);
  const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
  const spans = [];
  let match;
  while ((match = regex.exec(view.text)) !== null) {
    if (match[0].length === 0) { regex.lastIndex += 1; continue; }
    if (isAllowedMatch(pattern, match[0], allowed)) continue;
    spans.push([view.starts[match.index], view.ends[match.index + match[0].length - 1]]);
  }
  let output = original;
  for (let s = spans.length - 1; s >= 0; s--) {
    const [start, end] = spans[s];
    output = output.slice(0, start) + pattern.replacement + output.slice(end);
  }
  return output;
}

function organizationAllowlist(values) {
  return new Set((values || []).map(normalizeDigits).filter((value) => value.length === 13));
}

function collectMatches(text, pattern, allowedIdentifiers = new Set()) {
  const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (isAllowedMatch(pattern, match[0], allowedIdentifiers)) {
      continue;
    }
    matches.push({ index: match.index, length: match[0].length });
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return matches;
}

/** The credential pattern (passwords, tokens, API keys, signed URL parameters), for masking credentials alone. */
export const CREDENTIAL_PATTERN = PATTERNS.find((pattern) => pattern.id === 'credential').regex;

export function scanPrivacyText(text = '', { allowedIdentifiers = [] } = {}) {
  const input = String(text || '');
  const allowed = organizationAllowlist(allowedIdentifiers);
  const cacheKey = hashText(input + '|allow:' + [...allowed].sort().join(','));
  const hash = hashText(input);
  const cached = scanCache.get(cacheKey);
  if (cached) {
    scanCache.delete(cacheKey);
    scanCache.set(cacheKey, cached);
    return { ...structuredClone(cached), cacheHit: true };
  }

  const findings = [];
  let hasDirectIdentifier = false;
  const scanText = normalizeForScan(input).text;

  for (const pattern of PATTERNS) {
    const matches = collectMatches(scanText, pattern, allowed);
    if (!matches.length) continue;
    findings.push({
      type: pattern.id,
      label: pattern.label,
      classification: pattern.class,
      count: matches.length,
    });
    if (pattern.class === 'restricted') hasDirectIdentifier = true;
  }

  const lower = scanText.toLowerCase();
  // Check labels left after known matches are removed. This is a review signal,
  // not a claim that an unlabelled name has been reliably recognized.
  let unmatched = scanText;
  for (const pattern of PATTERNS) {
    unmatched = unmatched.replace(pattern.regex, (value) => isAllowedMatch(pattern, value, allowed) ? value : '');
  }
  const nameTable = NAME_TABLE_HEADER.test(scanText);
  const unresolvedIdentifier = UNRESOLVED_ID_LABEL.test(unmatched);
  if (nameTable || unresolvedIdentifier) {
    findings.push({ type: nameTable ? 'name-table-review' : 'unresolved-identifier',
      label: 'ตารางชื่อหรือข้อมูลระบุตัวบุคคลที่ต้องตรวจด้วยคน', classification: 'restricted', count: 1 });
  }
  const sensitiveKeywords = [
    ...SENSITIVE_KEYWORDS.filter((keyword) => lower.includes(keyword.toLowerCase())),
    ...new Set(lower.match(ENGLISH_SENSITIVE) || []),
  ];
  if (sensitiveKeywords.length) {
    findings.push({
      type: 'possible-sensitive-data',
      label: 'อาจมีข้อมูลส่วนบุคคลที่มีความอ่อนไหว',
      classification: 'sensitive',
      count: sensitiveKeywords.length,
    });
  }

  let classification = 'public';
  let action = 'pass';

  if (findings.some((f) => f.classification === 'internal')) {
    classification = 'internal';
    action = 'auto-mask';
  }
  if (findings.some((f) => f.classification === 'restricted')) {
    classification = 'restricted';
    action = 'auto-mask';
  }
  if (nameTable || unresolvedIdentifier) action = 'human-confirm';
  if (sensitiveKeywords.length && hasDirectIdentifier) {
    classification = 'sensitive';
    action = 'block-external';
  } else if (sensitiveKeywords.length) {
    classification = 'restricted';
    action = 'human-confirm';
  }
  if (findings.some((f) => f.type === 'credential')) {
    classification = 'sensitive';
    action = 'block-external';
  }

  const result = {
    hash,
    classification,
    action,
    containsPersonalData: findings.length > 0,
    findings,
    sensitiveKeywordsCount: sensitiveKeywords.length,
    cacheHit: false,
    // A pattern scan is not an authoritative document classification.
    detectionScope: 'text-patterns-only',
    unresolvedIdentifiers: nameTable || unresolvedIdentifier,
  };

  scanCache.set(cacheKey, result);
  if (scanCache.size > PRIVACY_CACHE_LIMIT) scanCache.delete(scanCache.keys().next().value);
  return structuredClone(result);
}

export function redactPrivacyText(text = '', { allowedIdentifiers = [] } = {}) {
  const original = String(text || '');
  let output = original;
  const allowed = organizationAllowlist(allowedIdentifiers);
  const scan = scanPrivacyText(output, { allowedIdentifiers });

  // Match on the normalized view, replace the matching span of the original.
  for (const pattern of PATTERNS) {
    output = replaceInOriginal(output, pattern, allowed);
  }

  // Never hand back a "redacted" copy that still holds a known pattern. If the
  // copy fails a rescan, it is withheld and a person reviews the original.
  const residual = scanPrivacyText(output, { allowedIdentifiers }).findings
    .filter((finding) => PATTERN_IDS.has(finding.type));
  if (residual.length) {
    return {
      ...scan,
      action: scan.action === 'block-external' ? 'block-external' : 'human-confirm',
      redactedText: null,
      redactionApplied: false,
      redactionIncomplete: residual.map((finding) => finding.type),
    };
  }

  return {
    ...scan,
    redactedText: output,
    redactionApplied: output !== original,
  };
}

export function evaluatePrivacyGate(text = '', options = {}) {
  const result = redactPrivacyText(text, options);

  return {
    ...result,
    // Pending confirmation is not permission to transmit. The host must resolve
    // the review separately; a classifier flag must never implicitly authorize it.
    canSendToExternalAI: false,
    transmissionAuthorization: 'not-evaluated',
    requiresHumanConfirmation: result.action !== 'pass',
    logSafeMetadata: {
      sourceHash: result.hash,
      containsPersonalData: result.containsPersonalData,
      privacyClass: result.classification,
      privacyAction: result.action,
      redactionApplied: result.redactionApplied,
    },
  };
}

export const WITHHELD_TEXT = '[ข้อความถูกระงับ: ปิดบังข้อมูลส่วนบุคคลได้ไม่ครบ ต้องให้คนตรวจต้นฉบับ]';

/**
 * Text that is safe to route, log or persist after a gate result. When the
 * redacted copy was withheld, nothing of the original is passed on.
 */
export function privacySafeText(result) {
  return typeof result?.redactedText === 'string' ? result.redactedText : WITHHELD_TEXT;
}

const PRIVATE_KEYS = /^(?:password|passwd|pwd|secret|token|accessToken|refreshToken|apiKey|cookie|cookies|authorization|mfa|mfaCode|recoveryCode|employeeName|fullName|firstName|lastName|personalName|phone|phoneNumber|email|address|bankAccount|nationalId|employeeId|medicalHistory|healthRecord|ชื่อพนักงาน|ชื่อจริง|นามสกุล|เบอร์โทร|เลขบัญชี|เลขประจำตัว)$/i;

/** Best-effort minimization for JSON state. Unknown/unlabelled PII still needs
 * host review; never use this helper as a permission or a complete DLP verdict.
 * Keys are inspected too because model output can place PII in object keys.
 */
export function sanitizeRunData(value, depth = 0, parentKey = '') {
  if (depth > 30) throw new Error('Run data exceeds maximum depth');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    if (parentKey === 'runId' && /^\d{8}-\d{6}-[a-z0-9-]+-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) return value;
    if (/^(?:sha256|sourceHash|operationHash|harnessRevision)$/.test(parentKey)
        && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value)) return value;
    const result = evaluatePrivacyGate(value);
    if (result.action === 'human-confirm' || result.action === 'block-external') return '[restricted-content-omitted]';
    return privacySafeText(result);
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeRunData(item, depth + 1, parentKey));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      const safeKey = sanitizeRunData(key, depth + 1);
      const privateKey = PRIVATE_KEYS.test(key.replace(/[_\s-]/g, ''))
        || (key === 'name' && /^(?:employee|person|contact|user)$/i.test(parentKey));
      return [safeKey, privateKey ? '[private-field-omitted]' : sanitizeRunData(item, depth + 1, key)];
    }));
  }
  if (value === undefined) return null;
  throw new Error('Run data must contain only JSON values');
}

export function clearPrivacyScanCache() {
  scanCache.clear();
}

export function getPrivacyScanCacheSize() {
  return scanCache.size;
}
