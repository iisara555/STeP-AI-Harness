import { useEffect, useState } from 'react';
import { ConfirmDialog } from './ui';
import type { DesktopAPI, UsageReport } from './types';
import { explainError } from './messages';
import { locale, t } from './i18n';
export function UsageDialog({ api, onClose }: { api: DesktopAPI; onClose: () => void }) {
  const [report, setReport] = useState<UsageReport>(),
    [error, setError] = useState('');
  useEffect(() => {
    void api
      .call('usage')
      .then(setReport)
      .catch(e => setError(explainError(e)));
  }, [api]);
  return (
    <ConfirmDialog title={t('การใช้งาน AI')} confirmLabel={t('ปิด')} onConfirm={onClose} onCancel={onClose}>
      {error && <p role="alert">{error}</p>}
      {report ? (
        <>
          <p>
            {t('วันนี้ (UTC)')} {report.day}: {report.dailyTokens.toLocaleString(locale())} tokens
            {report.budgets.dailyTokens ? ` / ${report.budgets.dailyTokens.toLocaleString(locale())}` : ''}
          </p>
          <p>
            {t('เดือน')} {report.month}
            {t(': ค่าใช้จ่ายประมาณ $')}
            {report.monthlyUsd.toFixed(4)}
            {report.budgets.monthlyCostUsd ? ` / $${report.budgets.monthlyCostUsd}` : ''}
          </p>
          <p className="muted small">
            {t(
              'คำนวณจาก tokens ของ Chat, Draft และ Web Search ที่ provider รายงาน และราคาที่ผู้ดูแลตั้งไว้ เป็นยอดประมาณการ ไม่รวมรูปภาพ ค่าบัญชีสมาชิก หรือการใช้งานนอกแอป',
            )}
          </p>
          {report.unpricedTokens > 0 && (
            <p>
              {report.unpricedTokens.toLocaleString(locale())} {t('tokens ยังไม่มีราคาที่ตั้งไว้ จึงยังไม่รวมในค่าใช้จ่าย')}
            </p>
          )}
          {report.warnings.length > 0 && <p role="status">{t('การใช้งานถึงอย่างน้อย 80% ของงบที่ตั้งไว้ โปรดตรวจยอดก่อนทำงานต่อ')}</p>}
          <div className="chat-table">
            <table>
              <thead>
                <tr>
                  <th>{t('วันที่')}</th>
                  <th>Model</th>
                  <th>Tokens</th>
                  <th>USD</th>
                </tr>
              </thead>
              <tbody>
                {report.entries.map((e, i) => (
                  <tr key={i}>
                    <td>{e.day}</td>
                    <td>
                      {e.provider} / {e.model}
                    </td>
                    <td>{e.total.toLocaleString(locale())}</td>
                    <td>
                      {e.usd.toFixed(4)}
                      {e.unpricedTokens > 0 ? t(' + รอราคา') : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>{t('กำลังอ่านการใช้งาน…')}</p>
      )}
    </ConfirmDialog>
  );
}
