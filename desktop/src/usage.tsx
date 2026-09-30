import { useEffect, useState } from 'react';
import { ConfirmDialog } from './ui';
import type { DesktopAPI, UsageReport } from './types';
import { explainError } from './messages';
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
    <ConfirmDialog title="การใช้งาน AI" confirmLabel="ปิด" onConfirm={onClose} onCancel={onClose}>
      {error && <p role="alert">{error}</p>}
      {report ? (
        <>
          <p>
            วันนี้ (UTC) {report.day}: {report.dailyTokens.toLocaleString('th-TH')} tokens
            {report.budgets.dailyTokens ? ` / ${report.budgets.dailyTokens.toLocaleString('th-TH')}` : ''}
          </p>
          <p>
            เดือน {report.month}: ค่าใช้จ่ายประมาณ ${report.monthlyUsd.toFixed(4)}
            {report.budgets.monthlyCostUsd ? ` / $${report.budgets.monthlyCostUsd}` : ''}
          </p>
          <p className="muted small">
            คำนวณจาก tokens ของ Chat, Draft และ Web Search ที่ provider รายงาน และราคาที่ผู้ดูแลตั้งไว้ เป็นยอดประมาณการ ไม่รวมรูปภาพ
            ค่าบัญชีสมาชิก หรือการใช้งานนอกแอป
          </p>
          {report.unpricedTokens > 0 && (
            <p>{report.unpricedTokens.toLocaleString('th-TH')} tokens ยังไม่มีราคาที่ตั้งไว้ จึงยังไม่รวมในค่าใช้จ่าย</p>
          )}
          {report.warnings.length > 0 && <p role="status">การใช้งานถึงอย่างน้อย 80% ของงบที่ตั้งไว้ โปรดตรวจยอดก่อนทำงานต่อ</p>}
          <div className="chat-table">
            <table>
              <thead>
                <tr>
                  <th>วันที่</th>
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
                    <td>{e.total.toLocaleString('th-TH')}</td>
                    <td>
                      {e.usd.toFixed(4)}
                      {e.unpricedTokens > 0 ? ' + รอราคา' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>กำลังอ่านการใช้งาน…</p>
      )}
    </ConfirmDialog>
  );
}
