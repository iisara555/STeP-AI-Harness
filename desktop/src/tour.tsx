import { useEffect, useLayoutEffect, useState } from 'react';

// A short spotlight tour over the real interface. Targets are marked with data-tour; a missing
// target (a hidden pane) shows its card in the middle instead of pointing at nothing.
export const tourSteps = [
  {
    target: 'new-work',
    title: 'เริ่มงานใหม่',
    body: 'แต่ละงานมีบทสนทนาและร่างของตัวเอง งานเก่าอยู่ในแถบนี้ ปักหมุด เปลี่ยนชื่อ หรือค้นจากเนื้อหาได้',
  },
  {
    target: 'composer',
    title: 'บอกงานเป็นภาษาไทยธรรมดา',
    body: 'พิมพ์สิ่งที่อยากให้ช่วย กด Enter เพื่อส่ง Shift+Enter ขึ้นบรรทัดใหม่ แนบเอกสารได้ด้วยปุ่มคลิป ระบบจะตรวจข้อมูลส่วนบุคคลก่อนส่ง',
  },
  {
    target: 'skills',
    title: 'เรียก Skill ได้ตรง ๆ',
    body: 'พิมพ์ / ในกล่องพิมพ์เพื่อเลือก Skill เช่น /receipt-audit หรือดูทั้งหมดในศูนย์รวม Skill',
  },
  {
    target: 'model',
    title: 'เลือก AI และโมเดล',
    body: 'เปลี่ยนโมเดลและระดับการคิดได้ทุกเมื่อ ระดับสูงคิดละเอียดขึ้นแต่ช้าและใช้โควตามากขึ้น',
  },
  {
    target: 'artifact',
    title: 'ร่างของคุณอยู่ตรงนี้',
    body: 'AI เสนอร่างให้ตรวจก่อนเสมอ กด “ใช้ร่างนี้” แล้วแก้ต่อได้ มีประวัติเวอร์ชันและส่งออกเป็น docx, pdf, xlsx, pptx',
  },
  { target: 'tools', title: 'เครื่องมือเฉพาะงาน', body: 'เช่น ตรวจใบเสร็จก่อนส่ง AFP ด้วย OCR ในเครื่อง' },
  { target: 'palette', title: 'ทางลัดทุกอย่าง', body: 'กด Ctrl+K (Mac: ⌘K) เพื่อค้นหางาน สลับโมเดล เปลี่ยนธีม หรือเปิดทัวร์นี้อีกครั้ง' },
];

export function Tour({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0),
    [rect, setRect] = useState<DOMRect | null>(null);
  const step = tourSteps[index],
    last = index === tourSteps.length - 1;
  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      el?.scrollIntoView({ block: 'nearest' });
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [index]);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        last ? onClose() : setIndex(i => i + 1);
      }
      if (e.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [last, onClose]);
  const pad = 6,
    card = 330;
  // Place the card beside the target, flipping to stay on screen.
  const left = rect
    ? Math.min(
        Math.max(12, rect.right + 16 + card > window.innerWidth ? rect.left - card - 16 : rect.right + 16),
        window.innerWidth - card - 12,
      )
    : window.innerWidth / 2 - card / 2;
  const top = rect ? Math.min(Math.max(12, rect.top), window.innerHeight - 220) : window.innerHeight / 2 - 100;
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={`ทัวร์แนะนำ ${index + 1} จาก ${tourSteps.length}: ${step.title}`}>
      {rect ? (
        <div
          className="tour-spot"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <section className="tour-card" style={{ left, top, width: card }}>
        <small className="muted">
          {index + 1} / {tourSteps.length}
        </small>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button className="text-link" onClick={onClose}>
            ข้ามทัวร์
          </button>
          <span className="spacer" />
          {index > 0 && (
            <button className="quiet" onClick={() => setIndex(index - 1)}>
              ย้อนกลับ
            </button>
          )}
          <button autoFocus onClick={() => (last ? onClose() : setIndex(index + 1))}>
            {last ? 'เริ่มใช้งาน' : 'ถัดไป'}
          </button>
        </div>
      </section>
    </div>
  );
}
