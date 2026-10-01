import { useEffect, useState } from 'react';
import type { DesktopAPI } from './types';
import { formatTokens } from './ui';
import { errorText } from './messages';
import { t } from './i18n';
export function Readiness({ api, query, connectionId, model }: { api: DesktopAPI; query: string; connectionId: string; model: string }) {
  const [result, setResult] = useState<any>();
  useEffect(() => {
    let active = true;
    setResult(undefined);
    if (!query.trim()) return;
    const timer = setTimeout(
      () =>
        void api
          .call('dryRun', { query, connectionId, model })
          .then(r => {
            if (active) setResult(r);
          })
          .catch(() => {
            if (active) setResult({ status: 'blocked', blockers: ['CONTEXT_UNAVAILABLE'] });
          }),
      500,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, query, connectionId, model]);
  if (!query.trim() || !result) return null;
  return (
    <div className="small muted" aria-label={t('ตรวจความพร้อมก่อนส่ง')} aria-live="polite">
      {result.estimate && (
        <>
          {t('ประมาณ')} {formatTokens(result.estimate.inputTokens)} {t('tokens เข้า /')} {formatTokens(result.estimate.outputTokens)}{' '}
          {t('ออก ·')}
          {result.estimate.usd === null ? t(' ยังไม่มีราคาในนโยบาย') : ` $${result.estimate.usd.toFixed(4)}`} {t('· เฉพาะคำขอปัจจุบัน')}
        </>
      )}
      {result.status === 'needs-input' && t('ต้องตอบคำถามแยกประเภทงานก่อน')}
      {result.blockers?.length > 0 && (
        <span>
          {' '}
          {t('ต้องตรวจ:')} {result.blockers.map((c: string) => errorText[c] || t('คำขอนี้ต้องตรวจเพิ่มเติม')).join(', ')}
        </span>
      )}
      <span> {t('· ตรวจปลายทางและร่างก่อนใช้ ตัวเลขเป็นการประมาณ')}</span>
    </div>
  );
}
