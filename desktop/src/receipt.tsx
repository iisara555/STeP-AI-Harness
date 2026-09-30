import { useEffect, useMemo, useState } from 'react';
import { Check, Download, FileSearch, FolderOpen, LoaderCircle, Play, RefreshCw, Save, ScanText, Send, TriangleAlert } from 'lucide-react';
// One extraction and review rule set, shared with the OCR trial's own web page and its tests.
import '../../experiments/local-thai-ocr/web/receipt-review.js';
import ideaArt from './assets/illustrations/idea.png';
import { receiptSourceText } from './receipt-source';

type MappingCandidate = {
  value: string;
  evidence: string;
  page: number | null;
  confidence: number | null;
  method: string;
  score: number;
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
};
type AiDecision = {
  field: string;
  status: 'keep' | 'suggested' | 'ambiguous' | 'unmapped';
  value?: string;
  token?: string;
  reason: string;
};
type Doc = { name: string; preview: string; result: any };

const labels: Record<string, string> = {
  merchant: 'ผู้ออกใบเสร็จ / ร้านค้า',
  receiptNumber: 'เลขที่ใบเสร็จ',
  date: 'วันที่',
  taxId: 'เลขผู้เสียภาษีของผู้ออก',
  subtotal: 'ยอดก่อนภาษี',
  vat: 'ภาษีมูลค่าเพิ่ม',
  total: 'ยอดรวมที่ชำระ',
};
const issueText: Record<string, string | ((issue: Issue) => string)> = {
  missing_merchant: 'ยังไม่มีชื่อร้านค้าหรือผู้ออกใบเสร็จ',
  missing_date: 'ยังไม่มีวันที่บนใบเสร็จ',
  missing_total: 'ยังไม่มียอดรวมที่ชำระ',
  invalid_total: 'ยอดรวมต้องเป็นตัวเลขมากกว่า 0',
  invalid_subtotal: 'ยอดก่อนภาษียังไม่ใช่ตัวเลขที่อ่านได้',
  invalid_vat: 'ภาษีมูลค่าเพิ่มยังไม่ใช่ตัวเลขที่อ่านได้',
  amount_mismatch: 'ยอดก่อนภาษีบวกภาษีมูลค่าเพิ่มไม่เท่ากับยอดรวม โปรดเทียบใบเสร็จ',
  tax_id_length: 'เลขประจำตัวผู้เสียภาษีที่กรอกมีไม่ครบ 13 หลัก',
  unconfirmed_fields: issue => `มีข้อมูล ${issue.count} ช่องที่ยังไม่ได้ทำเครื่องหมายว่าตรวจแล้ว`,
  review_lines: issue => `มี ${issue.count} บรรทัดที่ต้องตรวจจากภาพต้นฉบับ รวมจุดที่ OCR สองตัวอ่านต่างกัน`,
  resized_image: 'ภาพถูกย่อก่อน OCR โปรดตรวจข้อความขนาดเล็กบนใบเสร็จ',
  buyer_tax_id_excluded: 'พบเลขผู้เสียภาษีในส่วนของผู้ซื้อ จึงไม่เติมเป็นเลขของผู้ออกใบเสร็จ',
};
const describe = (issue: Issue) => {
  const text = issueText[issue.code];
  return typeof text === 'function' ? text(issue) : text || issue.code;
};

export function ReceiptApp({
  call,
  notify,
  onError,
  handoff,
  onEvent,
  connectionId,
}: {
  call: (method: string, input?: unknown) => Promise<any>;
  onError: (error: unknown) => void;
  notify: (text: string, tone?: 'info' | 'success' | 'error', action?: { label: string; run: () => unknown }) => void;
  handoff: (text: string, sourceText: string, allowIds?: string[]) => Promise<void>;
  onEvent: (callback: (event: { type: string; text?: string }) => void) => () => void;
  connectionId?: string;
}) {
  const [status, setStatus] = useState<OcrStatus | null>(null),
    [busy, setBusy] = useState(''),
    [installProgress, setInstallProgress] = useState('');
  const [doc, setDoc] = useState<Doc | null>(null),
    [fields, setFields] = useState<Record<string, Field>>({}),
    [records, setRecords] = useState<LineRecord[]>([]),
    [mapping, setMapping] = useState<AfpMapping | null>(null);
  const [values, setValues] = useState<Record<string, string>>({}),
    [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [linesChecked, setLinesChecked] = useState(false),
    [note, setNote] = useState(''),
    [buyerExcluded, setBuyerExcluded] = useState(false),
    [aiDecisions, setAiDecisions] = useState<AiDecision[]>([]);
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
        reviewLinesChecked: linesChecked,
        resized,
        buyerTaxIdExcluded: buyerExcluded,
      }),
    [values, confirmed, reviewLines, linesChecked, resized, buyerExcluded],
  );

  async function read() {
    const read: Doc | null = await call('ocrRead');
    if (!read) return;
    const extracted = review.extractReceipt(read.result);
    setDoc(read);
    setFields(extracted.fields);
    setRecords(extracted.records);
    setMapping(extracted.afpMapping);
    setBuyerExcluded(extracted.buyerTaxIdExcluded);
    setValues(Object.fromEntries(review.fieldKeys.map(k => [k, extracted.fields[k]?.value || ''])));
    setConfirmed({});
    setLinesChecked(false);
    setNote('');
    setAiDecisions([]);
  }
  const draft = () => ({
    schema: 'step-receipt-review/v1',
    filename: doc?.name,
    created_at: new Date().toISOString(),
    review_state: result.complete ? 'fields_checked' : 'draft_needs_review',
    notice: 'OCR suggestions checked by a person. This is not a reimbursement approval.',
    fields: Object.fromEntries(
      review.fieldKeys.map(k => [k, { value: values[k] || '', checked: Boolean(confirmed[k]), ocr_evidence: fields[k]?.evidence || '' }]),
    ),
    afp_mapping: mapping
      ? {
          ...mapping,
          fields: Object.fromEntries(
            review.fieldKeys.map(k => {
              const original = fields[k]?.value || '';
              const selected = values[k] || '';
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
                  status: selected && selected !== original ? 'user-selected-or-edited' : base.status,
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
    expense_note: note,
    issues: result.issues.map(i => ({ ...i, message: describe(i) })),
    ocr: { text: doc?.result?.text || '', lines: records },
  });
  const summary = () =>
    [
      'ช่วย pre-check ใบเสร็จก่อนส่ง AFP',
      '',
      `ข้อมูลจากใบเสร็จ “${doc?.name}” (อ่านด้วย OCR ในเครื่องและให้คนตรวจแล้ว):`,
      ...review.fieldKeys.map(
        k => `- ${labels[k]}: ${values[k] || '(ไม่มี)'}${values[k] ? (confirmed[k] ? ' · ตรวจแล้ว' : ' · ยังไม่ตรวจ') : ''}`,
      ),
      ...(note.trim() ? ['', 'หมายเหตุผู้เบิก: ' + note.trim()] : []),
      ...(mapping?.unresolved_field_lines?.length
        ? [
            '',
            `OCR พบข้อความที่ดูเหมือนข้อมูลสำหรับ AFP แต่ยัง map เข้าช่องไม่ได้ ${mapping.unresolved_field_lines.length} บรรทัด — โปรดดู afp_mapping ใน JSON`,
          ]
        : []),
      ...(result.issues.length ? ['', 'ประเด็นที่ระบบตรวจพบ:', ...result.issues.map(i => '- ' + describe(i))] : []),
    ].join('\n');

  const ready = status?.running;
  const requiredChecked = review.requiredKeys.every((k: string) => confirmed[k]);
  return (
    <div className="receipt-app">
      <div className="receipt-service">
        <span className={`status-dot ${ready ? 'ok' : ''}`} aria-hidden="true" />
        <span>
          {!status
            ? 'กำลังตรวจบริการ OCR…'
            : ready
              ? `OCR ในเครื่องพร้อมใช้${status.tesseract ? ' · Tesseract' : ''}${status.handwriting ? ' · ลายมือ' : ''}${status.crosscheck ? ' · EasyOCR' : ''}`
              : status.installed
                ? 'บริการ OCR ในเครื่องยังไม่เปิด'
                : status.updateAvailable
                  ? 'OCR ที่ติดตั้งไว้ต้องอัปเดตให้ตรงกับแอปเวอร์ชันนี้'
                  : 'ยังไม่ได้ติดตั้ง OCR ในเครื่องนี้'}
        </span>
        <span className="spacer" />
        {status && !ready && status.installed && (
          <button disabled={Boolean(busy)} onClick={() => void run('start', async () => setStatus(await call('ocrStart')))}>
            {busy === 'start' ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}เปิดบริการ OCR
          </button>
        )}
        {status && !ready && !status.installed && (
          <>
            <button
              disabled={Boolean(busy)}
              onClick={() =>
                void run('install', async () => {
                  setInstallProgress('กำลังเตรียมส่วนเสริม OCR');
                  try {
                    const installed = await call('ocrInstall', { crosscheck: false });
                    setStatus(installed);
                    setStatus(await call('ocrStart'));
                    notify('ติดตั้ง OCR ในเครื่องนี้แล้ว', 'success');
                  } finally {
                    setInstallProgress('');
                  }
                })
              }
            >
              {busy === 'install' ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}
              {busy === 'install' ? 'กำลังติดตั้ง OCR…' : status.updateAvailable ? 'อัปเดต OCR' : 'ติดตั้ง OCR'}
            </button>
            <button
              className="quiet"
              disabled={Boolean(busy)}
              onClick={() => void run('folder', async () => setStatus(await call('ocrFolder')))}
            >
              <FolderOpen size={15} />
              ใช้ OCR ที่มีอยู่
            </button>
          </>
        )}
        <button className="icon" aria-label="ตรวจสถานะบริการอีกครั้ง" disabled={Boolean(busy)} onClick={() => void refresh()}>
          <RefreshCw size={15} />
        </button>
      </div>
      {status?.running && (
        <div className="receipt-ocr-layers small muted">
          <span>Tesseract: {status.tesseract ? 'พร้อมตรวจตัวพิมพ์/ตัวเลข' : 'ยังไม่พบ tha+eng'}</span>
          {!status.tesseract && (
            <button className="text-link" type="button" onClick={() => void call('openHelp', { topic: 'tesseract' })}>
              วิธีติดตั้ง
            </button>
          )}
          <span>Thai-TrOCR: {status.handwriting ? 'พร้อมอ่านลายมือ' : 'ยังไม่ติดตั้ง'}</span>
          {!status.handwriting && (
            <button
              className="text-link"
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                void run('handwriting', async () => {
                  setInstallProgress('กำลังเตรียมโมเดลอ่านลายมือภาษาไทย');
                  try {
                    const installed = await call('ocrInstall', { handwriting: true });
                    setStatus(installed);
                    setStatus(await call('ocrStart'));
                    notify('ติดตั้งโมเดลอ่านลายมือภาษาไทยแล้ว', 'success');
                  } finally {
                    setInstallProgress('');
                  }
                })
              }
            >
              เพิ่มอ่านลายมือ
            </button>
          )}
        </div>
      )}
      {(busy === 'install' || busy === 'handwriting') && installProgress && (
        <p className="small muted receipt-hint">{installProgress.replace(/^STEP\s*/, '')}</p>
      )}
      {status && !ready && !status.installed && (
        <p className="small muted receipt-hint">
          OCR เป็นส่วนเสริม ไม่ติดมากับตัวติดตั้งหลัก กด “{status.updateAvailable ? 'อัปเดต OCR' : 'ติดตั้ง OCR'}” เมื่อต้องการใช้
          ระบบจะดาวน์โหลด Python ที่ตรวจสอบ checksum แล้ว จากนั้นติดตั้ง Paddle และโมเดล OCR ไว้ใน App Data ของผู้ใช้นี้
          การอ่านใบเสร็จทำบนเครื่องและไม่ส่งไฟล์ไปบริการ OCR บนอินเทอร์เน็ต
        </p>
      )}

      {!doc ? (
        <div className="receipt-empty">
          <img className="illustration empty-art" src={ideaArt} alt="" />
          <h2>ตรวจใบเสร็จก่อนส่ง AFP</h2>
          <p className="muted">
            เลือกรูปหรือ PDF ของใบเสร็จ ระบบจะอ่านข้อความและเสนอข้อมูลสำคัญ
            <br />
            คุณเทียบกับต้นฉบับ แก้ไข และทำเครื่องหมายว่าตรวจแล้วทีละช่อง
          </p>
          <button disabled={!ready || Boolean(busy)} onClick={() => void run('read', read)}>
            {busy === 'read' ? <LoaderCircle size={16} className="spin" /> : <FileSearch size={16} />}
            {busy === 'read' ? 'กำลังอ่านใบเสร็จ… ครั้งแรกอาจใช้ 1–2 นาที' : 'เลือกใบเสร็จ'}
          </button>
          <p className="small muted">รองรับ PDF, PNG, JPG, WebP, BMP, TIFF ขนาดไม่เกิน 25 MB</p>
        </div>
      ) : (
        <div className="receipt-grid">
          <section className="receipt-source" aria-label="ใบเสร็จต้นฉบับ">
            <header>
              <ScanText size={16} />
              <strong>{doc.name}</strong>
            </header>
            {doc.preview ? (
              <img className="receipt-preview" src={doc.preview} alt={'ภาพใบเสร็จ ' + doc.name} />
            ) : (
              <p className="small muted">ไฟล์ชนิดนี้แสดงภาพในแอปไม่ได้ โปรดเปิดต้นฉบับเทียบกับข้อความด้านล่าง</p>
            )}
            <details open={reviewLines > 0}>
              <summary>
                ข้อความที่อ่านได้ ({records.length} บรรทัด{reviewLines ? ` · ต้องตรวจ ${reviewLines}` : ''})
              </summary>
              <ol className="ocr-lines">
                {records.map((r, i) => (
                  <li key={i} className={r.needsReview ? 'flag' : ''}>
                    <span>{r.text}</span>
                    {r.tesseractCandidate && r.tesseractCandidate !== r.text && (
                      <small>
                        Tesseract อ่านว่า “{r.tesseractCandidate}”
                        {r.tesseractConfidence !== null && r.tesseractConfidence !== undefined
                          ? ` · ${Math.round(r.tesseractConfidence * 100)}%`
                          : ''}
                      </small>
                    )}
                    {r.handwritingCandidate && r.handwritingCandidate !== r.text && (
                      <small>โมเดลลายมืออ่านว่า “{r.handwritingCandidate}” · ยังไม่ยืนยัน</small>
                    )}
                    {r.crosscheckCandidate && r.crosscheckCandidate !== r.text && (
                      <small>EasyOCR อ่านว่า “{r.crosscheckCandidate}”</small>
                    )}
                    {r.textKind && <small>ประเภท: {r.textKind}</small>}
                    {r.confidence !== null && <small className="conf">{Math.round(r.confidence * 100)}%</small>}
                  </li>
                ))}
              </ol>
            </details>
          </section>
          <section className="receipt-form" aria-label="ข้อมูลที่ต้องตรวจ">
            {review.fieldKeys.map(k => (
              <div className="receipt-field" key={k}>
                <label htmlFor={'rf-' + k}>
                  {labels[k]}
                  {review.requiredKeys.includes(k) && <span className="required"> *</span>}
                </label>
                <div className="receipt-field-row">
                  <input
                    id={'rf-' + k}
                    value={values[k] || ''}
                    onChange={e => {
                      setValues({ ...values, [k]: e.target.value });
                      setConfirmed({ ...confirmed, [k]: false });
                    }}
                  />
                  <label className="check">
                    <input
                      type="checkbox"
                      disabled={!String(values[k] || '').trim()}
                      checked={Boolean(confirmed[k])}
                      onChange={e => setConfirmed({ ...confirmed, [k]: e.target.checked })}
                    />
                    ตรวจแล้ว
                  </label>
                </div>
                {fields[k]?.evidence && (
                  <small className="muted">
                    จากบรรทัด “{fields[k].evidence}”
                    {fields[k].confidence !== null ? ` · ${Math.round((fields[k].confidence || 0) * 100)}%` : ''}
                    {fields[k].mappingMethod ? ` · map: ${fields[k].mappingMethod}` : ''}
                  </small>
                )}
                {!String(values[k] || '').trim() && (fields[k]?.candidates?.length || 0) > 0 && (
                  <div className="receipt-candidates">
                    <small>OCR อ่านพบค่าที่อาจตรงกับช่องนี้ แต่ยังไม่ควรเลือกแทนคุณ:</small>
                    <div>
                      {(fields[k]?.candidates || []).slice(0, 3).map((candidate, index) => (
                        <button
                          className="quiet"
                          type="button"
                          key={candidate.value + index}
                          onClick={() => {
                            setValues({ ...values, [k]: candidate.value });
                            setConfirmed({ ...confirmed, [k]: false });
                          }}
                        >
                          ใช้ “{candidate.value}”
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
                        ? `แนะนำ candidate “${decision.value}”`
                        : decision.status === 'keep'
                          ? 'เห็นด้วยกับค่าปัจจุบัน'
                          : decision.status === 'ambiguous'
                            ? 'ยังไม่แน่ใจ ให้คนเลือก'
                            : 'หลักฐานยังไม่พอ map'}
                      {decision.reason ? ` · ${decision.reason}` : ''}
                    </small>
                  ))}
              </div>
            ))}
            {reviewLines > 0 && (
              <label className="check lines-check">
                <input type="checkbox" checked={linesChecked} onChange={e => setLinesChecked(e.target.checked)} />
                ตรวจ {reviewLines} บรรทัดที่ต้องตรวจเทียบกับต้นฉบับแล้ว
              </label>
            )}
            {mapping?.unresolved_field_lines?.length ? (
              <details className="receipt-mapping-warning">
                <summary>พบข้อมูลลักษณะช่อง AFP ที่ยัง map ไม่สำเร็จ {mapping.unresolved_field_lines.length} บรรทัด</summary>
                <ul>
                  {mapping.unresolved_field_lines.slice(0, 8).map((line, index) => (
                    <li key={line.text + index}>{line.text}</li>
                  ))}
                </ul>
                <small className="muted">ข้อมูลยังอยู่ใน JSON/Workspace และจะไม่ถูกทิ้ง เพียงแต่ระบบไม่เดาใส่ช่องให้อัตโนมัติ</small>
              </details>
            ) : null}
            <label className="receipt-note">
              หมายเหตุการเบิก
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น ใช้ในโครงการ… (กรอกเอง)" />
            </label>
            <div className={`receipt-verdict ${result.complete ? 'ok' : ''}`} role="status">
              {result.complete ? <Check size={16} /> : <TriangleAlert size={16} />}
              <div>
                <strong>{result.complete ? 'พร้อมให้ AFP ตรวจ' : 'ยังต้องตรวจหรือแก้เพิ่ม'}</strong>{' '}
                <small>
                  {result.complete ? 'READY-FOR-AFP-REVIEW' : 'NEEDS-DOCUMENT-FIX'} · ตรวจแล้ว {result.confirmedCount}/{result.filledCount}{' '}
                  ช่อง
                </small>
                {result.issues.length > 0 && (
                  <ul>
                    {result.issues.map(i => (
                      <li key={i.code} className={i.severity}>
                        {describe(i)}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="small muted">
                  ผลนี้เป็นการตรวจเอกสารเบื้องต้น ไม่ใช่การอนุมัติเบิกจ่าย และยังไม่ได้เทียบกับระเบียบการเงินฉบับปัจจุบัน
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
                      notify('บันทึกร่างการตรวจแล้ว', 'success', {
                        label: 'เปิดโฟลเดอร์',
                        run: () => call('reveal', { path: saved.path }),
                      });
                  })
                }
              >
                <Save size={15} />
                บันทึกร่าง (JSON)
              </button>
              <button className="quiet" disabled={Boolean(busy)} onClick={() => void run('read', read)}>
                <FileSearch size={15} />
                ตรวจใบใหม่
              </button>
              <button
                className="quiet"
                disabled={!connectionId || !mapping || Boolean(busy)}
                onClick={() =>
                  void run('ai-filter', async () => {
                    const currentMapping = draft().afp_mapping;
                    const filtered = await call('ocrResolve', { connectionId, mapping: currentMapping });
                    if (filtered?.cancelled) return;
                    const decisions: AiDecision[] = Array.isArray(filtered?.decisions) ? filtered.decisions : [];
                    setAiDecisions(decisions);
                    const nextValues = { ...values };
                    const nextConfirmed = { ...confirmed };
                    for (const decision of decisions) {
                      if (
                        decision.status === 'suggested' &&
                        decision.value &&
                        !String(nextValues[decision.field] || '').trim()
                      ) {
                        nextValues[decision.field] = decision.value;
                        nextConfirmed[decision.field] = false;
                      }
                    }
                    setValues(nextValues);
                    setConfirmed(nextConfirmed);
                    notify('AI กรอง candidate OCR แล้ว ยังต้องตรวจต้นฉบับก่อนติ๊ก “ตรวจแล้ว”', 'success');
                  })
                }
              >
                {busy === 'ai-filter' ? <LoaderCircle size={15} className="spin" /> : <ScanText size={15} />}
                AI กรอง OCR อีกชั้น
              </button>
              <span className="spacer" />
              {/* AI pre-check follows the person's check: the required fields must be ticked first. A checked vendor tax ID stays readable. */}
              {!requiredChecked && <small className="muted">ติ๊ก “ตรวจแล้ว” ช่องที่มี * ก่อนส่งให้ AI</small>}
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
                ให้ AI pre-check ต่อ
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
