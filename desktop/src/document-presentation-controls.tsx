import { resolvePresentation, type DocumentPresentation } from './document-presentation';
import { t } from './i18n';
import './document-presentation.css';

export function DocumentPresentationControls({
  value,
  locked,
  disabled,
  onChange,
}: {
  value: DocumentPresentation;
  locked: boolean;
  disabled: boolean;
  onChange: (value: DocumentPresentation) => void;
}) {
  const update = (change: Partial<DocumentPresentation>) => onChange(resolvePresentation({ ...value, ...change }));
  return (
    <fieldset className="document-presentation" disabled={disabled}>
      <legend>{t('รูปแบบ DOCX')}</legend>
      <label>
        {t('การจัดหน้า')}
        <select
          aria-label={t('การจัดหน้า')}
          value={value.preset}
          disabled={locked}
          onChange={event => update({ preset: event.target.value as DocumentPresentation['preset'] })}
        >
          <option value="saraban">{t('ราชการ (สารบรรณ)')}</option>
          <option value="report">{t('รายงานทั่วไป')}</option>
          <option value="book">{t('บทความ / หนังสือ')}</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={value.thaiBreaks} onChange={event => update({ thaiBreaks: event.target.checked })} />
        {t('ช่วยตัดคำไทยใน Word')}
      </label>
      <label>
        <input type="checkbox" checked={value.embedFonts} onChange={event => update({ embedFonts: event.target.checked })} />
        {t('ฝังฟอนต์เพื่อเปิดและแก้ไขบนเครื่องอื่น')}
      </label>
    </fieldset>
  );
}
