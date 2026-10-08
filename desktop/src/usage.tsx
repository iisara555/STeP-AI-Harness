import { useEffect, useState } from 'react';
import { ConfirmDialog } from './ui';
import type { DesktopAPI, ProviderUsageReport, UsageReport } from './types';
import { explainError } from './messages';
import { locale, t } from './i18n';
import './usage.css';

function statusText(account: ProviderUsageReport) {
  if (account.status === 'idle') return t('ยังไม่ได้อ่าน Usage จากผู้ให้บริการ');
  if (account.status === 'unsupported') return t('ยังไม่มีช่องอ่านโควตาหรือเครดิตสำหรับการเชื่อมต่อนี้');
  if (account.status === 'disconnected') return t('เชื่อมต่อและทดสอบบัญชีนี้ก่อนอ่าน Usage');
  if (account.status === 'unavailable') return t('ผู้ให้บริการยังไม่รายงานโควตาหรือเครดิตสำหรับบัญชีนี้');
  if (account.status === 'error') {
    if (account.reason === 'FEATURE_DISABLED') return t('Policy ปิดการเชื่อมต่อนี้');
    if (account.reason === 'USAGE_AUTH_REQUIRED') return t('ตรวจการลงชื่อเข้าใช้หรือสิทธิ์ API key ที่หน้าการเชื่อมต่อ AI');
    if (account.reason === 'USAGE_TIMEOUT') return t('อ่าน Usage ไม่ทันเวลา ลองรีเฟรชอีกครั้ง');
    return t('อ่าน Usage ไม่สำเร็จ ลองรีเฟรชหรือตรวจที่ผู้ให้บริการ');
  }
  return t('ข้อมูลจากผู้ให้บริการ');
}
function limitName(row: ProviderUsageReport['limits'][number]) {
  const minutes = row.windowMinutes;
  const period =
    minutes === 300
      ? t('5h (5 ชั่วโมง)')
      : minutes === 10080
        ? t('1W (7 วัน)')
        : minutes
          ? t('{0} นาที', minutes.toLocaleString(locale()))
          : '';
  const names: Record<string, string> = {
    primary: t('โควตาหลัก'),
    secondary: t('โควตารอง'),
    five_hour: '',
    seven_day: '',
    seven_day_opus: 'Opus',
    seven_day_sonnet: 'Sonnet',
    seven_day_oauth_apps: t('แอป OAuth'),
    model_week: '',
    premium_interactions: t('Premium requests'),
    chat: 'Chat',
    completions: t('Completions'),
  };
  return [period, row.scope || names[row.name]].filter(Boolean).join(' · ') || t('โควตา');
}
const displayNumber = (n: number) => n.toLocaleString(locale(), { maximumFractionDigits: 4 });

function UsageAccount({
  account,
  report,
  busy,
  onRefresh,
  onDashboard,
}: {
  account: ProviderUsageReport;
  report: UsageReport;
  busy: string;
  onRefresh: () => void;
  onDashboard: () => void;
}) {
  const entries = report.entries.filter(e => e.connectionId === account.connectionId),
    tokens = entries.reduce((n, e) => n + e.total, 0),
    usd = entries.reduce((n, e) => n + e.usd, 0);
  return (
    <section className="usage-account" data-usage-account={account.connectionId} aria-label={account.label}>
      <h4>
        {account.label}{' '}
        <span className="muted small">
          {account.mode === 'api' ? 'API' : account.mode === 'oauth' ? 'Console OAuth' : t('สมาชิก')}
          {account.plan ? ` · ${account.plan}` : ''}
        </span>
      </h4>
      <p className="small" role={account.status === 'error' ? 'status' : undefined}>
        {statusText(account)}
      </p>
      {account.source && <p className="muted small">{t('แหล่งข้อมูล: {0}', account.source)}</p>}
      {account.checkedAt && <p className="muted small">{t('อัปเดต: {0}', new Date(account.checkedAt).toLocaleString(locale()))}</p>}
      {account.experimental && <p className="muted small">{t('ช่องอ่าน Usage นี้ยังเป็น experimental และอาจเปลี่ยนได้')}</p>}
      {account.reason === 'CREDIT_UNAVAILABLE' && <p className="small">{t('อ่านยอดใช้ของ API key ได้ แต่ยังอ่านเครดิตบัญชีไม่ได้')}</p>}
      {account.limits.map((row, i) => (
        <div className="usage-meter" key={i}>
          <div className="usage-meter-heading">
            <strong>{limitName(row)}</strong>
            <span>
              {row.unlimited === true
                ? t('ผู้ให้บริการรายงานว่าไม่จำกัด')
                : row.usedPercent === undefined
                  ? t('ยังไม่รายงานเปอร์เซ็นต์')
                  : t('ใช้แล้ว {0}%', displayNumber(row.usedPercent))}
            </span>
          </div>
          {row.usedPercent !== undefined && <progress max={100} value={row.usedPercent} aria-label={limitName(row)} />}
          {row.used !== undefined && (
            <p className="muted small">
              {t('ใช้แล้ว {0} requests', displayNumber(row.used))}
              {row.total !== undefined ? ` / ${displayNumber(row.total)}` : ''}
            </p>
          )}
          {row.resetsAt && <p className="muted small">{t('รีเซ็ต: {0}', new Date(row.resetsAt).toLocaleString(locale()))}</p>}
        </div>
      ))}
      {account.credits.map((credit, i) => (
        <div className="usage-credit" key={i}>
          <strong>
            {credit.name === 'key_limit'
              ? t('วงเงิน API key')
              : credit.name === 'extra_usage'
                ? t('Extra usage ของรอบบิล')
                : t('เครดิตบัญชี')}
            {credit.scope ? ` · ${credit.scope}` : ''}
          </strong>
          <p>
            {credit.name === 'key_limit' && credit.unlimited === true
              ? t('ไม่ได้ตั้งวงเงิน API key')
              : credit.unlimited === true
                ? t('ผู้ให้บริการรายงานว่าไม่จำกัด')
                : credit.remaining === undefined
                  ? t('ยังไม่รายงานยอดคงเหลือ')
                  : t(
                      'คงเหลือ {0} {1}',
                      displayNumber(credit.remaining),
                      credit.unit === 'minor-units' ? t('หน่วยย่อย (ไม่ระบุสกุลเงิน)') : credit.unit,
                    )}
          </p>
          {credit.used !== undefined && (
            <p className="muted small">
              {t(
                'ใช้แล้ว {0} {1}',
                displayNumber(credit.used),
                credit.unit === 'minor-units' ? t('หน่วยย่อย (ไม่ระบุสกุลเงิน)') : credit.unit,
              )}
              {credit.total !== undefined ? ` / ${displayNumber(credit.total)}` : ''}
            </p>
          )}
          {credit.available === false && <p className="small">{t('ผู้ให้บริการรายงานว่าเครดิตนี้ยังใช้ไม่ได้')}</p>}
          {credit.hasCredits === false && <p className="muted small">{t('ผู้ให้บริการรายงานว่าไม่มีเครดิตเพิ่มเติม')}</p>}
          {credit.name === 'key_limit' && <p className="muted small">{t('วงเงิน key แยกจากเครดิตบัญชี')}</p>}
        </div>
      ))}
      {account.spend.length > 0 && (
        <div className="usage-api-spend">
          <strong>{t('ยอด API ที่ผู้ให้บริการรายงาน (USD)')}</strong>
          {account.spend.map((spend, i) => {
            const periods = {
              day: t('วันนี้ (UTC)'),
              week: t('สัปดาห์นี้ (จันทร์–อาทิตย์ UTC)'),
              month: t('เดือนนี้ (UTC)'),
              all: t('สะสม'),
            };
            return (
              <p className="small" key={i}>
                {periods[spend.period]} · {spend.scope === 'byok' ? t('BYOK ภายนอก') : t('API key นี้')}: ${displayNumber(spend.amount)}
              </p>
            );
          })}
        </div>
      )}
      <p className="muted small">{t('ในแอปเดือนนี้: {0} tokens · ประมาณ ${1}', displayNumber(tokens), usd.toFixed(4))}</p>
      <div className="usage-account-actions">
        {account.canRefresh && (
          <button className="quiet" disabled={Boolean(busy)} onClick={onRefresh}>
            {busy === account.connectionId ? t('กำลังอ่าน Usage…') : t('รีเฟรช Usage')}
          </button>
        )}
        {account.hasDashboard && (
          <button className="quiet" onClick={onDashboard}>
            {t('ดูที่ผู้ให้บริการ')}
          </button>
        )}
      </div>
    </section>
  );
}
export function UsageDialog({ api, onClose }: { api: DesktopAPI; onClose: () => void }) {
  const [report, setReport] = useState<UsageReport>(),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    void api
      .call('usage')
      .then(setReport)
      .catch(e => setError(explainError(e)));
  }, [api]);
  const refresh = async (account: ProviderUsageReport) => {
    if (busy) return;
    setBusy(account.connectionId);
    setError('');
    try {
      const next: ProviderUsageReport = await api.call('providerUsage', { id: account.connectionId });
      setReport(previous =>
        previous ? { ...previous, accounts: previous.accounts?.map(a => (a.connectionId === next.connectionId ? next : a)) } : previous,
      );
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy('');
    }
  };
  return (
    <ConfirmDialog info title={t('การใช้งาน AI')} confirmLabel={t('ปิด')} onConfirm={onClose} onCancel={onClose}>
      {error && <p role="alert">{error}</p>}
      {report ? (
        <>
          <h3>{t('โควตาและเครดิตรายบัญชี')}</h3>
          <p className="muted small">
            {t('ข้อมูลเป็น snapshot ณ เวลาที่ระบุ รีเฟรชได้ไม่เกินหนึ่งครั้งต่อนาทีต่อบัญชี ข้อมูลที่ไม่รายงานยังถือว่าไม่ทราบ')}
          </p>
          {(report.accounts || []).length ? (
            report.accounts!.map(account => (
              <UsageAccount
                key={account.connectionId}
                account={account}
                report={report}
                busy={busy}
                onRefresh={() => void refresh(account)}
                onDashboard={() => void api.call('providerUsagePage', { id: account.connectionId }).catch(e => setError(explainError(e)))}
              />
            ))
          ) : (
            <p className="muted small">{t('ยังไม่มีบัญชี AI ที่ตั้งค่าไว้')}</p>
          )}
          <h3>{t('การใช้ใน STeP Desktop')}</h3>
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
          {report.entries.some(e => !e.connectionId) && (
            <p className="muted small">{t('ยอดเก่าที่ไม่มีรหัสบัญชีรวมอยู่ในยอดแอป แต่ไม่จัดให้บัญชีใด')}</p>
          )}
          {report.entries.length === 0 ? (
            <p className="muted small">{t('ยังไม่มีการใช้งานที่บันทึกในแอป')}</p>
          ) : (
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
                        {report.accounts?.find(a => a.connectionId === e.connectionId)?.label || e.provider} / {e.model}
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
          )}
        </>
      ) : (
        <p>{t('กำลังอ่านการใช้งาน…')}</p>
      )}
    </ConfirmDialog>
  );
}
