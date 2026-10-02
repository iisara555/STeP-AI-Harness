import { useEffect, useState } from 'react';
import type { DesktopAPI } from './types';
import { formatTokens } from './ui';
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
  // Like Claude Desktop, typing shows nothing about routing or review: the send itself asks when it must. Only an
  // organization that set prices sees what this request is expected to cost.
  if (!query.trim() || typeof result?.estimate?.usd !== 'number') return null;
  return (
    <div className="small muted" aria-label={t('ตรวจความพร้อมก่อนส่ง')} aria-live="polite">
      {t(
        'ประมาณ {0} tokens เข้า / {1} ออก · ${2} · เฉพาะคำขอปัจจุบัน',
        formatTokens(result.estimate.inputTokens),
        formatTokens(result.estimate.outputTokens),
        result.estimate.usd.toFixed(4),
      )}
    </div>
  );
}
