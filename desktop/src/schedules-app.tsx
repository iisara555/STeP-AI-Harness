import { useEffect, useState } from 'react';
import { CalendarClock, LoaderCircle, Pause, Pencil, Play, Plus, Power, Trash2 } from 'lucide-react';
import type { Automation, AutomationRun } from '../electron/cron';
import type { Connection, DesktopAPI } from './types';
import { connectionName, explainError } from './messages';
import { locale, t } from './i18n';
import { ConfirmDialog } from './ui';
import {
  DAY_LABELS,
  REPEAT_LABELS,
  SCHEDULE_TEMPLATES,
  describeSchedule,
  fromCron,
  toCron,
  type Repeat,
  type ScheduleChoice,
  type ScheduleTemplate,
} from './schedules';
import './schedules.css';

type Draft = { id: string; name: string; query: string; connectionId: string; choice: ScheduleChoice };
const blank = (connectionId = ''): Draft => ({
  id: '',
  name: '',
  query: '',
  connectionId,
  choice: { repeat: 'weekdays', time: '08:30', days: [1] },
});
const STATUS: Record<AutomationRun['status'], string> = {
  queued: 'รอคิว',
  running: 'กำลังทำ',
  review: 'ร่างรอตรวจ',
  error: 'ไม่สำเร็จ',
  cancelled: 'ยกเลิกแล้ว',
  interrupted: 'หยุดระหว่างทำ',
};
const scheduleText = (cron: string) => {
  const { text, args } = describeSchedule(cron);
  return t(text, ...args);
};

/**
 * "งานตั้งเวลา": tasks the assistant does on a schedule, like scheduled tasks in other AI apps. Each run is a draft
 * for the employee to check; the schedule itself runs in the main process (electron/cron.ts).
 */
export function ScheduledTasks({
  api,
  connections,
  defaultConnection,
  onOpen,
}: {
  api: DesktopAPI;
  connections: Connection[];
  defaultConnection: string;
  onOpen: (sessionId: string) => void;
}) {
  const ready = connections.filter(c => c.ready);
  const fallback = ready.some(c => c.id === defaultConnection) ? defaultConnection : ready[0]?.id || '';
  const [data, setData] = useState<{ jobs: Automation[]; history: AutomationRun[]; enabled: boolean }>(),
    [draft, setDraft] = useState<Draft | null>(null),
    [remove, setRemove] = useState<Automation | null>(null),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  const load = async () => setData(await api.call('automationList'));
  useEffect(() => {
    void load().catch(e => setError(explainError(e)));
    return api.onEvent(e => {
      if (e.type === 'changed') void load().catch(() => {});
    });
  }, []);
  const act = async (key: string, run: () => Promise<unknown>) => {
    if (busy) return false;
    setBusy(key);
    setError('');
    try {
      await run();
      await load();
      return true;
    } catch (e) {
      // Cancelling the consent prompt is not an error worth showing.
      if (!/CANCELLED/.test(String((e as Error)?.message))) setError(explainError(e));
      return false;
    } finally {
      setBusy('');
    }
  };
  const save = (job: Draft, enabled: boolean) =>
    act('save', async () => {
      await api.call('automationSave', {
        id: job.id || undefined,
        name: job.name,
        query: job.query,
        schedule: toCron(job.choice),
        label: scheduleText(toCron(job.choice)),
        connectionId: job.connectionId,
        enabled,
      });
    });
  const toggle = (job: Automation) =>
    act(job.id, () =>
      api.call('automationSave', {
        ...job,
        label: scheduleText(job.schedule),
        enabled: !job.enabled,
      }),
    );
  const fromTemplate = (template: ScheduleTemplate) => {
    window.scrollTo?.(0, 0);
    document.querySelector('.schedules')?.scrollTo({ top: 0 });
    setDraft({ ...blank(fallback), name: t(template.name), query: t(template.query), choice: { ...template.choice } });
  };
  const lastRun = (id: string) => data?.history.find(r => r.automationId === id);
  const enabled = data?.enabled;

  return (
    <div className="schedules">
      <h1 className="sr-only">{t('งานตั้งเวลา')}</h1>
      <section className="schedules-intro">
        <p>
          {t(
            'ให้ผู้ช่วยทำงานซ้ำตามเวลาที่คุณตั้ง เช่น ร่างสรุปงานทุกเย็นวันศุกร์ ผลแต่ละรอบเป็นร่างในรายการงาน พร้อมแจ้งเตือนให้คุณตรวจก่อนใช้',
          )}
        </p>
        <p className="small muted">
          {t('ทำเมื่อแอปเปิดอยู่ ถ้าถึงเวลาตอนแอปปิด จะทำให้ทันทีที่เปิดแอปภายใน 12 ชั่วโมง ใช้บัญชี AI และพื้นที่งานที่เลือกไว้ตอนสร้าง')}
        </p>
        {enabled && (
          <button disabled={!!busy || !ready.length} onClick={() => setDraft(blank(fallback))}>
            <Plus size={16} />
            {t('งานใหม่')}
          </button>
        )}
      </section>
      {draft && (
        <ScheduleEditor
          key={draft.id + draft.name + draft.choice.time}
          draft={draft}
          connections={ready}
          busy={busy === 'save'}
          onCancel={() => setDraft(null)}
          onSave={async (job, on) => {
            if (await save(job, on)) setDraft(null);
          }}
        />
      )}
      {error && (
        <p className="schedules-error" role="alert">
          {error}
        </p>
      )}
      {data && !enabled && <p className="schedules-empty">{t('ผู้ดูแลยังไม่เปิดงานตั้งเวลาบนเครื่องนี้ ถ้าต้องใช้ ติดต่อผู้ดูแลระบบ')}</p>}
      {enabled && !ready.length && <p className="schedules-empty">{t('เชื่อมต่อบัญชี AI ก่อน แล้วจึงสร้างงานตั้งเวลาได้')}</p>}
      {enabled && (
        <>
          <h2>{t('งานของฉัน')}</h2>
          {!data.jobs.length && <p className="schedules-empty">{t('ยังไม่มีงานตั้งเวลา เริ่มจากแม่แบบด้านล่างหรือกด "งานใหม่"')}</p>}
          <ul className="schedule-list">
            {data.jobs.map(job => {
              const run = lastRun(job.id),
                connection = connections.find(c => c.id === job.connectionId);
              return (
                <li key={job.id} className={'schedule-card' + (job.enabled ? '' : ' paused')}>
                  <CalendarClock size={20} className="schedule-icon" aria-hidden="true" />
                  <div className="schedule-main">
                    <strong>{job.name}</strong>
                    <span className="small">{scheduleText(job.schedule)}</span>
                    <span className="small muted">
                      {job.enabled
                        ? t('รอบถัดไป {0}', new Date(job.nextAt).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }))
                        : t('พักไว้')}
                      {connection ? ` · ${connectionName(connection)}` : ''}
                    </span>
                    {run && (
                      <span className="small muted">
                        {t(
                          'ล่าสุด {0} · {1}',
                          new Date(run.at).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }),
                          t(STATUS[run.status]),
                        )}
                        {run.sessionId && (
                          <button className="text-link" onClick={() => onOpen(run.sessionId!)}>
                            {t('เปิดผล')}
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="schedule-actions">
                    {job.running ? (
                      <button
                        className="quiet"
                        disabled={!!busy}
                        onClick={() => void act(job.id, () => api.call('automationCancel', { id: job.id }))}
                      >
                        <LoaderCircle size={15} className="spin" />
                        {t('หยุดรอบนี้')}
                      </button>
                    ) : (
                      <button
                        className="quiet"
                        disabled={!!busy}
                        title={t('ทำรอบนี้ทันที')}
                        onClick={() => void act(job.id, () => api.call('automationRun', { id: job.id }))}
                      >
                        <Play size={15} />
                        {t('ทำตอนนี้')}
                      </button>
                    )}
                    <button
                      className="quiet"
                      aria-label={job.enabled ? t('พักงาน {0}', job.name) : t('เปิดงาน {0}', job.name)}
                      disabled={!!busy || !!job.running}
                      onClick={() => void toggle(job)}
                    >
                      {job.enabled ? <Pause size={15} /> : <Power size={15} />}
                      {job.enabled ? t('พักงาน') : t('เปิดงาน')}
                    </button>
                    <button
                      className="icon"
                      aria-label={t('แก้ไขงาน {0}', job.name)}
                      title={t('แก้ไขงาน')}
                      disabled={!!busy || !!job.running}
                      onClick={() =>
                        setDraft({
                          id: job.id,
                          name: job.name,
                          query: job.query,
                          connectionId: job.connectionId,
                          choice: fromCron(job.schedule) || blank().choice,
                        })
                      }
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon"
                      aria-label={t('ลบงาน {0}', job.name)}
                      title={t('ลบงาน')}
                      disabled={!!busy}
                      onClick={() => setRemove(job)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <h2>{t('แม่แบบ')}</h2>
          <ul className="schedule-templates">
            {SCHEDULE_TEMPLATES.map(template => (
              <li key={template.id}>
                <button className="schedule-template" disabled={!!busy || !ready.length} onClick={() => fromTemplate(template)}>
                  <strong>{t(template.name)}</strong>
                  <span className="small muted">{t(template.note)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {remove && (
        <ConfirmDialog
          title={t('ลบงาน "{0}"?', remove.name)}
          tone="danger"
          confirmLabel={t('ลบงาน')}
          onCancel={() => setRemove(null)}
          onConfirm={async () => {
            await api.call('automationRemove', { id: remove.id });
            setRemove(null);
            await load();
          }}
        >
          <p>{t('งานนี้จะไม่ทำอีก รอบที่รออยู่จะหยุด ส่วนร่างที่ทำไปแล้วยังอยู่ในรายการงาน')}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function ScheduleEditor({
  draft,
  connections,
  busy,
  onCancel,
  onSave,
}: {
  draft: Draft;
  connections: Connection[];
  busy: boolean;
  onCancel: () => void;
  onSave: (job: Draft, enabled: boolean) => Promise<void>;
}) {
  const [job, setJob] = useState(draft);
  const choice = job.choice;
  const setChoice = (next: Partial<ScheduleChoice>) => setJob({ ...job, choice: { ...choice, ...next } });
  const valid = job.name.trim() && job.query.trim() && job.connectionId && (choice.repeat !== 'days' || choice.days.length);
  // Shown in the page, not as a dialog: saving opens the app's consent prompt, which must not sit under another modal.
  return (
    <form
      className="schedule-editor"
      aria-label={job.id ? t('แก้ไขงานตั้งเวลา') : t('งานตั้งเวลาใหม่')}
      onSubmit={e => {
        e.preventDefault();
        if (valid && !busy) void onSave(job, true);
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <h2>{job.id ? t('แก้ไขงานตั้งเวลา') : t('งานตั้งเวลาใหม่')}</h2>
      <label className="field">
        {t('ชื่องาน')}
        <input
          aria-label={t('ชื่องานตั้งเวลา')}
          maxLength={120}
          value={job.name}
          placeholder={t('เช่น สรุปงานประจำสัปดาห์')}
          onChange={e => setJob({ ...job, name: e.target.value })}
        />
      </label>
      <label className="field">
        {t('ให้ผู้ช่วยทำอะไร')}
        <textarea
          aria-label={t('สิ่งที่ให้ผู้ช่วยทำ')}
          rows={4}
          maxLength={4000}
          value={job.query}
          placeholder={t('พิมพ์เหมือนสั่งงานในแชต ห้ามใส่ข้อมูลส่วนบุคคล')}
          onChange={e => setJob({ ...job, query: e.target.value })}
        />
      </label>
      <div className="schedule-when">
        <label className="field">
          {t('ทำซ้ำ')}
          <select aria-label={t('ทำซ้ำ')} value={choice.repeat} onChange={e => setChoice({ repeat: e.target.value as Repeat })}>
            {(Object.keys(REPEAT_LABELS) as Repeat[]).map(id => (
              <option key={id} value={id}>
                {t(REPEAT_LABELS[id])}
              </option>
            ))}
          </select>
        </label>
        {choice.repeat === 'hourly' ? (
          <label className="field">
            {t('นาทีที่')}
            <input
              aria-label={t('นาทีที่')}
              type="number"
              min="0"
              max="59"
              value={Number(choice.time.slice(3))}
              onChange={e => setChoice({ time: `00:${String(Math.min(59, Math.max(0, Number(e.target.value) || 0))).padStart(2, '0')}` })}
            />
          </label>
        ) : (
          <label className="field">
            {t('เวลา')}
            <input
              aria-label={t('เวลา')}
              type="time"
              value={choice.time}
              onChange={e => e.target.value && setChoice({ time: e.target.value })}
            />
          </label>
        )}
      </div>
      {choice.repeat === 'days' && (
        <div className="schedule-days" role="group" aria-label={t('วันที่ทำ')}>
          {DAY_LABELS.map((label, day) => (
            <label key={day} className={'day-chip' + (choice.days.includes(day) ? ' on' : '')}>
              <input
                type="checkbox"
                checked={choice.days.includes(day)}
                onChange={e => setChoice({ days: e.target.checked ? [...choice.days, day] : choice.days.filter(d => d !== day) })}
              />
              {t(label)}
            </label>
          ))}
        </div>
      )}
      <label className="field">
        {t('บัญชี AI')}
        <select aria-label={t('บัญชี AI ของงาน')} value={job.connectionId} onChange={e => setJob({ ...job, connectionId: e.target.value })}>
          <option value="">{t('เลือกบัญชี')}</option>
          {connections.map(c => (
            <option key={c.id} value={c.id}>
              {connectionName(c)}
            </option>
          ))}
        </select>
      </label>
      <p className="small muted">{t('กดบันทึกแล้ว แอปจะถามยืนยันอีกครั้ง ผลแต่ละรอบเป็นร่างรอตรวจ ไม่ส่งหรือเผยแพร่เอง')}</p>
      <div className="schedule-editor-actions">
        <button type="button" className="quiet" onClick={onCancel}>
          {t('ยกเลิก')}
        </button>
        <button type="submit" disabled={!valid || busy}>
          {busy && <LoaderCircle size={15} className="spin" />}
          {t('บันทึกและเปิดใช้')}
        </button>
      </div>
    </form>
  );
}
