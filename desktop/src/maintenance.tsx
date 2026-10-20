import { useEffect, useState } from 'react';
import { ChevronRight } from './icons';
import { explainError, shownDate } from './messages';
import type { DesktopAPI, MaintenanceBoard, MaintenanceItem, MaintenanceKind, MaintenanceStatus } from './types';
import { localized, t } from './i18n';

// The maintenance board (electron/maintenance.ts): what the daily local check found, and what to do about it. The
// board never changes a memory, lesson or Skill itself; the employee fixes it where it lives, then moves it to done.
const problems: Record<MaintenanceKind, string> = localized({
  'memory-expired': 'ความจำหมดอายุแล้ว: ลบ หรือแก้ข้อความแล้วตั้งอายุใหม่',
  'memory-stale': 'ความจำไม่ได้ทบทวนเกิน 180 วัน: ตรวจว่ายังจริงอยู่ไหม แล้วแก้หรือลบ',
  'memory-ephemeral': 'ความจำเก็บข้อมูลชั่วคราว (ความคืบหน้างาน เลขงาน หรือบันทึกระบบ): ลบ หรือเขียนใหม่เป็นข้อเท็จจริงถาวร',
  'memory-duplicate': 'ความจำสองรายการเนื้อหาเกือบเหมือนกัน: รวมเป็นรายการเดียว แล้วลบอีกรายการ',
  'lesson-repeated': 'บทเรียนนี้ยังต้องแก้เรื่องเดิมซ้ำ: เขียนบทเรียนให้ชัดขึ้นในกล่องบทเรียน',
  'lesson-fix': 'คำตอบที่ใช้บทเรียนนี้ถูกกด "ต้องแก้" บ่อยกว่า "ดี": ทบทวนหรือปิดบทเรียน',
  'lesson-unused': 'บทเรียนนี้ไม่ถูกใช้เกิน 90 วัน: ปิดถ้าไม่จำเป็นแล้ว',
  'lesson-ephemeral': 'บทเรียนเก็บข้อมูลชั่วคราว: แก้ให้เหลือแต่วิธีทำงานที่ใช้ซ้ำได้',
  'lesson-duplicate': 'บทเรียนสองข้อเนื้อหาเกือบเหมือนกัน: รวมเป็นข้อเดียว แล้วปิดอีกข้อ',
  'pack-invalid': 'Skill Pack ที่ติดตั้งอ่านไม่ได้: นำเข้าใหม่หรือลบออก',
  'pack-review': 'Skill Pack ที่เปิดใช้มีผลตรวจที่ต้องแก้: เปิดผลตรวจใน Skill Pack แล้วแก้ไฟล์ Skill',
});
const areas: Record<string, string> = localized({ memory: 'ความจำ', lesson: 'บทเรียน', skill: 'Skill' });
const columns: { status: MaintenanceStatus; label: string }[] = [
  { status: 'todo', label: 'ต้องทำ' },
  { status: 'doing', label: 'กำลังแก้' },
  { status: 'done', label: 'เสร็จแล้ว' },
];
const day = (iso: string) => shownDate(iso);

export function MaintenancePanel({ api, version }: { api: DesktopAPI; version: number }) {
  const [state, setState] = useState<{ enabled: boolean; board?: MaintenanceBoard }>(),
    [open, setOpen] = useState(false),
    [note, setNote] = useState(''),
    [busy, setBusy] = useState(false);
  const act = async (run: () => Promise<{ enabled: boolean; board?: MaintenanceBoard; verified?: boolean }>) => {
    if (busy) return;
    setBusy(true);
    setNote('');
    try {
      const next = await run();
      setState(next);
      if (next.verified === false) setNote(t('ตรวจอีกครั้งแล้วยังพบปัญหาเดิม จึงย้ายกลับไป "ต้องทำ"'));
    } catch (e) {
      setNote(explainError(e));
    } finally {
      setBusy(false);
    }
  };
  // Re-read after the Memory dialog changes something, so an item fixed there can close.
  useEffect(() => {
    void act(() => api.call('maintenanceList'));
  }, [version]);
  if (!state?.enabled) return null;
  const items = state.board?.items || [];
  const waiting = items.filter(i => i.status === 'todo' || i.status === 'doing').length;
  const move = (item: MaintenanceItem, status: MaintenanceStatus) => void act(() => api.call('maintenanceMove', { id: item.id, status }));
  return (
    <section className="maintenance">
      {/* A disclosure, so it reads as one: chevron first, text left-aligned, like the other folds in the app. */}
      <button className="quiet maintenance-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronRight size={16} aria-hidden="true" className="maintenance-chevron" />
        <span>{waiting ? t('งานดูแลข้อมูลที่จำและ Skill ({0})', waiting) : t('งานดูแลข้อมูลที่จำและ Skill: ไม่มีงานค้าง')}</span>
      </button>
      {open && (
        <>
          <p className="small muted">
            {t(
              'แอปตรวจข้อมูลที่จำ บทเรียน และ Skill Pack บนเครื่องนี้วันละครั้ง ไม่ส่งข้อมูลออกและไม่แก้หรือลบเอง เมื่อคุณแก้แล้ว ย้ายงานเป็น "เสร็จแล้ว" เพื่อให้แอปตรวจซ้ำ',
            )}
            {state.board ? ` ${t('ตรวจล่าสุด {0}', day(state.board.checkedAt))}` : ''}
          </p>
          <button className="quiet" disabled={busy} onClick={() => void act(() => api.call('maintenanceRun'))}>
            {t('ตรวจตอนนี้')}
          </button>
          {note && <p role="status">{note}</p>}
          <div className="maintenance-board">
            {columns.map(column => {
              const list = items.filter(i => i.status === column.status).slice(0, column.status === 'done' ? 10 : 50);
              return (
                <div key={column.status} className="maintenance-column">
                  <h4>
                    {t(column.label)} ({list.length})
                  </h4>
                  {list.map(item => (
                    <article key={item.id} className="maintenance-item">
                      <strong>{item.name}</strong>
                      <span className="muted small"> · {areas[item.area]}</span>
                      <p className="small">{problems[item.kind]}</p>
                      {item.reopened && <p className="small">{t('เคยย้ายเป็นเสร็จแล้ว แต่ยังพบปัญหาเดิม')}</p>}
                      {item.status === 'done' && item.resolvedAt && (
                        <p className="muted small">
                          {item.resolvedBy === 'check' ? t('ตรวจแล้วไม่พบปัญหานี้แล้ว') : t('ยืนยันแล้วว่าแก้ครบ')} · {day(item.resolvedAt)}
                        </p>
                      )}
                      {item.status === 'todo' && (
                        <button className="quiet" disabled={busy} onClick={() => move(item, 'doing')}>
                          {t('เริ่มทำ')}
                        </button>
                      )}
                      {item.status !== 'done' && (
                        <button className="quiet" disabled={busy} onClick={() => move(item, 'done')}>
                          {t('แก้แล้ว ตรวจอีกครั้ง')}
                        </button>
                      )}
                      {item.status !== 'done' && (
                        <button className="quiet" disabled={busy} onClick={() => move(item, 'dismissed')}>
                          {t('ไม่ต้องทำ')}
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
