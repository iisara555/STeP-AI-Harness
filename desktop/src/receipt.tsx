import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Download, FileSearch, LoaderCircle, Play, RefreshCw, Save, ScanText, Send, ZoomIn, ZoomOut } from 'lucide-react';
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  classifyFromText,
  complianceChecklist,
  receiptCompleteness,
  type ClaimCategory,
  type ComplianceItem,
  type DocumentFeatures,
  type DocumentType,
} from './receipt-compliance';
import {
  compareField,
  receiptRuleChecks,
  RECEIPT_SIGNATURE_ROLES,
  type ReceiptField,
  type ReceiptSignatureRole,
  type SignatureStatus,
} from './receipt-vision';
// One extraction and review rule set, shared with the OCR trial's own web page and its tests.
import '../../experiments/local-thai-ocr/web/receipt-review.js';
import { SectionArt } from './illustration';
import { receiptSourceText } from './receipt-source';
import { receiptProvenance } from './extraction-provenance';
import { expenseCategorySuggestion, expenseCodeLabel, expenseDescriptionFromText, formValues, receiptAssessment } from './receipt-workflow';
import { localized, t } from './i18n';
import { emptyReceiptForm, receiptFormReducer } from './receipt-form';
import { visionFormSuggestions, receiptFocusStyle } from './receipt-hybrid';
import type { ReceiptVisionResult } from '../electron/receipt-vision-recheck';
import { explainError, connectionLabel } from './messages';
import type { Connection } from './types';

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
  textOnly?: boolean;
};
type Vision = ReceiptVisionResult & { model: string; pagePreviews?: string[] };
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
const signatureLabels: Record<ReceiptSignatureRole, string> = localized({
  receiver: 'ลายเซ็นผู้รับเงิน',
  issuer: 'ลายเซ็นผู้ออกเอกสาร',
  buyer: 'ลายเซ็นผู้ซื้อ / ผู้จ่ายเงิน',
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
  invalid_money: 'รูปแบบยอดเงินไม่ถูกต้องหรือมีเศษต่ำกว่าหนึ่งสตางค์ โปรดเทียบกับต้นฉบับ',
  amounts_do_not_add_up: 'ยอดก่อนภาษีบวกภาษีไม่ตรงกับยอดรวม แม้ต่างหนึ่งสตางค์ก็ต้องตรวจต้นฉบับ',
  tax_id_checksum: 'เลขผู้เสียภาษีไม่ผ่านการตรวจเลขหลักสุดท้าย อาจอ่านผิดหนึ่งหลัก โปรดเทียบกับต้นฉบับ',
  tax_id_may_be_buyer:
    'เลขผู้เสียภาษีนี้อาจเป็นของผู้ซื้อ (เช่น มหาวิทยาลัย) ไม่ใช่ของร้าน ร้านบางแห่งเขียนเลขลูกค้าลงช่องผู้ออก โปรดตรวจกับต้นฉบับ',
  vat_not_7_percent: 'ภาษีมูลค่าเพิ่มไม่เท่ากับ 7% ของยอดก่อนภาษี โปรดตรวจตัวเลขทั้งสองช่อง',
  amount_words_differ: 'ยอดเงินตัวอักษรไม่ตรงกับยอดรวมตัวเลข โปรดตรวจยอดรวมกับต้นฉบับ',
  amount_words_unreadable: 'ยังแปลงยอดเงินตัวอักษรไม่ได้ โปรดเทียบข้อความกับต้นฉบับ',
  invalid_item_number: 'ตัวเลขในตารางรายการยังอ่านไม่ครบหรือรูปแบบไม่ถูกต้อง โปรดตรวจต้นฉบับ',
  item_amount_mismatch: 'จำนวนคูณราคาต่อหน่วยไม่ตรงกับยอดรายการ โปรดตรวจตารางกับต้นฉบับ',
  item_rounding_needs_review: 'รายการมีเศษต่ำกว่าหนึ่งสตางค์ ต้องยืนยันกติกาปัดเศษก่อนตรวจยอด',
  items_total_mismatch: 'ผลรวมรายการไม่ตรงกับยอดรวมตารางที่ระบุบนใบเสร็จ โปรดตรวจต้นฉบับ',
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
  connections = [],
  chooseConnection,
  openAiSettings,
}: {
  call: (method: string, input?: unknown) => Promise<any>;
  onError: (error: unknown) => void;
  notify: (text: string, tone?: 'info' | 'success' | 'error', action?: { label: string; run: () => unknown }) => void;
  handoff: (text: string, sourceText: string, allowIds?: string[]) => Promise<void>;
  onEvent: (callback: (event: { type: string; text?: string }) => void) => () => void;
  connectionId?: string;
  /** Whether a read or check is running, so the sidebar can show it while another page is open. */
  onBusy?: (busy: boolean) => void;
  connections?: Connection[];
  chooseConnection?: (id: string) => void;
  openAiSettings?: () => void;
}) {
  const [status, setStatus] = useState<OcrStatus | null>(null),
    [busy, setBusy] = useState(''),
    [installProgress, setInstallProgress] = useState('');
  const [doc, setDoc] = useState<Doc | null>(null),
    [fields, setFields] = useState<Record<string, Field>>({}),
    [records, setRecords] = useState<LineRecord[]>([]),
    [mapping, setMapping] = useState<AfpMapping | null>(null);
  // One confirmation covers every field and every flagged OCR line; editing anything clears it.
  const [form, updateForm] = useReducer(receiptFormReducer, emptyReceiptForm);
  const { values, guessed, origins, checked: allChecked } = form;
  const { value: expenseDescription, edited: descriptionEdited, origin: descriptionOrigin } = form.description;
  const sourceIdRef = useRef('');
  const actionPending = useRef(false);
  const [actionError, setActionError] = useState('');
  const statusVersion = useRef(0);
  const setAllChecked = (checked: boolean) => updateForm({ type: 'check', checked });
  const confirmed = useMemo(
    () => (allChecked ? Object.fromEntries(review.fieldKeys.map(k => [k, true])) : {}) as Record<string, boolean>,
    [allChecked],
  );
  const edit = (field: string, value: string) => updateForm({ type: 'edit', field, value });
  const [note, setNote] = useState(''),
    [buyerExcluded, setBuyerExcluded] = useState(false),
    [aiDecisions, setAiDecisions] = useState<AiDecision[]>([]),
    [vision, setVision] = useState<Vision | null>(null),
    [zoom, setZoom] = useState(false),
    [typeOverride, setTypeOverride] = useState<DocumentType | ''>(''),
    [categoryOverride, setCategory] = useState<ClaimCategory | null>(null);
  const [focusedField, setFocusedField] = useState<ReceiptField | null>(null);
  const [signatureFocus, setSignatureFocus] = useState<ReceiptSignatureRole | null>(null);
  const [signatureOverrides, setSignatureOverrides] = useState<Partial<Record<ReceiptSignatureRole, SignatureStatus>>>({});
  const [previewPage, setPreviewPage] = useState(1);
  const focusedRegion = signatureFocus
    ? vision?.signatures?.[signatureFocus]?.region
    : focusedField
      ? vision?.fields[focusedField]?.region
      : null;
  const focusedLabel = signatureFocus ? signatureLabels[signatureFocus] : focusedField ? labels[focusedField] : '';
  const previews = vision?.pagePreviews || [];
  const currentPage = focusedRegion && (focusedRegion.page === 1 || previews[focusedRegion.page - 1]) ? focusedRegion.page : previewPage;
  const preview = currentPage === 1 ? doc?.preview || previews[0] : previews[currentPage - 1];
  const fieldRegion = focusedRegion?.page === currentPage && preview ? focusedRegion : null;
  useEffect(() => onBusy?.(Boolean(busy) && busy !== 'status'), [busy, onBusy]);
  const run = async (id: string, fn: () => Promise<unknown>) => {
    const foreground = id !== 'status';
    if (foreground && actionPending.current) return;
    if (foreground) {
      actionPending.current = true;
      setBusy(id);
      setActionError('');
    }
    try {
      await fn();
    } catch (e) {
      setActionError(explainError(e));
      if (id !== 'handoff') onError(e);
    } finally {
      if (foreground) {
        actionPending.current = false;
        setBusy('');
      }
    }
  };
  const refresh = () =>
    run('status', async () => {
      const version = ++statusVersion.current;
      const next = await call('ocrStatus', { connectionId });
      if (version === statusVersion.current) setStatus(next);
    });
  useEffect(
    () =>
      onEvent(event => {
        if (event.type === 'install' && /^(STEP|DONE)/.test(event.text || '')) setInstallProgress(event.text || '');
      }),
    [onEvent],
  );
  // OCR is optional. If the employee installed it before, opening this page starts the local service; otherwise nothing is downloaded.
  useEffect(() => {
    let current = true;
    const version = ++statusVersion.current;
    void run('status', async () => {
      const s = await call('ocrStatus', { connectionId });
      if (!current || version !== statusVersion.current) return;
      const next = s?.installed && !s.running ? await call('ocrStart', { connectionId }) : s;
      if (current && version === statusVersion.current) setStatus(next);
    });
    return () => {
      current = false;
    };
  }, [connectionId]);

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
    const read: (Doc & { elapsedMs?: number }) | null = await call('ocrRead', { connectionId: usableConnectionId });
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
    const sourceId = crypto.randomUUID();
    sourceIdRef.current = sourceId;
    setDoc({ ...read, sourceId });
    setFields(extracted?.fields || {});
    setRecords(extracted?.records || []);
    setMapping(extracted?.afpMapping || null);
    setBuyerExcluded(Boolean(extracted?.buyerTaxIdExcluded));
    updateForm({
      type: 'load',
      sourceId,
      values: formValues(nextValues),
      guessed: nextGuessed,
      description: expenseDescriptionFromText(String(read.result?.text || '')),
    });
    setNote('');
    setAiDecisions([]);
    setVision(null);
    setSignatureFocus(null);
    setSignatureOverrides({});
    setPreviewPage(1);
    setFocusedField(null);
    setZoom(false);
    setTypeOverride('');
    setCategory(null);
    // The second, independent reading by a vision model, compared with the OCR field by field below.
    if (status?.vision && usableConnectionId) await readWithAi(formValues(nextValues), nextGuessed, sourceId);
    // Without the image reading, the AI still sorts the OCR candidates into the fields (OCR text only, masked).
    else if (usableConnectionId && extracted?.afpMapping)
      await aiFilter(nextValues, nextGuessed, extracted.afpMapping, String(read.result?.text || ''), sourceId);
  }
  async function readWithAi(current = values, currentGuessed = guessed, sourceId = sourceIdRef.current) {
    const reading = await call('receiptVision', { connectionId });
    if (!reading || reading.cancelled || sourceIdRef.current !== sourceId) return;
    setVision(reading);
    // Handwriting uses Vision first. Printed OCR remains an independent comparison; manual edits always win in the reducer.
    const suggestions = visionFormSuggestions(current, currentGuessed, reading);
    updateForm({
      type: 'suggest',
      sourceId,
      origin: 'vision',
      values: { ...suggestions, merchantAddress: reading.merchantAddress || '', amountInWords: reading.amountInWords || '' },
      description: reading.expenseDescription,
    });
    notify(t('AI อ่านภาพใบเสร็จแล้ว ดูช่องที่ไฮไลต์เทียบกับต้นฉบับ แล้วติ๊กยืนยันครั้งเดียว'), 'success');
  }
  const matchOf = (k: string) =>
    vision ? compareField(k as ReceiptField, fields[k]?.value || '', vision.fields[k as ReceiptField]?.value || '') : undefined;
  // The total in Thai words, from the AI's reading or an OCR line such as "แปดร้อยแปดบาทถ้วน".
  const amountInWords =
    form.origins.amountInWords === 'manual'
      ? values.amountInWords || ''
      : values.amountInWords ||
        vision?.amountInWords ||
        records.map(r => String(r.text || '').replace(/\s/g, '')).find(text => /^[ก-๙()]+บาท(ถ้วน|ตัว|[ก-๙]+สตางค์)$/.test(text)) ||
        '';
  const signatureStatus = (role: ReceiptSignatureRole): SignatureStatus =>
    signatureOverrides[role] ??
    vision?.signatures?.[role]?.status ??
    (role === 'receiver' && vision?.features.receiverSigned !== undefined
      ? vision.features.receiverSigned
        ? 'present'
        : 'absent'
      : 'uncertain');
  // The kind of document and what the claim still needs (src/receipt-compliance.ts).
  const detectedType = vision?.documentType || classifyFromText(String(doc?.result?.text || '')) || '';
  const docType = typeOverride || detectedType;
  const typeSource = typeOverride ? 'person' : vision?.documentType ? 'ai' : detectedType ? 'heading' : '';
  const features: DocumentFeatures = {
    ...vision?.features,
    receiverSigned: signatureStatus('receiver') === 'uncertain' ? undefined : signatureStatus('receiver') === 'present',
    itemsListed: descriptionEdited
      ? Boolean(expenseDescription.trim())
      : (vision?.features.itemsListed ?? (expenseDescription.trim() ? true : undefined)),
    handwritten: vision?.features.handwritten ?? (records.some(r => r.textKind === 'handwriting-likely') || undefined),
  };
  const categorySuggestion = expenseCategorySuggestion(expenseDescription, note, values.date);
  const category = categoryOverride ?? categorySuggestion.category;
  const compliance = complianceChecklist({ type: docType, features, values, amountInWords, category });
  const completeness = receiptCompleteness(compliance);
  const itemText = (item: ComplianceItem) => (item.ifCategoryB ? t('ถ้าเบิกหมวด B: ') : '') + t(item.text, ...(item.vars || []));
  const rules = receiptRuleChecks(values as Partial<Record<ReceiptField, string>>, {
    buyerTaxId: vision?.buyerTaxId,
    amountInWords,
    items: vision?.items,
    itemsTotal: vision?.itemsTotal,
  }).filter(r => ruleText[r.code]);
  const assessment = receiptAssessment({
    type: docType,
    values,
    items: compliance,
    hasRuleWarnings: rules.length > 0,
    checked: allChecked,
  });
  const assessmentTitles = localized({
    'needs-document': 'ยังใช้แทนหลักฐานรับเงินไม่ได้',
    'needs-correction': 'ต้องแก้หรือเติมข้อมูลก่อนใช้ประกอบการเบิก',
    'needs-policy': 'รอ AFP ยืนยันเงื่อนไขการใช้เอกสาร',
    'needs-actions': 'ต้องเตรียมเอกสารหรือยืนยันเงื่อนไขเพิ่มเติม',
    'awaiting-confirmation': 'รอคุณตรวจยืนยันข้อมูลครั้งเดียว',
    prepared: 'พร้อมเตรียมชุดเบิกให้ AFP ตรวจ',
  });
  const draft = () =>
    receiptProvenance({
      schema: 'step-receipt-review/v1',
      filename: doc?.name,
      source_id: doc?.sourceId,
      created_at: new Date().toISOString(),
      review_state: result.complete ? 'fields_checked' : 'draft_needs_review',
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
                          ? origins[k] === 'manual'
                            ? 'user-selected-or-edited'
                            : 'formatted-source-value'
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
            merchant_address: vision.merchantAddress,
            signatures: vision.signatures,
            items: vision.items,
            items_total: vision.itemsTotal,
            recheck: vision.recheck,
            expense_description: { value: vision.expenseDescription || '' },
            fields: Object.fromEntries(
              review.fieldKeys.map(k => [
                k,
                { ...vision.fields[k as ReceiptField], ai_value: vision.fields[k as ReceiptField]?.value || '', match: matchOf(k) },
              ]),
            ),
          }
        : null,
      compliance: {
        notice:
          'Document type and checklist: fixed rules tied to their source (AFP circulars, general payment-document elements to confirm with AFP, or no source yet). Not an approval.',
        document_type: docType || null,
        document_type_source: typeSource || null,
        claim_category: category,
        category_source: categoryOverride === null ? 'source-backed-suggestion' : 'user-input',
        category_suggestion: categorySuggestion,
        assessment,
        basic_elements: {
          ...completeness,
          human_checked: allChecked,
          notice: 'Preliminary general receipt elements; confirm exact category requirements with AFP. Not payment approval.',
        },
        items: compliance.map(item => ({ id: item.id, status: item.status, source: item.source, text: itemText(item) })),
      },
      expense_note: note,
      issuer_address: { value: values.merchantAddress || '', input_origin: form.origins.merchantAddress || 'vision', checked: allChecked },
      amount_in_words: {
        value: amountInWords,
        input_origin: form.origins.amountInWords || (vision?.amountInWords ? 'vision' : 'ocr'),
        checked: allChecked,
      },
      signature_observations: Object.fromEntries(
        RECEIPT_SIGNATURE_ROLES.filter(role => role === 'receiver' || vision?.signatures?.[role]).map(role => [
          role,
          {
            value: signatureStatus(role),
            input_origin: signatureOverrides[role] ? 'manual' : 'vision',
            checked: allChecked && signatureStatus(role) !== 'uncertain',
            scope: 'visible-presence-only',
          },
        ]),
      ),
      expense_description: {
        value: expenseDescription,
        input_origin: descriptionOrigin,
        checked: allChecked,
        provenance: allChecked && expenseDescription ? 'SOURCE_FACT' : descriptionEdited ? 'USER_INPUT' : 'EXTRACTED_UNVERIFIED',
        sourceRef: `receipt:${doc?.sourceId}`,
        verification: allChecked && expenseDescription ? 'human-source-comparison' : null,
      },
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
      t('รายการค่าใช้จ่าย: {0}', expenseDescription || t('(ไม่มี)')),
      t(
        'หมวดที่แนะนำ: {0}',
        categoryOverride === null
          ? expenseCodeLabel(categorySuggestion.code) || t('ยังระบุหมวดจากรายการนี้ไม่ได้')
          : t(CATEGORY_LABELS[categoryOverride]),
      ),
      t('ผลตรวจ: {0}', assessmentTitles[assessment.status]),
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

  // Text-only connections choose existing OCR tokens; they never get image bytes or invent missing values.
  async function aiFilter(
    current = values,
    currentGuessed = guessed,
    currentMapping = mapping,
    text = String(doc?.result?.text || ''),
    sourceId = sourceIdRef.current,
  ) {
    if (!currentMapping) return;
    const sourceDescription = expenseDescriptionFromText(text);
    const filtered = await call('ocrResolve', {
      connectionId,
      mapping: {
        ...currentMapping,
        fields: {
          ...Object.fromEntries(
            review.fieldKeys.map(k => {
              const base = currentMapping.fields[k];
              // A guess is not a reading, so the AI sees the field as still open and chooses among all candidates.
              const open = !String(current[k] || '').trim() || currentGuessed[k];
              return [k, { ...base, selected_value: open ? '' : current[k], status: open ? 'ambiguous' : base?.status }];
            }),
          ),
          expenseDescription: {
            label: 'รายการค่าใช้จ่าย',
            status: sourceDescription ? 'mapped' : 'unmapped',
            selected_value: sourceDescription,
            evidence: sourceDescription,
            candidates: sourceDescription
              ? [{ value: sourceDescription, evidence: sourceDescription, method: 'item-table', engine: 'paddle', score: 0.7 }]
              : [],
          },
        },
      },
    });
    if (filtered?.cancelled) return;
    if (sourceIdRef.current !== sourceId || filtered?.cancelled) return;
    const decisions: AiDecision[] = Array.isArray(filtered?.decisions) ? filtered.decisions : [];
    setAiDecisions(decisions);
    const suggestions: Record<string, string> = {};
    let description: string | undefined;
    for (const decision of decisions) {
      const k = decision.field;
      if (k === 'expenseDescription') {
        if (decision.status === 'suggested' && decision.value) description = decision.value;
        continue;
      }
      if (review.fieldKeys.includes(k) && decision.status === 'suggested' && decision.value)
        suggestions[k] = formValues({ [k]: decision.value })[k as ReceiptField];
    }
    updateForm({ type: 'suggest', sourceId, origin: 'ai-candidate-filter', values: suggestions, description });
    notify(t('AI จัดข้อความ OCR เข้าช่องให้แล้ว ดูช่องที่ไฮไลต์เทียบกับต้นฉบับ แล้วติ๊กยืนยันครั้งเดียว'), 'success');
  }
  const ready = status?.running;
  const usableConnectionId = connections.find(c => c.id === connectionId && c.ready)?.id;
  const corrections = [
    ...new Set([
      ...compliance.filter(item => ['missing', 'warn'].includes(item.status) && !item.ifCategoryB).map(itemText),
      ...issues.filter(issue => issue.code !== 'unconfirmed_fields' && !issue.code.startsWith('missing_')).map(describe),
      ...rules.map(rule => (rule.itemIndex !== undefined ? t('รายการที่ {0}: ', rule.itemIndex + 1) : '') + t(ruleText[rule.code])),
    ]),
  ];
  const nextSteps = [
    ...new Set([
      ...(categoryOverride === null ? categorySuggestion.nextSteps : []),
      ...compliance.filter(item => ['todo', 'info'].includes(item.status) && !item.ifCategoryB).map(itemText),
    ]),
  ];
  const visibleFieldKeys = review.fieldKeys.filter(
    k =>
      review.requiredKeys.includes(k) ||
      k === 'receiptNumber' ||
      values[k] ||
      docType === 'tax_invoice' ||
      docType === 'abbreviated_tax_invoice',
  );
  const requiredFilled = review.requiredKeys.every((k: string) => String(values[k] || '').trim());
  const requiredChecked = allChecked && requiredFilled;
  return (
    <div className="receipt-app">
      <header className="receipt-heading">
        <h1>{t('ตรวจใบเสร็จก่อนส่ง AFP')}</h1>
        <p className="muted">{t('ดูต้นฉบับ แก้ข้อมูลที่อ่านผิด แล้วตรวจยืนยันก่อนส่งต่อ')}</p>
      </header>
      <div className="receipt-grid">
        <section className="receipt-source" aria-label={t('ใบเสร็จต้นฉบับ')}>
          <header>
            <ScanText size={16} aria-hidden="true" />
            <strong>{doc?.name || t('ใบเสร็จต้นฉบับ')}</strong>
            {preview && (
              <button
                type="button"
                className="icon receipt-zoom"
                aria-pressed={zoom || Boolean(fieldRegion)}
                aria-label={zoom || fieldRegion ? t('ย่อภาพใบเสร็จ') : t('ขยายภาพใบเสร็จ')}
                onClick={() => {
                  setFocusedField(null);
                  setSignatureFocus(null);
                  setZoom(fieldRegion ? false : !zoom);
                }}
              >
                {zoom || fieldRegion ? <ZoomOut size={15} /> : <ZoomIn size={15} />}
              </button>
            )}
          </header>
          {previews.length > 1 && (
            <label className="small">
              {t('หน้าใบเสร็จ')}
              <select
                aria-label={t('หน้าใบเสร็จ')}
                value={currentPage}
                onChange={e => {
                  setFocusedField(null);
                  setSignatureFocus(null);
                  setPreviewPage(Number(e.target.value));
                  setZoom(false);
                }}
              >
                {previews.map((_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
          )}
          {preview ? (
            <div className={'receipt-preview-frame' + (fieldRegion ? ' field-focused' : zoom ? ' zoomed' : '')}>
              <img
                className="receipt-preview"
                src={preview}
                alt={t('ภาพใบเสร็จ ') + doc?.name}
                style={fieldRegion ? receiptFocusStyle(fieldRegion) : undefined}
                onClick={() => {
                  setFocusedField(null);
                  setSignatureFocus(null);
                  setZoom(fieldRegion ? false : !zoom);
                }}
              />
            </div>
          ) : doc ? (
            <div className="receipt-empty">
              <FileSearch size={28} aria-hidden="true" />
              <p>{t('ยังไม่มีภาพตัวอย่าง โปรดเปิดต้นฉบับในเครื่องเทียบก่อนยืนยัน')}</p>
            </div>
          ) : (
            <div className="receipt-empty">
              <SectionArt scene="receipt" className="receipt-illustration" />
              <p>{t('เลือกรูปหรือ PDF ของใบเสร็จ เพื่อเริ่มตรวจข้อมูล')}</p>
            </div>
          )}
          {fieldRegion && focusedLabel && (
            <p className="small muted" role="status">
              {t('ภาพขยายช่อง {0} · ตำแหน่งจาก AI โปรดเทียบต้นฉบับ', focusedLabel)}
            </p>
          )}
          <button
            className="receipt-pick"
            disabled={!(ready || (status?.vision && usableConnectionId)) || Boolean(busy)}
            onClick={() => void run('read', read)}
          >
            {busy === 'read' ? <LoaderCircle size={16} className="spin" /> : <FileSearch size={16} />}
            {busy === 'read' ? t('กำลังอ่านใบเสร็จ… ครั้งแรกอาจใช้ 1–2 นาที') : t('เลือกใบเสร็จ')}
          </button>
          <p className="small muted">{t('รองรับ PDF, PNG, JPG, WebP, BMP, TIFF ขนาดไม่เกิน 25 MB')}</p>
          <div className="receipt-service">
            <span className={`status-dot ${ready ? 'ok' : ''}`} aria-hidden="true" />
            <span>
              {!status
                ? t('กำลังตรวจบริการ OCR…')
                : ready
                  ? t('OCR ในเครื่องพร้อมใช้')
                  : status.installed
                    ? t('บริการ OCR ในเครื่องยังไม่เปิด')
                    : t('ยังไม่ได้ติดตั้ง OCR ในเครื่องนี้')}
            </span>
            <button className="icon" aria-label={t('ตรวจสถานะบริการอีกครั้ง')} disabled={Boolean(busy)} onClick={() => void refresh()}>
              <RefreshCw size={15} />
            </button>
          </div>
          {status && !ready && (
            <button
              className="quiet"
              disabled={Boolean(busy)}
              onClick={() =>
                void run('install', async () => {
                  if (!status.installed) {
                    setInstallProgress(t('กำลังเตรียมส่วนเสริม OCR'));
                    try {
                      setStatus(await call('ocrInstall', { crosscheck: false, connectionId: usableConnectionId }));
                    } finally {
                      setInstallProgress('');
                    }
                  }
                  setStatus(await call('ocrStart', { connectionId: usableConnectionId }));
                })
              }
            >
              {busy === 'install' ? (
                <LoaderCircle size={15} className="spin" />
              ) : status.installed ? (
                <Play size={15} />
              ) : (
                <Download size={15} />
              )}
              {status.installed ? t('เปิดบริการ OCR') : status.updateAvailable ? t('อัปเดต OCR') : t('ติดตั้ง OCR')}
            </button>
          )}
          {busy === 'install' && (
            <p role="status" className="small muted">
              {installProgress.replace(/^STEP\s*/, '') || t('กำลังติดตั้ง OCR…')}
            </p>
          )}
          {status && !ready && !status.installed && (
            <p className="small muted">{t('OCR เป็นส่วนเสริมที่ดาวน์โหลดเมื่อคุณติดตั้ง อ่านไฟล์ในเครื่องโดยไม่ส่งไปบริการ OCR ภายนอก')}</p>
          )}
          {status?.vision && <p className="small muted">{t('AI อ่านภาพได้เมื่อคุณยินยอม ส่งต่อในแชตจะส่งเฉพาะข้อความที่ตรวจแล้ว')}</p>}
          {status?.textOnly && (
            <p className="small muted">{t('AI ที่เลือกช่วยจัดข้อความ OCR เข้าฟอร์ม แต่เส้นทางนี้ยังไม่อ่านภาพใบเสร็จ')}</p>
          )}
        </section>
        <section className="receipt-form" aria-label={t('ข้อมูลที่ต้องตรวจ')}>
          {actionError && (
            <p className="receipt-error" role="alert">
              {actionError} {t('ข้อมูลที่ตรวจยังอยู่ในหน้านี้')}
            </p>
          )}
          <section className="receipt-review-section" aria-labelledby="receipt-fixes-title">
            <h2 id="receipt-fixes-title">{t('ต้องแก้หรือเติมข้อมูลก่อนใช้ประกอบการเบิก')}</h2>
            {!doc ? (
              <p className="muted">{t('เลือกใบเสร็จด้านซ้าย แล้วระบบจะแสดงจุดที่ต้องตรวจ')}</p>
            ) : (
              <>
                {assessment.status !== 'needs-correction' && (
                  <p className="receipt-assessment" role="status">
                    {assessmentTitles[assessment.status]}
                  </p>
                )}
                {corrections.length > 0 && (
                  <ul className="receipt-corrections">
                    {corrections.map(text => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                )}
                {(guessCount > 0 || vision) && (
                  <p className="small muted">{t('ค่าที่ระบบอ่านได้ยังต้องเทียบต้นฉบับ โดยเฉพาะช่องที่ไฮไลต์')}</p>
                )}
                <details className="receipt-values">
                  <summary>{t('ตรวจ/แก้ข้อมูลที่อ่านได้')}</summary>
                  <label className="receipt-value-row">
                    {t('ประเภทเอกสาร')}
                    <select
                      aria-label={t('ประเภทเอกสาร')}
                      value={docType}
                      onChange={e => {
                        setTypeOverride(e.target.value as DocumentType);
                        setAllChecked(false);
                      }}
                    >
                      {!docType && <option value="">{t('ยังไม่ทราบ')}</option>}
                      {DOCUMENT_TYPES.map(type => (
                        <option key={type} value={type}>
                          {t(DOCUMENT_TYPE_LABELS[type])}
                        </option>
                      ))}
                    </select>
                  </label>
                  {visibleFieldKeys.map((k, index) => (
                    <div
                      className={
                        'receipt-value-row receipt-field' +
                        ((guessed[k] ||
                          matchOf(k) === 'differ' ||
                          vision?.fields[k as ReceiptField]?.needsReview ||
                          rules.some(r => r.field === k)) &&
                        values[k]
                          ? ' uncertain'
                          : '')
                      }
                      key={k}
                    >
                      <label htmlFor={'rf-' + k}>
                        {labels[k]}
                        {review.requiredKeys.includes(k) && <span className="required"> *</span>}
                      </label>
                      <input
                        id={'rf-' + k}
                        value={values[k] || ''}
                        onFocus={() => {
                          setSignatureFocus(null);
                          setFocusedField(k as ReceiptField);
                          setZoom(false);
                        }}
                        onChange={e => edit(k, e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            (
                              document.getElementById(
                                visibleFieldKeys[index + 1] ? 'rf-' + visibleFieldKeys[index + 1] : 'receipt-description',
                              ) as HTMLElement | null
                            )?.focus();
                          }
                        }}
                      />
                    </div>
                  ))}
                  <label className="receipt-value-row">
                    {t('รายการค่าใช้จ่าย')}
                    <input
                      id="receipt-description"
                      aria-label={t('รายการค่าใช้จ่าย')}
                      value={expenseDescription}
                      onChange={e => updateForm({ type: 'describe', value: e.target.value })}
                    />
                  </label>
                  <label className="receipt-value-row">
                    {t('ที่อยู่ผู้รับเงิน / ร้าน')}
                    <input
                      aria-label={t('ที่อยู่ผู้รับเงิน / ร้าน')}
                      value={values.merchantAddress || ''}
                      onChange={e => edit('merchantAddress', e.target.value)}
                    />
                  </label>
                  <label className="receipt-value-row">
                    {t('จำนวนเงินตัวอักษร')}
                    <input
                      aria-label={t('จำนวนเงินตัวอักษร')}
                      value={amountInWords}
                      onChange={e => edit('amountInWords', e.target.value)}
                    />
                  </label>
                  {RECEIPT_SIGNATURE_ROLES.filter(role => role === 'receiver' || vision?.signatures?.[role]).map(role => (
                    <label className="receipt-value-row" key={role}>
                      {signatureLabels[role]}
                      <select
                        aria-label={signatureLabels[role]}
                        value={signatureStatus(role)}
                        onFocus={() => {
                          setFocusedField(null);
                          setSignatureFocus(role);
                          setZoom(false);
                        }}
                        onChange={e => {
                          setSignatureOverrides(previous => ({ ...previous, [role]: e.target.value as SignatureStatus }));
                          setAllChecked(false);
                        }}
                      >
                        <option value="present">{t('พบลายเซ็นในช่องนี้')}</option>
                        <option value="absent">{t('ไม่พบลายเซ็นในช่องนี้')}</option>
                        <option value="uncertain">{t('ยังไม่แน่ใจ')}</option>
                      </select>
                    </label>
                  ))}
                  {vision?.items?.length ? (
                    <div className="receipt-items-scroll">
                      <table className="receipt-items">
                        <caption>{t('รายการที่อ่านได้ · โปรดเทียบต้นฉบับ')}</caption>
                        <thead>
                          <tr>
                            {['รายการ', 'จำนวน', 'ราคาต่อหน่วย', 'ยอดรายการ'].map(label => (
                              <th key={label}>{t(label)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {vision.items.map((item, i) => (
                            <tr key={i} className={item.needsReview || rules.some(r => r.itemIndex === i) ? 'receipt-item-warning' : ''}>
                              <td>{item.description}</td>
                              <td>{item.quantity}</td>
                              <td>{item.unitPrice}</td>
                              <td>{item.amount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  {vision?.notes && <p className="small muted">{t('AI ฝากตรวจ: {0}', vision.notes)}</p>}
                </details>
              </>
            )}
          </section>
          <section className="receipt-review-section" aria-labelledby="receipt-next-title">
            <h2 id="receipt-next-title">{t('ทำอะไรต่อ')}</h2>
            {doc && (
              <>
                <p className="small muted">
                  {t(
                    'หมวดที่แนะนำ: {0}',
                    categoryOverride === null
                      ? expenseCodeLabel(categorySuggestion.code) || t('ยังระบุหมวดจากรายการนี้ไม่ได้')
                      : t(CATEGORY_LABELS[categoryOverride]),
                  )}
                </p>
                {nextSteps.length > 0 && (
                  <ul className="receipt-next-actions">
                    {nextSteps.map(step => (
                      <li key={step}>{t(step)}</li>
                    ))}
                  </ul>
                )}
                <details className="receipt-claim-options">
                  <summary>{t('เพิ่มวัตถุประสงค์หรือแก้หมวด (ถ้าจำเป็น)')}</summary>
                  <label className="receipt-value-row">
                    {t('หมวดที่จะเบิก')}
                    <select
                      aria-label={t('หมวดที่จะเบิก')}
                      value={categoryOverride ?? 'auto'}
                      onChange={e => {
                        setCategory(e.target.value === 'auto' ? null : (e.target.value as ClaimCategory));
                        setAllChecked(false);
                      }}
                    >
                      <option value="auto">{t('ใช้หมวดที่ระบบแนะนำ')}</option>
                      {(Object.keys(CATEGORY_LABELS) as ClaimCategory[]).map(c => (
                        <option key={c} value={c}>
                          {t(CATEGORY_LABELS[c])}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="receipt-note">
                    {t('หมายเหตุการเบิก')}
                    <textarea
                      id="receipt-note"
                      aria-label={t('หมายเหตุการเบิก')}
                      value={note}
                      placeholder={t('เช่น ใช้ในโครงการ… (กรอกเอง)')}
                      onChange={e => {
                        setNote(e.target.value);
                        setAllChecked(false);
                      }}
                    />
                  </label>
                </details>
                <label className={'receipt-confirm' + (allChecked ? ' checked' : '')}>
                  <input
                    id="receipt-confirm"
                    type="checkbox"
                    disabled={!result.filledCount || Boolean(busy)}
                    checked={allChecked}
                    onChange={e => setAllChecked(e.target.checked)}
                  />
                  <span>
                    <strong>{t('ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว')}</strong>
                    <small>{t('รวมรายการ ที่อยู่ จำนวนเงินตัวอักษร และลายเซ็น การแก้ข้อมูลจะยกเลิกการยืนยัน')}</small>
                  </span>
                </label>
              </>
            )}
            <div className="receipt-handoff-target">
              <label>
                {t('AI สำหรับตรวจทาน')}
                <select
                  aria-label={t('AI สำหรับตรวจทาน')}
                  value={usableConnectionId || ''}
                  disabled={Boolean(busy)}
                  onChange={e => chooseConnection?.(e.target.value)}
                >
                  <option value="">{t('เลือก AI ที่พร้อมใช้งาน')}</option>
                  {connections
                    .filter(c => c.ready)
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {connectionLabel(c)}
                      </option>
                    ))}
                </select>
              </label>
              {!usableConnectionId && <p className="small muted">{t('เชื่อมต่อและทดสอบ AI ก่อนส่งตรวจทาน ข้อมูลในหน้านี้ยังอยู่')}</p>}
              {openAiSettings && (
                <button type="button" className="text-link" onClick={openAiSettings}>
                  {t('ไปที่การเชื่อมต่อ AI')}
                </button>
              )}
            </div>
            {doc && (
              <>
                {!requiredChecked && (
                  <p className="small muted">
                    {requiredFilled ? t('ติ๊ก “ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว” ก่อนส่งให้ AI') : t('กรอกช่องที่มี * ให้ครบก่อนส่งให้ AI')}
                  </p>
                )}
                <div className="receipt-actions">
                  <button
                    disabled={!requiredChecked || !usableConnectionId || Boolean(busy)}
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
                    {busy === 'handoff' ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}
                    {t('ให้ AI ตรวจทานต่อ')}
                  </button>
                  <button
                    className="text-link"
                    disabled={Boolean(busy)}
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
                    <Save size={14} />
                    {t('บันทึกผลตรวจเก็บไว้')}
                  </button>
                </div>
                <p className="small muted">{t('ส่งเฉพาะผลตรวจและข้อความ ภาพต้นฉบับไม่ถูกส่งในขั้นตอนนี้')}</p>
              </>
            )}
            <p className="small muted">{t('ผลตรวจช่วยเตรียมเอกสาร ไม่ใช่การอนุมัติเบิกจ่าย เก็บต้นฉบับและยืนยันเงื่อนไขกับ AFP')}</p>
          </section>
          <section className="receipt-review-section receipt-elements" aria-label={t('องค์ประกอบพื้นฐานใบเสร็จ')}>
            <h2>{t('ดูองค์ประกอบพื้นฐานใบเสร็จ')}</h2>
            {!doc ? (
              <p className="muted">{t('ยังไม่มีผลตรวจองค์ประกอบ')}</p>
            ) : (
              <>
                <p role="status">
                  {completeness.status === 'incomplete'
                    ? t('ใบเสร็จยังขาดองค์ประกอบ')
                    : completeness.status === 'uncertain'
                      ? t('องค์ประกอบใบเสร็จยังรอตรวจบางจุด')
                      : rules.length
                        ? t('มีองค์ประกอบแต่ข้อมูลยังขัดกัน')
                        : allChecked
                          ? t('ครบองค์ประกอบพื้นฐานที่ตรวจ')
                          : t('พบองค์ประกอบพื้นฐานครบ · รอคุณยืนยัน')}
                </p>
                <ul>
                  {completeness.components.map(component => (
                    <li key={component.id}>
                      <span>{t(component.label)}</span>
                      <span className={'chip ' + (component.status === 'present' ? 'agree' : 'differ')}>
                        {t(component.status === 'present' ? 'พบข้อมูล' : component.status === 'missing' ? 'ขาด' : 'รอตรวจ')}
                      </span>
                    </li>
                  ))}
                </ul>
                <small className="muted">{t('ตรวจว่ามีลายเซ็น ไม่ได้ยืนยันตัวผู้ลงชื่อ องค์ประกอบครบยังไม่เท่ากับอนุมัติเบิก')}</small>
              </>
            )}
          </section>
        </section>
      </div>
    </div>
  );
}
