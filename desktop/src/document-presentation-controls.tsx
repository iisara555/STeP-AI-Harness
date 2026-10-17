import { resolvePresentation, type DocumentPresentation } from './document-presentation';
import { t } from './i18n';
import './document-presentation.css';

const EXPORT_SETTINGS_KEY = 'step.exportSettings';

/** Export settings start folded so the draft keeps the panel; the employee's last choice is remembered on this computer. */
export function readExportSettingsOpen(): boolean {
  try {
    return localStorage.getItem(EXPORT_SETTINGS_KEY) === 'open';
  } catch {
    return false;
  }
}

export function saveExportSettingsOpen(open: boolean) {
  try {
    localStorage.setItem(EXPORT_SETTINGS_KEY, open ? 'open' : 'closed');
  } catch {
    // Storage can be unavailable; the panel still works for this run.
  }
}

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
        <input type="checkbox" disabled={locked} checked={value.toc} onChange={event => update({ toc: event.target.checked })} />
        {t('สารบัญจากหัวข้อระดับ 1–3')}
      </label>
      <label>
        {t('ข้อความหัวกระดาษ')}
        <input maxLength={500} disabled={locked} value={value.headerText} onChange={event => update({ headerText: event.target.value })} />
      </label>
      <label>
        {t('ข้อความท้ายกระดาษ')}
        <input maxLength={500} disabled={locked} value={value.footerText} onChange={event => update({ footerText: event.target.value })} />
      </label>
      <label>
        {t('รูปแบบเลขหน้า')}
        <select
          aria-label={t('รูปแบบเลขหน้า')}
          disabled={locked}
          value={value.pageNumber}
          onChange={event => update({ pageNumber: event.target.value as DocumentPresentation['pageNumber'] })}
        >
          <option value="none">{t('ไม่ใส่เลขหน้า')}</option>
          <option value="thai">{t('หน้า ๑')}</option>
          <option value="arabic-total">1 / 10</option>
        </select>
      </label>
      <label>
        {t('ตำแหน่งเลขหน้า')}
        <select
          aria-label={t('ตำแหน่งเลขหน้า')}
          disabled={locked || value.pageNumber === 'none'}
          value={value.pageNumberPosition}
          onChange={event => update({ pageNumberPosition: event.target.value as DocumentPresentation['pageNumberPosition'] })}
        >
          <option value="footer-center">{t('ท้ายกระดาษ ตรงกลาง')}</option>
          <option value="footer-right">{t('ท้ายกระดาษ ด้านขวา')}</option>
          <option value="header-right">{t('หัวกระดาษ ด้านขวา')}</option>
        </select>
      </label>
      {(value.toc || value.pageNumber !== 'none') && (
        <p className="muted">{t('หากสารบัญหรือเลขหน้ายังไม่ปรับ ให้เปิดใน Word แล้วเลือก Update Field (อัปเดตเขตข้อมูล)')}</p>
      )}
      <label>
        <input type="checkbox" checked={value.embedFonts} onChange={event => update({ embedFonts: event.target.checked })} />
        {t('ฝังฟอนต์เพื่อเปิดและแก้ไขบนเครื่องอื่น')}
      </label>
    </fieldset>
  );
}
