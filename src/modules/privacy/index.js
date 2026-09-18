import { createHash } from 'node:crypto';

const scanCache = new Map();

const PATTERNS = [
  {
    id: 'email',
    label: 'อีเมล',
    class: 'internal',
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

  const result = {
    hash,
    classification,
    action,
    containsPersonalData: findings.length > 0,
    findings,
    sensitiveKeywordsCount: sensitiveKeywords.length,
    cacheHit: false,
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
    canSendToExternalAI: result.action !== 'block-external',
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

export function clearPrivacyScanCache() {
  scanCache.clear();
}

export function getPrivacyScanCacheSize() {
  return scanCache.size;
}
