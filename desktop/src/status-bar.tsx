import { Timer } from './icons';
import { formatTokens } from './ui';
import { locale, t } from './i18n';
import type { AppView } from './use-workspace';
import { useElapsed } from './live-run';

/** Whether the AI can work, how long the run has taken and how many tokens the task used. */
export function StatusBar({ v }: { v: AppView }) {
  const { connection, runFailed, running, session, startedAt } = v;
  const elapsed = useElapsed(running, startedAt);
  return (
    <>
      <footer className="statusbar" aria-label={t('สถานะ')}>
        <span
          className={`status-dot ${connection?.ready ? (runFailed ? 'failed' : 'ok') : ''}`}
          aria-hidden="true"
          title={connection?.ready && !runFailed ? t('พร้อมทำงาน') : undefined}
        />
        {/* The account and model are on the composer's AI pill; the status bar only says whether it can work, and
                says it in words only when something needs attention. All is well is the quiet dot alone. */}
        <span className={connection?.ready && !runFailed ? 'sr-only' : undefined}>
          {connection
            ? !connection.ready
              ? t('ยังไม่พร้อม')
              : runFailed
                ? t('งานล่าสุดไม่สำเร็จ')
                : t('พร้อมทำงาน')
            : t('ยังไม่เชื่อมต่อ AI')}
        </span>
        {elapsed && (
          <span className="status-item">
            <Timer size={12} />
            {elapsed}
          </span>
        )}
        <span className="spacer" />
        {session?.usage && (
          <span
            className="status-item"
            title={t(
              'ข้อความที่ส่ง {0} tokens · คำตอบ {1} tokens จาก {2} ครั้ง',
              session.usage.input.toLocaleString(locale()),
              session.usage.output.toLocaleString(locale()),
              session.usage.runs,
            )}
          >
            {t('{0} tokens', formatTokens(session.usage.total))}
          </span>
        )}
      </footer>
    </>
  );
}
