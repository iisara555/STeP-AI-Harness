import { useRef, useState } from 'react';
import { Plus, Trash2 } from './icons';
import { t } from './i18n';
import { explainError } from './messages';
import {
  ACTIVITY_LABELS,
  FINANCE_LABELS,
  blankEvidenceGuidance,
  evidenceAiPrompt,
  evidenceChecklist,
  inferActivity,
  type EvidenceGuidance,
  type EvidenceStatus,
} from './afp-evidence';
import type { ReceiptPacket } from './receipt-packet';

const statusLabels: Record<EvidenceStatus, string> = {
  checked: 'พบหน้าที่ตรวจเทียบแล้ว',
  unchecked: 'พบในชุด · รอตรวจเทียบ',
  suggested: 'ชื่อไฟล์คล้ายกัน · รอยืนยันประเภท',
  missing: 'ยังไม่พบหน้าที่ระบุประเภท',
};
const sourceLabels = {
  'qp-af-003': 'QP-AF-003 ข้อ 4.2 · ใช้เมื่อเกี่ยวข้อง',
  'afp-circular': 'แนวปฏิบัติ AFP หมวด B · ตามกรณีที่เลือก',
  'need-source': 'ข้อเสนอให้ตรวจเพิ่ม · ยังไม่มีแหล่งยืนยันว่าต้องแนบ',
};

export function AfpEvidencePanel({
  packet,
  onChange,
  onAskAi,
  onReviewContext,
}: {
  packet: ReceiptPacket;
  onChange: (guidance: EvidenceGuidance) => void;
  onAskAi: (text: string) => Promise<boolean>;
  onReviewContext: (text: string) => Promise<{ text: string; redacted: boolean }>;
}) {
  const [previewAi, setPreviewAi] = useState(false);
  const [contextInput, setContextInput] = useState('');
  const [reviewedContext, setReviewedContext] = useState<{ text: string; redacted: boolean } | null>(null);
  const [checkingContext, setCheckingContext] = useState(false);
  const [contextError, setContextError] = useState('');
  const contextReviewVersion = useRef(0);
  const guidance = packet.guidance || blankEvidenceGuidance();
  const context = inferActivity(packet);
  const checklist = evidenceChecklist(packet);
  const change = (patch: Partial<EvidenceGuidance>) => onChange({ ...guidance, ...patch });
  const editExtra = (id: string, patch: Partial<EvidenceGuidance['extra'][number]>) =>
    change({ extra: guidance.extra.map(item => (item.id === id ? { ...item, ...patch } : item)) });
  return (
    <section className="packet-section evidence-guidance" aria-label={t('แนะนำเอกสารตามกิจกรรม')}>
      <div className="packet-section-heading">
        <h2>{t('แนะนำเอกสารตามกิจกรรม')}</h2>
        <span className="evidence-local">{t('วิเคราะห์บนเครื่อง')}</span>
      </div>
      <p className="small muted">{t('ระบบดูชื่อเรื่องและวัตถุประสงค์ แล้วเทียบกับประเภทหน้าที่เลือก คุณเปลี่ยนข้อเสนอได้')}</p>
      <p className="evidence-context" role="status">
        {context.activity
          ? context.automatic
            ? t('ระบบคาดว่า: {0} · โปรดตรวจหรือเปลี่ยนได้', t(ACTIVITY_LABELS[context.activity]))
            : t('กิจกรรม: {0}', t(ACTIVITY_LABELS[context.activity]))
          : context.candidates.length
            ? t('พบหลายลักษณะกิจกรรม · โปรดเลือกประเภทที่ตรง')
            : t('ยังระบุกิจกรรมไม่ได้ · เพิ่มบริบทหรือเลือกเอง')}
      </p>
      <p className="small muted">{t('กรณีการเงิน: {0}', t(FINANCE_LABELS[guidance.finance]))}</p>
      <details className="evidence-options">
        <summary>{t('ปรับกิจกรรมและกรณีการเงิน')}</summary>
        <label>
          {t('ลักษณะกิจกรรม')}
          <select value={guidance.activity} onChange={event => change({ activity: event.target.value as EvidenceGuidance['activity'] })}>
            {Object.entries(ACTIVITY_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <div className="evidence-selects">
          <label>
            {t('กรณีการเงินที่ทราบ')}
            <select value={guidance.finance} onChange={event => change({ finance: event.target.value as EvidenceGuidance['finance'] })}>
              {Object.entries(FINANCE_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('วิทยากร / ผู้เชี่ยวชาญ')}
            <select value={guidance.speaker} onChange={event => change({ speaker: event.target.value as EvidenceGuidance['speaker'] })}>
              <option value="auto">{t('ดูจากบริบท')}</option>
              <option value="yes">{t('มี')}</option>
              <option value="no">{t('ไม่มี / ไม่เกี่ยวข้อง')}</option>
            </select>
          </label>
        </div>
        <p className="small muted">{t('กรณีการเงินต้องเลือกเอง ระบบไม่เดาหมวดค่าใช้จ่ายจากชื่อกิจกรรม')}</p>
      </details>
      {checklist.length ? (
        <ul className="evidence-list">
          {checklist.map(item => (
            <li key={item.id}>
              <div className="evidence-item-heading">
                <strong>{t(item.label)}</strong>
                <span className={`evidence-state evidence-state-${item.status}`}>{t(statusLabels[item.status])}</span>
              </div>
              {item.source === 'need-source' && <p className="small muted">{t('ต้องยืนยันความจำเป็นกับ AFP')}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="evidence-empty">{t('เลือกกิจกรรมหรือกรณีการเงินเพื่อดูรายการที่เกี่ยวข้อง')}</p>
      )}
      {checklist.length > 0 && (
        <details className="evidence-sources">
          <summary>{t('ดูเหตุผลและที่มา')}</summary>
          <ul>
            {checklist.map(item => (
              <li key={item.id}>
                <strong>{t(item.label)}</strong>
                <p>{t(item.reason)}</p>
                <p className="small muted">{t(sourceLabels[item.source])}</p>
                {item.sources.map(source => (
                  <p className="small" key={source.id}>
                    {t('ในชุด: {0} · หน้า {1}', source.name, source.pages.join(', '))}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="small muted">
        {t('รายการเป็นเครื่องช่วยตรวจตามบริบท ไม่ยืนยันว่าเอกสารครบหรืออนุมัติเบิกได้ โปรดเทียบข้อกำหนดล่าสุดกับ AFP')}
      </p>
      <details className="evidence-extra">
        <summary>{t('รายการอื่นที่ต้องการตรวจ ({0})', guidance.extra.length)}</summary>
        <p className="small muted">{t('เพิ่มรายการเองและเชื่อมไฟล์ในชุดได้ รายการเหล่านี้ไม่ส่งให้ AI')}</p>
        {guidance.extra.map((item, index) => {
          const source = packet.documents.find(doc => doc.id === item.sourceId);
          const selected = source?.pages.filter(page => page.included) || [];
          return (
            <div className="evidence-extra-row" key={item.id}>
              <label>
                {t('รายการเพิ่มเติม {0}', index + 1)}
                <input value={item.label} maxLength={180} onChange={event => editExtra(item.id, { label: event.target.value })} />
              </label>
              <label>
                {t('เชื่อมไฟล์สำหรับรายการ {0}', index + 1)}
                <select value={item.sourceId} onChange={event => editExtra(item.id, { sourceId: event.target.value })}>
                  <option value="">{t('ยังไม่เชื่อมไฟล์')}</option>
                  {packet.documents.map(doc => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name}
                    </option>
                  ))}
                </select>
              </label>
              {source && (
                <p className="small muted">
                  {!selected.length
                    ? t('ยังไม่ได้เลือกหน้าในไฟล์นี้')
                    : selected.every(page => page.checked)
                      ? t('ตรวจหน้าที่เลือกแล้ว')
                      : t('หน้าที่เลือกยังรอตรวจเทียบ')}
                </p>
              )}
              <button
                type="button"
                className="text-link"
                aria-label={t('ลบรายการเพิ่มเติม {0}', index + 1)}
                onClick={() => change({ extra: guidance.extra.filter(other => other.id !== item.id) })}
              >
                <Trash2 size={14} />
                {t('ลบรายการ')}
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="quiet"
          disabled={guidance.extra.length >= 20}
          onClick={() => change({ extra: [...guidance.extra, { id: crypto.randomUUID(), label: '', sourceId: '' }] })}
        >
          <Plus size={14} />
          {t('เพิ่มรายการตรวจ')}
        </button>
      </details>
      <div className="evidence-ai">
        <button
          type="button"
          className="quiet"
          onClick={() => {
            if (previewAi) {
              contextReviewVersion.current++;
              setContextInput('');
              setReviewedContext(null);
              setContextError('');
              setCheckingContext(false);
            }
            setPreviewAi(!previewAi);
          }}
          aria-expanded={previewAi}
        >
          {t('ให้ AI ช่วยพิจารณาต่อ')}
        </button>
        {previewAi && (
          <div className="evidence-ai-preview">
            <p>{t('ตรวจข้อมูลที่จะส่งก่อน: ประเภทกิจกรรม กรณีการเงิน สถานะเอกสาร และบริบทเพิ่มเติมที่คุณเลือก')}</p>
            <p className="small muted">
              {t('ไม่แนบไฟล์หรือนำชื่อเรื่อง ชื่อไฟล์ รายการที่เพิ่มเอง เนื้อหาเอกสาร รายชื่อ สำเนาบัตร CV หรือภาพลายเซ็นมาโดยอัตโนมัติ')}
            </p>
            <label>
              {t('บริบทเพิ่มเติมสำหรับ AI (ไม่บังคับ)')}
              <textarea
                rows={3}
                maxLength={600}
                value={contextInput}
                disabled={checkingContext}
                placeholder={t('เช่น อบรมหนึ่งวัน มีวิทยากรและอาหาร โดยไม่ใส่ชื่อบุคคล')}
                onChange={event => {
                  contextReviewVersion.current++;
                  setContextInput(event.target.value);
                  setReviewedContext(null);
                  setContextError('');
                }}
              />
            </label>
            <p className="small muted">
              {t('ระบบช่วยปิดบังรูปแบบที่รู้จัก แต่ชื่อหรือข้อมูลบางอย่างอาจตรวจไม่พบ โปรดลบข้อมูลส่วนบุคคลก่อนส่ง')}
            </p>
            <button
              type="button"
              className="quiet"
              disabled={!contextInput.trim() || checkingContext}
              onClick={() => {
                const reviewVersion = ++contextReviewVersion.current;
                setCheckingContext(true);
                setContextError('');
                setReviewedContext(null);
                void onReviewContext(contextInput)
                  .then(review => {
                    if (contextReviewVersion.current === reviewVersion) setReviewedContext(review);
                  })
                  .catch(error => {
                    if (contextReviewVersion.current === reviewVersion) setContextError(explainError(error));
                  })
                  .finally(() => {
                    if (contextReviewVersion.current === reviewVersion) setCheckingContext(false);
                  });
              }}
            >
              {checkingContext ? t('กำลังตรวจบริบท…') : t('ตรวจและปิดบังบริบท')}
            </button>
            {contextError && <p role="alert">{contextError}</p>}
            {reviewedContext && (
              <p className="small muted">
                {reviewedContext.redacted ? t('ปิดบังข้อมูลบางส่วนแล้ว โปรดตรวจข้อความอีกครั้ง') : t('ตรวจข้อความด้วยตนเองก่อนส่ง')}
              </p>
            )}
            <pre>{evidenceAiPrompt(packet, t, reviewedContext?.text || '')}</pre>
            <button
              type="button"
              className="primary"
              disabled={checkingContext || Boolean(contextInput.trim() && !reviewedContext)}
              onClick={() => {
                void onAskAi(evidenceAiPrompt(packet, t, reviewedContext?.text || '')).then(sent => {
                  if (sent) {
                    setPreviewAi(false);
                    setContextInput('');
                    setReviewedContext(null);
                  }
                });
              }}
            >
              {t('ส่งบริบทนี้ให้ AI วิเคราะห์')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
