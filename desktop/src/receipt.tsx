import { useEffect, useMemo, useState } from 'react';
import { Check, FileSearch, FolderOpen, LoaderCircle, Play, RefreshCw, Save, ScanText, Send, TriangleAlert } from 'lucide-react';
// One extraction and review rule set, shared with the OCR trial's own web page and its tests.
import '../../experiments/local-thai-ocr/web/receipt-review.js';
import ideaArt from './assets/illustrations/idea.png';

type Field = { value: string; page: number | null; confidence: number | null; evidence: string; crosscheckCandidate: string; crosscheckStatus: string | null };
type LineRecord = { text: string; page: number; confidence: number | null; needsReview?: boolean; crosscheckCandidate?: string; crosscheckStatus?: string | null };
type Issue = { code: string; severity: 'blocking' | 'advisory'; count?: number };
type ReceiptReviewApi = {
  fieldKeys: string[]; requiredKeys: string[]; normalizeDigits(value: string): string;
  extractReceipt(result: unknown): { fields: Record<string, Field>; records: LineRecord[]; buyerTaxIdExcluded: boolean };
  reviewIssues(values: Record<string, string>, confirmed: Record<string, boolean>, options: object): { issues: Issue[]; complete: boolean; confirmedCount: number; filledCount: number };
};
const review = (window as unknown as { ReceiptReview: ReceiptReviewApi }).ReceiptReview;
type OcrStatus = { running: boolean; crosscheck: boolean; installed: boolean; folder: string };
type Doc = { name: string; preview: string; result: any };

const labels: Record<string, string> = { merchant: 'ผู้ออกใบเสร็จ / ร้านค้า', receiptNumber: 'เลขที่ใบเสร็จ', date: 'วันที่', taxId: 'เลขผู้เสียภาษีของผู้ออก', subtotal: 'ยอดก่อนภาษี', vat: 'ภาษีมูลค่าเพิ่ม', total: 'ยอดรวมที่ชำระ' };
const issueText: Record<string, string | ((issue: Issue) => string)> = {
  missing_merchant: 'ยังไม่มีชื่อร้านค้าหรือผู้ออกใบเสร็จ', missing_date: 'ยังไม่มีวันที่บนใบเสร็จ', missing_total: 'ยังไม่มียอดรวมที่ชำระ',
  invalid_total: 'ยอดรวมต้องเป็นตัวเลขมากกว่า 0', invalid_subtotal: 'ยอดก่อนภาษียังไม่ใช่ตัวเลขที่อ่านได้', invalid_vat: 'ภาษีมูลค่าเพิ่มยังไม่ใช่ตัวเลขที่อ่านได้',
  amount_mismatch: 'ยอดก่อนภาษีบวกภาษีมูลค่าเพิ่มไม่เท่ากับยอดรวม โปรดเทียบใบเสร็จ', tax_id_length: 'เลขประจำตัวผู้เสียภาษีที่กรอกมีไม่ครบ 13 หลัก',
  unconfirmed_fields: issue => `มีข้อมูล ${issue.count} ช่องที่ยังไม่ได้ทำเครื่องหมายว่าตรวจแล้ว`,
  review_lines: issue => `มี ${issue.count} บรรทัดที่ต้องตรวจจากภาพต้นฉบับ รวมจุดที่ OCR สองตัวอ่านต่างกัน`,
  resized_image: 'ภาพถูกย่อก่อน OCR โปรดตรวจข้อความขนาดเล็กบนใบเสร็จ', buyer_tax_id_excluded: 'พบเลขผู้เสียภาษีในส่วนของผู้ซื้อ จึงไม่เติมเป็นเลขของผู้ออกใบเสร็จ',
};
const describe = (issue: Issue) => { const text = issueText[issue.code]; return typeof text === 'function' ? text(issue) : text || issue.code; };

export function ReceiptApp({ call, notify, onError, handoff }: { call: (method: string, input?: unknown) => Promise<any>; onError: (error: unknown) => void; notify: (text: string, tone?: 'info' | 'success' | 'error', action?: { label: string; run: () => unknown }) => void; handoff: (text: string, allowIds?: string[]) => Promise<void> }) {
  const [status, setStatus] = useState<OcrStatus | null>(null), [busy, setBusy] = useState('');
  const [doc, setDoc] = useState<Doc | null>(null), [fields, setFields] = useState<Record<string, Field>>({}), [records, setRecords] = useState<LineRecord[]>([]);
  const [values, setValues] = useState<Record<string, string>>({}), [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [linesChecked, setLinesChecked] = useState(false), [note, setNote] = useState(''), [buyerExcluded, setBuyerExcluded] = useState(false);
  const run = async (id: string, fn: () => Promise<unknown>) => { setBusy(id); try { await fn(); } catch (e) { onError(e); } finally { setBusy(''); } };
  const refresh = () => run('status', async () => setStatus(await call('ocrStatus')));
  // OCR ships with the app, so opening this page starts it; the button stays for a stopped service.
  useEffect(() => { void run('status', async () => { const s = await call('ocrStatus'); setStatus(s); if (s?.installed && !s.running) setStatus(await call('ocrStart')); }); }, []);

  const reviewLines = doc?.result?.summary?.needs_review || 0;
  const resized = (doc?.result?.warnings || []).some((w: string) => /resized/i.test(w));
  const result = useMemo(() => review.reviewIssues(values, confirmed, { reviewLineCount: reviewLines, reviewLinesChecked: linesChecked, resized, buyerTaxIdExcluded: buyerExcluded }), [values, confirmed, reviewLines, linesChecked, resized, buyerExcluded]);

  async function read() {
    const read: Doc | null = await call('ocrRead'); if (!read) return;
    const extracted = review.extractReceipt(read.result);
    setDoc(read); setFields(extracted.fields); setRecords(extracted.records); setBuyerExcluded(extracted.buyerTaxIdExcluded);
    setValues(Object.fromEntries(review.fieldKeys.map(k => [k, extracted.fields[k]?.value || '']))); setConfirmed({}); setLinesChecked(false); setNote('');
  }
  const draft = () => ({
    schema: 'step-receipt-review/v1', filename: doc?.name, created_at: new Date().toISOString(), review_state: result.complete ? 'fields_checked' : 'draft_needs_review',
    notice: 'OCR suggestions checked by a person. This is not a reimbursement approval.',
    fields: Object.fromEntries(review.fieldKeys.map(k => [k, { value: values[k] || '', checked: Boolean(confirmed[k]), ocr_evidence: fields[k]?.evidence || '' }])),
    expense_note: note, issues: result.issues.map(i => ({ ...i, message: describe(i) })), ocr: { text: doc?.result?.text || '', lines: records },
  });
  const summary = () => ['ช่วย pre-check ใบเสร็จก่อนส่ง AFP', '', `ข้อมูลจากใบเสร็จ “${doc?.name}” (อ่านด้วย OCR ในเครื่องและให้คนตรวจแล้ว):`,
    ...review.fieldKeys.map(k => `- ${labels[k]}: ${values[k] || '(ไม่มี)'}${values[k] ? (confirmed[k] ? ' · ตรวจแล้ว' : ' · ยังไม่ตรวจ') : ''}`),
    ...(note.trim() ? ['', 'หมายเหตุผู้เบิก: ' + note.trim()] : []),
    ...(result.issues.length ? ['', 'ประเด็นที่ระบบตรวจพบ:', ...result.issues.map(i => '- ' + describe(i))] : []),
  ].join('\n');

  const ready = status?.running;
  const requiredChecked = review.requiredKeys.every((k: string) => confirmed[k]);
  return <div className="receipt-app">
    <div className="receipt-service">
      <span className={`status-dot ${ready ? 'ok' : ''}`} aria-hidden="true"/>
      <span>{!status ? 'กำลังตรวจบริการ OCR…' : ready ? `OCR ในเครื่องพร้อมใช้${status.crosscheck ? ' · มี OCR ตัวที่สองช่วยตรวจ' : ''}` : status.installed ? 'บริการ OCR ในเครื่องยังไม่เปิด' : 'ยังไม่ได้ติดตั้ง OCR ในเครื่องนี้'}</span>
      <span className="spacer"/>
      {status && !ready && status.installed && <button disabled={Boolean(busy)} onClick={() => void run('start', async () => setStatus(await call('ocrStart')))}>{busy === 'start' ? <LoaderCircle size={15} className="spin"/> : <Play size={15}/>}เปิดบริการ OCR</button>}
      {status && !ready && !status.installed && <button className="quiet" disabled={Boolean(busy)} onClick={() => void run('folder', async () => setStatus(await call('ocrFolder')))}><FolderOpen size={15}/>เลือกโฟลเดอร์ OCR</button>}
      <button className="icon" aria-label="ตรวจสถานะบริการอีกครั้ง" disabled={Boolean(busy)} onClick={() => void refresh()}><RefreshCw size={15}/></button>
    </div>
    {status && !ready && !status.installed && <p className="small muted receipt-hint">ติดตั้งครั้งแรกด้วย <code>Install-OCR.bat</code> ในโฟลเดอร์ <code>experiments/local-thai-ocr</code> แล้วกด “เลือกโฟลเดอร์ OCR” ใบเสร็จจะถูกอ่านบนเครื่องนี้เท่านั้น ไม่ส่งขึ้นบริการ OCR บนอินเทอร์เน็ต</p>}

    {!doc ? <div className="receipt-empty">
      <img className="illustration empty-art" src={ideaArt} alt=""/>
      <h2>ตรวจใบเสร็จก่อนส่ง AFP</h2>
      <p className="muted">เลือกรูปหรือ PDF ของใบเสร็จ ระบบจะอ่านข้อความและเสนอข้อมูลสำคัญ<br/>คุณเทียบกับต้นฉบับ แก้ไข และทำเครื่องหมายว่าตรวจแล้วทีละช่อง</p>
      <button disabled={!ready || Boolean(busy)} onClick={() => void run('read', read)}>{busy === 'read' ? <LoaderCircle size={16} className="spin"/> : <FileSearch size={16}/>}{busy === 'read' ? 'กำลังอ่านใบเสร็จ… ครั้งแรกอาจใช้ 1–2 นาที' : 'เลือกใบเสร็จ'}</button>
      <p className="small muted">รองรับ PDF, PNG, JPG, WebP, BMP, TIFF ขนาดไม่เกิน 25 MB</p>
    </div> : <div className="receipt-grid">
      <section className="receipt-source" aria-label="ใบเสร็จต้นฉบับ">
        <header><ScanText size={16}/><strong>{doc.name}</strong></header>
        {doc.preview ? <img className="receipt-preview" src={doc.preview} alt={'ภาพใบเสร็จ ' + doc.name}/> : <p className="small muted">ไฟล์ชนิดนี้แสดงภาพในแอปไม่ได้ โปรดเปิดต้นฉบับเทียบกับข้อความด้านล่าง</p>}
        <details open={reviewLines > 0}><summary>ข้อความที่อ่านได้ ({records.length} บรรทัด{reviewLines ? ` · ต้องตรวจ ${reviewLines}` : ''})</summary>
          <ol className="ocr-lines">{records.map((r, i) => <li key={i} className={r.needsReview ? 'flag' : ''}><span>{r.text}</span>
            {r.crosscheckCandidate && r.crosscheckCandidate !== r.text && <small>OCR ตัวที่สองอ่านว่า “{r.crosscheckCandidate}”</small>}
            {r.confidence !== null && <small className="conf">{Math.round(r.confidence * 100)}%</small>}</li>)}</ol>
        </details>
      </section>
      <section className="receipt-form" aria-label="ข้อมูลที่ต้องตรวจ">
        {review.fieldKeys.map(k => <div className="receipt-field" key={k}>
          <label htmlFor={'rf-' + k}>{labels[k]}{review.requiredKeys.includes(k) && <span className="required"> *</span>}</label>
          <div className="receipt-field-row"><input id={'rf-' + k} value={values[k] || ''} onChange={e => { setValues({ ...values, [k]: e.target.value }); setConfirmed({ ...confirmed, [k]: false }); }}/>
            <label className="check"><input type="checkbox" disabled={!String(values[k] || '').trim()} checked={Boolean(confirmed[k])} onChange={e => setConfirmed({ ...confirmed, [k]: e.target.checked })}/>ตรวจแล้ว</label></div>
          {fields[k]?.evidence && <small className="muted">จากบรรทัด “{fields[k].evidence}”{fields[k].confidence !== null ? ` · ${Math.round((fields[k].confidence || 0) * 100)}%` : ''}</small>}
        </div>)}
        {reviewLines > 0 && <label className="check lines-check"><input type="checkbox" checked={linesChecked} onChange={e => setLinesChecked(e.target.checked)}/>ตรวจ {reviewLines} บรรทัดที่ต้องตรวจเทียบกับต้นฉบับแล้ว</label>}
        <label className="receipt-note">หมายเหตุการเบิก<textarea value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น ใช้ในโครงการ… (กรอกเอง)"/></label>
        <div className={`receipt-verdict ${result.complete ? 'ok' : ''}`} role="status">
          {result.complete ? <Check size={16}/> : <TriangleAlert size={16}/>}
          <div><strong>{result.complete ? 'พร้อมให้ AFP ตรวจ' : 'ยังต้องตรวจหรือแก้เพิ่ม'}</strong> <small>{result.complete ? 'READY-FOR-AFP-REVIEW' : 'NEEDS-DOCUMENT-FIX'} · ตรวจแล้ว {result.confirmedCount}/{result.filledCount} ช่อง</small>
            {result.issues.length > 0 && <ul>{result.issues.map(i => <li key={i.code} className={i.severity}>{describe(i)}</li>)}</ul>}
            <p className="small muted">ผลนี้เป็นการตรวจเอกสารเบื้องต้น ไม่ใช่การอนุมัติเบิกจ่าย และยังไม่ได้เทียบกับระเบียบการเงินฉบับปัจจุบัน</p></div>
        </div>
        <div className="receipt-actions">
          <button className="quiet" onClick={() => void run('save', async () => { const saved = await call('ocrSave', { draft: draft() }); if (saved) notify('บันทึกร่างการตรวจแล้ว', 'success', { label: 'เปิดโฟลเดอร์', run: () => call('reveal', { path: saved.path }) }); })}><Save size={15}/>บันทึกร่าง (JSON)</button>
          <button className="quiet" disabled={Boolean(busy)} onClick={() => void run('read', read)}><FileSearch size={15}/>ตรวจใบใหม่</button>
          <span className="spacer"/>
          {/* AI pre-check follows the person's check: the required fields must be ticked first. A checked vendor tax ID stays readable. */}
          {!requiredChecked && <small className="muted">ติ๊ก “ตรวจแล้ว” ช่องที่มี * ก่อนส่งให้ AI</small>}
          <button disabled={!requiredChecked || Boolean(busy)} onClick={() => void run('handoff', () => handoff(summary(), confirmed.taxId && /^0\d{12}$/.test(review.normalizeDigits(values.taxId || '')) ? [review.normalizeDigits(values.taxId)] : []))}><Send size={15}/>ให้ AI pre-check ต่อ</button>
        </div>
      </section>
    </div>}
  </div>;
}
