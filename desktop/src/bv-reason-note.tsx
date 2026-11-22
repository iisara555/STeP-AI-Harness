import { AlertTriangle, Check } from './icons';
import { t } from './i18n';
import { BV_FORMULA, bvReasonProblem } from './bv-travel-reason';

/** Under the purpose of a BV case: what the reason still lacks, or that it has all five parts. */
export function BvReasonHint({ text, id }: { text: string; id: string }) {
  const written = Boolean(text.trim());
  const problem = written ? bvReasonProblem(text, t) : null;
  return (
    <p id={id} className={problem ? 'bv-reason-hint bv-reason-warn' : 'bv-reason-hint'} aria-live="polite">
      {problem ? <AlertTriangle size={13} aria-hidden="true" /> : written ? <Check size={13} aria-hidden="true" /> : null}
      <span>{problem || (written ? t('ครบ 5 ส่วน') : t('เขียนให้ครบ: {0}', t(BV_FORMULA)))}</span>
    </p>
  );
}

/** Before exporting a BV case: a reason AFP would send back. It warns only; the person can still export. */
export function BvReasonExportWarning({ text, onFix }: { text: string; onFix: () => void }) {
  const problem = bvReasonProblem(text, t);
  if (!problem) return null;
  return (
    <div className="bv-reason-export" role="status">
      <AlertTriangle size={15} aria-hidden="true" />
      <div>
        <strong>{t('เหตุผลการเดินทางหมวด BV ยังไม่ครบ')}</strong>
        <p className="small">
          {problem} · {t('AFP อาจส่งกลับให้แก้')}
        </p>
      </div>
      <button type="button" className="text-link" onClick={onFix}>
        {t('แก้ในข้อมูลเรื่อง')}
      </button>
    </div>
  );
}
