import { createHash } from 'node:crypto';

const scanCache = new Map();

const PATTERNS = [
  {
    id: 'person-name',
    label: 'ชื่อบุคคล',
    class: 'restricted',
    regex: /(?:ชื่อ(?:พนักงาน|ผู้รับบริการ|บุคคล|ผู้ติดต่อ|จริง|[ -]นามสกุล)?\s*[:：]\s*|\b(?:employee\s*name|full\s*name|contact\s*name)\s*[:：]\s*)[^\r\n,;|]{1,120}/gi,
    replacement: '[ชื่อบุคคลถูกปิดบัง]',
  },
  {
    id: 'thai-titled-name',
    label: 'ชื่อบุคคลพร้อมคำนำหน้า',
    class: 'restricted',
    regex: /(?<![ก-๙])(?:นาย|นางสาว|นาง|น\.ส\.)[ \t]*[ก-๙]{2,}(?:[ \t]+[ก-๙]{2,})?/g,
    replacement: '[ชื่อบุคคลถูกปิดบัง]',
  },
  {
    id: 'credential',
    label: 'ข้อมูลรับรองตัวตน',
    class: 'sensitive',
    regex: /\b(?:password|passwd|pwd|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|cookie|authorization|mfa[_-]?code|recovery[_-]?code)\s*[:=]\s*[^\r\n,;]+|Bearer\s+[A-Za-z0-9._~+\/-]+=*|\b(?:gh[pousr]_|sk-)[A-Za-z0-9_-]{20,}|[?&](?:token|key|sig|signature|code|x-amz-signature)=[^\s&#]+/gi,
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

function hashText(text) {
  return createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function normalizeDigits(value = '') {
  return String(value).replace(/\D/g, '');
}

function collectMatches(text, pattern, allowedIdentifiers = new Set()) {
  const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (pattern.id === 'id-13-digit' && allowedIdentifiers.has(normalizeDigits(match[0]))) {
      continue;
    }
    matches.push({ index: match.index, length: match[0].length });
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return matches;
}

export function scanPrivacyText(text = '', { allowedIdentifiers = [] } = {}) {
  const input = String(text || '');
  const allowed = new Set((allowedIdentifiers || []).map(normalizeDigits).filter(Boolean));
  const cacheKey = hashText(input + '|allow:' + [...allowed].sort().join(','));
  const hash = hashText(input);
  const cached = scanCache.get(cacheKey);
  if (cached) return { ...structuredClone(cached), cacheHit: true };

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
  const sensitiveKeywords = SENSITIVE_KEYWORDS.filter((keyword) => lower.includes(keyword.toLowerCase()));
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
  };

  scanCache.set(cacheKey, result);
  return structuredClone(result);
}

export function redactPrivacyText(text = '', { allowedIdentifiers = [] } = {}) {
  let output = String(text || '');
  const allowed = new Set((allowedIdentifiers || []).map(normalizeDigits).filter(Boolean));
  const scan = scanPrivacyText(output, { allowedIdentifiers });

  for (const pattern of PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    if (pattern.id === 'id-13-digit') {
      output = output.replace(regex, (value) =>
        allowed.has(normalizeDigits(value)) ? value : pattern.replacement
      );
    } else {
      output = output.replace(regex, pattern.replacement);
    }
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
    canSendToExternalAI: result.action === 'pass' || result.action === 'auto-mask',
    requiresHumanConfirmation: result.action === 'human-confirm' || result.action === 'block-external',
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
    if (result.requiresHumanConfirmation) return '[restricted-content-omitted]';
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
