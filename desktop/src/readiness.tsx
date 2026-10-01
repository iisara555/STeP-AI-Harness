import { useEffect, useState } from 'react';
import type { DesktopAPI } from './types';
import { formatTokens } from './ui';
import { errorText } from './messages';
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
    <div className="small muted" aria-label="ตรวจความพร้อมก่อนส่ง" aria-live="polite">
      {result.estimate && (
        <>
          ประมาณ {formatTokens(result.estimate.inputTokens)} tokens เข้า / {formatTokens(result.estimate.outputTokens)} ออก ·
          {result.estimate.usd === null ? ' ยังไม่มีราคาในนโยบาย' : ` $${result.estimate.usd.toFixed(4)}`} · เฉพาะคำขอปัจจุบัน
        </>
      )}
      {result.status === 'needs-input' && 'ต้องตอบคำถามแยกประเภทงานก่อน'}
      {result.blockers?.length > 0 && (
        <span> ต้องตรวจ: {result.blockers.map((c: string) => errorText[c] || 'คำขอนี้ต้องตรวจเพิ่มเติม').join(', ')}</span>
      )}
      <span> · ตรวจปลายทางและร่างก่อนใช้ ตัวเลขเป็นการประมาณ</span>
    </div>
  );
}
