import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Download,
  Eye,
  FileSearch,
  FolderOpen,
  LoaderCircle,
  Play,
  RefreshCw,
  Save,
  ScanText,
  Send,
  TriangleAlert,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  classifyFromText,
  complianceChecklist,
  complianceSummary,
  type ClaimCategory,
  type ComplianceItem,
  type DocumentFeatures,
  type DocumentType,
} from './receipt-compliance';
import { compareField, receiptRuleChecks, type ReceiptField, type VisionReading } from './receipt-vision';
// One extraction and review rule set, shared with the OCR trial's own web page and its tests.
import '../../experiments/local-thai-ocr/web/receipt-review.js';
import { SectionArt } from './illustration';
import { receiptSourceText } from './receipt-source';
import { receiptProvenance, type ExtractionMethod } from './extraction-provenance';
import { trialReading, trialReport, type TrialReading } from './receipt-trial';
import { localized, t } from './i18n';

type MappingCandidate = {
  value: string;
  evidence: string;
  page: number | null;
  confidence: number | null;
  method: string;
  score: number;
  engine?: string;
};
type Field = {
  value: string;
  page: number | null;
  confidence: number | null;
  evidence: string;
  crosscheckCandidate: string;
  crosscheckStatus: string | null;
  mappingStatus?: 'mapped' | 'ambiguous' | 'unmapped';
  mappingMethod?: string;
  sourceTexts?: string[];
  candidates?: MappingCandidate[];
};
type AfpMapping = {
  schema: string;
  notice: string;
  fields: Record<
    string,
    {
      label: string;
      required_for_desktop_precheck: boolean;
      status: string;
      method: string;
      selected_value: string;
      evidence: string;
      candidates: MappingCandidate[];
    }
  >;
  unresolved_field_lines: Array<{ text: string; page: number; confidence: number | null }>;
  unmapped_ocr_lines: Array<{ text: string; page: number; confidence: number | null }>;
};
type LineRecord = {
  text: string;
  page: number;
  confidence: number | null;
  needsReview?: boolean;
  crosscheckCandidate?: string;
  crosscheckStatus?: string | null;
  tesseractCandidate?: string;
  tesseractConfidence?: number | null;
  tesseractStatus?: string | null;
  handwritingCandidate?: string;
  textKind?: 'printed-likely' | 'handwriting-likely' | 'printed-conflict' | 'uncertain';
};
type Issue = { code: string; severity: 'blocking' | 'advisory'; count?: number };
type ReceiptReviewApi = {
  fieldKeys: string[];
  requiredKeys: string[];
  normalizeDigits(value: string): string;
  extractReceipt(result: unknown): {
    fields: Record<string, Field>;
    records: LineRecord[];
    buyerTaxIdExcluded: boolean;
    afpMapping: AfpMapping;
  };
  reviewIssues(
    values: Record<string, string>,
    confirmed: Record<string, boolean>,
    options: object,
  ): { issues: Issue[]; complete: boolean; confirmedCount: number; filledCount: number };
};
const review = (window as unknown as { ReceiptReview: ReceiptReviewApi }).ReceiptReview;
type OcrStatus = {
  running: boolean;
  crosscheck: boolean;
  handwriting: boolean;
  tesseract: boolean;
  installed: boolean;
  folder: string;
  installing?: boolean;
  updateAvailable?: boolean;
  /** A vision model may read the receipt image too (policy receiptVision, privacy checks off). */
  vision?: boolean;
};
type Vision = {
  fields: VisionReading;
  buyerTaxId: string;
  amountInWords: string;
  documentType: DocumentType | '';
  features: DocumentFeatures;
  notes: string;
  model: string;
};
const CATEGORY_LABELS: Record<ClaimCategory, string> = {
  unsure: 'ยังไม่แน่ใจ',
  B: 'หมวด B (B1–B12)',
  BV: 'หมวด BV ค่าพาหนะ',
  emergency: 'หมวดฉุกเฉิน',
  other: 'หมวดอื่น',
};
const SOURCE_LABELS: Record<ComplianceItem['source'], string> = {
  afp: 'AFP แจ้งเวียน',
  general: 'หลักทั่วไป · ยืนยันกับ AFP',
  'need-source': 'ยังไม่มีแหล่งในระบบ · ถาม AFP',
};
const STATUS_MARK: Record<ComplianceItem['status'], string> = { ok: '✓', missing: '✕', warn: '!', todo: '○', info: 'i' };
type AiDecision = {
  field: string;
  status: 'keep' | 'suggested' | 'ambiguous' | 'unmapped';
  value?: string;
  token?: string;
  reason: string;
};
type Doc = { name: string; preview: string; result: any; visionOnly?: boolean; sourceId?: string };

const labels: Record<string, string> = localized({
  merchant: 'ผู้ออกใบเสร็จ / ร้านค้า',
  receiptNumber: 'เลขที่ใบเสร็จ',
  date: 'วันที่',
  taxId: 'เลขผู้เสียภาษีของผู้ออก',
  subtotal: 'ยอดก่อนภาษี',
  vat: 'ภาษีมูลค่าเพิ่ม',
  total: 'ยอดรวมที่ชำระ',
});
const issueText: Record<string, string | ((issue: Issue) => string)> = {
  missing_merchant: 'ยังไม่มีชื่อร้านค้าหรือผู้ออกใบเสร็จ',
  missing_date: 'ยังไม่มีวันที่บนใบเสร็จ',
  missing_total: 'ยังไม่มียอดรวมที่ชำระ',
  invalid_total: 'ยอดรวมต้องเป็นตัวเลขมากกว่า 0',
  invalid_subtotal: 'ยอดก่อนภาษียังไม่ใช่ตัวเลขที่อ่านได้',
  invalid_vat: 'ภาษีมูลค่าเพิ่มยังไม่ใช่ตัวเลขที่อ่านได้',
  amount_mismatch: 'ยอดก่อนภาษีบวกภาษีมูลค่าเพิ่มไม่เท่ากับยอดรวม โปรดเทียบใบเสร็จ',
  tax_id_length: 'เลขประจำตัวผู้เสียภาษีที่กรอกมีไม่ครบ 13 หลัก',
  unconfirmed_fields: () => t('ยังไม่ได้ติ๊กยืนยันว่าตรวจทุกช่องกับต้นฉบับแล้ว'),
  review_lines: issue => t('มี {0} บรรทัดที่ต้องตรวจจากภาพต้นฉบับ รวมจุดที่ OCR สองตัวอ่านต่างกัน', issue.count),
  resized_image: 'ภาพถูกย่อก่อน OCR โปรดตรวจข้อความขนาดเล็กบนใบเสร็จ',
  buyer_tax_id_excluded: 'พบเลขผู้เสียภาษีในส่วนของผู้ซื้อ จึงไม่เติมเป็นเลขของผู้ออกใบเสร็จ',
};
// Checks that need no AI (src/receipt-vision.ts); amounts adding up is already one of the page's own review rules.
const ruleText: Record<string, string> = {
  tax_id_checksum: 'เลขผู้เสียภาษีไม่ผ่านการตรวจเลขหลักสุดท้าย อาจอ่านผิดหนึ่งหลัก โปรดเทียบกับต้นฉบับ',
  tax_id_may_be_buyer:
    'เลขผู้เสียภาษีนี้อาจเป็นของผู้ซื้อ (เช่น มหาวิทยาลัย) ไม่ใช่ของร้าน ร้านบางแห่งเขียนเลขลูกค้าลงช่องผู้ออก โปรดตรวจกับต้นฉบับ',
  vat_not_7_percent: 'ภาษีมูลค่าเพิ่มไม่เท่ากับ 7% ของยอดก่อนภาษี โปรดตรวจตัวเลขทั้งสองช่อง',
  amount_words_differ: 'ยอดเงินตัวอักษรไม่ตรงกับยอดรวมตัวเลข โปรดตรวจยอดรวมกับต้นฉบับ',
};
const describe = (issue: Issue) => {
  const text = issueText[issue.code];
  return typeof text === 'function' ? text(issue) : text ? t(text) : issue.code;
};

export function ReceiptApp({
  call,
  notify,
  onError,
  handoff,
  onEvent,
  connectionId,
  onBusy,
}: {
  call: (method: string, input?: unknown) => Promise<any>;
  onError: (error: unknown) => void;
  notify: (text: string, tone?: 'info' | 'success' | 'error', action?: { label: string; run: () => unknown }) => void;
  handoff: (text: string, sourceText: string, allowIds?: string[]) => Promise<void>;
  onEvent: (callback: (event: { type: string; text?: string }) => void) => () => void;
  connectionId?: string;
  /** Whether a read or check is running, so the sidebar can show it while another page is open. */
  onBusy?: (busy: boolean) => void;
}) {
  const [status, setStatus] = useState<OcrStatus | null>(null),
    [busy, setBusy] = useState(''),
    [installProgress, setInstallProgress] = useState('');
  const [doc, setDoc] = useState<Doc | null>(null),
    [fields, setFields] = useState<Record<string, Field>>({}),
    [records, setRecords] = useState<LineRecord[]>([]),
    [mapping, setMapping] = useState<AfpMapping | null>(null);
  // One confirmation covers every field and every flagged OCR line; editing anything clears it.
  const [values, setValues] = useState<Record<string, string>>({}),
    [allChecked, setAllChecked] = useState(false),
    // Fields the app filled from a low-score OCR candidate or the AI, which the person has not edited yet.
    [guessed, setGuessed] = useState<Record<string, 'ocr' | 'ai'>>({});
  const [origins, setOrigins] = useState<Record<string, ExtractionMethod>>({});
  const [trialMode, setTrialMode] = useState(false);
  const [trialOcr, setTrialOcr] = useState<TrialReading | null>(null);
  const [trialVision, setTrialVision] = useState<TrialReading | null>(null);
  const pilot = trialOcr ? trialReport(trialOcr, trialVision, values, allChecked, `receipt:${doc?.sourceId}`) : null;
  const confirmed = useMemo(
    () => (allChecked ? Object.fromEntries(review.fieldKeys.map(k => [k, true])) : {}) as Record<string, boolean>,
    [allChecked],
  );
  const edit = (k: string, value: string) => {
    setValues(v => ({ ...v, [k]: value }));
    setGuessed(({ [k]: _, ...rest }) => rest);
    setOrigins(v => ({ ...v, [k]: 'manual' }));
    setAllChecked(false);
  };
  const [note, setNote] = useState(''),
    [buyerExcluded, setBuyerExcluded] = useState(false),
    [aiDecisions, setAiDecisions] = useState<AiDecision[]>([]),
    [vision, setVision] = useState<Vision | null>(null),
    [zoom, setZoom] = useState(false),
    [typeOverride, setTypeOverride] = useState<DocumentType | ''>(''),
    [category, setCategory] = useState<ClaimCategory>('unsure');
  useEffect(() => onBusy?.(Boolean(busy) && busy !== 'status'), [busy, onBusy]);
  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
    } catch (e) {
      onError(e);
    } finally {
      setBusy('');
    }
  };
  const refresh = () => run('status', async () => setStatus(await call('ocrStatus')));
  useEffect(
    () =>
      onEvent(event => {
        if (event.type === 'install' && /^(STEP|DONE)/.test(event.text || '')) setInstallProgress(event.text || '');
      }),
    [onEvent],
  );
  // OCR is optional. If the employee installed it before, opening this page starts the local service; otherwise nothing is downloaded.
  useEffect(() => {
    void run('status', async () => {
      const s = await call('ocrStatus');
      setStatus(s);
      if (s?.installed && !s.running) setStatus(await call('ocrStart'));
    });
  }, []);

  const reviewLines = doc?.result?.summary?.needs_review || 0;
  const resized = (doc?.result?.warnings || []).some((w: string) => /resized/i.test(w));
  const result = useMemo(
    () =>
      review.reviewIssues(values, confirmed, {
        reviewLineCount: reviewLines,
        reviewLinesChecked: allChecked,
        resized,
        buyerTaxIdExcluded: buyerExcluded,
      }),
    [values, confirmed, reviewLines, allChecked, resized, buyerExcluded],
  );
  // The single confirmation stands for both the fields and the flagged lines, so it is listed once.
  const issues = result.issues.some(i => i.code === 'unconfirmed_fields')
    ? result.issues.filter(i => i.code !== 'review_lines')
    : result.issues;
  const guessCount = Object.keys(guessed).filter(k => String(values[k] || '').trim()).length;

  async function read() {
    const read: (Doc & { elapsedMs?: number }) | null = await call('ocrRead', { localOnly: trialMode });
    if (!read) return;
    const extracted = read.visionOnly ? null : review.extractReceipt(read.result);
    const nextValues = Object.fromEntries(review.fieldKeys.map(k => [k, extracted?.fields[k]?.value || '']));
    // A field the rules left empty because its candidates scored close or low still gets the best candidate,
    // marked as a guess for the person to look at, instead of an empty box to fill by hand.
    const nextGuessed: Record<string, 'ocr' | 'ai'> = {};
    for (const k of review.fieldKeys) {
      const best = [...(extracted?.fields[k]?.candidates || [])].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      if (!nextValues[k] && best?.value) {
        nextValues[k] = best.value;
        nextGuessed[k] = 'ocr';
      }
    }
    setDoc({ ...read, sourceId: crypto.randomUUID() });
    setFields(extracted?.fields || {});
    setRecords(extracted?.records || []);
    setMapping(extracted?.afpMapping || null);
    setBuyerExcluded(Boolean(extracted?.buyerTaxIdExcluded));
    setValues(nextValues);
    setOrigins(Object.fromEntries(review.fieldKeys.map(k => [k, 'ocr'])));
    setGuessed(nextGuessed);
    setAllChecked(false);
    setNote('');
    setAiDecisions([]);
    setVision(null);
    setZoom(false);
    setTypeOverride('');
    setTrialVision(null);
    setTrialOcr(
      trialMode && extracted
        ? trialReading(
            nextValues,
            review.fieldKeys.filter(k => {
              const field = extracted.fields[k];
              return (
                Boolean(nextGuessed[k]) ||
                !nextValues[k] ||
                field.mappingStatus === 'ambiguous' ||
                extracted.records.some(line => line.needsReview && (field.sourceTexts || []).includes(line.text))
              );
            }),
            read.elapsedMs || 0,
          )
        : null,
    );
    // A local pilot never calls a provider automatically. The independent AI button remains explicit.
    if (trialMode) return;
    // The second, independent reading by a vision model, compared with the OCR field by field below.
    if (status?.vision && connectionId) await readWithAi(nextValues, nextGuessed);
    // Without the image reading, the AI still sorts the OCR candidates into the fields (OCR text only, masked).
    else if (
      connectionId &&
      extracted?.afpMapping &&
      (Object.keys(nextGuessed).length ||
        (extracted.afpMapping.unresolved_field_lines.length && review.fieldKeys.some(k => !nextValues[k])))
    )
      await aiFilter(nextValues, nextGuessed, extracted.afpMapping).catch(() => undefined);
  }
  async function readWithAi(current = values, currentGuessed = guessed) {
    const started = performance.now();
    const reading = await call('receiptVision', { connectionId });
    if (!reading || reading.cancelled) return;
    setVision(reading);
    if (trialOcr)
      setTrialVision(
        trialReading(
          Object.fromEntries(review.fieldKeys.map(k => [k, reading.fields?.[k]?.value || ''])),
          review.fieldKeys.filter(k => !reading.fields?.[k]?.value),
          performance.now() - started,
        ),
      );
    // A field the OCR left empty, or only guessed from a low-score candidate, takes the AI's reading (still a guess
    // to look at); a field the OCR read with confidence keeps its value and shows the AI's reading beside it when they differ.
    const next = { ...current },
      nextGuessed = { ...currentGuessed };
    for (const k of review.fieldKeys as ReceiptField[]) {
      const ai = reading.fields?.[k]?.value || '';
      if (ai && (!String(next[k] || '').trim() || currentGuessed[k])) {
        next[k] = ai;
        nextGuessed[k] = 'ai';
      }
    }
    setValues(next);
    setOrigins(previous => ({
      ...previous,
      ...Object.fromEntries(
        review.fieldKeys
          .filter(k => next[k] !== current[k] || (reading.fields?.[k]?.value && (!current[k] || currentGuessed[k])))
          .map(k => [k, 'vision']),
      ),
    }));
    setGuessed(nextGuessed);
    setAllChecked(false);
    notify(t('AI อ่านภาพใบเสร็จแล้ว ดูช่องที่ไฮไลต์เทียบกับต้นฉบับ แล้วติ๊กยืนยันครั้งเดียว'), 'success');
  }
  const matchOf = (k: string) =>
    vision ? compareField(k as ReceiptField, fields[k]?.value || '', vision.fields[k as ReceiptField]?.value || '') : undefined;
  // The total in Thai words, from the AI's reading or an OCR line such as "แปดร้อยแปดบาทถ้วน".
  const amountInWords =
    vision?.amountInWords ||
    records.map(r => String(r.text || '').replace(/\s/g, '')).find(text => /^[ก-๙()]+บาท(ถ้วน|ตัว|[ก-๙]+สตางค์)$/.test(text)) ||
    '';
  // The kind of document and what the claim still needs (src/receipt-compliance.ts).
  const detectedType = vision?.documentType || classifyFromText(String(doc?.result?.text || '')) || '';
  const docType = typeOverride || detectedType;
  const typeSource = typeOverride ? 'person' : vision?.documentType ? 'ai' : detectedType ? 'heading' : '';
  const features: DocumentFeatures = {
    ...vision?.features,
    handwritten: vision?.features.handwritten ?? (records.some(r => r.textKind === 'handwriting-likely') || undefined),
  };
  const compliance = complianceChecklist({ type: docType, features, values, amountInWords, category });
  const complianceCount = complianceSummary(compliance);
  const itemText = (item: ComplianceItem) => (item.ifCategoryB ? t('ถ้าเบิกหมวด B: ') : '') + t(item.text, ...(item.vars || []));
  const rules = receiptRuleChecks(values as Partial<Record<ReceiptField, string>>, {
    buyerTaxId: vision?.buyerTaxId,
    amountInWords,
  }).filter(r => ruleText[r.code]);
  const draft = () =>
    receiptProvenance({
      schema: 'step-receipt-review/v1',
      filename: doc?.name,
      source_id: doc?.sourceId,
      created_at: new Date().toISOString(),
      review_state: result.complete ? 'fields_checked' : 'draft_needs_review',
      notice: 'OCR suggestions checked by a person. This is not a reimbursement approval.',
      fields: Object.fromEntries(
        review.fieldKeys.map(k => [
          k,
          {
            value: values[k] || '',
            checked: Boolean(confirmed[k]),
            input_origin: origins[k] || 'ocr',
            ocr_evidence: fields[k]?.evidence || '',
            page: fields[k]?.page,
          },
        ]),
      ),
      afp_mapping: mapping
        ? {
            ...mapping,
            fields: Object.fromEntries(
              review.fieldKeys.map(k => {
                const original = fields[k]?.value || '';
                const selected = values[k] || '';
                const aiSuggested = aiDecisions.some(
                  decision => decision.field === k && decision.status === 'suggested' && decision.value === selected,
                );
                const base = mapping.fields[k] || {
                  label: labels[k],
                  required_for_desktop_precheck: review.requiredKeys.includes(k),
                  status: 'unmapped',
                  method: '',
                  selected_value: '',
                  evidence: '',
                  candidates: [],
                };
                return [
                  k,
                  {
                    ...base,
                    selected_value: selected,
                    status: aiSuggested
                      ? 'ai-suggested-unconfirmed'
                      : guessed[k] && selected
                        ? guessed[k] === 'ai'
                          ? 'ai-filled'
                          : 'low-score-candidate-filled'
                        : selected && selected !== original
                          ? 'user-selected-or-edited'
                          : base.status,
                  },
                ];
              }),
            ),
          }
        : null,
      ai_filter: aiDecisions.length
        ? {
            mode: 'candidate-only',
            notice: 'AI may select only OCR candidate tokens. Human confirmation is still required.',
            decisions: aiDecisions,
          }
        : null,
      vision_check: vision
        ? {
            notice:
              'A vision model read the receipt image independently; each field is compared with the OCR. Human confirmation is still required.',
            model: vision.model,
            notes: vision.notes,
            amount_in_words: vision.amountInWords,
            buyer_tax_id: vision.buyerTaxId,
            fields: Object.fromEntries(
              review.fieldKeys.map(k => [k, { ai_value: vision.fields[k as ReceiptField]?.value || '', match: matchOf(k) }]),
            ),
          }
        : null,
      compliance: {
        notice:
          'Document type and checklist: fixed rules tied to their source (AFP circulars, general payment-document elements to confirm with AFP, or no source yet). Not an approval.',
        document_type: docType || null,
        document_type_source: typeSource || null,
        claim_category: category,
        items: compliance.map(item => ({ id: item.id, status: item.status, source: item.source, text: itemText(item) })),
      },
      expense_note: note,
      issues: [
        ...result.issues.map(i => ({ ...i, message: describe(i) })),
        ...rules.map(r => ({ code: r.code, severity: 'advisory', message: t(ruleText[r.code]) })),
      ],
      ocr: { text: doc?.result?.text || '', lines: records },
    });
  const summary = () =>
    [
      t('ช่วย pre-check ใบเสร็จก่อนส่ง AFP'),
      '',
      doc?.visionOnly
        ? t('ข้อมูลจากใบเสร็จ “{0}” (อ่านด้วย AI จากภาพและให้คนตรวจแล้ว):', doc?.name)
        : vision
          ? t('ข้อมูลจากใบเสร็จ “{0}” (อ่านด้วย OCR ในเครื่อง เทียบกับ AI อ่านภาพ และให้คนตรวจแล้ว):', doc?.name)
          : t('ข้อมูลจากใบเสร็จ “{0}” (อ่านด้วย OCR ในเครื่องและให้คนตรวจแล้ว):', doc?.name),
      ...review.fieldKeys.map(
        k => `- ${labels[k]}: ${values[k] || t('(ไม่มี)')}${values[k] ? (confirmed[k] ? t(' · ตรวจแล้ว') : t(' · ยังไม่ตรวจ')) : ''}`,
      ),
      '',
      t('ประเภทเอกสาร: {0}', docType ? t(DOCUMENT_TYPE_LABELS[docType]) : t('ยังไม่ทราบ')),
      t('หมวดที่จะเบิก: {0}', t(CATEGORY_LABELS[category])),
      ...compliance.filter(i => i.status !== 'ok').map(i => `- [${i.status}] ${itemText(i)} (${t(SOURCE_LABELS[i.source])})`),
      ...(note.trim() ? ['', t('หมายเหตุผู้เบิก: ') + note.trim()] : []),
      ...(mapping?.unresolved_field_lines?.length
        ? [
            '',
            t(
              'OCR พบข้อความที่ดูเหมือนข้อมูลสำหรับ AFP แต่ยัง map เข้าช่องไม่ได้ {0} บรรทัด — โปรดดู afp_mapping ใน JSON',
              mapping.unresolved_field_lines.length,
            ),
          ]
        : []),
      ...(result.issues.length || rules.length
        ? ['', t('ประเด็นที่ระบบตรวจพบ:'), ...result.issues.map(i => '- ' + describe(i)), ...rules.map(r => '- ' + t(ruleText[r.code]))]
        : []),
    ].join('\n');

  const counts = review.fieldKeys.reduce(
    (total: { agree: number; differ: number; single: number }, k: string) => {
      const match = matchOf(k);
      if (match === 'agree') total.agree++;
      else if (match === 'differ') total.differ++;
      else if (match === 'ai-only' || match === 'ocr-only') total.single++;
      return total;
    },
    { agree: 0, differ: 0, single: 0 },
  );
  // The AI picks among the OCR's own candidate tokens for each field; it fills empty and guessed fields only.
  async function aiFilter(current = values, currentGuessed = guessed, currentMapping = mapping) {
    if (!currentMapping) return;
    const filtered = await call('ocrResolve', {
      connectionId,
      mapping: {
        ...currentMapping,
        fields: Object.fromEntries(
          review.fieldKeys.map(k => {
            const base = currentMapping.fields[k];
            // A guess is not a reading, so the AI sees the field as still open and chooses among all candidates.
            const open = !String(current[k] || '').trim() || currentGuessed[k];
            return [k, { ...base, selected_value: open ? '' : current[k], status: open ? 'ambiguous' : base?.status }];
          }),
        ),
      },
    });
    if (filtered?.cancelled) return;
    const decisions: AiDecision[] = Array.isArray(filtered?.decisions) ? filtered.decisions : [];
    setAiDecisions(decisions);
    const nextValues = { ...current },
      nextGuessed = { ...currentGuessed };
    for (const decision of decisions) {
      const k = decision.field;
      if (decision.status === 'suggested' && decision.value && (!String(nextValues[k] || '').trim() || currentGuessed[k])) {
        nextValues[k] = decision.value;
        nextGuessed[k] = 'ai';
      }
    }
    setValues(nextValues);
    setGuessed(nextGuessed);
    setOrigins(previous => ({
      ...previous,
      ...Object.fromEntries(review.fieldKeys.filter(k => nextValues[k] !== current[k]).map(k => [k, 'ai-candidate-filter'])),
    }));
    setAllChecked(false);
    notify(t('AI จัดข้อความ OCR เข้าช่องให้แล้ว ดูช่องที่ไฮไลต์เทียบกับต้นฉบับ แล้วติ๊กยืนยันครั้งเดียว'), 'success');
  }
  const ready = status?.running;
  const requiredFilled = review.requiredKeys.every((k: string) => String(values[k] || '').trim());
  const requiredChecked = allChecked && requiredFilled;
  return (
    <div className="receipt-app">
      <div className="receipt-service">
        <span className={`status-dot ${ready ? 'ok' : ''}`} aria-hidden="true" />
        <span>
          {!status
            ? t('กำลังตรวจบริการ OCR…')
            : ready
              ? t(
                  'OCR ในเครื่องพร้อมใช้{0}{1}{2}',
                  status.tesseract ? ' · Tesseract' : '',
                  status.handwriting ? t(' · ลายมือ') : '',
                  status.crosscheck ? ' · EasyOCR' : '',
                )
              : status.installed
                ? t('บริการ OCR ในเครื่องยังไม่เปิด')
                : status.updateAvailable
                  ? t('OCR ที่ติดตั้งไว้ต้องอัปเดตให้ตรงกับแอปเวอร์ชันนี้')
                  : t('ยังไม่ได้ติดตั้ง OCR ในเครื่องนี้')}
        </span>
        <span className="spacer" />
        {status && !ready && status.installed && (
          <button disabled={Boolean(busy)} onClick={() => void run('start', async () => setStatus(await call('ocrStart')))}>
            {busy === 'start' ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}
            {t('เปิดบริการ OCR')}
          </button>
        )}
        {status && !ready && !status.installed && (
          <>
            <button
              disabled={Boolean(busy)}
              onClick={() =>
                void run('install', async () => {
                  setInstallProgress(t('กำลังเตรียมส่วนเสริม OCR'));
                  try {
                    const installed = await call('ocrInstall', { crosscheck: false });
                    setStatus(installed);
                    setStatus(await call('ocrStart'));
                    notify(t('ติดตั้ง OCR ในเครื่องนี้แล้ว'), 'success');
                  } finally {
                    setInstallProgress('');
                  }
                })
              }
            >
              {busy === 'install' ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}
              {busy === 'install' ? t('กำลังติดตั้ง OCR…') : status.updateAvailable ? t('อัปเดต OCR') : t('ติดตั้ง OCR')}
            </button>
            <button
              className="quiet"
              disabled={Boolean(busy)}
              onClick={() => void run('folder', async () => setStatus(await call('ocrFolder')))}
            >
              <FolderOpen size={15} />
              {t('ใช้ OCR ที่มีอยู่')}
            </button>
          </>
        )}
        <button className="icon" aria-label={t('ตรวจสถานะบริการอีกครั้ง')} disabled={Boolean(busy)} onClick={() => void refresh()}>
          <RefreshCw size={15} />
        </button>
      </div>
      {status?.running && (
        <details className="receipt-ocr-layers small muted">
          <summary>{status.handwriting ? t('ส่วนเสริม OCR') : t('ส่วนเสริม OCR · ใบเขียนมือ? เพิ่มโมเดลอ่านลายมือได้ที่นี่')}</summary>
          <span>Tesseract: {status.tesseract ? t('พร้อมตรวจตัวพิมพ์/ตัวเลข') : t('ยังไม่พบ tha+eng')}</span>
          {!status.tesseract && (
            <button className="text-link" type="button" onClick={() => void call('openHelp', { topic: 'tesseract' })}>
              {t('วิธีติดตั้ง')}
            </button>
          )}
          <span>Thai-TrOCR: {status.handwriting ? t('พร้อมอ่านลายมือ') : t('ยังไม่ติดตั้ง')}</span>
          {!status.handwriting && (
            <button
              className="text-link"
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                void run('handwriting', async () => {
                  setInstallProgress(t('กำลังเตรียมโมเดลอ่านลายมือภาษาไทย'));
                  try {
                    const installed = await call('ocrInstall', { handwriting: true });
                    setStatus(installed);
                    setStatus(await call('ocrStart'));
                    notify(t('ติดตั้งโมเดลอ่านลายมือภาษาไทยแล้ว'), 'success');
                  } finally {
                    setInstallProgress('');
                  }
                })
              }
            >
              {t('เพิ่มอ่านลายมือ')}
            </button>
          )}
        </details>
      )}
      {(busy === 'install' || busy === 'handwriting') && installProgress && (
        <p className="small muted receipt-hint">{installProgress.replace(/^STEP\s*/, '')}</p>
      )}
      {status && !ready && !status.installed && (
        <p className="small muted receipt-hint">
          {t(
            'OCR เป็นส่วนเสริม ไม่ติดมากับตัวติดตั้งหลัก กด “{0}” เมื่อต้องการใช้ ระบบจะดาวน์โหลด Python ที่ตรวจสอบ checksum แล้ว จากนั้นติดตั้ง Paddle และโมเดล OCR ไว้ใน App Data ของผู้ใช้นี้ การอ่านใบเสร็จทำบนเครื่องและไม่ส่งไฟล์ไปบริการ OCR บนอินเทอร์เน็ต',
            status.updateAvailable ? t('อัปเดต OCR') : t('ติดตั้ง OCR'),
          )}
        </p>
      )}

      <label className="receipt-hint">
        <input type="checkbox" checked={trialMode} disabled={Boolean(busy)} onChange={e => setTrialMode(e.target.checked)} />
        {t('ทดลอง OCR ในเครื่อง (สำหรับใบที่เลือกครั้งถัดไป)')}
      </label>
      {trialMode && (
        <p className="small muted receipt-hint">
          {t('อ่านด้วย OCR ในเครื่องก่อน เก็บผลก่อนแก้และเวลาอ่านไว้ให้เทียบกับค่าที่คุณตรวจแล้ว AI จะทำงานเมื่อคุณกดเรียกเอง')}
        </p>
      )}
      {!doc ? (
        <div className="receipt-empty">
          <SectionArt scene="receipt" className="receipt-illustration" />
          <h2>{t('ตรวจใบเสร็จก่อนส่ง AFP')}</h2>
          <p className="muted">
            {t('เลือกรูปหรือ PDF ของใบเสร็จ ระบบจะอ่านข้อความและเสนอข้อมูลสำคัญ')}
            <br />
            {t('ระบบกรอกให้ทุกช่องที่อ่านได้ คุณเทียบกับต้นฉบับ แก้ที่ผิด แล้วติ๊กยืนยันครั้งเดียว')}
          </p>
          <button
            disabled={!(trialMode ? ready : ready || (status?.vision && connectionId)) || Boolean(busy)}
            onClick={() => void run('read', read)}
          >
            {busy === 'read' ? <LoaderCircle size={16} className="spin" /> : <FileSearch size={16} />}
            {busy === 'read' ? t('กำลังอ่านใบเสร็จ… ครั้งแรกอาจใช้ 1–2 นาที') : t('เลือกใบเสร็จ')}
          </button>
          {status?.vision && !trialMode && (
            <p className="small muted">
              {ready
                ? t('อ่าน 2 ทาง: OCR ในเครื่อง และ AI อ่านภาพแยกกัน แล้วเทียบผลทีละช่อง')
                : connectionId
                  ? t('ยังไม่มี OCR ในเครื่อง ใช้ AI อ่านภาพได้เลย (อ่านทางเดียว ติดตั้ง OCR เพิ่มเพื่อเทียบ 2 ทาง)')
                  : t('เชื่อมต่อ AI ก่อน เพื่อให้ AI อ่านภาพใบเสร็จ')}
            </p>
          )}
          <p className="small muted">{t('รองรับ PDF, PNG, JPG, WebP, BMP, TIFF ขนาดไม่เกิน 25 MB')}</p>
        </div>
      ) : (
        <div className="receipt-grid">
          <section className="receipt-source" aria-label={t('ใบเสร็จต้นฉบับ')}>
            <header>
              <ScanText size={16} />
              <strong>{doc.name}</strong>
              {doc.preview && (
                <button
                  type="button"
                  className="icon receipt-zoom"
                  aria-pressed={zoom}
                  aria-label={zoom ? t('ย่อภาพใบเสร็จ') : t('ขยายภาพใบเสร็จ')}
                  title={zoom ? t('ย่อภาพใบเสร็จ') : t('ขยายภาพใบเสร็จ')}
                  onClick={() => setZoom(!zoom)}
                >
                  {zoom ? <ZoomOut size={15} /> : <ZoomIn size={15} />}
                </button>
              )}
            </header>
            {doc.preview ? (
              <div className={'receipt-preview-frame' + (zoom ? ' zoomed' : '')}>
                <img className="receipt-preview" src={doc.preview} alt={t('ภาพใบเสร็จ ') + doc.name} onClick={() => setZoom(!zoom)} />
              </div>
            ) : (
              <p className="small muted">{t('ไฟล์ชนิดนี้แสดงภาพในแอปไม่ได้ โปรดเปิดต้นฉบับเทียบกับข้อความด้านล่าง')}</p>
            )}
            {vision?.notes && (
              <p className="receipt-vision-note small">
                <Eye size={14} />
                {t('AI ฝากตรวจ: {0}', vision.notes)}
              </p>
            )}
            <details open={reviewLines > 0}>
              <summary>
                {reviewLines
                  ? t('ข้อความที่อ่านได้ ({0} บรรทัด · ต้องตรวจ {1})', records.length, reviewLines)
                  : t('ข้อความที่อ่านได้ ({0} บรรทัด)', records.length)}
              </summary>
              <ol className="ocr-lines">
                {records.map((r, i) => (
                  <li key={i} className={r.needsReview ? 'flag' : ''}>
                    <span>{r.text}</span>
                    {r.tesseractCandidate && r.tesseractCandidate !== r.text && (
                      <small>
                        {t('Tesseract อ่านว่า “{0}”', r.tesseractCandidate)}
                        {r.tesseractConfidence !== null && r.tesseractConfidence !== undefined
                          ? ` · ${Math.round(r.tesseractConfidence * 100)}%`
                          : ''}
                      </small>
                    )}
                    {r.handwritingCandidate && r.handwritingCandidate !== r.text && (
                      <small>{t('โมเดลลายมืออ่านว่า “{0}” · ยังไม่ยืนยัน', r.handwritingCandidate)}</small>
                    )}
                    {r.crosscheckCandidate && r.crosscheckCandidate !== r.text && (
                      <small>{t('EasyOCR อ่านว่า “{0}”', r.crosscheckCandidate)}</small>
                    )}
                    {r.confidence !== null && <small className="conf">{Math.round(r.confidence * 100)}%</small>}
                  </li>
                ))}
              </ol>
            </details>
          </section>
          <section className="receipt-form" aria-label={t('ข้อมูลที่ต้องตรวจ')}>
            {pilot && (
              <details open className="receipt-compliance receipt-trial" aria-label={t('ผลทดลอง OCR')}>
                <summary>{t('ผลทดลอง OCR · ก่อนแก้เทียบกับค่าที่คนตรวจ')}</summary>
                <p className="small muted">
                  {t('เวลา OCR {0} วินาที · รวมการโหลดโมเดลถ้ามี · ยังไม่ได้วัด RAM', (pilot.ocr.elapsedMs / 1000).toFixed(2))}
                  {pilot.vision && ' · ' + t('เวลา AI {0} วินาที (รวมเวลายืนยันส่งภาพ)', (pilot.vision.elapsedMs / 1000).toFixed(2))}
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>{t('ช่อง')}</th>
                        <th>{t('OCR ก่อนแก้')}</th>
                        {pilot.vision && <th>{t('AI อ่านภาพ')}</th>}
                        <th>{t('ค่าที่คนตรวจ')}</th>
                        <th>{t('ผล OCR')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {review.fieldKeys.map(k => {
                        const row = pilot.fields[k as ReceiptField];
                        return (
                          <tr key={k}>
                            <th>{labels[k]}</th>
                            <td>{row.ocr.value || '—'}</td>
                            {pilot.vision && (
                              <td>
                                {row.vision?.value || '—'}
                                {row.vision?.match !== null && (row.vision?.match ? ' ✓' : ' ✕')}
                              </td>
                            )}
                            <td>{row.human.value || '—'}</td>
                            <td>
                              {row.ocr.match === null ? t('รอยืนยัน') : row.ocr.match ? t('ตรง') : t('ต่าง')}
                              {row.ocr.needsReview && ' · ' + t('เตือนให้ตรวจ')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {pilot.summary ? (
                  <p className="small">
                    {t(
                      'OCR ตรง {0}/7 ช่อง · ต่าง {1} · ต่างแต่ไม่เตือน {2} · เตือนช่องที่ตรง {3}',
                      pilot.summary.ocr.exact,
                      pilot.summary.ocr.errors,
                      pilot.summary.ocr.missedErrors,
                      pilot.summary.ocr.extraWarnings,
                    )}
                  </p>
                ) : (
                  <p className="small muted">{t('แก้ค่าตามภาพ รวมถึงช่องที่ไม่มีค่า แล้วติ๊กตรวจทั้งหมด จึงจะคำนวณผลทดลอง')}</p>
                )}
                <p className="small muted">
                  {t(
                    'เทียบข้อความตรงตัว โดยคงเลขศูนย์นำหน้าและรูปแบบวันที่/เงินไว้ รูปแบบต่างกันอาจนับว่าต่าง ผลใบเดียวไม่ยืนยันความแม่นยำหรือการผ่านเกณฑ์',
                  )}
                </p>
                <button
                  type="button"
                  className="quiet"
                  disabled={!allChecked || Boolean(busy)}
                  onClick={() =>
                    void run('trial-save', async () => {
                      const saved = await call('ocrTrialSave', {
                        draft: { ...pilot, source_id: doc.sourceId, created_at: new Date().toISOString() },
                      });
                      if (saved)
                        notify(t('บันทึกผลทดลองในเครื่องแล้ว'), 'success', {
                          label: t('เปิดโฟลเดอร์'),
                          run: () => call('reveal', { path: saved.path }),
                        });
                    })
                  }
                >
                  <Save size={15} />
                  {t('บันทึกผลทดลอง (JSON)')}
                </button>
                <p className="small muted">{t('รายงานมีข้อมูลจากเอกสารจริง เลือกเก็บนอก Git repo และดูแลตามข้อกำหนดองค์กร')}</p>
              </details>
            )}
            <div className="receipt-progress" role="status">
              <div className="receipt-progress-head">
                <strong>
                  {t('กรอกให้แล้ว {0}/{1} ช่อง', result.filledCount, review.fieldKeys.length)}
                  {guessCount > 0 && ' · ' + t('เดาให้ {0} ช่อง', guessCount)}
                </strong>
                {vision && (
                  <span className="receipt-progress-chips">
                    {counts.agree > 0 && <span className="chip agree">{t('ตรงกัน {0}', counts.agree)}</span>}
                    {counts.differ > 0 && <span className="chip differ">{t('อ่านต่างกัน {0}', counts.differ)}</span>}
                    {counts.single > 0 && <span className="chip">{t('อ่านได้ทางเดียว {0}', counts.single)}</span>}
                  </span>
                )}
              </div>
              <div className="receipt-progress-bar" aria-hidden="true">
                <span style={{ width: `${(100 * result.filledCount) / review.fieldKeys.length}%` }} />
              </div>
              <small className="muted">{t('ช่องสีเหลืองคือค่าที่ระบบเดาให้จาก OCR คะแนนต่ำหรือจาก AI ดูให้แน่ใจก่อนยืนยัน')}</small>
              {(status?.vision || mapping) && (
                <div className="receipt-ai-tools">
                  {status?.vision && (
                    <button
                      className="text-link"
                      type="button"
                      disabled={!connectionId || Boolean(busy)}
                      onClick={() => void run('vision', () => readWithAi())}
                    >
                      {busy === 'vision' ? <LoaderCircle size={13} className="spin" /> : <Eye size={13} />}
                      {vision ? t('ให้ AI อ่านภาพอีกครั้ง') : t('ให้ AI อ่านภาพเทียบ')}
                    </button>
                  )}
                  {mapping && (
                    <button
                      className="text-link"
                      type="button"
                      disabled={!connectionId || Boolean(busy)}
                      onClick={() => void run('ai-filter', () => aiFilter())}
                    >
                      {busy === 'ai-filter' ? <LoaderCircle size={13} className="spin" /> : <ScanText size={13} />}
                      {t('AI กรอง OCR อีกชั้น')}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="receipt-compliance" aria-label={t('ประเภทเอกสารและสิ่งที่ต้องมี')}>
              <div className="receipt-compliance-head">
                <label>
                  {t('ประเภทเอกสาร')}
                  <select aria-label={t('ประเภทเอกสาร')} value={docType} onChange={e => setTypeOverride(e.target.value as DocumentType)}>
                    {!docType && <option value="">{t('ยังไม่ทราบ')}</option>}
                    {DOCUMENT_TYPES.map(type => (
                      <option key={type} value={type}>
                        {t(DOCUMENT_TYPE_LABELS[type])}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('หมวดที่จะเบิก')}
                  <select aria-label={t('หมวดที่จะเบิก')} value={category} onChange={e => setCategory(e.target.value as ClaimCategory)}>
                    {(Object.keys(CATEGORY_LABELS) as ClaimCategory[]).map(c => (
                      <option key={c} value={c}>
                        {t(CATEGORY_LABELS[c])}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <small className="muted">
                {typeSource === 'ai'
                  ? t('AI จำแนกจากภาพ เปลี่ยนได้ถ้าไม่ถูก')
                  : typeSource === 'heading'
                    ? t('จำแนกจากหัวเอกสารที่ OCR อ่านได้ เปลี่ยนได้ถ้าไม่ถูก')
                    : typeSource === 'person'
                      ? t('คุณเลือกประเภทเอง')
                      : t('ยังจำแนกไม่ได้ เลือกประเภทเอง หรือให้ AI อ่านภาพ')}
              </small>
              <div className="receipt-compliance-summary">
                <strong>{t('สิ่งที่ต้องมีและต้องทำ')}</strong>
                {complianceCount.missing > 0 && <span className="chip differ">{t('ขาด {0}', complianceCount.missing)}</span>}
                {complianceCount.warn > 0 && <span className="chip differ">{t('ควรตรวจ {0}', complianceCount.warn)}</span>}
                {complianceCount.todo > 0 && <span className="chip">{t('ต้องเตรียม {0}', complianceCount.todo)}</span>}
              </div>
              {(() => {
                const order: ComplianceItem['status'][] = ['missing', 'warn', 'todo', 'info'];
                const open = compliance.filter(i => i.status !== 'ok').sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
                const done = compliance.filter(i => i.status === 'ok');
                const row = (item: ComplianceItem) => (
                  <li key={item.id} className={'status-' + item.status}>
                    <span className="mark" aria-hidden="true">
                      {STATUS_MARK[item.status]}
                    </span>
                    <span>
                      {itemText(item)}
                      <small className={'source source-' + item.source}>{t(SOURCE_LABELS[item.source])}</small>
                    </span>
                  </li>
                );
                return (
                  <>
                    {open.length > 0 && <ul className="receipt-compliance-list">{open.map(row)}</ul>}
                    {done.length > 0 && (
                      <details className="receipt-compliance-done">
                        <summary>{t('ครบแล้ว {0} ข้อ: {1}', done.length, done.map(i => itemText(i)).join(' · '))}</summary>
                        <ul className="receipt-compliance-list">{done.map(row)}</ul>
                      </details>
                    )}
                  </>
                );
              })()}
              <small className="muted">{t('รายการนี้ช่วยเตรียมเอกสาร ไม่ใช่การอนุมัติเบิกจ่าย ข้อที่ยังไม่มีแหล่งยืนยันให้ถาม AFP')}</small>
            </div>
            {review.fieldKeys.map((k, index) => (
              <div
                className={
                  'receipt-field' +
                  (matchOf(k) ? ' match-' + matchOf(k) : '') +
                  (guessed[k] && values[k] ? ' guessed' : '') +
                  (allChecked && values[k] ? ' confirmed' : '')
                }
                key={k}
              >
                <label htmlFor={'rf-' + k}>
                  {labels[k]}
                  {review.requiredKeys.includes(k) && <span className="required"> *</span>}
                </label>
                <div className="receipt-field-row">
                  <input
                    id={'rf-' + k}
                    value={values[k] || ''}
                    onChange={e => edit(k, e.target.value)}
                    onKeyDown={e => {
                      // Enter moves on to the next field.
                      if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                      e.preventDefault();
                      const next = review.fieldKeys[index + 1];
                      (document.getElementById(next ? 'rf-' + next : 'receipt-confirm') as HTMLElement | null)?.focus();
                    }}
                  />
                </div>
                {guessed[k] && values[k] && (
                  <small className="receipt-guess">
                    <TriangleAlert size={12} />
                    {guessed[k] === 'ai' ? t('AI เลือกให้ · ดูกับภาพ') : t('เดาจาก OCR ที่ยังไม่แน่ใจ · ดูกับภาพ')}
                  </small>
                )}
                {fields[k]?.evidence && (
                  <small className="muted">
                    {t('จากบรรทัด “{0}”', fields[k].evidence)}
                    {fields[k].confidence !== null ? ` · ${Math.round((fields[k].confidence || 0) * 100)}%` : ''}
                  </small>
                )}
                {(() => {
                  const match = matchOf(k),
                    ai = vision?.fields[k as ReceiptField]?.value || '';
                  if (!match || match === 'empty') return null;
                  if (match === 'agree')
                    return (
                      <small className="receipt-match agree">
                        <Check size={12} />
                        {t('OCR และ AI อ่านตรงกัน')}
                      </small>
                    );
                  if (match === 'ai-only')
                    return (
                      <small className="receipt-match ai-only">
                        <Eye size={12} />
                        {doc?.visionOnly ? t('AI อ่านจากภาพ · ตรวจกับต้นฉบับ') : t('OCR ไม่พบ AI อ่านได้ “{0}” · ตรวจกับภาพ', ai)}
                        {values[k] !== ai && (
                          <button className="text-link" type="button" onClick={() => edit(k, ai)}>
                            {t('ใช้ค่านี้')}
                          </button>
                        )}
                      </small>
                    );
                  if (match === 'ocr-only')
                    return <small className="receipt-match ocr-only">{t('AI อ่านช่องนี้ไม่เห็น ใช้ค่าจาก OCR · ตรวจกับภาพ')}</small>;
                  return (
                    <small className="receipt-match differ">
                      <TriangleAlert size={12} />
                      {t('อ่านต่างกัน: AI อ่านว่า “{0}”', ai)}
                      {values[k] !== ai && (
                        <button className="text-link" type="button" onClick={() => edit(k, ai)}>
                          {t('ใช้ค่านี้')}
                        </button>
                      )}
                    </small>
                  );
                })()}
                {(!String(values[k] || '').trim() || guessed[k]) &&
                  (fields[k]?.candidates || []).some(candidate => candidate.value !== values[k]) && (
                    <div className="receipt-candidates">
                      <small>{t('ค่าอื่นที่ OCR อ่านได้สำหรับช่องนี้:')}</small>
                      <div>
                        {(fields[k]?.candidates || [])
                          .filter(candidate => candidate.value !== values[k])
                          .slice(0, 3)
                          .map((candidate, index) => (
                            <button className="quiet" type="button" key={candidate.value + index} onClick={() => edit(k, candidate.value)}>
                              {t('ใช้ “{0}”', candidate.value)}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                {aiDecisions
                  .filter(decision => decision.field === k)
                  .map((decision, index) => (
                    <small className="receipt-ai-decision" key={decision.field + index}>
                      AI filter:{' '}
                      {decision.status === 'suggested'
                        ? t('แนะนำ candidate “{0}”', decision.value)
                        : decision.status === 'keep'
                          ? t('เห็นด้วยกับค่าปัจจุบัน')
                          : decision.status === 'ambiguous'
                            ? t('ยังไม่แน่ใจ ให้คนเลือก')
                            : t('หลักฐานยังไม่พอ map')}
                      {decision.reason ? ` · ${decision.reason}` : ''}
                    </small>
                  ))}
              </div>
            ))}
            {mapping?.unresolved_field_lines?.length ? (
              <details className="receipt-mapping-warning">
                <summary>
                  {t('พบข้อมูลลักษณะช่อง AFP ที่ยัง map ไม่สำเร็จ')} {mapping.unresolved_field_lines.length} {t('บรรทัด')}
                </summary>
                <ul>
                  {mapping.unresolved_field_lines.slice(0, 8).map((line, index) => (
                    <li key={line.text + index}>{line.text}</li>
                  ))}
                </ul>
                <small className="muted">
                  {t('ข้อมูลยังอยู่ใน JSON/Workspace และจะไม่ถูกทิ้ง AI ใช้บรรทัดเหล่านี้ช่วยจัดเข้าช่องได้')}
                </small>
              </details>
            ) : null}
            <label className="receipt-note">
              {t('หมายเหตุการเบิก')}
              <textarea
                id="receipt-note"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={t('เช่น ใช้ในโครงการ… (กรอกเอง)')}
              />
            </label>
            <label className={'receipt-confirm' + (allChecked ? ' checked' : '')}>
              <input
                id="receipt-confirm"
                type="checkbox"
                disabled={!result.filledCount}
                checked={allChecked}
                onChange={e => setAllChecked(e.target.checked)}
              />
              <span>
                <strong>{t('ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว')}</strong>
                <small>
                  {t('ทุกช่องด้านบน')}
                  {guessCount > 0 && t(' รวม {0} ช่องที่ระบบเดาให้', guessCount)}
                  {reviewLines > 0 && t(' และ {0} บรรทัดที่ไฮไลต์ในข้อความที่อ่านได้', reviewLines)}
                </small>
              </span>
            </label>
            <div className={`receipt-verdict ${result.complete ? 'ok' : ''}`} role="status">
              {result.complete ? <Check size={16} /> : <TriangleAlert size={16} />}
              <div>
                <strong>{result.complete ? t('พร้อมให้ AFP ตรวจ') : t('ยังต้องตรวจหรือแก้เพิ่ม')}</strong>{' '}
                {issues.length + rules.length > 0 && (
                  <ul>
                    {issues.map(i => (
                      <li key={i.code} className={i.severity}>
                        {describe(i)}
                      </li>
                    ))}
                    {rules.map(r => (
                      <li key={r.code} className="advisory">
                        {t(ruleText[r.code])}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="small muted">
                  {t('ผลนี้เป็นการตรวจเอกสารเบื้องต้น ไม่ใช่การอนุมัติเบิกจ่าย และยังไม่ได้เทียบกับระเบียบการเงินฉบับปัจจุบัน')}
                </p>
              </div>
            </div>
            <div className="receipt-actions">
              <button
                className="quiet"
                onClick={() =>
                  void run('save', async () => {
                    const saved = await call('ocrSave', { draft: draft() });
                    if (saved)
                      notify(t('บันทึกร่างการตรวจแล้ว'), 'success', {
                        label: t('เปิดโฟลเดอร์'),
                        run: () => call('reveal', { path: saved.path }),
                      });
                  })
                }
              >
                <Save size={15} />
                {t('บันทึกร่าง (JSON)')}
              </button>
              <button className="quiet" disabled={Boolean(busy)} onClick={() => void run('read', read)}>
                <FileSearch size={15} />
                {t('ตรวจใบใหม่')}
              </button>
              <span className="spacer" />
              {/* AI pre-check follows the person's one confirmation of every field. A checked vendor tax ID stays readable. */}
              {!requiredChecked && (
                <small className="muted receipt-actions-hint">
                  {requiredFilled ? t('ติ๊ก “ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว” ก่อนส่งให้ AI') : t('กรอกช่องที่มี * ให้ครบก่อนส่งให้ AI')}
                </small>
              )}
              <button
                disabled={!requiredChecked || Boolean(busy)}
                onClick={() =>
                  void run('handoff', () =>
                    handoff(
                      summary(),
                      receiptSourceText(draft()),
                      confirmed.taxId && /^0\d{12}$/.test(review.normalizeDigits(values.taxId || ''))
                        ? [review.normalizeDigits(values.taxId)]
                        : [],
                    ),
                  )
                }
              >
                <Send size={15} />
                {t('ให้ AI pre-check ต่อ')}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
