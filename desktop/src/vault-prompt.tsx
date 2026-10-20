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
  const provider = prompt.provider === 'bitwarden' ? 'Bitwarden' : prompt.provider === 'onepassword' ? '1Password' : '';
  const passwordLabel = prompt.kind === 'unlock' ? t('รหัสผ่านหลักของตัวจัดการรหัสผ่าน') : t('รหัสผ่านของเว็บไซต์นี้');
  return (
    <ConfirmDialog
      title={title}
      confirmLabel={title}
      onConfirm={() => send(true)}
      onCancel={() => void send(false).catch(() => {})}
      submitOnEnter
      confirmDisabled={prompt.kind === 'login' ? !remember || !username.trim() || !password : prompt.kind === 'unlock' ? !password : !code}
    >
      <p>{provider || prompt.origin}</p>
      <p>
        {prompt.kind === 'unlock'
          ? t('กรอกรหัสผ่านหลักของตัวจัดการรหัสผ่านที่ระบุด้านบน เพื่อปลดล็อกบัญชีที่บันทึกไว้ หากไม่เคยใช้ตัวจัดการนี้ ให้กดยกเลิก')
          : prompt.kind === 'login'
            ? t('กรอกชื่อผู้ใช้และรหัสผ่านที่คุณใช้เข้าสู่เว็บไซต์ด้านบน ตรวจชื่อเว็บไซต์ก่อนบันทึก')
            : t('กรอกรหัสยืนยันครั้งเดียวที่เว็บไซต์ด้านบนร้องขอ เช่น รหัสจากแอปยืนยันตัวตน อีเมล หรือ SMS ของบัญชีที่กำลังเข้าสู่ระบบ')}
      </p>
      {prompt.kind === 'unlock' && (
        <p className="muted">{t('Google Workspace ใช้การลงชื่อเข้าใช้ผ่าน Google ไม่ต้องกรอกรหัสผ่าน Google ในกล่องนี้')}</p>
      )}
      <p className="muted">{t('ข้อมูลส่งตรงให้โปรแกรมในเครื่อง ไม่เข้าแชตหรือโมเดล AI')}</p>
      <div className="credential-form vault-prompt-form">
        {prompt.kind === 'login' && (
          <label>
            {t('ชื่อผู้ใช้หรืออีเมล')}
            <input
              autoComplete="off"
              autoFocus
              required
              maxLength={4000}
              value={username}
              onChange={event => setUsername(event.target.value)}
            />
          </label>
        )}
        {prompt.kind !== 'code' && (
          <label>
            {passwordLabel}
            <input
              type="password"
              autoComplete="off"
              autoFocus={prompt.kind === 'unlock'}
              required
              maxLength={4000}
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
              maxLength={4000}
              value={code}
              onChange={event => setCode(event.target.value)}
            />
          </label>
        )}
        {prompt.kind === 'login' && (
          <label className="credential-check">
            <input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />
            {t('จำบัญชีนี้บนเครื่องส่วนตัวของฉัน')}
          </label>
        )}
      </div>
    </ConfirmDialog>
  );
}
