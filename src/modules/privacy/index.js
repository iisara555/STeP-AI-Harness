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
    regex: /(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g,
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
    regex: /(?<!\d)(?:\+66[-\s]?|0)\d{1,2}[-\s]?\d{3}[-\s]?\d{4}(?!\d)/g,
    replacement: '[หมายเลขโทรศัพท์ถูกปิดบัง]',
  },
  {
    id: 'id-13-digit',
    label: 'เลขประจำตัว 13 หลัก',
    class: 'restricted',
    regex: /(?<!\d)\d[-\s]?\d{4}[-\s]?\d{5}[-\s]?\d{2}[-\s]?\d(?!\d)/g,
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
    regex: /(?:ที่อยู่|address)\s*[:：]\s*[^\r\n]{6,160}/gi,
    replacement: 'ที่อยู่: [ถูกปิดบัง]',
  },
];

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
const ENGLISH_SENSITIVE = /\b(?:medical\s+record|medical\s+history|health\s+record|diagnosis|diabetes|hiv|depression|disability|criminal\s+record|biometric|fingerprint|religion|ethnicity|race|political\s+opinion|trade\s+union|sexual\s+orientation|sexual\s+behavior)\b/gi;
const NAME_TABLE_HEADER = /ชื่อ\s*[-–]?\s*(?:นามสกุล|สกุล)|(?:^|[\r\n|,\t])\s*(?:ชื่อ|นามสกุล|full\s*name|first\s*name|last\s*name|surname)\s*(?=[|,\t\r\n]|$)/im;
const UNRESOLVED_ID_LABEL = /นามสกุล|ผู้เข้าอบรม|ผู้สมัคร|ชื่อ(?!โครงการ|บริษัท|องค์กร|หน่วยงาน|เรื่อง|เอกสาร|ไฟล์|เครื่องมือ|เครื่องจักร)|หนังสือเดินทาง|ใบ(?:อนุญาต)?ขับขี่|บัตรเครดิต|วัน(?:เดือนปี)?เกิด|\b(?:passport|line\s*id|credit\s*card|date\s*of\s*birth|dob|surname|full\s*name|first\s*name|last\s*name)\b/i;

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
  return String(value).replace(/\D/g, '');
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

  for (const pattern of PATTERNS) {
    const matches = collectMatches(input, pattern, allowed);
    if (!matches.length) continue;
    findings.push({
      type: pattern.id,
      label: pattern.label,
      classification: pattern.class,
      count: matches.length,
    });
    if (pattern.class === 'restricted') hasDirectIdentifier = true;
  }

  const lower = input.toLowerCase();
  // Check labels left after known matches are removed. This is a review signal,
  // not a claim that an unlabelled name has been reliably recognized.
  let unmatched = input;
  for (const pattern of PATTERNS) {
    unmatched = unmatched.replace(pattern.regex, (value) => isAllowedMatch(pattern, value, allowed) ? value : '');
  }
  const nameTable = NAME_TABLE_HEADER.test(input);
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
  let output = String(text || '');
  const allowed = organizationAllowlist(allowedIdentifiers);
  const scan = scanPrivacyText(output, { allowedIdentifiers });

  for (const pattern of PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    output = output.replace(regex, (value) => isAllowedMatch(pattern, value, allowed) ? value : pattern.replacement);
  }

  return {
    ...scan,
    redactedText: output,
    redactionApplied: output !== String(text || ''),
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
    return result.redactedText;
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
