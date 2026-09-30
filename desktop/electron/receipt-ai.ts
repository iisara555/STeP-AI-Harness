type Candidate = {
  value: string;
  evidence?: string;
  method?: string;
  score?: number;
  engine?: string;
};

type MappingField = {
  label?: string;
  status?: string;
  selected_value?: string;
  evidence?: string;
  candidates?: Candidate[];
};

type ReceiptMapping = {
  schema?: string;
  fields?: Record<string, MappingField>;
  unresolved_field_lines?: Array<{ text?: string; page?: number; confidence?: number | null }>;
};

export type ReceiptAiDecision = {
  field: string;
  status: 'keep' | 'suggested' | 'ambiguous' | 'unmapped';
  value?: string;
  token?: string;
  reason: string;
};

type TokenEntry = { fields: string[]; value: string };

const SAFE_FIELD = /^[A-Za-z][A-Za-z0-9_-]{0,60}$/;

function valueShape(value: string) {
  const compact = String(value || '').trim();
  if (!compact) return 'empty';
  if (/^0\d{12}$/.test(compact.replace(/\D/g, ''))) return '13-digit-id';
  if (/^\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?$/.test(compact) || /^\d+(?:\.\d{1,2})?$/.test(compact)) return 'number';
  if (/\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}/.test(compact)) return 'date-like';
  if (/^[A-Za-z0-9ก-๙][A-Za-z0-9ก-๙./#_-]{1,47}$/.test(compact)) return 'identifier-or-text';
  return 'text';
}

function unresolvedValues(text: string) {
  const source = String(text || '').trim();
  const values: Array<{ value: string; fields: string[]; shape: string }> = [];
  const push = (value: string, fields: string[], shape: string) => {
    const clean = String(value || '').trim();
    if (!clean || values.some(item => item.value === clean && item.fields.join('|') === fields.join('|'))) return;
    values.push({ value: clean, fields, shape });
  };

  const tax = source.match(/(?:^|[^\d])((?:\d[\s-]?){12}\d)(?=$|[^\d])/);
  if (tax) push(tax[1].replace(/\D/g, ''), ['taxId'], '13-digit-id');

  const date = source.match(
    /(?:^|[^\d])((?:19|20|25)\d{2}[/.\-]\d{1,2}[/.\-]\d{1,2}|\d{1,2}[/.\-]\d{1,2}[/.\-](?:\d{4}|\d{2}))(?=$|[^\d])/,
  );
  if (date) push(date[1], ['date'], 'date-like');

  for (const match of source.matchAll(/(^|[^\d])((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?=$|[^\d])/g)) {
    const value = match[2];
    const digits = value.replace(/\D/g, '');
    if (digits.length > 10 || (date && date[1].includes(value))) continue;
    push(value, ['subtotal', 'vat', 'total'], 'number');
  }

  const trailing = source.match(/[:：]\s*(.{2,80})$/)?.[1]?.trim();
  if (trailing && !/^\d+(?:[.,]\d+)?$/.test(trailing)) {
    push(trailing, ['merchant', 'receiptNumber'], 'text-after-label');
  }

  const code = source.match(/\b([A-Za-z]{1,8}[-/#]?[A-Za-z0-9-]{2,30})\b/)?.[1];
  if (code && /\d/.test(code)) push(code, ['receiptNumber'], 'identifier-or-text');

  return values.slice(0, 8);
}

function jsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  for (const candidate of [fenced, text.trim()]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
  }
  throw new Error('OCR_AI_INVALID_RESPONSE');
}

export function buildReceiptAiResolver(mapping: ReceiptMapping, sanitize: (text: string) => string) {
  const tokens = new Map<string, TokenEntry>();
  const fields: any[] = [];

  for (const [field, spec] of Object.entries(mapping?.fields || {})) {
    if (!SAFE_FIELD.test(field)) continue;
    const candidates: any[] = [];
    const seen = new Set<string>();
    const source = [...(spec.candidates || [])];

    if (spec.selected_value && !source.some(item => String(item.value || '') === spec.selected_value)) {
      source.unshift({
        value: spec.selected_value,
        evidence: spec.evidence || '',
        method: 'current-selection',
        score: 1,
      });
    }

    const localCandidates: Array<{ token: string; value: string; item: Candidate }> = [];
    for (const item of source.slice(0, 6)) {
      const value = String(item?.value || '').trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      const token = 'C_' + field + '_' + String(localCandidates.length + 1);
      tokens.set(token, { fields: [field], value });
      localCandidates.push({ token, value, item });
    }

    const tokenizedEvidence = (value: string) => {
      let output = String(value || '');
      for (const candidate of [...localCandidates].sort((a, b) => b.value.length - a.value.length)) {
        if (candidate.value) output = output.split(candidate.value).join(candidate.token);
      }
      return sanitize(output).slice(0, 400);
    };

    for (const candidate of localCandidates) {
      candidates.push({
        token: candidate.token,
        shape: valueShape(candidate.value),
        method: String(candidate.item?.method || ''),
        engine: String(candidate.item?.engine || ''),
        score: Number.isFinite(Number(candidate.item?.score)) ? Number(candidate.item.score) : null,
        evidence: tokenizedEvidence(String(candidate.item?.evidence || '')),
      });
    }

    fields.push({
      field,
      label: sanitize(String(spec.label || field)).slice(0, 120),
      current_status: String(spec.status || ''),
      has_current_value: Boolean(spec.selected_value),
      current_shape: valueShape(String(spec.selected_value || '')),
      evidence: tokenizedEvidence(String(spec.evidence || '')),
      candidates,
    });
  }

  const unresolved = (mapping?.unresolved_field_lines || []).slice(0, 20).map((item, index) => {
    let text = String(item?.text || '');
    const valueTokens = unresolvedValues(text).map((candidate, candidateIndex) => {
      const token = 'U_' + String(index + 1) + '_' + String(candidateIndex + 1);
      tokens.set(token, { fields: candidate.fields, value: candidate.value });
      text = text.split(candidate.value).join(token);
      return {
        token,
        shape: candidate.shape,
        allowed_fields: candidate.fields,
      };
    });
    return {
      text: sanitize(text).slice(0, 400),
      page: Number(item?.page || 0) || null,
      confidence: typeof item?.confidence === 'number' ? item.confidence : null,
      value_tokens: valueTokens,
    };
  });

  const payload = {
    schema: mapping?.schema || 'step-afp-receipt-precheck-mapping/v1',
    fields,
    unresolved,
  };

  const prompt = [
    'You are a strict OCR reconciliation filter for a Thai receipt pre-check.',
    'You do not extract new values and you do not decide finance eligibility.',
    'All candidate values are hidden behind local tokens. Never invent, reconstruct, transform, calculate, or guess a value.',
    'For each field choose exactly one of:',
    '- KEEP: current mapped value is adequately supported by the evidence.',
    '- a provided candidate token: that existing OCR candidate is better supported.',
    '- AMBIGUOUS: evidence conflicts or more than one candidate is plausible.',
    '- UNMAPPED: evidence is insufficient.',
    'Tesseract is supporting evidence for printed text, not a handwriting authority. Handwriting candidates remain unverified.',
    'Return JSON only in this shape:',
    '{"decisions":{"fieldName":{"choice":"KEEP|C_field_1|AMBIGUOUS|UNMAPPED","reason":"short reason"}}}',
    'Input:',
    JSON.stringify(payload),
  ].join('\n');

  return { prompt, tokens, fields: fields.map(item => item.field) };
}

export function resolveReceiptAiResponse(response: string, tokenMap: Map<string, TokenEntry>, fields: string[]): ReceiptAiDecision[] {
  const parsed: any = jsonObject(response);
  const decisions = parsed?.decisions;
  if (!decisions || typeof decisions !== 'object' || Array.isArray(decisions)) throw new Error('OCR_AI_INVALID_RESPONSE');

  const allowedFields = new Set(fields);
  const output: ReceiptAiDecision[] = [];
  for (const [field, raw] of Object.entries(decisions)) {
    if (!allowedFields.has(field) || !raw || typeof raw !== 'object') continue;
    const item: any = raw;
    const choice = String(item.choice || '').trim();
    const reason = String(item.reason || '')
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, 300);
    if (choice === 'KEEP') {
      output.push({ field, status: 'keep', reason });
      continue;
    }
    if (choice === 'AMBIGUOUS') {
      output.push({ field, status: 'ambiguous', reason });
      continue;
    }
    if (choice === 'UNMAPPED') {
      output.push({ field, status: 'unmapped', reason });
      continue;
    }
    const token = tokenMap.get(choice);
    if (!token || !token.fields.includes(field)) throw new Error('OCR_AI_INVALID_RESPONSE');
    output.push({ field, status: 'suggested', value: token.value, token: choice, reason });
  }
  return output;
}
