import { useEffect, useState } from 'react';
import { ConfirmDialog } from './ui';
import { explainError } from './messages';
import type { DesktopAPI, MemoryEntry, MemoryProposal, Settings } from './types';
import { localized, t } from './i18n';

type Edit = Pick<MemoryEntry, 'name' | 'text' | 'type' | 'scope' | 'importance' | 'ttl_days'> & { id?: string; proposal?: boolean };
const fresh = (): Edit => ({ name: '', text: '', type: 'user', scope: 'private', importance: 0.7, ttl_days: 0 });
const scopes: Record<string, string> = localized({ private: 'ส่วนตัว', project: 'พื้นที่งาน', team: 'ทีม' });
export function MemoryDialog({
  api,
  settings,
  onClose,
  refresh,
}: {
  api: DesktopAPI;
  settings: Settings;
  onClose: () => void;
  refresh: () => Promise<unknown>;
}) {
  const [data, setData] = useState<{ entries: MemoryEntry[]; proposals: MemoryProposal[]; teamEnabled: boolean }>(),
    [edit, setEdit] = useState<Edit>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const load = async () => {
    setData(await api.call('memoryList'));
  };
  useEffect(() => {
    void load().catch(e => setError(explainError(e)));
  }, []);
  const act = async (run: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await run();
      await load();
      await refresh();
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ConfirmDialog title={t('ความจำ')} confirmLabel={t('ปิด')} onConfirm={onClose} onCancel={onClose}>
      <p className="small muted">
        {t(
          'บันทึกเฉพาะข้อมูลที่ไม่มีข้อมูลส่วนบุคคลหรือความลับ ความจำที่ยืนยันแล้วอาจถูกเลือกส่งให้ AI ในงานถัดไป คุณจะได้ตรวจบริบทก่อนส่ง',
        )}
      </p>
      {error && <p role="alert">{error}</p>}
      {!edit && (
        <button className="quiet" disabled={busy} onClick={() => setEdit(fresh())}>
          {t('เพิ่มความจำ')}
        </button>
      )}
      {edit && (
        <form
          className="memory-editor"
          onSubmit={e => {
            e.preventDefault();
            void act(async () => {
              await api.call(edit.proposal ? 'memoryConfirm' : 'memorySave', edit);
              setEdit(undefined);
            });
          }}
        >
          <label>
            {t('ชื่อความจำ')}
            <input
              aria-label={t('ชื่อความจำ')}
              value={edit.name}
              maxLength={120}
              onChange={e => setEdit({ ...edit, name: e.target.value })}
              required
            />
          </label>
          <label>
            {t('ข้อความ')}
            <textarea
              aria-label={t('ข้อความความจำ')}
              value={edit.text}
              maxLength={4000}
              rows={5}
              onChange={e => setEdit({ ...edit, text: e.target.value })}
              required
            />
          </label>
          <label>
            {t('ขอบเขต')}
            <select
              aria-label={t('ขอบเขตความจำ')}
              value={edit.scope}
              disabled={Boolean(edit.id && !edit.proposal)}
              onChange={e => setEdit({ ...edit, scope: e.target.value as Edit['scope'] })}
            >
              <option value="private">{t('ส่วนตัว')}</option>
              <option value="project" disabled={!settings.workspace}>
                {t('พื้นที่งาน')}
              </option>
              <option value="team" disabled={!data?.teamEnabled}>
                {t('ทีม')}
              </option>
            </select>
          </label>
          <label>
            {t('ประเภท')}
            <select value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value as Edit['type'] })}>
              <option value="user">{t('ความชอบในการทำงาน')}</option>
              <option value="feedback">{t('ข้อแก้ไข')}</option>
              <option value="project">{t('บริบทโครงการ')}</option>
              <option value="reference">{t('ข้อมูลอ้างอิง')}</option>
            </select>
          </label>
          <label>
            {t('ความสำคัญ (0–1)')}
            <input
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={edit.importance}
              onChange={e => setEdit({ ...edit, importance: Number(e.target.value) })}
            />
          </label>
          <label>
            {t('อายุความจำ (วัน; 0 = ไม่หมดอายุ)')}
            <input
              type="number"
              min="0"
              max="3650"
              value={edit.ttl_days}
              onChange={e => setEdit({ ...edit, ttl_days: Number(e.target.value) })}
            />
          </label>
          <button type="submit" disabled={busy}>
            {t('ยืนยันบันทึกความจำ')}
          </button>
          <button type="button" className="quiet" onClick={() => setEdit(undefined)}>
            {t('ยกเลิกการแก้ไข')}
          </button>
        </form>
      )}
      {data?.proposals.length ? <h3>{t('ข้อเสนอที่รอยืนยัน')}</h3> : null}
      {data?.proposals.map(p => (
        <article className="memory-item" key={p.id}>
          <p>{p.text}</p>
          <p className="muted small">
            {t('หลักฐานจากคำขอ:')} {p.evidence}
          </p>
          <button className="quiet" disabled={busy} onClick={() => setEdit({ ...p, proposal: true })}>
            {t('ตรวจและยืนยัน')}
          </button>
          <button className="quiet" disabled={busy} onClick={() => void act(() => api.call('memoryDismiss', { id: p.id }))}>
            {t('ไม่บันทึก')}
          </button>
        </article>
      ))}
      <h3>{t('ความจำที่บันทึกแล้ว')}</h3>
      {data?.entries.map(m => (
        <article className="memory-item" key={m.id}>
          <strong>{m.name}</strong>
          <span className="muted small">
            {' '}
            · {scopes[m.scope]}
            {m.expired ? t(' · หมดอายุแล้ว') : ''}
          </span>
          <p>{m.text}</p>
          <button className="quiet" disabled={busy} onClick={() => setEdit(m)}>
            {t('แก้ไข')}
          </button>
          <button className="quiet" disabled={busy} onClick={() => void act(() => api.call('memoryDelete', { id: m.id }))}>
            {t('ลบความจำ')}
          </button>
        </article>
      ))}
      {data && !data.entries.length && <p className="muted">{t('ยังไม่มีความจำที่ยืนยันแล้ว')}</p>}
    </ConfirmDialog>
  );
}
