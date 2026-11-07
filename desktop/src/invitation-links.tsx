import { useEffect, useState } from 'react';
import { invitationUrl, type InvitationPresentation } from './invitation';
import { t } from './i18n';

export const invitationLinkLabels = { rsvpUrl: 'ลิงก์ตอบรับเข้าร่วมงาน', venueUrl: 'ลิงก์แผนที่สถานที่จัดงาน' } as const;
export function invalidInvitationLinks(value: Partial<InvitationPresentation>) {
  return (Object.keys(invitationLinkLabels) as (keyof InvitationPresentation)[]).filter(key => {
    try {
      invitationUrl(value[key]);
      return false;
    } catch {
      return true;
    }
  });
}
export function InvitationLinks({
  value,
  disabled,
  onChange,
}: {
  value: InvitationPresentation;
  disabled: boolean;
  onChange: (value: InvitationPresentation) => void;
}) {
  const [previews, setPreviews] = useState<Partial<Record<keyof InvitationPresentation, string>>>({});
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setPreviews({});
    setFailed(false);
    void Promise.all(
      (Object.keys(invitationLinkLabels) as (keyof InvitationPresentation)[]).map(async key => {
        let url: string;
        try {
          url = invitationUrl(value[key]);
        } catch {
          return [key, ''] as const;
        }
        const data = url ? await (await import('qrcode')).default.toDataURL(url, { errorCorrectionLevel: 'M', margin: 4, width: 512 }) : '';
        return [key, data] as const;
      }),
    )
      .then(items => {
        if (active) setPreviews(Object.fromEntries(items));
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [value.rsvpUrl, value.venueUrl]);
  const invalid = invalidInvitationLinks(value);
  return (
    <fieldset className="invitation-links" disabled={disabled}>
      <legend>{t('QR สำหรับหนังสือเชิญ')}</legend>
      <p className="small muted">{t('สร้าง QR ในเครื่องจากลิงก์ที่กรอก เว้นว่างได้')}</p>
      {(Object.keys(invitationLinkLabels) as (keyof InvitationPresentation)[]).map(key => (
        <div key={key}>
          <label>
            {t(invitationLinkLabels[key])}
            <input
              type="url"
              aria-invalid={invalid.includes(key)}
              value={value[key]}
              placeholder={key === 'rsvpUrl' ? 'https://example.org/rsvp' : 'https://example.org/map'}
              maxLength={2048}
              onChange={e => onChange({ ...value, [key]: e.target.value })}
            />
          </label>
          {invalid.includes(key) && (
            <p className="small error" role="alert">
              {t('กรอกลิงก์ http:// หรือ https:// ที่ถูกต้อง')}
            </p>
          )}
          {previews[key] && (
            <img
              src={previews[key]}
              width={112}
              height={112}
              alt={t(key === 'rsvpUrl' ? 'QR ตอบรับเข้าร่วมงาน' : 'QR แผนที่สถานที่จัดงาน')}
            />
          )}
        </div>
      ))}
      {failed && (
        <p className="small error" role="alert">
          {t('สร้าง QR ไม่ได้ กรุณาตรวจลิงก์อีกครั้ง')}
        </p>
      )}
    </fieldset>
  );
}
