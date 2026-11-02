import { useEffect, useState } from 'react';
import { t } from './i18n';
import type { StartupState } from '../electron/startup';

export function StartupSettings({
  call,
  onError,
}: {
  call: (method: string, input?: any) => Promise<any>;
  onError: (error: unknown) => void;
}) {
  const [state, setState] = useState<StartupState>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void call('startupState')
      .then(value => {
        if (active) setState(value);
      })
      .catch(error => {
        if (active) {
          setFailed(true);
          onError(error);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section>
      <h2>{t('การเริ่มโปรแกรม')}</h2>
      <label className="check">
        <input
          type="checkbox"
          role="switch"
          checked={state?.enabled || false}
          disabled={busy || !state?.supported}
          onChange={event => {
            const enabled = event.target.checked;
            setBusy(true);
            void call('startupSet', { enabled })
              .then(setState)
              .catch(async error => {
                onError(error);
                // A denied OS change keeps the last known state, then re-reads any external change.
                try {
                  setState(await call('startupState'));
                } catch {
                  /* Retain the last known state. */
                }
              })
              .finally(() => setBusy(false));
          }}
        />
        {t('เปิด STeP Desktop เมื่อเข้าสู่ Windows')}
      </label>
      <p className="small muted" role="status">
        {t(
          failed
            ? 'อ่านการตั้งค่าเริ่มโปรแกรมไม่ได้ กรุณาเปิดหน้าตั้งค่าใหม่'
            : !state
              ? 'กำลังอ่านการตั้งค่า…'
              : state.supported
                ? 'มีผลทันทีสำหรับผู้ใช้ Windows คนนี้ เปลี่ยนได้ใน Startup apps ของ Windows'
                : 'ใช้ได้ใน STeP Desktop ที่ติดตั้งบน Windows',
        )}
      </p>
    </section>
  );
}
