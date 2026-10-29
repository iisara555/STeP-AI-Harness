import { parseDocumentOutput } from '../src/document-output';
import type { DocumentToolId } from '../src/document-tools';
import { stripReasoningBlocks } from './json-schema';

export type QualityFindingCode =
  | 'MISSING_DOCUMENT_ENVELOPE'
  | 'MISSING_REQUIRED_HEADINGS'
  | 'MISSING_CONFIRM_PLACEHOLDER'
  | 'TABLE_TOTAL_MISMATCH'
  | 'UNVERIFIED_ACTION_CLAIM'
  | 'UNGROUNDED_DOC_CODE';

export type QualityFinding = {
  code: QualityFindingCode;
  severity: 'critical' | 'warning';
  detail: string;
};

export type OutputQualityReport = {
  sanitizedText: string;
  validEnvelope: boolean;
  findings: QualityFinding[];
  needsRepair: boolean;
};

const REQUIRED_HEADINGS: Partial<Record<DocumentToolId, RegExp[]>> = {
  memo: [/ส่วนหัวบันทึก|ส่วนหัว/, /เรื่อง/, /เรียน/, /เนื้อหา|ความเดิม|ข้อเท็จจริง|ข้อเสนอ/],
  letter: [/เรื่อง/, /เรียน/, /อ้างถึง|สิ่งที่ส่งมาด้วย|เนื้อหา/, /ขอแสดงความนับถือ/],
  tor: [/หลักการและเหตุผล|วัตถุประสงค์/, /ขอบเขต/, /การส่งมอบ|งวดงาน|เกณฑ์/],
  minutes: [/ระเบียบวาระ|วาระที่/, /มติที่ประชุม|สรุปมติ|การมอบหมายงาน/],
  project: [/หลักการและเหตุผล|ที่มา/, /วัตถุประสงค์/, /แผนการดำเนินงาน|งบประมาณ|ผลที่คาดว่าจะได้รับ/],
};

/**
 * Gate C: Strips leaked `<think>...</think>` blocks outside markdown code fences.
 */
export function sanitizeModelOutput(text: string): string {
  if (!text) return text;
  const cleaned = stripReasoningBlocks(text);
  // Also strip an unclosed trailing <think>... block outside code fences if a local model truncated mid-thought.
  const segments = cleaned.split(/(```[\s\S]*?```)/g);
  return segments
    .map((segment, index) => (index % 2 === 1 ? segment : segment.replace(/<think>\s*[\s\S]*$/i, '')))
    .join('')
    .trim();
}

/**
 * Gate A: Detects explicit claims that a workspace file or external system write already succeeded when no write tool ran.
 */
export function checkUnverifiedToolClaims(text: string, executedTools: Iterable<string>, writtenFilesCount = 0): QualityFinding[] {
  const tools = new Set(executedTools);
  const findings: QualityFinding[] = [];
  const hasFileWrite =
    writtenFilesCount > 0 ||
    tools.has('changes') ||
    tools.has('patch') ||
    tools.has('sheet_create') ||
    tools.has('sheet_edit') ||
    tools.has('slides_create') ||
    tools.has('terminal') ||
    tools.has('sandbox');
  const hasGoogleWrite = tools.has('google_workspace');

  const outsideFences = text
    .split(/(```[\s\S]*?```)/g)
    .filter((_, index) => index % 2 === 0)
    .join('\n');

  if (
    !hasFileWrite &&
    /(?:ได้สร้างไฟล์|บันทึกไฟล์|เขียนไฟล์ลงใน|สร้างไฟล์\s+[^\s]+\.(?:xlsx|pptx|docx))\s*(?:เรียบร้อยแล้ว|เสร็จสิ้นแล้ว|ไว้ที่)/i.test(
      outsideFences,
    )
  ) {
    findings.push({
      code: 'UNVERIFIED_ACTION_CLAIM',
      severity: 'critical',
      detail: 'Output claims a local file was created or saved, but no file-writing tool succeeded in this run.',
    });
  }

  if (
    !hasGoogleWrite &&
    /(?:ส่งอีเมลให้เรียบร้อยแล้ว|บันทึกนัดหมายลงใน\s*Google\s*Calendar\s*เรียบร้อยแล้ว|อัปเดตข้อมูลลงใน\s*Google\s*Sheets?\s*เรียบร้อยแล้ว)/i.test(
      outsideFences,
    )
  ) {
    findings.push({
      code: 'UNVERIFIED_ACTION_CLAIM',
      severity: 'critical',
      detail: 'Output claims a Google Workspace write/send completed, but google_workspace was not executed in this run.',
    });
  }

  return findings;
}

/**
 * Gate B: Checks STeP document/form codes (QM-, QP-, WI-, FM-, SD-) against the grounding corpus for this run.
 */
export function checkOrganizationDocCodes(text: string, groundingCorpus: string): QualityFinding[] {
  const codePattern = /\b(?:QM|QP|WI|FM|SD)-[A-Z0-9]{1,6}(?:-[A-Z0-9]{1,8})*\b/g;
  const mentioned = [...new Set(text.match(codePattern) || [])];
  if (!mentioned.length || !groundingCorpus.trim()) return [];
  const allowedUpper = groundingCorpus.toUpperCase();
  const ungrounded = mentioned.filter(code => !allowedUpper.includes(code.toUpperCase()));
  if (!ungrounded.length) return [];
  return [
    {
      code: 'UNGROUNDED_DOC_CODE',
      severity: 'warning',
      detail: `Document/form code(s) not found in loaded STeP references or source: ${ungrounded.join(', ')}`,
    },
  ];
}

function parseTableNumber(cell: string): number | null {
  const cleaned = cell
    .replace(/\*\*/g, '')
    .replace(/,/g, '')
    .replace(/(?:บาท|THB|%|\s)+$/gi, '')
    .replace(/^(?:฿|\$)\s*/, '')
    .trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Gate D1: Verifies arithmetic totals in Markdown tables that end with a summary row (รวมทั้งสิ้น / รวมเป็นเงิน / Total).
 */
export function checkMarkdownTableTotals(text: string): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let tableLines: string[] = [];

  const inspectTable = (rows: string[]) => {
    const parsedRows = rows
      .map(line =>
        line
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map(c => c.trim()),
      )
      .filter(cells => cells.length >= 2 && !cells.every(c => /^:?-{2,}:?$/.test(c)));
    if (parsedRows.length < 4) return;
    const lastRow = parsedRows.at(-1)!;
    const firstNonEmpty =
      lastRow
        .find(c => c.replace(/\*\*/g, '').trim().length > 0)
        ?.replace(/\*\*/g, '')
        .trim() || '';
    if (!/^(?:รวมทั้งสิ้น|รวมเป็นเงิน|รวมงบประมาณ|ยอดรวมสุทธิ|ยอดรวม|รวม$|total\b|grand\s+total\b)/i.test(firstNonEmpty)) return;
    // Skip if preceding rows include subtotals/VAT/discounts so we only check pure additive item tables.
    const dataRows = parsedRows.slice(1, -1);
    if (
      dataRows.some(r =>
        r.some(c => /(?:ภาษีมูลค่าเพิ่ม|vat|ส่วนลด|รวมย่อย|subtotal|เฉลี่ย|ร้อยละ|%)/i.test(c.replace(/\*\*/g, '').trim())),
      )
    )
      return;
    const lastColIndex = lastRow.length - 1;
    const declaredTotal = parseTableNumber(lastRow[lastColIndex]);
    if (declaredTotal === null) return;
    const values = dataRows.map(r => (r.length > lastColIndex ? parseTableNumber(r[lastColIndex]) : null));
    if (values.length < 2 || values.some(v => v === null)) return;
    const sum = (values as number[]).reduce((acc, v) => acc + v, 0);
    if (Math.abs(sum - declaredTotal) > 0.05) {
      findings.push({
        code: 'TABLE_TOTAL_MISMATCH',
        severity: 'critical',
        detail: `Markdown table total mismatch: rows sum to ${sum.toLocaleString('en-US', { maximumFractionDigits: 2 })}, but the total row states ${declaredTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}.`,
      });
    }
  };

  for (const line of lines) {
    if (/^\s*\|.+\|\s*$/.test(line)) {
      tableLines.push(line);
    } else if (tableLines.length) {
      inspectTable(tableLines);
      tableLines = [];
    }
  }
  if (tableLines.length) inspectTable(tableLines);
  return findings;
}

/**
 * Evaluates a model response across all deterministic quality gates (envelope, headings, placeholders, arithmetic, tool claims, doc codes).
 */
export function evaluateOutputQuality(
  rawText: string,
  options: {
    documentTool?: DocumentToolId;
    strictHeadings?: boolean;
    missingConfirmLabels?: string[];
    executedTools?: Iterable<string>;
    writtenFilesCount?: number;
    groundingCorpus?: string;
  } = {},
): OutputQualityReport {
  const sanitizedText = sanitizeModelOutput(rawText);
  const findings: QualityFinding[] = [];
  let validEnvelope = true;
  let bodyToInspect = sanitizedText;

  if (options.documentTool) {
    try {
      const parsed = parseDocumentOutput(sanitizedText, options.documentTool, { requireEnvelope: true });
      bodyToInspect = parsed.draft;
      const expectedHeadings = REQUIRED_HEADINGS[options.documentTool] || [];
      const missingHeadings = expectedHeadings.filter(pattern => !pattern.test(parsed.draft));
      if (missingHeadings.length > 0) {
        findings.push({
          code: 'MISSING_REQUIRED_HEADINGS',
          severity: options.strictHeadings ? 'critical' : 'warning',
          detail: `Draft for ${options.documentTool} is missing ${missingHeadings.length} recommended structural section(s).`,
        });
      }
      if (options.missingConfirmLabels?.length && !/\[รอยืนยัน/.test(parsed.draft) && !/รอยืนยัน/.test(parsed.review)) {
        findings.push({
          code: 'MISSING_CONFIRM_PLACEHOLDER',
          severity: 'warning',
          detail: `Fields marked for confirmation (${options.missingConfirmLabels.join(', ')}) should use [รอยืนยัน: ...] placeholders instead of invented values.`,
        });
      }
    } catch {
      validEnvelope = false;
      findings.push({
        code: 'MISSING_DOCUMENT_ENVELOPE',
        severity: 'critical',
        detail:
          'Response is missing the required <document_draft>...</document_draft> and <document_review>...</document_review> XML blocks.',
      });
    }
  }

  findings.push(...checkMarkdownTableTotals(bodyToInspect));

  if (options.executedTools) {
    findings.push(...checkUnverifiedToolClaims(bodyToInspect, options.executedTools, options.writtenFilesCount ?? 0));
  }

  if (options.groundingCorpus) {
    findings.push(...checkOrganizationDocCodes(bodyToInspect, options.groundingCorpus));
  }

  const needsRepair = findings.some(f => f.severity === 'critical');
  return {
    sanitizedText,
    validEnvelope,
    findings,
    needsRepair,
  };
}

/**
 * Builds a concise, targeted 1-pass self-repair prompt for critical deterministic quality findings.
 */
export function buildRepairPrompt(originalOutput: string, findings: QualityFinding[], documentTool?: DocumentToolId): string {
  const issues = findings.map((f, idx) => `${idx + 1}. [${f.code}] ${f.detail}`).join('\n');
  return [
    '<quality_repair_request>',
    'Your previous response failed deterministic quality checks on the following point(s):',
    issues,
    ...(documentTool
      ? [
          'Return the corrected response using ONLY the exact <document_draft>...</document_draft> and <document_review>...</document_review> XML blocks.',
        ]
      : ['Return the corrected complete response in Thai, keeping all verified facts intact and fixing only the issues listed above.']),
    '</quality_repair_request>',
    '<previous_response>',
    originalOutput.slice(0, 24_000),
    '</previous_response>',
  ].join('\n');
}
