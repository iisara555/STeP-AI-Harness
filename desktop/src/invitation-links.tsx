import { useEffect, useRef, useState } from 'react';
import {
  INVITATION_RSVP_LABELS,
  INVITATION_RSVP_STATUSES,
  blankInvitationRecipient,
  invitationSummary,
  invitationUrl,
  type InvitationPresentation,
  type InvitationRecipient,
  type InvitationRsvpStatus,
} from './invitation';
import { t } from './i18n';

/**
 * A count field that may be empty while staff retype it. The last valid number stays in the register;
 * the visible text is restored to it on blur, so clearing a field never turns "25" into "125".
 */
function CountInput({
  value,
  min,
  max,
  onCommit,
  invalid,
  describedBy,
}: {
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(previous => (previous.trim() !== '' && Number(previous) === value ? previous : String(value)));
  }, [value]);
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={e => {
        const raw = e.target.value;
        setText(raw);
        if (raw.trim() === '') return;
        const number = Math.trunc(Number(raw));
        if (!Number.isFinite(number)) return;
        const next = Math.max(min, Math.min(max, number));
        if (next !== value) onCommit(next);
        else if (String(next) !== raw) setText(String(next));
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

export const invitationLinkLabels = { rsvpUrl: 'ลิงก์ตอบรับเข้าร่วมงาน', venueUrl: 'ลิงก์แผนที่สถานที่จัดงาน' } as const;
export function invalidInvitationLinks(value: Partial<InvitationPresentation>) {
  return (Object.keys(invitationLinkLabels) as ('rsvpUrl' | 'venueUrl')[]).filter(key => {
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
  const [previews, setPreviews] = useState<Partial<Record<'rsvpUrl' | 'venueUrl', string>>>({});
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setPreviews({});
    setFailed(false);
    void Promise.all(
      (Object.keys(invitationLinkLabels) as ('rsvpUrl' | 'venueUrl')[]).map(async key => {
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
  const recipients = value.recipients || [];
  const summary = invitationSummary(recipients);
  const updateRecipients = (next: InvitationRecipient[]) =>
    onChange({
      rsvpUrl: value.rsvpUrl,
      venueUrl: value.venueUrl,
      ...(next.length ? { recipients: next } : {}),
    });
  const patchRecipient = (index: number, patch: Partial<InvitationRecipient>) =>
    updateRecipients(recipients.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  // Stable row keys, so a removed row's typing state never moves onto the row below it.
  const rowKeys = useRef<number[]>([]);
  const nextRowKey = useRef(0);
  if (rowKeys.current.length > recipients.length) rowKeys.current.length = recipients.length;
  while (rowKeys.current.length < recipients.length) rowKeys.current.push(nextRowKey.current++);
  const [removed, setRemoved] = useState<{ item: InvitationRecipient; index: number; key: number } | null>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const focusUndo = useRef(false);
  useEffect(() => {
    if (removed && focusUndo.current) {
      focusUndo.current = false;
      undoButton.current?.focus();
    }
  }, [removed]);
  const removeRecipient = (index: number) => {
    const [key] = rowKeys.current.splice(index, 1);
    focusUndo.current = true;
    setRemoved({ item: recipients[index], index, key });
    updateRecipients(recipients.filter((_, i) => i !== index));
  };
  const register = useRef<HTMLFieldSetElement>(null);
  const focusRow = useRef<number | null>(null);
  useEffect(() => {
    if (focusRow.current === null) return;
    const key = focusRow.current;
    focusRow.current = null;
    register.current?.querySelector<HTMLInputElement>(`[data-row-key="${key}"] input`)?.focus();
  }, [recipients]);
  const undoRemove = () => {
    if (!removed || recipients.length >= 200) return;
    const index = Math.min(removed.index, recipients.length);
    rowKeys.current.splice(index, 0, removed.key);
    focusRow.current = removed.key;
    setRemoved(null);
    updateRecipients([...recipients.slice(0, index), removed.item, ...recipients.slice(index)]);
  };
  return (
    <>
      <fieldset className="invitation-links" disabled={disabled}>
        <legend>{t('QR สำหรับหนังสือเชิญ')}</legend>
        <p className="small muted">{t('สร้าง QR ในเครื่องจากลิงก์ที่กรอก เว้นว่างได้')}</p>
        {(Object.keys(invitationLinkLabels) as ('rsvpUrl' | 'venueUrl')[]).map(key => (
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
      <fieldset ref={register} className="invitation-links invitation-register" disabled={disabled}>
        <legend>{t('ทะเบียนหนังสือเชิญและยอดตอบรับ (หลายหน่วยงาน)')}</legend>
        <p className="small muted">
          {t('แยกจำนวนหนังสือจากจำนวนที่นั่ง เช่น หนังสือ 1 ฉบับเชิญผู้แทน 2 คน เพื่อสรุปยอดจัดงานและส่งออกรายฉบับ')}
        </p>
        {recipients.length > 0 && (
          <p className="small invitation-summary" role="status">
            {t(
              'สรุปยอดทะเบียน: หนังสือ {0} ฉบับ · ที่นั่งเชิญรวม {1} ที่นั่ง · ตอบรับแล้ว {2} ฉบับ (ยืนยันเข้าร่วม {3} คน) · รอตอบรับ {4} ฉบับ · ขัดข้อง {5} ฉบับ',
              summary.letters,
              summary.invitedSeats,
              summary.respondedLetters,
              summary.confirmedSeats,
              summary.pendingLetters,
              summary.declinedLetters,
            )}
          </p>
        )}
        {removed && (
          <p className="small invitation-removed" role="status">
            {t('ลบหนังสือฉบับที่ {0} แล้ว', removed.index + 1)}{' '}
            <button ref={undoButton} type="button" className="quiet" disabled={disabled || recipients.length >= 200} onClick={undoRemove}>
              {t('เลิกทำ')}
            </button>
          </p>
        )}
        {recipients.map((item, index) => {
          const rowKey = rowKeys.current[index];
          const overSeats = item.confirmedSeats > item.seats;
          return (
            <div key={rowKey} data-row-key={rowKey} className="invitation-recipient-row">
              <div className="invitation-recipient-head">
                <strong>{t('หนังสือฉบับที่ {0}', index + 1)}</strong>
                <button
                  type="button"
                  className="quiet"
                  aria-label={t('ลบผู้รับลำดับที่ {0}', index + 1)}
                  onClick={() => removeRecipient(index)}
                >
                  {t('ลบ')}
                </button>
              </div>
              <div className="invitation-recipient-grid">
                <label>
                  {t('เลขหนังสือรายฉบับ')}
                  <input
                    type="text"
                    maxLength={160}
                    value={item.number}
                    placeholder={t('เช่น ศธ 0000/0123')}
                    onChange={e => patchRecipient(index, { number: e.target.value })}
                  />
                </label>
                <label>
                  {t('ผู้รับ (เรียน)')}
                  <input
                    type="text"
                    maxLength={500}
                    value={item.recipient}
                    placeholder={t('เช่น คุณกานต์ ตัวอย่าง')}
                    onChange={e => patchRecipient(index, { recipient: e.target.value })}
                  />
                </label>
                <label>
                  {t('ตำแหน่ง / หน่วยงานผู้รับ')}
                  <input
                    type="text"
                    maxLength={500}
                    value={item.position}
                    placeholder={t('เช่น ผู้จัดการโครงการ หน่วยงานตัวอย่าง')}
                    onChange={e => patchRecipient(index, { position: e.target.value })}
                  />
                </label>
                <label>
                  {t('จำนวนที่นั่งที่เชิญ')}
                  <CountInput
                    value={item.seats}
                    min={1}
                    max={500}
                    onCommit={seats =>
                      patchRecipient(index, {
                        seats,
                        // A full acceptance follows the invitation; otherwise attendees can never exceed the seats.
                        confirmedSeats:
                          item.status !== 'pending' && item.status !== 'declined' && item.confirmedSeats === item.seats
                            ? seats
                            : Math.min(item.confirmedSeats, seats),
                      })
                    }
                  />
                </label>
                <label>
                  {t('สถานะตอบรับ')}
                  <select
                    value={item.status}
                    onChange={e => {
                      const status = e.target.value as InvitationRsvpStatus;
                      const confirmedSeats =
                        status === 'pending' || status === 'declined'
                          ? 0
                          : item.confirmedSeats > 0
                            ? Math.min(item.confirmedSeats, item.seats)
                            : item.seats;
                      patchRecipient(index, { status, confirmedSeats });
                    }}
                  >
                    {INVITATION_RSVP_STATUSES.map(status => (
                      <option key={status} value={status}>
                        {t(INVITATION_RSVP_LABELS[status])}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('จำนวนผู้ยืนยันเข้าร่วม')}
                  <CountInput
                    value={item.confirmedSeats}
                    min={0}
                    max={Math.max(item.seats, item.confirmedSeats)}
                    invalid={overSeats}
                    describedBy={overSeats ? `invitation-over-seats-${rowKey}` : undefined}
                    onCommit={confirmedSeats => patchRecipient(index, { confirmedSeats: Math.min(confirmedSeats, item.seats) })}
                  />
                  {overSeats ? (
                    <small id={`invitation-over-seats-${rowKey}`} className="error" role="alert">
                      {t('ผู้ยืนยันเข้าร่วมเกินที่นั่งที่เชิญ ({0} ที่นั่ง)', item.seats)}
                    </small>
                  ) : (
                    <small className="muted">{t('ไม่เกิน {0} คนตามที่นั่งที่เชิญ', item.seats)}</small>
                  )}
                </label>
                <label className="wide">
                  {t('รายชื่อผู้เข้าร่วม / หมายเหตุ')}
                  <input
                    type="text"
                    maxLength={500}
                    value={item.attendees}
                    placeholder={t('เช่น ผู้แทน 2 คน หรือหมายเหตุการเข้าร่วม')}
                    onChange={e => patchRecipient(index, { attendees: e.target.value })}
                  />
                </label>
              </div>
            </div>
          );
        })}
        <div>
          <button
            type="button"
            className="quiet"
            disabled={disabled || recipients.length >= 200}
            onClick={() => {
              setRemoved(null);
              updateRecipients([...recipients, blankInvitationRecipient()]);
            }}
          >
            {t('เพิ่มผู้รับ / หน่วยงาน')}
          </button>
        </div>
      </fieldset>
    </>
  );
}
