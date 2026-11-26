import { useEffect, useState } from 'react';
import { locale, t } from './i18n';
import type { ContextWindowReading, RunEvent, Session } from './types';

type ContextEvent = Pick<RunEvent, 'contextWindow'> & { type: string; sessionId?: string };

export function ContextWindowGauge({
  session,
  connectionId,
  model,
  onEvent,
}: {
  session?: Pick<Session, 'id' | 'runs'>;
  connectionId?: string;
  model: string;
  onEvent?: (callback: (event: ContextEvent) => void) => () => void;
}) {
  const sessionId = session?.id;
  const [live, setLive] = useState<{ sessionId: string; reading: ContextWindowReading }>();
  useEffect(() => {
    if (!sessionId) return;
    return onEvent?.(event => {
      if (event.type === 'context-window' && event.sessionId === sessionId && event.contextWindow)
        setLive({ sessionId, reading: event.contextWindow });
    });
  }, [sessionId, onEvent]);

  const saved = session?.runs?.findLast(run => run.contextWindow)?.contextWindow;
  const reading = live && live.sessionId === sessionId && live.reading.measuredAt >= (saved?.measuredAt ?? 0) ? live.reading : saved;
  if (!reading || reading.connectionId !== connectionId || reading.model !== model || reading.budgetTokens < 1) return null;

  const { inputTokens, budgetTokens } = reading;
  const ratio = inputTokens / budgetTokens;
  // Keep 100% for an estimate that has actually reached the Desktop budget.
  const percent = ratio > 1 ? '100%+' : new Intl.NumberFormat(locale(), { style: 'percent' }).format(ratio < 1 ? Math.min(ratio, 0.99) : 1);
  const detail = t('ประมาณ {0} จากงบบริบท STeP {1} โทเคน', inputTokens.toLocaleString(locale()), budgetTokens.toLocaleString(locale()));
  return (
    <div className="context-window-gauge">
      <span
        className="context-window-meter"
        role="meter"
        aria-label={t('หน้าต่างบริบท')}
        aria-valuemin={0}
        aria-valuemax={budgetTokens}
        aria-valuenow={Math.min(inputTokens, budgetTokens)}
        aria-valuetext={detail}
        data-level={ratio >= 1 ? 'full' : ratio >= 0.8 ? 'near' : 'normal'}
        title={detail + ' · ' + t('คิดจากข้อความล่าสุดทั้งชุด ขีดจำกัดของโมเดลอาจต่างกัน')}
      >
        <span aria-hidden="true">{t('งบบริบท STeP')}</span>
        <span className="context-window-track" aria-hidden="true">
          <span style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </span>
        <span className="context-window-percent" aria-hidden="true">
          {percent}
        </span>
      </span>
    </div>
  );
}
