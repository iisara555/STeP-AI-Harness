import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, CircleAlert, CircleCheck, Download, RefreshCw } from './icons';
import { explainError } from './messages';
import { language, t } from './i18n';
import type { DiagnosticEntry, DiagnosticLevel, DiagnosticsSnapshot } from './types';

type Filter = 'all' | DiagnosticLevel;

const levelLabels: Record<DiagnosticLevel, string> = {
  error: 'ข้อผิดพลาด',
  warning: 'คำเตือน',
  info: 'ข้อมูล',
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(language() === 'en' ? 'en-GB' : 'th-TH', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function LevelIcon({ level }: { level: DiagnosticLevel }) {
  if (level === 'error') return <CircleAlert size={16} aria-hidden="true" />;
  if (level === 'warning') return <AlertTriangle size={16} aria-hidden="true" />;
  return <CircleCheck size={16} aria-hidden="true" />;
}

function DiagnosticRow({ entry }: { entry: DiagnosticEntry }) {
  return (
    <article className={`diagnostic-entry ${entry.level}`}>
      <div className="diagnostic-entry-head">
        <span className={`diagnostic-level ${entry.level}`}>
          <LevelIcon level={entry.level} />
          {t(levelLabels[entry.level])}
        </span>
        <code>{entry.event}</code>
        <time dateTime={entry.at}>{formatDate(entry.at)}</time>
      </div>
      {(entry.code || entry.provider || entry.model || entry.outcome || entry.ms !== undefined) && (
        <div className="diagnostic-meta">
          {entry.code && <code>{entry.code}</code>}
          {entry.provider && (
            <span>
              {t('บริการ')}: {entry.provider}
            </span>
          )}
          {entry.model && (
            <span>
              {t('โมเดล')}: {entry.model}
            </span>
          )}
          {entry.outcome && (
            <span>
              {t('ผลลัพธ์')}: {entry.outcome}
            </span>
          )}
          {entry.ms !== undefined && <span>{entry.ms} ms</span>}
        </div>
      )}
      {entry.detail && <p className="diagnostic-detail">{entry.detail}</p>}
    </article>
  );
}

export function DeveloperDiagnostics({
  call,
  onError,
}: {
  call: (method: string, input?: unknown) => Promise<any>;
  onError: (error: unknown) => void;
}) {
  const [report, setReport] = useState<DiagnosticsSnapshot>();
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [exportedPath, setExportedPath] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    setExportedPath('');
    try {
      setReport(await call('diagnostics', { limit: 250 }));
    } catch (reason) {
      setError(reason);
      onError(reason);
    } finally {
      setBusy(false);
    }
  }, [call, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportReport = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await call('diagnosticsExport');
      if (!result.cancelled) setExportedPath(result.path || '');
    } catch (reason) {
      setError(reason);
      onError(reason);
    } finally {
      setBusy(false);
    }
  };

  const entries = report?.entries.filter(entry => filter === 'all' || entry.level === filter) || [];
  const connectionCount = report?.connections.length || 0;
  const readyCount = report?.connections.filter(connection => connection.ready).length || 0;

  return (
    <section className="developer-diagnostics">
      <div className="diagnostic-intro">
        <div>
          <h2>{t('ภาพรวมระบบสำหรับนักพัฒนา')}</h2>
          <p className="muted">{t('ดูสถานะการเชื่อมต่อ นโยบาย ระบบ และ Error ล่าสุดได้จากที่เดียว')}</p>
          <p className="small muted">{t('ข้อมูลหน้านี้ผ่านการปิดบังแล้ว ไม่เก็บ prompt ร่าง เนื้อหาไฟล์ หรือ API key')}</p>
        </div>
        <div className="diagnostic-actions">
          <button className="quiet" disabled={busy} onClick={() => void load()}>
            <RefreshCw size={16} className={busy ? 'spin' : undefined} />
            {t('รีเฟรชข้อมูล')}
          </button>
          <button disabled={busy || !report} onClick={() => void exportReport()}>
            <Download size={16} />
            {t('ส่งออก JSON')}
          </button>
        </div>
      </div>

      {error !== undefined && (
        <div className="diagnostic-problem" role="alert">
          <CircleAlert size={17} />
          <span>{explainError(error)}</span>
        </div>
      )}
      {exportedPath && (
        <p className="diagnostic-ok" role="status">
          <Check size={16} /> {t('ส่งออกไฟล์แล้ว: {0}', exportedPath)}
        </p>
      )}

      {report ? (
        <>
          <div className="diagnostic-summary" aria-label={t('สรุปเหตุการณ์ใน log')}>
            <div className="diagnostic-stat error">
              <span>{t('ข้อผิดพลาด')}</span>
              <strong>{report.counts.error}</strong>
              <small>{t('ต้องตรวจสอบ')}</small>
            </div>
            <div className="diagnostic-stat warning">
              <span>{t('คำเตือน')}</span>
              <strong>{report.counts.warning}</strong>
              <small>{t('ควรติดตาม')}</small>
            </div>
            <div className="diagnostic-stat info">
              <span>{t('ข้อมูล')}</span>
              <strong>{report.counts.info}</strong>
              <small>{t('เหตุการณ์ล่าสุด')}</small>
            </div>
            <div className="diagnostic-stat connection">
              <span>{t('การเชื่อมต่อพร้อมใช้')}</span>
              <strong>
                {readyCount}/{connectionCount}
              </strong>
              <small>
                {formatBytes(report.sizeBytes)} · {t('log')}
              </small>
            </div>
          </div>

          <section className="diagnostic-panel">
            <h2>{t('รายละเอียดระบบ')}</h2>
            <dl className="diagnostic-grid">
              <div>
                <dt>{t('รุ่นแอป')}</dt>
                <dd>{report.system.appVersion}</dd>
              </div>
              <div>
                <dt>{t('ระบบปฏิบัติการ')}</dt>
                <dd>
                  {report.system.platform} · {report.system.arch}
                </dd>
              </div>
              <div>
                <dt>{t('Runtime')}</dt>
                <dd>
                  Electron {report.system.electron} · Node {report.system.node}
                </dd>
              </div>
              <div>
                <dt>{t('รูปแบบการรัน')}</dt>
                <dd>{report.system.packaged ? t('รุ่นติดตั้ง') : t('โหมดพัฒนา')}</dd>
              </div>
              <div className="diagnostic-wide">
                <dt>{t('ไฟล์ log')}</dt>
                <dd>
                  <code>{report.path}</code>
                </dd>
              </div>
              <div>
                <dt>{t('อ่านข้อมูลเมื่อ')}</dt>
                <dd>{formatDate(report.generatedAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="diagnostic-panel">
            <h2>{t('นโยบายและฟีเจอร์')}</h2>
            <p className="small">
              {t('ที่มา')}: <code>{report.policy.source}</code> · {t('ไฟล์นโยบาย')}: <code>{report.policy.path}</code>
            </p>
            {report.policy.problems.length ? (
              <div className="diagnostic-problem" role="alert">
                <CircleAlert size={17} />
                <div>
                  <strong>{t('พบปัญหาในการอ่านนโยบาย')}</strong>
                  <ul>
                    {report.policy.problems.map(problem => (
                      <li key={problem}>
                        <code>{problem}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="diagnostic-ok">
                <CircleCheck size={16} /> {t('ไม่พบปัญหานโยบาย')}
              </p>
            )}
            <div className="diagnostic-feature-list">
              {report.policy.enabledFeatures.length ? (
                report.policy.enabledFeatures.map(feature => <code key={feature}>{feature}</code>)
              ) : (
                <span className="muted">{t('ยังไม่มีฟีเจอร์ที่เปิดใช้')}</span>
              )}
            </div>
          </section>

          <section className="diagnostic-panel">
            <h2>{t('การเชื่อมต่อ AI')}</h2>
            {report.connections.length ? (
              <div className="diagnostic-list">
                {report.connections.map(connection => (
                  <article className="diagnostic-connection" key={`${connection.provider}:${connection.label}`}>
                    <div>
                      <h3>{connection.label}</h3>
                      <p className="small">
                        <code>{connection.provider}</code> · {connection.model || t('ใช้โมเดลเริ่มต้น')}
                      </p>
                      {connection.baseUrl && (
                        <p className="small muted">
                          {t('ปลายทาง')}: <code>{connection.baseUrl}</code>
                        </p>
                      )}
                    </div>
                    <div className={connection.ready ? 'diagnostic-ok' : 'diagnostic-problem'}>
                      {connection.ready ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
                      <span>{connection.ready ? t('พร้อมใช้') : connection.policyBlocked ? t('ถูกบล็อกโดยนโยบาย') : t('ยังไม่พร้อม')}</span>
                      {!connection.ready && connection.problem && <code>{connection.problem}</code>}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">{t('ยังไม่มีการเชื่อมต่อ AI')}</p>
            )}
          </section>

          <section className="diagnostic-panel">
            <div className="diagnostic-log-heading">
              <div>
                <h2>{t('เหตุการณ์จาก log')}</h2>
                <p className="small muted">{t('แสดงเหตุการณ์ล่าสุดสูงสุด 250 รายการ และเรียงจากใหม่ไปเก่า')}</p>
              </div>
              <div className="diagnostic-filters" role="group" aria-label={t('กรองระดับเหตุการณ์')}>
                {(['all', 'error', 'warning', 'info'] as const).map(value => (
                  <button key={value} className={filter === value ? 'active' : 'quiet'} onClick={() => setFilter(value)}>
                    {value === 'all' ? t('ทั้งหมด') : t(levelLabels[value])}
                  </button>
                ))}
              </div>
            </div>
            <div className="diagnostic-log">
              {entries.length ? (
                entries
                  .slice()
                  .reverse()
                  .map(entry => <DiagnosticRow key={`${entry.at}:${entry.event}:${entry.code || ''}`} entry={entry} />)
              ) : (
                <p className="muted">{t('ยังไม่มีเหตุการณ์ในระดับที่เลือก')}</p>
              )}
            </div>
          </section>
        </>
      ) : !busy ? (
        <div className="diagnostic-panel">
          <p className="muted">{t('ยังโหลดข้อมูลตรวจระบบไม่ได้')}</p>
        </div>
      ) : (
        <div className="diagnostic-panel">
          <p className="muted">{t('กำลังโหลดข้อมูลตรวจระบบ…')}</p>
        </div>
      )}
    </section>
  );
}
