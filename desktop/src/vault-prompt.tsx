import { useState } from 'react';
import { t } from './i18n';
import { ConfirmDialog } from './ui';

export type VaultPrompt = { id: string; sessionId: string; kind: 'login' | 'unlock' | 'code'; origin: string; provider?: string };
export function VaultPromptDialog({
  prompt,
  respond,
}: {
  prompt: VaultPrompt;
  respond: (id: string, value?: Record<string, string>) => Promise<unknown>;
}) {
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [code, setCode] = useState('');
  const [remember, setRemember] = useState(false);
  const send = async (save: boolean) => {
    const value: Record<string, string> | undefined = !save
      ? undefined
      : prompt.kind === 'login'
        ? { username, password }
        : prompt.kind === 'unlock'
          ? { password }
          : { code };
    setUsername('');
    setPassword('');
    setCode('');
    await respond(prompt.id, value);
  };
  const title =
    prompt.kind === 'login' ? t('บันทึกบัญชีและเข้าสู่ระบบ') : prompt.kind === 'unlock' ? t('ปลดล็อกตัวจัดการรหัสผ่าน') : t('รหัสยืนยัน');
  return (
    <ConfirmDialog
      title={title}
      confirmLabel={title}
      onConfirm={() => send(true)}
      onCancel={() => void send(false).catch(() => {})}
      confirmDisabled={prompt.kind === 'login' ? !remember || !username.trim() || !password : prompt.kind === 'unlock' ? !password : !code}
    >
      <p>{prompt.provider || prompt.origin}</p>
      <p className="muted">{t('ข้อมูลส่งตรงให้โปรแกรมในเครื่อง ไม่เข้าแชตหรือโมเดล AI')}</p>
      <div className="credential-form">
        {prompt.kind === 'login' && (
          <label>
            {t('Username / อีเมล')}
            <input autoComplete="off" autoFocus required value={username} onChange={event => setUsername(event.target.value)} />
          </label>
        )}
        {prompt.kind !== 'code' && (
          <label>
            {t('รหัสผ่าน')}
            <input
              type="password"
              autoComplete="off"
              autoFocus={prompt.kind === 'unlock'}
              required
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </label>
        )}
        {prompt.kind === 'code' && (
          <label>
            {t('รหัสยืนยัน')}
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              required
              value={code}
              onChange={event => setCode(event.target.value)}
            />
          </label>
        )}
        {prompt.kind === 'login' && (
          <label>
            <input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />
            {t('จำบัญชีนี้บนเครื่องส่วนตัวของฉัน')}
          </label>
        )}
      </div>
    </ConfirmDialog>
  );
}
