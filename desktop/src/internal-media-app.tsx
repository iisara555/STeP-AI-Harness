import { useEffect, useMemo, useState } from 'react';
import { Copy, Lightbulb } from 'lucide-react';
import {
  MEDIA_EXAMPLES,
  MEDIA_FONTS,
  MEDIA_RATIOS,
  MEDIA_SPACE_LABELS,
  MEDIA_STYLE_LABELS,
  MEDIA_TYPES,
  compileMedia,
  mediaAiRequest,
  normalizeMedia,
  type MediaSpace,
  type MediaState,
  type MediaStyle,
  type MediaType,
} from './internal-media';
import { t } from './i18n';
import { ConfirmDialog } from './ui';
import coupleArt from './assets/illustrations/media-couple.webp';
import './internal-media.css';

// The draft stays on this computer only; storage can be unavailable, so every access is guarded.
const STORAGE_KEY = 'step-internal-media-v1';
function loadDraft(): MediaState {
  try {
    return normalizeMedia(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
  } catch {
    return normalizeMedia();
  }
}

export function InternalMedia({
  notify,
  copyText,
}: {
  notify: (text: string, tone?: 'info' | 'error') => void;
  copyText: (text: string) => Promise<unknown>;
}) {
  const [state, setState] = useState<MediaState>(loadDraft);
  const [exampleType, setExampleType] = useState<MediaType | null>(null);
  const result = useMemo(() => compileMedia(state), [state]);
  const aiRequest = useMemo(() => mediaAiRequest(state), [state]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Not saving a draft is harmless: the form keeps working for this session.
    }
  }, [state]);
  const set = (patch: Partial<MediaState>) => setState(old => ({ ...old, ...patch }));
  const blank = state.textMode === 'SPACE';
  async function copy(text: string) {
    try {
      await copyText(text);
      notify(t('คัดลอกแล้ว'));
    } catch {
      notify(t('คัดลอกไม่ได้ เลือกข้อความแล้วคัดลอกเองได้'), 'error');
    }
  }
  function fillExample(type: MediaType) {
    set({ ...MEDIA_EXAMPLES[type], source: t('ตัวอย่างสมมติสำหรับทดลอง') });
    setExampleType(null);
    notify(t('ใส่ตัวอย่างแล้ว แก้ให้ตรงกับงานจริง'));
  }
  function applyExample() {
    const replacesDraft = [state.topic, state.brief, state.content, state.visual, state.source].some(value => value.trim());
    if (replacesDraft) setExampleType(state.type);
    else fillExample(state.type);
  }
  const audit = result.ready
    ? t('พร้อมคัดลอก · ตรวจเนื้อหาก่อนใช้จริง')
    : [
        // Name the field on screen: the topic box, or the one content box that both content checks refer to.
        ...new Set(result.missing.map(m => t('กรอก {0}', m === 'หัวข้อ' ? t('เรื่องที่ต้องการสื่อสาร') : t('เนื้อหา / ขั้นตอนที่จะใช้')))),
        ...result.warnings.map(w => t(w)),
      ].join(' · ');
  return (
    <div className="internal-media">
      {exampleType && (
        <ConfirmDialog
          title={t('ใช้ตัวอย่างแทนข้อมูลปัจจุบันหรือไม่?')}
          confirmLabel={t('ใส่ตัวอย่าง')}
          focusCancel
          onCancel={() => setExampleType(null)}
          onConfirm={() => fillExample(exampleType)}
        >
          <p>{t('ตัวอย่างสมมติสำหรับทดลอง')}</p>
        </ConfirmDialog>
      )}
      <h1 className="sr-only">{t('สื่อภายใน')}</h1>
      <p className="muted">{t('เลือกงาน → ใส่เรื่องที่ต้องการสื่อสาร → ได้ Prompt สำหรับเครื่องมือสร้างภาพ')}</p>
      <div className="media-types" role="group" aria-label={t('ประเภทสื่อ')}>
        {(Object.keys(MEDIA_TYPES) as MediaType[]).map(type => (
          <button
            key={type}
            aria-pressed={state.type === type}
            className={state.type === type ? 'active' : ''}
            onClick={() => set({ type })}
          >
            {t(MEDIA_TYPES[type])}
          </button>
        ))}
      </div>
      <div className="media-workspace">
        <section className="media-card">
          <label>
            {t('เรื่องที่ต้องการสื่อสาร')}
            <input
              value={state.topic}
              maxLength={300}
              placeholder={t('เช่น วิธีใช้ตู้ประชุม หรือประกาศเปลี่ยนพื้นที่ทำงาน')}
              onChange={e => set({ topic: e.target.value })}
            />
          </label>
          <label>
            {t('ข้อมูลที่มี')}
            <textarea
              rows={3}
              maxLength={6000}
              value={state.brief}
              placeholder={t('บอกสารสำคัญ ขั้นตอน หรือรายละเอียดที่ต้องมี')}
              onChange={e => set({ brief: e.target.value })}
            />
          </label>
          <div className="media-actions">
            <button type="button" className="quiet" onClick={applyExample}>
              <Lightbulb size={16} />
              {t('ใส่ตัวอย่าง')}
            </button>
          </div>
          <details className="media-ai-request">
            <summary>{t('ให้ AI ช่วยร่างเนื้อหา')}</summary>
            <p className="small muted">
              {t(
                'คัดลอกคำขอนี้ไปถามในแชต แล้วนำเนื้อหาที่ได้กลับมาวางในช่อง "เนื้อหา / ขั้นตอนที่จะใช้" เรื่องของ STeP AI จะตอบจากเอกสารองค์กร',
              )}
            </p>
            <textarea readOnly rows={8} aria-label={t('คำขอให้ AI ช่วยร่าง')} value={aiRequest} />
            <button type="button" className="quiet" disabled={!state.topic.trim()} onClick={() => void copy(aiRequest)}>
              <Copy size={16} />
              {t('คัดลอกคำขอให้ AI')}
            </button>
          </details>
          <label>
            {t('เนื้อหา / ขั้นตอนที่จะใช้')}
            <textarea
              rows={6}
              maxLength={6000}
              value={state.content}
              placeholder={t('แก้ร่างที่นี่ หรือวางเนื้อหาที่ AI ช่วยร่างมา')}
              onChange={e => set({ content: e.target.value })}
            />
          </label>
          <div className="media-two">
            <label>
              {t('รูปแบบภาพ')}
              <select value={state.ratio} onChange={e => set({ ratio: e.target.value as MediaState['ratio'] })}>
                {MEDIA_RATIOS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {t(label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('แนวภาพ')}
              <select value={state.style} onChange={e => set({ style: e.target.value as MediaStyle })}>
                {(Object.keys(MEDIA_STYLE_LABELS) as MediaStyle[]).map(style => (
                  <option key={style} value={style}>
                    {t(MEDIA_STYLE_LABELS[style])}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {state.style === 'NOTION' && (
            <p className="small muted">
              {t(
                'เส้นหนาบางมีจังหวะวาดมือ ผมและเสื้อผ้าถมดำ หน้าตาเรียบ ท่าทางเล่าเรื่อง บนพื้นขาว เติมเหลืององค์กรเฉพาะจุด ถ้ามีภาพอ้างอิงที่ได้รับอนุญาต แนบในเครื่องมือสร้างภาพได้ การคัดลอก Prompt ไม่ได้แนบรูปให้',
              )}
            </p>
          )}
          <label>
            {t('ฟอนต์ข้อความไทย')}
            <select value={state.font} onChange={e => set({ font: e.target.value })}>
              {MEDIA_FONTS.map(font => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </label>
          <p className="small muted">
            {t(
              'ฟอนต์ที่ทีมเลือกใช้ ไม่ใช่ข้อกำหนดของคู่มือ CI ถ้าเครื่องมือสร้างข้อความไม่ได้ ให้เว้นที่แล้วจัดข้อความด้วยฟอนต์จริงภายหลัง',
            )}
          </p>
          <label>
            {t('ข้อความในภาพ')}
            <select value={state.textMode} onChange={e => set({ textMode: e.target.value as MediaState['textMode'] })}>
              <option value="GENERATE">{t('ให้ AI สร้างข้อความในภาพเลย')}</option>
              <option value="SPACE">{t('เว้นพื้นที่ ใส่ข้อความเองภายหลัง')}</option>
            </select>
          </label>
          {blank && (
            <label>
              {t('ตำแหน่งที่ต้องการเว้นว่าง')}
              <select value={state.position} onChange={e => set({ position: e.target.value as MediaSpace })}>
                {(Object.keys(MEDIA_SPACE_LABELS) as MediaSpace[]).map(space => (
                  <option key={space} value={space}>
                    {t(MEDIA_SPACE_LABELS[space])}
                  </option>
                ))}
              </select>
            </label>
          )}
          <details>
            <summary>{t('รายละเอียดเพิ่มเติม')}</summary>
            <label>
              {t('แนวคิดภาพ')}
              <textarea
                rows={2}
                maxLength={2000}
                value={state.visual}
                placeholder={t('ระบุสิ่งที่อยากให้เห็นในภาพ (ไม่บังคับ)')}
                onChange={e => set({ visual: e.target.value })}
              />
            </label>
            <label>
              {t('แหล่งข้อมูล')}
              <input
                value={state.source}
                maxLength={500}
                placeholder={t('คู่มือ ผู้รับผิดชอบ หรือข้อมูลอ้างอิง')}
                onChange={e => set({ source: e.target.value })}
              />
            </label>
          </details>
          <p className="small muted">{t('ร่างนี้เก็บไว้ในเครื่องนี้อัตโนมัติ')}</p>
        </section>
        <section className="media-card media-result">
          <header>
            <h2>{t('Prompt ของคุณ')}</h2>
            <span className="small muted">{t('ใช้ภายในเท่านั้น')}</span>
          </header>
          {/* Sticky: what is still missing and the copy button stay in view while the lower fields are filled. */}
          <div className="media-copy-bar">
            <p role="status" aria-live="polite" className={result.ready ? 'small' : 'small media-audit-pending'}>
              {audit}
            </p>
            <button type="button" className="primary" disabled={!result.ready} onClick={() => void copy(result.prompt)}>
              <Copy size={16} />
              {t('คัดลอก Prompt')}
            </button>
          </div>
          <textarea readOnly rows={16} aria-label={t('Prompt พร้อมใช้')} value={result.prompt} />
          <MediaPreview state={state} />
          <p className="small muted">
            {t('Simple · Service · Sincere · เหลือง #FFC709 · ดำ #231F20 · ห้าม AI สร้างโลโก้ทุกชนิด ตรวจตัวสะกดและความถูกต้องก่อนใช้จริง')}
          </p>
        </section>
      </div>
    </div>
  );
}

/** A layout sketch at the chosen ratio: where the copy or the empty text area goes, and where the art goes. */
function MediaPreview({ state }: { state: MediaState }) {
  const blank = state.textMode === 'SPACE';
  const ratio = MEDIA_RATIOS.find(([value]) => value === state.ratio)?.[1] || state.ratio;
  const lines = state.content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 5);
  // Copy-in-image layouts follow the shape: text above the art on tall formats, beside it on wide ones.
  const placement = blank ? state.position.toLowerCase() : ['4:5', '9:16'].includes(state.ratio) ? 'top' : 'left';
  return (
    <figure className="media-preview">
      <figcaption>
        <span>{t('ตัวอย่างการจัดวาง')}</span>
        <span className="media-preview-chip">{t(ratio)}</span>
      </figcaption>
      <div
        className={`media-canvas ratio-${state.ratio.replace(':', '-')} place-${placement}${blank ? ' is-blank' : ''}`}
        role="img"
        aria-label={blank ? t('ผังภาพ เว้นพื้นที่ข้อความ{0}', t(MEDIA_SPACE_LABELS[state.position])) : t('ผังภาพ ข้อความอยู่ในภาพ')}
      >
        <div className="media-canvas-text">
          {blank ? (
            <>
              <span className="media-canvas-tag">{t('เว้นว่างไว้ใส่ข้อความ')}</span>
              <i />
              <i />
              <i className="short" />
            </>
          ) : lines.length ? (
            lines.map((line, i) => (
              <span key={i} className={i === 0 ? 'heading' : ''} style={{ fontFamily: `'${state.font}', var(--font, sans-serif)` }}>
                {line}
              </span>
            ))
          ) : (
            <>
              <span className="heading placeholder">{t('หัวเรื่อง')}</span>
              <i />
              <i className="short" />
            </>
          )}
        </div>
        <div className="media-canvas-art" aria-hidden="true">
          <img src={coupleArt} alt="" draggable={false} />
        </div>
      </div>
      <p className="small muted">{t('ผังคร่าว ๆ ไม่ใช่ภาพที่ AI สร้าง')}</p>
    </figure>
  );
}
