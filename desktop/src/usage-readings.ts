import { locale, t } from './i18n';
import { shownDate } from './messages';
import type { ProviderUsageReport, UsageReport } from './types';
import { formatUsd } from './usage-display';

export type QuotaRamp = 'warm' | 'cool';
export type QuotaTone = 'normal' | 'warn' | 'danger';

/**
 * Unified Remaining-Quota reading (adapted from Token Bar `src/readings.ts`).
 * Every meter fills to what is LEFT in the tank (`100 - usedPercent`), never what is spent.
 */
export type QuotaReading = {
  key: string;
  kind: 'limit' | 'credit' | 'budget';
  shortLabel: string;
  longLabel: string;
  /** Remaining tank percentage (0..100). Undefined when no percentage/denominator is reported. */
  remainingPercent?: number;
  /** Provider-reported used percentage (0..100), preserved alongside remainingPercent. */
  usedPercent?: number;
  unlimited?: boolean;
  /** Headline display text on the card (e.g. "คงเหลือ 65%" or "คงเหลือ 60.00 USD"). */
  valueText: string;
  /** Compact value for the inline status/composer chip (e.g. "65%" or "$60.00"). */
  compactValue: string;
  /** Short caption for compact surfaces (e.g. "รีเซ็ต 3 ชม."). */
  shortCaption?: string;
  /** Detailed caption below the card meter (used %, request counts, countdown, and wall-clock reset). */
  longCaption?: string;
  resetsAt?: string;
  countdown?: string;
  ramp: QuotaRamp;
  tone: QuotaTone;
};

const clampPercent = (n: number) => Math.max(0, Math.min(100, Math.round(n * 100) / 100));
const displayNumber = (n: number) => n.toLocaleString(locale(), { maximumFractionDigits: 4 });

export function remainingPercentFromUsed(usedPercent?: number): number | undefined {
  if (usedPercent === undefined || !Number.isFinite(usedPercent)) return undefined;
  return clampPercent(100 - usedPercent);
}

export function quotaTone(remainingPercent?: number): QuotaTone {
  if (remainingPercent === undefined || !Number.isFinite(remainingPercent)) return 'normal';
  if (remainingPercent <= 10) return 'danger';
  if (remainingPercent <= 20) return 'warn';
  return 'normal';
}

export function windowRamp(row: ProviderUsageReport['limits'][number]): QuotaRamp {
  if ((row.windowMinutes || 0) >= 6 * 24 * 60) return 'cool';
  if (row.name.includes('seven_day') || row.name.includes('week') || row.name === 'secondary') return 'cool';
  return 'warm';
}

export function shortWindowLabel(row: ProviderUsageReport['limits'][number]): string {
  const m = row.windowMinutes;
  if (m === 300) return '5H';
  if (m === 10080) return '1W';
  if (m === 1440) return '1D';
  if (m && m >= 28 * 1440) return '1M';
  if (m && m >= 60 && m % 60 === 0) return `${m / 60}H`;
  if (m) return `${m}m`;
  if (row.name === 'premium_interactions') return 'PRM';
  if (row.name === 'chat') return 'CHAT';
  if (row.name === 'completions') return 'CMP';
  if (row.name.includes('seven_day') || row.name.includes('week')) return '1W';
  if (row.name === 'five_hour' || row.name === 'primary') return '5H';
  return 'Q';
}

export function limitLabel(row: ProviderUsageReport['limits'][number]): string {
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

export function formatResetCountdown(resetsAt?: string, now = Date.now()): string {
  if (!resetsAt) return '';
  const target = Date.parse(resetsAt);
  if (!Number.isFinite(target)) return '';
  const diffMs = target - now;
  if (diffMs <= 0) return '';
  const totalMinutes = Math.max(1, Math.round(diffMs / 60_000));
  if (totalMinutes < 60) {
    return t('อีก {0} นาที', totalMinutes.toLocaleString(locale()));
  }
  if (totalMinutes < 48 * 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0
      ? t('อีก {0} ชม. {1} นาที', hours.toLocaleString(locale()), mins.toLocaleString(locale()))
      : t('อีก {0} ชม.', hours.toLocaleString(locale()));
  }
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  return hours > 0
    ? t('อีก {0} วัน {1} ชม.', days.toLocaleString(locale()), hours.toLocaleString(locale()))
    : t('อีก {0} วัน', days.toLocaleString(locale()));
}

export function limitReading(row: ProviderUsageReport['limits'][number], index = 0, now = Date.now()): QuotaReading {
  const computedUsed =
    row.usedPercent !== undefined
      ? row.usedPercent
      : row.unlimited !== true && row.used !== undefined && row.total !== undefined && row.total > 0
        ? clampPercent((row.used / row.total) * 100)
        : undefined;
  const remainingPercent = row.unlimited === true ? undefined : remainingPercentFromUsed(computedUsed);
  const countdown = formatResetCountdown(row.resetsAt, now);
  const shortLabel = shortWindowLabel(row);
  const longLabel = limitLabel(row);
  const valueText =
    row.unlimited === true
      ? t('ผู้ให้บริการรายงานว่าไม่จำกัด')
      : remainingPercent === undefined
        ? t('ยังไม่รายงานเปอร์เซ็นต์')
        : t('คงเหลือ {0}%', displayNumber(remainingPercent));
  const compactValue = row.unlimited === true ? '∞' : remainingPercent !== undefined ? `${Math.round(remainingPercent)}%` : '—';
  const parts: string[] = [];
  if (computedUsed !== undefined) parts.push(t('ใช้แล้ว {0}%', displayNumber(computedUsed)));
  if (row.used !== undefined) {
    parts.push(t('ใช้แล้ว {0} ครั้ง', displayNumber(row.used)) + (row.total !== undefined ? ` / ${displayNumber(row.total)}` : ''));
  }
  if (row.resetsAt) {
    parts.push(
      countdown
        ? `${t('รีเซ็ตในอีก {0}', countdown)} (${t('รีเซ็ต: {0}', shownDate(row.resetsAt, true))})`
        : t('รีเซ็ต: {0}', shownDate(row.resetsAt, true)),
    );
  }
  return {
    key: `limit-${row.name}-${row.scope || index}`,
    kind: 'limit',
    shortLabel,
    longLabel,
    remainingPercent,
    usedPercent: computedUsed,
    unlimited: row.unlimited,
    valueText,
    compactValue,
    shortCaption: countdown ? t('รีเซ็ต {0}', countdown) : undefined,
    longCaption: parts.join(' · ') || undefined,
    resetsAt: row.resetsAt,
    countdown: countdown || undefined,
    ramp: windowRamp(row),
    tone: row.unlimited === true ? 'normal' : quotaTone(remainingPercent),
  };
}

export function creditReading(
  credit: ProviderUsageReport['credits'][number],
  account: Pick<ProviderUsageReport, 'spend'>,
  index = 0,
): QuotaReading {
  const labelBase =
    credit.name === 'key_limit' ? t('วงเงิน API key') : credit.name === 'extra_usage' ? t('Extra usage ของรอบบิล') : t('เครดิตบัญชี');
  const longLabel = credit.scope ? `${labelBase} · ${credit.scope}` : labelBase;
  const shortLabel = credit.unit === 'USD' ? '$' : credit.unit === 'CNY' ? '¥' : 'CR';
  const unitLabel = credit.unit === 'minor-units' ? t('หน่วยย่อย (ไม่ระบุสกุลเงิน)') : credit.unit;
  const formatAmount = (val: number) => (credit.unit === 'USD' ? formatUsd(val) : displayNumber(val));
  const spendFallback =
    credit.unit === 'USD'
      ? (account.spend.find(s => s.period === 'all' && s.scope === 'key')?.amount ??
        account.spend.find(s => s.period === 'month' && s.scope === 'key')?.amount)
      : undefined;
  let remainingPercent: number | undefined;
  if (credit.unlimited !== true && credit.remaining !== undefined) {
    if (credit.total !== undefined && credit.total > 0) {
      remainingPercent = clampPercent((credit.remaining / credit.total) * 100);
    } else if (credit.used !== undefined && credit.remaining + credit.used > 0) {
      remainingPercent = clampPercent((credit.remaining / (credit.remaining + credit.used)) * 100);
    } else if (spendFallback !== undefined && credit.remaining + spendFallback > 0) {
      remainingPercent = clampPercent((credit.remaining / (credit.remaining + spendFallback)) * 100);
    }
  }
  const usedPercent = remainingPercent !== undefined ? clampPercent(100 - remainingPercent) : undefined;
  const valueText =
    credit.name === 'key_limit' && credit.unlimited === true
      ? t('ไม่ได้ตั้งวงเงิน API key')
      : credit.unlimited === true
        ? t('ผู้ให้บริการรายงานว่าไม่จำกัด')
        : credit.remaining === undefined
          ? t('ยังไม่รายงานยอดคงเหลือ')
          : t('คงเหลือ {0} {1}', formatAmount(credit.remaining), unitLabel);
  const compactValue =
    credit.unlimited === true
      ? '∞'
      : credit.remaining === undefined
        ? '—'
        : credit.unit === 'USD'
          ? `$${formatUsd(credit.remaining)}`
          : credit.unit === 'CNY'
            ? `¥${displayNumber(credit.remaining)}`
            : `${displayNumber(credit.remaining)} cr`;
  const parts: string[] = [];
  if (remainingPercent !== undefined) parts.push(t('คงเหลือ {0}%', displayNumber(remainingPercent)));
  if (credit.used !== undefined) {
    parts.push(
      t('ใช้แล้ว {0} {1}', formatAmount(credit.used), unitLabel) + (credit.total !== undefined ? ` / ${formatAmount(credit.total)}` : ''),
    );
  }
  return {
    key: `credit-${credit.name}-${credit.unit}-${credit.scope || index}`,
    kind: 'credit',
    shortLabel,
    longLabel,
    remainingPercent,
    usedPercent,
    unlimited: credit.unlimited,
    valueText,
    compactValue,
    shortCaption: remainingPercent !== undefined ? `${Math.round(remainingPercent)}%` : undefined,
    longCaption: parts.join(' · ') || undefined,
    ramp: 'warm',
    tone: credit.available === false ? 'danger' : quotaTone(remainingPercent),
  };
}

export function usageReadingsFor(account: ProviderUsageReport, now = Date.now()): QuotaReading[] {
  const limits = account.limits.map((row, i) => limitReading(row, i, now));
  const credits = account.credits.map((credit, i) => creditReading(credit, account, i));
  return [...limits, ...credits];
}

/**
 * Picks up to 2 concise readings for the inline chip in the composer / AI picker,
 * matching Token Bar's `ProviderChip` (e.g. `5H 65% · 1W 30%` or `$60.00`).
 */
export function inlineQuotaReadings(account?: ProviderUsageReport, now = Date.now()): QuotaReading[] {
  if (!account || account.status !== 'ok') return [];
  const limits = account.limits.map((row, i) => limitReading(row, i, now)).filter(r => r.remainingPercent !== undefined);
  if (limits.length > 0) return limits.slice(0, 2);
  const credits = account.credits.map((c, i) => creditReading(c, account, i)).filter(r => !r.unlimited && r.compactValue !== '—');
  return credits.slice(0, 2);
}

export function accountTokenSummary(connectionId: string, report?: UsageReport) {
  const entries = (report?.entries || []).filter(e => e.connectionId === connectionId);
  const input = entries.reduce((sum, e) => sum + (e.input ?? Math.max(0, e.total - (e.output || 0))), 0);
  const output = entries.reduce((sum, e) => sum + (e.output || 0), 0);
  const cached = entries.reduce((sum, e) => sum + (e.cachedInput || 0) + (e.cacheWriteInput || 0), 0);
  const total = entries.reduce((sum, e) => sum + e.total, 0);
  const usd = entries.reduce((sum, e) => sum + e.usd, 0);
  return { input, output, cached, total, usd, hasBreakdown: entries.some(e => e.input !== undefined || e.output !== undefined) };
}

export function budgetReading(kind: 'dailyTokens' | 'monthlyCostUsd', report: UsageReport): QuotaReading | undefined {
  if (kind === 'dailyTokens') {
    const budget = report.budgets.dailyTokens;
    if (!budget || budget <= 0) return undefined;
    const usedPercent = clampPercent((report.dailyTokens / budget) * 100);
    const remainingPercent = remainingPercentFromUsed(usedPercent)!;
    const remainingTokens = Math.max(0, budget - report.dailyTokens);
    return {
      key: 'budget-daily-tokens',
      kind: 'budget',
      shortLabel: '1D',
      longLabel: t('งบ Token วันนี้'),
      remainingPercent,
      usedPercent,
      valueText: t('คงเหลือ {0}%', displayNumber(remainingPercent)),
      compactValue: `${Math.round(remainingPercent)}%`,
      longCaption: `${t('คงเหลือ {0} tokens', remainingTokens.toLocaleString(locale()))} · ${t('ใช้แล้ว {0}%', displayNumber(usedPercent))} (${report.dailyTokens.toLocaleString(locale())} / ${budget.toLocaleString(locale())})`,
      ramp: 'warm',
      tone: quotaTone(remainingPercent),
    };
  }
  const budget = report.budgets.monthlyCostUsd;
  if (!budget || budget <= 0) return undefined;
  const usedPercent = clampPercent((report.monthlyUsd / budget) * 100);
  const remainingPercent = remainingPercentFromUsed(usedPercent)!;
  const remainingUsd = Math.max(0, budget - report.monthlyUsd);
  return {
    key: 'budget-monthly-usd',
    kind: 'budget',
    shortLabel: '1M',
    longLabel: t('งบค่าใช้จ่ายเดือนนี้'),
    remainingPercent,
    usedPercent,
    valueText: t('คงเหลือ {0}%', displayNumber(remainingPercent)),
    compactValue: `${Math.round(remainingPercent)}%`,
    longCaption: `${t('คงเหลือ ${0}', formatUsd(remainingUsd))} · ${t('ใช้แล้ว {0}%', displayNumber(usedPercent))} ($${formatUsd(report.monthlyUsd)} / $${formatUsd(budget)})`,
    ramp: 'cool',
    tone: quotaTone(remainingPercent),
  };
}
