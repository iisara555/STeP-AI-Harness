import { useEffect, useState } from 'react';
import { ConfirmDialog } from './ui';
import type { DesktopAPI, ProviderUsageReport, UsageReport } from './types';
import { connectionBrand, connectionName, explainError, shownDate, shownMonth } from './messages';
import { locale, t } from './i18n';
import './usage.css';
import { formatUsd, usageSourceName } from './usage-display';
import { accountTokenSummary, budgetReading, creditReading, inlineQuotaReadings, limitReading, type QuotaReading } from './usage-readings';

function statusText(account: ProviderUsageReport) {
  if (account.status === 'idle') return t('ยังไม่ได้อ่านการใช้งานจากผู้ให้บริการ');
  if (account.status === 'unsupported') return t('ยังไม่มีช่องอ่านโควตาหรือเครดิตสำหรับการเชื่อมต่อนี้');
  if (account.status === 'disconnected') return t('เชื่อมต่อและทดสอบบัญชีนี้ก่อนอ่านการใช้งาน');
  if (account.status === 'unavailable') return t('ผู้ให้บริการยังไม่รายงานโควตาหรือเครดิตสำหรับบัญชีนี้');
  if (account.status === 'error') {
    if (account.reason === 'FEATURE_DISABLED') return t('ผู้ดูแลปิดการเชื่อมต่อนี้ในนโยบาย');
    if (account.reason === 'USAGE_AUTH_REQUIRED') return t('ตรวจการลงชื่อเข้าใช้หรือสิทธิ์ API key ที่หน้าการเชื่อมต่อ AI');
    if (account.reason === 'USAGE_TIMEOUT') return t('อ่านการใช้งานไม่ทันเวลา ลองรีเฟรชอีกครั้ง');
    return t('อ่านการใช้งานไม่สำเร็จ ลองรีเฟรชหรือตรวจที่ผู้ให้บริการ');
  }
  return t('ข้อมูลจากผู้ให้บริการ');
}

/** Local clock time at which the ledger's day (counted in UTC) begins, such as 07:00 น. in Thailand. */
const dayStart = (day: string) => {
  const start = new Date(day + 'T00:00:00Z');
  return Number.isFinite(start.getTime()) ? shownDate(start, true).split(' ').slice(1).join(' ') : '';
};
const displayNumber = (n: number) => n.toLocaleString(locale(), { maximumFractionDigits: 4 });

/**
 * Token Bar style tank meter: fills according to REMAINING percentage (`100 - usedPercent`),
 * uses warm/cool gradient ramps, and prints a 0/25/50/75/100% quarter graduation scale below card meters.
 */
export function QuotaTankMeter({ reading, compact = false }: { reading: QuotaReading; compact?: boolean }) {
  const pct = reading.remainingPercent;
  const fill = pct === undefined ? 0 : Math.max(0, Math.min(100, pct));
  const gradientScale = fill > 0 ? `${(100 / fill) * 100}% 100%` : '100% 100%';
  if (compact) {
    return (
      <span className="quota-mini-meter" data-tone={reading.tone}>
        <span className="quota-mini-label">{reading.shortLabel}</span>
        {pct !== undefined && (
          <span className="quota-mini-track" data-ramp={reading.ramp} aria-hidden="true">
            <span className="quota-mini-fill" style={{ width: `${fill}%`, backgroundSize: gradientScale }} />
          </span>
        )}
        <span className="quota-mini-value">{reading.compactValue}</span>
      </span>
    );
  }
  return (
    <div className="usage-meter" data-tone={reading.tone} data-kind={reading.kind}>
      <div className="usage-meter-heading">
        <div className="usage-meter-title">
          <span className="usage-window-badge" data-ramp={reading.ramp}>
            {reading.shortLabel}
          </span>
          <strong>{reading.longLabel}</strong>
        </div>
        <span className="usage-meter-remaining" data-tone={reading.tone}>
          {reading.valueText}
        </span>
      </div>
      {pct !== undefined && (
        <>
          <div
            className="usage-meter-track"
            data-ramp={reading.ramp}
            role="meter"
            aria-label={reading.longLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            aria-valuetext={reading.valueText}
          >
            <span className="usage-meter-fill" style={{ width: `${fill}%`, backgroundSize: gradientScale }} />
          </div>
          <span className="usage-meter-scale" aria-hidden="true" />
          <progress className="sr-only" max={100} value={pct} aria-label={reading.longLabel} />
        </>
      )}
      {reading.longCaption && <p className="muted small usage-meter-caption">{reading.longCaption}</p>}
    </div>
  );
}

/**
 * Compact Token-Bar style pill shown beside the AI selector in the composer bar when an account has live readings.
 */
export function InlineQuotaChip({ account, onClick }: { account?: ProviderUsageReport; onClick: () => void }) {
  const readings = inlineQuotaReadings(account);
  if (!account || !readings.length) return null;
  const summary = readings.map(r => `${r.longLabel}: ${r.valueText}`).join(' · ');
  return (
    <button
      type="button"
      className="pill-select quota-mini-pill"
      data-quota-chip={account.connectionId}
      title={`${connectionName(account)} · ${summary}`}
      aria-label={t('โควตาคงเหลือ {0}: {1}', connectionName(account), summary)}
      onClick={onClick}
    >
      {readings.map(reading => (
        <QuotaTankMeter key={reading.key} reading={reading} compact />
      ))}
    </button>
  );
}

/**
 * Quota summary strip inside the AI picker popover menu so staff can check or refresh quota without leaving the composer.
 */
export function AccountQuotaMenuSummary({
  account,
  busy,
  onRefresh,
  onOpenUsage,
}: {
  account?: ProviderUsageReport;
  busy?: boolean;
  onRefresh?: () => void;
  onOpenUsage: () => void;
}) {
  if (!account) return null;
  const readings = inlineQuotaReadings(account);
  return (
    <div className="ai-picker-quota" data-picker-quota={account.connectionId}>
      <div className="ai-picker-quota-head">
        <span className="small muted">{t('โควตาคงเหลือ')}</span>
        <div className="ai-picker-quota-actions">
          {account.canRefresh && onRefresh && (
            <button type="button" className="quiet small" disabled={busy} onClick={onRefresh}>
              {busy ? t('กำลังอ่านการใช้งาน…') : t('รีเฟรชโควตา')}
            </button>
          )}
          <button type="button" className="quiet small" onClick={onOpenUsage}>
            {t('ดูการใช้งาน AI')}
          </button>
        </div>
      </div>
      {readings.length > 0 ? (
        <div className="ai-picker-quota-meters">
          {readings.map(reading => (
            <QuotaTankMeter key={reading.key} reading={reading} compact />
          ))}
        </div>
      ) : (
        <p className="muted small ai-picker-quota-note">{statusText(account)}</p>
      )}
    </div>
  );
}

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
  const tokenStats = accountTokenSummary(account.connectionId, report);
  const limitReadings = account.limits.map((row, i) => limitReading(row, i));
  const creditReadings = account.credits.map((credit, i) => ({
    credit,
    reading: creditReading(credit, account, i),
  }));
  return (
    <section className="usage-account" data-usage-account={account.connectionId} aria-label={connectionName(account)}>
      <div className="usage-account-head">
        <h4>
          {connectionName(account)}
          {account.plan ? <span className="usage-plan-badge">{account.plan}</span> : null}
        </h4>
        {account.checkedAt && <span className="muted small">{t('อัปเดต: {0}', shownDate(account.checkedAt, true))}</span>}
      </div>
      <p className="small" role={account.status === 'error' ? 'status' : undefined}>
        {statusText(account)}
      </p>
      {/* The source is only worth a line when it is not the account's own name (ChatGPT for the ChatGPT sign-in). */}
      {account.source && usageSourceName(account.source) !== connectionBrand(account) && (
        <p className="muted small">{t('แหล่งข้อมูล: {0}', usageSourceName(account.source))}</p>
      )}
      {account.experimental && <p className="muted small">{t('ช่องอ่านการใช้งานนี้ยังอยู่ระหว่างทดลอง และอาจเปลี่ยนได้')}</p>}
      {account.reason === 'CREDIT_UNAVAILABLE' && <p className="small">{t('อ่านยอดใช้ของ API key ได้ แต่ยังอ่านเครดิตบัญชีไม่ได้')}</p>}
      {limitReadings.map(reading => (
        <QuotaTankMeter key={reading.key} reading={reading} />
      ))}
      {creditReadings.map(({ credit, reading }, i) => (
        <div className="usage-credit" key={reading.key || i}>
          <QuotaTankMeter reading={reading} />
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
              day: t('วันนี้ (ตามรอบวันของผู้ให้บริการ)'),
              week: t('สัปดาห์นี้ (จันทร์–อาทิตย์ ตามรอบของผู้ให้บริการ)'),
              month: t('เดือนนี้ (ตามรอบของผู้ให้บริการ)'),
              all: t('สะสม'),
            };
            return (
              <p className="small" key={i}>
                {periods[spend.period]} · {spend.scope === 'byok' ? t('BYOK ภายนอก') : t('API key นี้')}: ${formatUsd(spend.amount)}
              </p>
            );
          })}
        </div>
      )}
      <div className="usage-token-summary">
        <p className="muted small">
          {t('ในแอปเดือนนี้: {0} tokens · ประมาณ ${1}', displayNumber(tokenStats.total), formatUsd(tokenStats.usd))}
        </p>
        {tokenStats.total > 0 && tokenStats.hasBreakdown && (
          <div className="usage-token-pills" aria-label={t('สัดส่วน Token ของบัญชีนี้')}>
            <span>
              {t('ขาเข้า')}: {displayNumber(tokenStats.input)}
            </span>
            <span>
              {t('ขาออก')}: {displayNumber(tokenStats.output)}
            </span>
            {tokenStats.cached > 0 && <span>Cache: {displayNumber(tokenStats.cached)}</span>}
          </div>
        )}
      </div>
      <div className="usage-account-actions">
        {account.canRefresh && (
          <button className="quiet" disabled={Boolean(busy)} onClick={onRefresh}>
            {busy === account.connectionId ? t('กำลังอ่านการใช้งาน…') : t('รีเฟรชการใช้งาน')}
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

export function UsageDialog({ api, onClose, onUpdated }: { api: DesktopAPI; onClose: () => void; onUpdated?: () => void }) {
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
      onUpdated?.();
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy('');
    }
  };
  const refreshAll = async () => {
    if (busy || !report?.accounts) return;
    const targets = report.accounts.filter(a => a.canRefresh);
    if (!targets.length) return;
    setBusy('all');
    setError('');
    try {
      for (const account of targets) {
        const next: ProviderUsageReport = await api.call('providerUsage', { id: account.connectionId });
        setReport(previous =>
          previous ? { ...previous, accounts: previous.accounts?.map(a => (a.connectionId === next.connectionId ? next : a)) } : previous,
        );
      }
      onUpdated?.();
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy('');
    }
  };
  const dailyBudgetMeter = report ? budgetReading('dailyTokens', report) : undefined;
  const monthlyBudgetMeter = report ? budgetReading('monthlyCostUsd', report) : undefined;
  const canRefreshAny = Boolean(report?.accounts?.some(a => a.canRefresh));
  return (
    <ConfirmDialog info title={t('การใช้งาน AI')} confirmLabel={t('ปิด')} onConfirm={onClose} onCancel={onClose}>
      {error && <p role="alert">{error}</p>}
      {report ? (
        <>
          <div className="usage-section-head">
            <h3>{t('โควตาและเครดิตรายบัญชี')}</h3>
            {canRefreshAny && (
              <button className="quiet" disabled={Boolean(busy)} onClick={() => void refreshAll()}>
                {busy === 'all' ? t('กำลังอ่านการใช้งาน…') : t('รีเฟรชทั้งหมด')}
              </button>
            )}
          </div>
          <p className="muted small">{t('รีเฟรชได้นาทีละครั้งต่อบัญชี')}</p>
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
            {t(
              'วันนี้ {0} (รอบวันเริ่ม {1}): {2} tokens',
              shownDate(report.day),
              dayStart(report.day),
              report.dailyTokens.toLocaleString(locale()),
            )}
            {report.budgets.dailyTokens ? ` / ${report.budgets.dailyTokens.toLocaleString(locale())}` : ''}
          </p>
          {dailyBudgetMeter && <QuotaTankMeter reading={dailyBudgetMeter} />}
          <p>
            {t('เดือน {0}: ค่าใช้จ่ายประมาณ ${1}', shownMonth(report.month), formatUsd(report.monthlyUsd))}
            {report.budgets.monthlyCostUsd ? ` / $${report.budgets.monthlyCostUsd}` : ''}
          </p>
          {monthlyBudgetMeter && <QuotaTankMeter reading={monthlyBudgetMeter} />}
          <p className="muted small">{t('ประมาณการจาก token ที่ผู้ให้บริการรายงาน · ไม่รวมรูปภาพ ค่าสมาชิก และการใช้นอกแอป')}</p>
          {report.unpricedTokens > 0 && (
            <p>
              {report.unpricedTokens.toLocaleString(locale())} {t('token ยังไม่มีราคาที่ตั้งไว้ จึงยังไม่รวมในค่าใช้จ่าย')}
            </p>
          )}
          {!!report.cachePriceMissingTokens && (
            <p className="muted small">
              {report.cachePriceMissingTokens.toLocaleString(locale())}{' '}
              {t('token ที่ใช้ซ้ำจาก cache ยังไม่มีราคาแยก จึงประมาณด้วยราคาข้อความขาเข้าปกติ')}
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
                    <th>{t('โมเดล')}</th>
                    <th>{t('token')}</th>
                    <th>{t('ค่าใช้จ่าย (USD)')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.entries.map((e, i) => {
                    const account = report.accounts?.find(a => a.connectionId === e.connectionId);
                    return (
                      <tr key={i}>
                        <td>{shownDate(e.day)}</td>
                        <td>
                          {account ? connectionName(account) : connectionName({ provider: e.provider })} ·{' '}
                          {e.model === 'provider-default' ? t('โมเดลเริ่มต้น') : e.model}
                        </td>
                        <td>
                          {e.total.toLocaleString(locale())}
                          {e.input !== undefined || e.output !== undefined ? (
                            <span className="muted small usage-table-io">
                              {' '}
                              ({t('ขาเข้า')} {(e.input || 0).toLocaleString(locale())} · {t('ขาออก')}{' '}
                              {(e.output || 0).toLocaleString(locale())})
                            </span>
                          ) : null}
                        </td>
                        <td>
                          {formatUsd(e.usd)}
                          {e.unpricedTokens > 0 ? t(' + รอราคา') : ''}
                        </td>
                      </tr>
                    );
                  })}
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
