import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ListChecks, Lightbulb, Sun, X, Video, ExternalLink, MessageSquare, ShieldCheck } from './icons';
import { t } from './i18n';
import type { MorningBrief } from '../electron/morning-brief';

// สรุปเช้านี้ (design of 2026-10-17): a card on the chat home once a day. Reading Google needs the employee's OK, and
// the summary is worked out on this computer; only "ถาม AI ต่อ" puts it in the composer, where sending asks as usual.
export type BriefState = {
  feature: boolean;
  available: boolean;
  enabled: boolean;
  time: string;
  account?: string;
  tasks: boolean;
  rememberAllowed: boolean;
  remembered: boolean;
  due: boolean;
  brief?: MorningBrief;
};
type Call = (method: string, input?: any) => Promise<any>;
const clock = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(11, 16);
const tip = (value: { text: string; args: string[] }) => t(value.text, ...value.args);

/** The day's summary as a question the employee can edit before sending it to their AI. */
export function briefQuestion(brief: MorningBrief) {
  const lines = [t('ช่วยวางแผนวันนี้ให้หน่อย จากนัดและงานด้านล่าง')];
  for (const e of brief.events) lines.push(`- ${e.allDay ? t('ทั้งวัน') : `${clock(e.start)}–${clock(e.end)}`} ${e.title}`);
  for (const task of [...brief.dueToday, ...brief.overdue])
    lines.push(`- ${t('งาน')}: ${task.title}${task.due < brief.date ? ` (${t('เลยกำหนด')})` : ''}`);
  return lines.join('\n');
}

export function MorningBriefCard({
  call,
  onError,
  onAsk,
}: {
  call: Call;
  onError: (error: unknown) => void;
  onAsk: (text: string) => void;
}) {
  const [state, setState] = useState<BriefState>();
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(false);
  const autoRun = useRef(false);
  const run = async (method: string, input?: unknown) => {
    setBusy(true);
    try {
      setState(await call(method, input));
    } catch (error) {
      if ((error as Error)?.message !== 'CANCELLED') onError(error);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let alive = true;
    const load = () =>
      call('morningBriefState')
        .then(next => alive && setState(next))
        .catch(() => undefined);
    void load();
    // The card appears at the chosen time while the app stays open.
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [call]);
  // With the every-day OK already given, the brief is read without a button press, once per opening of the card.
  useEffect(() => {
    if (state?.due && state.remembered && !state.brief && !autoRun.current && !busy) {
      autoRun.current = true;
      void run('morningBriefRun');
    }
  });
  if (!state?.feature || !state.available || !state.due) return null;
  const brief = state.brief;
  return (
    <section className="morning-brief" aria-labelledby="morning-brief-title">
      <header>
        <h2 id="morning-brief-title">
          <Sun size={17} aria-hidden="true" />
          {t('สรุปเช้านี้')}
        </h2>
        <button
          className="quiet icon"
          aria-label={t('ไม่ต้องแสดงวันนี้')}
          title={t('ไม่ต้องแสดงวันนี้')}
          onClick={() => void run('morningBriefDismiss')}
        >
          <X size={15} />
        </button>
      </header>
      {!brief ? (
        <>
          <p>{t('ดูนัดวันนี้จาก Calendar และงานจาก Google Tasks ของบัญชี {0}', state.account || '')}</p>
          <p className="muted small">
            <ShieldCheck size={13} aria-hidden="true" /> {t('อ่านอย่างเดียว สรุปในเครื่องนี้ ไม่ส่งให้ AI')}
          </p>
          {state.rememberAllowed && !state.remembered && (
            <label className="morning-brief-remember">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
              {t('อนุญาตทุกวัน ไม่ต้องถามอีก')}
            </label>
          )}
          <div className="morning-brief-actions">
            <button className="primary" disabled={busy} onClick={() => void run('morningBriefRun', { remember })}>
              {busy ? t('กำลังอ่าน…') : t('ดูสรุปวันนี้')}
            </button>
            <button className="quiet" disabled={busy} onClick={() => void run('morningBriefDismiss')}>
              {t('ไม่ต้องแสดงวันนี้')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="morning-brief-part">
            <h3>
              <CalendarDays size={15} aria-hidden="true" />
              {t('นัดวันนี้')}
            </h3>
            {!brief.events.length && <p className="muted">{t('วันนี้ไม่มีนัดในปฏิทิน')}</p>}
            <ul>
              {brief.events.map((e, i) => (
                <li key={i} className={e.conflict ? 'conflict' : undefined}>
                  <span className="morning-brief-time">{e.allDay ? t('ทั้งวัน') : `${clock(e.start)}–${clock(e.end)}`}</span>
                  <span className="morning-brief-what">
                    <strong>{e.title}</strong>
                    {e.location && <small>{e.location}</small>}
                  </span>
                  {e.tentative && <span className="badge">{t('ยังไม่ตอบรับ')}</span>}
                  {e.conflict && <span className="badge warn">{t('ชนกัน')}</span>}
                  {e.meet && (
                    <button className="quiet small" onClick={() => void call('morningBriefOpen', { url: e.meet }).catch(onError)}>
                      <Video size={13} />
                      Meet
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
          {state.tasks && (
            <div className="morning-brief-part">
              <h3>
                <ListChecks size={15} aria-hidden="true" />
                {t('งานวันนี้')}
              </h3>
              {!brief.dueToday.length && !brief.overdue.length && <p className="muted">{t('ไม่มีงานที่ครบกำหนดวันนี้หรือเลยกำหนด')}</p>}
              <ul>
                {brief.dueToday.map((task, i) => (
                  <li key={'d' + i}>
                    <span className="morning-brief-what">
                      <strong>{task.title}</strong>
                      {task.list && <small>{task.list}</small>}
                    </span>
                  </li>
                ))}
                {brief.overdue.map((task, i) => (
                  <li key={'o' + i}>
                    <span className="morning-brief-what">
                      <strong>{task.title}</strong>
                      {task.list && <small>{task.list}</small>}
                    </span>
                    <span className="badge warn">{t('เลยกำหนด {0}', task.due.split('-').reverse().slice(0, 2).join('/'))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {Boolean(brief.tips.length) && (
            <div className="morning-brief-part">
              <h3>
                <Lightbulb size={15} aria-hidden="true" />
                {t('คำแนะนำ')}
              </h3>
              <ul>
                {brief.tips.map((value, i) => (
                  <li key={i}>{tip(value)}</li>
                ))}
              </ul>
            </div>
          )}
          {brief.gaps.map((value, i) => (
            <p key={i} className="muted small">
              {tip(value)}
            </p>
          ))}
          <div className="morning-brief-actions">
            <button className="primary" onClick={() => onAsk(briefQuestion(brief))}>
              <MessageSquare size={14} />
              {t('ถาม AI ต่อ')}
            </button>
            <button className="quiet" onClick={() => void call('googleOpen', { service: 'calendar' }).catch(onError)}>
              <ExternalLink size={14} />
              {t('เปิด Calendar')}
            </button>
            <button className="quiet" onClick={() => void run('morningBriefDismiss')}>
              {t('ไม่ต้องแสดงวันนี้')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** In Passwords and connections, under the Google accounts: the switch, the time and the every-day OK with its revoke. */
export function MorningBriefSettings({ call, onError }: { call: Call; onError: (error: unknown) => void }) {
  const [state, setState] = useState<BriefState>();
  const [time, setTime] = useState('');
  useEffect(() => {
    let alive = true;
    void call('morningBriefState')
      .then((next: BriefState) => {
        if (!alive) return;
        setState(next);
        setTime(next.time);
      })
      .catch(onError);
    return () => {
      alive = false;
    };
    // onError is a new function on every render of the settings page; loading once per page is enough.
  }, [call]);
  const save = (input: Record<string, unknown>) =>
    void call('morningBriefSettings', input)
      .then((next: BriefState) => {
        setState(next);
        setTime(next.time);
      })
      .catch(onError);
  if (!state?.feature) return null;
  return (
    <div className="morning-brief-settings">
      <h3 className="google-subhead">
        <Sun size={15} aria-hidden="true" />
        {t('สรุปเช้านี้')}
      </h3>
      <p className="muted small">{t('การ์ดบนหน้าแชตที่สรุปนัดและงานของวันนี้ คิดในเครื่องนี้ ไม่ส่งให้ AI')}</p>
      {!state.available && <p className="muted small">{t('เชื่อมบัญชีที่เปิด Calendar ไว้ก่อน จึงจะใช้สรุปเช้านี้ได้')}</p>}
      <div className="morning-brief-controls">
        <label className="morning-brief-toggle">
          <input type="checkbox" checked={state.enabled} onChange={e => save({ enabled: e.target.checked })} />
          <span>{t('แสดงสรุปเช้านี้')}</span>
        </label>
        <label className="morning-brief-time-setting">
          <span>{t('แสดงตั้งแต่เวลา')}</span>
          <input
            type="time"
            value={time}
            disabled={!state.enabled}
            onChange={e => setTime(e.target.value)}
            onBlur={() => time && time !== state.time && save({ time })}
          />
        </label>
      </div>
      {state.remembered ? (
        <p className="morning-brief-row">
          <ShieldCheck size={14} aria-hidden="true" />
          {t('อนุญาตให้อ่านนัดและงานวันนี้ทุกวันแล้ว ({0})', state.account || '')}
          <button className="quiet small" onClick={() => save({ remember: false })}>
            {t('ยกเลิกการอนุญาตทุกวัน')}
          </button>
        </p>
      ) : (
        state.rememberAllowed && <p className="muted small">{t('อนุญาตทุกวันได้จากการ์ดสรุปเช้านี้ ไม่อย่างนั้นแอปจะถามทุกครั้ง')}</p>
      )}
    </div>
  );
}
