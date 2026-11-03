import { useEffect, useId, useRef, useState } from 'react';
import { t } from './i18n';

export function WelcomeGreeting({
  call,
  name,
  connectionId,
  model,
  hasDraft,
  enabled,
}: {
  call: (method: string, input?: unknown) => Promise<any>;
  name: string;
  connectionId: string;
  model: string;
  hasDraft: boolean;
  enabled: boolean;
}) {
  const visitId = useId();
  const [headline, setHeadline] = useState(t('เริ่มจากเรื่องไหนดี'));
  const typing = useRef(hasDraft);
  typing.current = hasDraft;
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void call('welcomeGreeting', { connectionId, model, visitId })
      .then(result => {
        if (alive && !typing.current && typeof result?.headline === 'string') setHeadline(result.headline);
      })
      .catch(() => {});
    return () => {
      alive = false;
      void call('welcomeGreetingLeave', { visitId }).catch(() => {});
    };
  }, [call, connectionId, model, visitId, enabled]);
  return (
    <div className="welcome">
      <p className="welcome-greeting">{name.trim() ? t('สวัสดี คุณ{0}', name.trim()) : t('สวัสดี')}</p>
      <h1>{headline}</h1>
    </div>
  );
}
