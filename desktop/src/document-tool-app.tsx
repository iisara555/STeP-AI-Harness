import { useEffect, useState } from 'react';
import { FileText, LoaderCircle, Paperclip, Sparkles, X } from './icons';
import type { Attachment, Connection } from './types';
import { DOCUMENT_TOOLS, documentTool, type DocumentToolId, type DocumentAttachmentRole } from './document-tools';
import { connectionName, errorText } from './messages';
import { t } from './i18n';
import { skillDisplayName } from './skill-display';
import { ThaiText } from './thai-text';
import './document-tools.css';

export type DocumentAttachment = { sessionId: string; file: Attachment };
export type DocumentForm = {
  values: Record<string, string>;
  variant: string;
  source?: DocumentAttachment;
  sourceRole?: DocumentAttachmentRole;
};
export function DocumentTools({
  connections,
  connectionId,
  chooseConnection,
  attach,
  draft,
  existingDraft,
  revise,
  consumedTask,
  busy,
  onError,
  openAiSettings,
}: {
  connections: Connection[];
  connectionId: string;
  chooseConnection: (id: string) => void;
  attach: (id: DocumentToolId) => Promise<DocumentAttachment | null>;
  draft: (id: DocumentToolId, form: DocumentForm) => Promise<void>;
  existingDraft?: { id: string; tool: DocumentToolId; title: string };
  revise: (id: string, request: string) => Promise<void>;
  consumedTask: string;
  busy: boolean;
  onError: (error: unknown) => void;
  openAiSettings: () => void;
}) {
  const [selected, setSelected] = useState<DocumentToolId>(() => existingDraft?.tool || 'tor');
  const [forms, setForms] = useState<Partial<Record<DocumentToolId, DocumentForm>>>({});
  const [working, setWorking] = useState(false);
  const [revisionRequest, setRevisionRequest] = useState('');
  const profile = documentTool(selected)!;
  const form = forms[selected] || { values: {}, variant: profile.variants[0].id };
  const ready = connections.filter(c => c.ready);
  const connected = ready.some(c => c.id === connectionId);
  const disabled = busy || working;
  const hasInput = Object.values(form.values).some(v => v.trim()) || Boolean(form.source?.file.usable);
  const sourceBlocked = Boolean(
    form.source && (!form.source.file.usable || (form.sourceRole !== 'template' && form.source.file.sourceUsable === false)),
  );
  // The same checks that disable the draft button, worded for staff so a grey button never goes unexplained.
  const blockedReason = disabled
    ? ''
    : !connected
      ? t('เลือก AI ที่เชื่อมต่อแล้วด้านบนก่อน')
      : sourceBlocked
        ? t('ไฟล์แนบส่งให้ AI ไม่ได้ ให้นำออกหรือแนบไฟล์อื่นก่อน')
        : !hasInput
          ? t('กรอกอย่างน้อยหนึ่งช่อง หรือแนบต้นเรื่อง แล้วจึงให้ AI ร่าง')
          : '';
  const update = (patch: Partial<DocumentForm>) => setForms(old => ({ ...old, [selected]: { ...form, ...patch } }));
  useEffect(() => setRevisionRequest(''), [existingDraft?.id, selected]);
  // Consent is handled by the normal send dialog. Only a started send consumes the attachment.
  useEffect(() => {
    if (!consumedTask) return;
    setForms(old =>
      Object.fromEntries(
        Object.entries(old).map(([id, f]) => [
          id,
          f?.source?.sessionId === consumedTask ? { ...f, source: undefined, sourceRole: undefined } : f,
        ]),
      ),
    );
  }, [consumedTask]);
  async function run(task: () => Promise<void>) {
    setWorking(true);
    try {
      await task();
    } catch (e) {
      onError(e);
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="document-tools">
      <h1 className="sr-only">{t('เครื่องมือร่างเอกสาร')}</h1>
      <p className="muted">{t('เลือกชนิดเอกสาร → กรอกข้อมูลหรือแนบต้นเรื่อง → AI ร่าง → แก้ไขและส่งออก')}</p>
      <div className="document-tool-picker" aria-label={t('ชนิดเอกสาร')}>
        {DOCUMENT_TOOLS.map(p => (
          <button
            key={p.id}
            aria-pressed={selected === p.id}
            disabled={disabled}
            className={selected === p.id ? 'active' : ''}
            onClick={() => setSelected(p.id)}
          >
            <FileText size={18} />
            <strong>{t(p.title)}</strong>
            <small>
              <ThaiText text={t(p.description)} />
            </small>
          </button>
        ))}
      </div>
      <form
        className="document-form"
        onSubmit={e => {
          e.preventDefault();
          if (!disabled && connected && hasInput && !form.source?.file.reason) void run(() => draft(selected, form));
        }}
      >
        <header>
          <h2>{t(profile.title)}</h2>
          <p className="small muted">
            {t('เว้นช่องเนื้อหาได้ AI จะช่วยขึ้นร่างจากต้นเรื่อง ส่วนข้อเท็จจริงและเงื่อนไขที่ต้องมีหลักฐานจะคงรอยืนยัน')}
          </p>
          <p className="small muted">
            {selected === 'tor'
              ? t('TOR ใช้แม่แบบ 16 หัวข้อเดิม')
              : t('แนบไฟล์ Word จาก MIS เป็นแม่แบบได้ เพื่อรักษารูปแบบต้นฉบับ หากไม่แนบจะใช้แบบร่างทั่วไป')}
          </p>
        </header>
        {existingDraft?.tool === selected && (
          <section className="document-revision">
            <h3>{t('ปรับร่างเดิม')}</h3>
            <p className="small muted">{t('ร่างที่กำลังแก้: {0}', existingDraft.title)}</p>
            <label>
              {t('ระบุเฉพาะส่วนที่ต้องการปรับ')}
              <textarea
                aria-label={t('ระบุเฉพาะส่วนที่ต้องการปรับ')}
                value={revisionRequest}
                maxLength={6000}
                disabled={disabled}
                onChange={e => setRevisionRequest(e.target.value)}
              />
            </label>
            <p className="small muted">{t('ใช้ร่างล่าสุดและข้อความที่คุณแก้ไว้ คงส่วนอื่นไว้ให้ตรวจเทียบก่อนใช้')}</p>
            <button
              type="button"
              className="quiet"
              disabled={disabled || !connected || !revisionRequest.trim()}
              onClick={() =>
                void run(async () => {
                  await revise(existingDraft.id, revisionRequest.trim());
                  setRevisionRequest('');
                })
              }
            >
              {t('ปรับร่างเดิม')}
            </button>
          </section>
        )}
        <div className="document-form-options">
          <label>
            {t('ชนิด / เรื่อง')}
            <select
              aria-label={t('ชนิด / เรื่อง')}
              value={form.variant}
              disabled={disabled}
              onChange={e => update({ variant: e.target.value })}
            >
              {profile.variants.map(v => (
                <option key={v.id} value={v.id}>
                  {t(v.label)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('AI ที่ใช้ร่าง')}
            <select
              aria-label={t('AI ที่ใช้ร่าง')}
              value={connected ? connectionId : ''}
              disabled={disabled}
              onChange={e => chooseConnection(e.target.value)}
            >
              <option value="" disabled>
                {t('เลือก AI ที่เชื่อมต่อแล้ว')}
              </option>
              {ready.map(c => (
                <option key={c.id} value={c.id}>
                  {connectionName(c)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!connected && (
          <p className="small">
            {t('เพิ่มหรือเลือกบัญชี AI เพื่อร่างใน Desktop')}{' '}
            <button type="button" className="quiet" onClick={openAiSettings}>
              {t('เชื่อมต่อ AI')}
            </button>
          </p>
        )}
        <details className="document-skill-info">
          <summary>{t('ขั้นตอนที่ใช้ร่างและตรวจข้อมูล')}</summary>
          <p>
            {t('Skill หลัก:')} <strong title={profile.skill}>{skillDisplayName(profile.skill)}</strong>
            {profile.supportSkills.length > 0 && (
              <>
                {' '}
                · {t('ร่วมกับ')} {profile.supportSkills.map(skillDisplayName).join(', ')}
              </>
            )}
          </p>
          <p className="small muted">
            {t(
              'ใช้โครงสร้าง กติกา และการตรวจแหล่งข้อมูลของ Skill พร้อมแม่แบบเพื่อร่าง หากยังไม่มีแบบหน่วยงานที่ยืนยันแล้ว ระบบจะระบุไว้ให้ตรวจ',
            )}
          </p>
        </details>
        <div className="document-source">
          <button
            type="button"
            className="quiet"
            disabled={disabled || !connected || Boolean(form.source)}
            onClick={() =>
              void run(async () => {
                const source = await attach(selected);
                if (source) update({ source, sourceRole: source.file.templateReady ? 'template' : 'source' });
              })
            }
          >
            <Paperclip size={16} />
            {t('แนบต้นเรื่อง / แบบฟอร์มหน่วยงาน')}
          </button>
          {form.source && (
            <div className="document-source-preview">
              <strong>{form.source.file.name}</strong>
              <button
                type="button"
                className="icon"
                aria-label={t('นำต้นเรื่องออก')}
                disabled={disabled}
                onClick={() => update({ source: undefined, sourceRole: undefined })}
              >
                <X size={16} />
              </button>
              <p className={form.source.file.usable ? 'small muted' : 'small error'}>{form.source.file.status}</p>
              <label>
                {t('ใช้ไฟล์แนบเป็น')}
                <select
                  aria-label={t('ใช้ไฟล์แนบเป็น')}
                  disabled={disabled}
                  value={form.sourceRole || 'source'}
                  onChange={e => update({ sourceRole: e.target.value as DocumentAttachmentRole })}
                >
                  <option value="source">{t('ต้นเรื่องของงานนี้')}</option>
                  <option value="template">{t('แบบฟอร์ม / ตัวอย่าง (ใช้เฉพาะโครงสร้าง)')}</option>
                </select>
              </label>
              {form.sourceRole === 'template' && (
                <p className="small muted">
                  {t(
                    'เลือกแม่แบบ DOCX ข้อมูลตัวอย่างไม่ส่งให้ AI รักษาฟอนต์ ตาราง ระยะขอบและตราของแบบเมื่อส่งออก DOCX ส่วน PDF ให้เปิดจาก Word หลังตรวจหน้า',
                  )}
                </p>
              )}
              {form.sourceRole !== 'template' && form.source.file.sourceUsable === false && (
                <p className="small error">{t('ไฟล์นี้ใช้เป็นแม่แบบได้เท่านั้น หากใช้เป็นต้นเรื่องให้แนบข้อความที่ตรวจแล้ว')}</p>
              )}
              {form.source.file.usable && (
                <details>
                  <summary>{t('ดูข้อความต้นเรื่องก่อนส่ง')}</summary>
                  <pre>{form.source.file.preview || t('ไม่มีข้อความที่อ่านได้')}</pre>
                </details>
              )}
              {!form.source.file.usable && (
                <p className="small">
                  {(form.source.file.reason && errorText[form.source.file.reason]) ||
                    t('ไฟล์นี้ส่งให้ AI ไม่ได้ ให้นำออกหรือแนบไฟล์อื่นก่อนร่าง')}
                </p>
              )}
            </div>
          )}
          <p className="small muted">
            {t(
              'แนบได้หนึ่งไฟล์ต่อร่าง หรือวางข้อมูลในช่องด้านล่าง ข้อมูลฟอร์มและต้นเรื่องจะส่งให้ AI ที่เลือกตามการตั้งค่าความเป็นส่วนตัวของเครื่องนี้',
            )}
          </p>
        </div>
        <div className="document-fields">
          {profile.fields.map(f => (
            <label key={f.key} className={f.multiline ? 'wide' : ''}>
              {t(f.label)}
              {f.multiline ? (
                <textarea
                  aria-label={t(f.label)}
                  rows={3}
                  maxLength={6000}
                  value={form.values[f.key] || ''}
                  disabled={disabled}
                  placeholder={t('เว้นได้หากยังไม่มีข้อมูล')}
                  onChange={e => update({ values: { ...form.values, [f.key]: e.target.value } })}
                />
              ) : (
                <input
                  aria-label={t(f.label)}
                  maxLength={6000}
                  value={form.values[f.key] || ''}
                  disabled={disabled}
                  placeholder={t('เว้นได้หากยังไม่มีข้อมูล')}
                  onChange={e => update({ values: { ...form.values, [f.key]: e.target.value } })}
                />
              )}
              {f.missingAction === 'draft-proposal' && <small className="muted">{t('เว้นได้ AI ช่วยเสนอร่างให้พิจารณา')}</small>}
              {f.hint && <small className="muted">{t(f.hint)}</small>}
            </label>
          ))}
        </div>
        {/* Sticky: the only primary action stays in reach on a form that is several screens tall. */}
        <footer className="document-form-actions">
          <p className="small muted">{t('AI ช่วยร่าง การตรวจข้อมูลจริง การอนุมัติ และการลงนามเป็นของเจ้าของเรื่องและผู้มีอำนาจ')}</p>
          <div className="document-form-submit">
            {blockedReason && (
              <p id="document-draft-reason" className="small document-draft-reason" role="status">
                {blockedReason}
              </p>
            )}
            <button
              className="primary"
              type="submit"
              aria-describedby={blockedReason ? 'document-draft-reason' : undefined}
              disabled={disabled || !connected || !hasInput || sourceBlocked}
            >
              {working ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}
              {t('ให้ AI ร่างเอกสาร')}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
