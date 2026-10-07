import { useEffect, useState } from 'react';
import { ArrowDownToLine, LoaderCircle, RefreshCw } from 'lucide-react';
import type { DesktopAPI, UpdateState } from './types';
import { t } from './i18n';

/** The in-app updater's state (electron/updater.ts), kept current from its events. */
export function useUpdate(api: DesktopAPI | undefined) {
  const [update, setUpdate] = useState<UpdateState | null>(null);
  useEffect(() => {
    if (!api) return;
    void api
      .call('updateState')
      .then(setUpdate)
      .catch(() => {});
    return api.onEvent(event => {
      if (event.type === 'update' && event.update) setUpdate(event.update);
    });
  }, [api]);
  return [update, setUpdate] as const;
}

/**
 * The update card above the profile at the bottom of the task list, as in Claude and Codex: a download in progress,
 * then "restart to update" (Windows) or "download" (a Mac build that cannot install updates itself).
 */
export function UpdateCard({ api, update }: { api: DesktopAPI; update: UpdateState | null }) {
  if (!update || !['downloading', 'ready', 'manual'].includes(update.status)) return null;
  if (update.status === 'downloading')
    return (
      <div className="update-card" role="status">
        <div className="update-card-head">
          <LoaderCircle size={14} className="spin" />
          <span>{t('กำลังดาวน์โหลดเวอร์ชัน {0}', update.version || '')}</span>
          <small>{update.percent ?? 0}%</small>
        </div>
        <div className="update-card-bar" aria-hidden="true">
          <span style={{ width: `${update.percent ?? 0}%` }} />
        </div>
      </div>
    );
  const ready = update.status === 'ready';
  return (
    <div className="update-card ready">
      <div className="update-card-head">
        <strong>{t('มีเวอร์ชันใหม่ {0}', update.version || '')}</strong>
      </div>
      <small className="muted">
        {ready
          ? t('ดาวน์โหลดแล้ว รีสตาร์ทเพื่อใช้เวอร์ชันใหม่ งานที่ค้างไว้ยังอยู่')
          : t('Mac รุ่นนี้ติดตั้งอัปเดตเองไม่ได้ ดาวน์โหลดแล้วลากไปที่ Applications')}
      </small>
      <button onClick={() => void api.call(ready ? 'updateInstall' : 'updateDownload').catch(() => {})}>
        {ready ? <RefreshCw size={14} /> : <ArrowDownToLine size={14} />}
        {ready ? t('รีสตาร์ทเพื่ออัปเดต') : t('ดาวน์โหลดเวอร์ชัน {0}', update.version || '')}
      </button>
    </div>
  );
}

/**
 * The app version under the person's name, with whether a newer one is out. Clicking it checks for updates, or
 * installs a downloaded one, so nobody has to wonder whether they are on the latest version.
 */
export function VersionLine({ api, update, version }: { api: DesktopAPI; update: UpdateState | null; version: string }) {
  const current = update?.current || version;
  if (!current) return null;
  const status = update?.status;
  const available = status === 'ready' || status === 'manual' || status === 'downloading';
  const note = available
    ? t('มีอัปเดต {0}', update?.version || '')
    : status === 'checking'
      ? t('กำลังตรวจอัปเดต…')
      : status === 'none'
        ? t('เป็นเวอร์ชันล่าสุด')
        : status === 'error'
          ? t('ตรวจอัปเดตไม่สำเร็จ')
          : status === 'disabled' || !update
            ? ''
            : t('ตรวจอัปเดต');
  const action = status === 'ready' ? 'updateInstall' : status === 'manual' ? 'updateDownload' : 'updateCheck';
  return (
    <button
      type="button"
      className={available ? 'version-line available' : 'version-line'}
      disabled={status === 'checking' || status === 'downloading' || status === 'disabled'}
      title={available ? t('มีเวอร์ชันใหม่ {0}', update?.version || '') : t('ตรวจหาเวอร์ชันใหม่')}
      onClick={() => void api.call(action).catch(() => {})}
    >
      <span>v{current}</span>
      {note && <span>· {note}</span>}
    </button>
  );
}
