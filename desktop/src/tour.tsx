import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from './i18n';

// A spotlight tour over the real interface, in two parts: the basics every staff member needs to start a task, then the
// task-specific tools. Targets are marked with data-tour. A step without a target is a card in the middle; an optional
// step whose target is not on screen (e.g. the starter list once a task is open) is left out, and any other step whose
// target is hidden shows its card in the middle instead of pointing at nothing.
type TourStep = {
  chapter: 0 | 1;
  target?: string;
  optional?: boolean;
  title: string;
  body: string;
  tip?: string;
};

export const tourChapters = ['พื้นฐาน', 'เครื่องมือช่วยงาน'];

export const tourSteps: TourStep[] = [
  {
    chapter: 0,
    title: 'ยินดีต้อนรับสู่ STeP Desktop',
    body: 'ผู้ช่วย AI ของ STeP ช่วยร่าง สรุป และตรวจงานให้ คุณแค่บอกเป็นภาษาไทยธรรมดา ไม่ต้องเขียนโปรแกรม และ AI จะเสนอร่างให้คุณตรวจก่อนใช้จริงเสมอ',
    tip: 'ทัวร์มี 2 ส่วน: พื้นฐานสำหรับเริ่มงาน และเครื่องมือช่วยงาน กดปุ่มลูกศร ← → บนคีย์บอร์ดเพื่อเลื่อนได้',
  },
  {
    chapter: 0,
    target: 'new-work',
    title: 'เริ่มงานใหม่ 1 เรื่อง ต่อ 1 งาน',
    body: 'แต่ละงานมีบทสนทนาและร่างของตัวเอง งานเก่าอยู่ในรายการใต้ปุ่มนี้ ค้นหา ปักหมุด หรือเปลี่ยนชื่อได้',
    tip: 'แยกงานคนละเรื่องไว้คนละงาน AI จะได้ไม่สับสนข้อมูล',
  },
  {
    chapter: 0,
    target: 'starters',
    optional: true,
    title: 'ไม่รู้จะเริ่มอย่างไร กดตัวอย่างงาน',
    body: 'ตัวอย่างงานเลือกมาตามทีมของคุณ กดแล้วข้อความจะไปอยู่ในกล่องพิมพ์ แก้รายละเอียดให้ตรงงานจริงก่อนส่งได้',
  },
  {
    chapter: 0,
    target: 'composer',
    title: 'สั่งงานเป็นภาษาไทยธรรมดา',
    body: 'บอกเหมือนฝากงานเพื่อนร่วมงาน: อยากได้อะไร ใช้กับใคร ยาวแค่ไหน กด Enter เพื่อส่ง Shift+Enter เพื่อขึ้นบรรทัดใหม่',
    tip: 'ตัวอย่าง: “สรุปไฟล์นี้เป็น 5 ข้อ สำหรับรายงานผู้บริหาร ใช้ภาษาทางการ”',
  },
  {
    chapter: 0,
    target: 'attach',
    title: 'แนบไฟล์ให้ AI อ่าน',
    body: 'ปุ่ม + แนบไฟล์ Word, PDF, Excel ได้ ระบบตรวจและปิดบังข้อมูลส่วนบุคคล เช่น เลขบัตรประชาชน เบอร์โทร แล้วให้คุณดูข้อความก่อนส่งทุกครั้ง',
  },
  {
    chapter: 0,
    target: 'mode',
    title: 'เลือกวิธีทำงาน',
    body: '“คุยกับผู้ช่วย” ใช้ได้กับงานส่วนใหญ่ งานใหญ่หลายขั้นเลือก “วางแผนก่อนลงมือ” ให้ AI เสนอแผนให้คุณอนุมัติก่อน และเลือก “สร้างรูป” เมื่ออยากได้ภาพ',
    tip: 'ช่องถัดไปคือสิทธิ์เครื่องมือ ค่า “ถามก่อนแก้ไข” หมายถึง AI ต้องขออนุญาตคุณก่อนแก้ไฟล์ในเครื่อง',
  },
  {
    chapter: 0,
    target: 'connect',
    optional: true,
    title: 'ยังไม่ได้เชื่อมต่อ AI เริ่มตรงนี้',
    body: 'ก่อนสั่งงานครั้งแรก ต้องเชื่อมต่อบัญชี AI 1 บัญชี กดลิงก์นี้แล้วเลือกบริการที่หน่วยงานใช้ ลงชื่อเข้าใช้ในเบราว์เซอร์ แล้วกลับมาที่แอป',
    tip: 'ไม่แน่ใจว่าใช้บัญชีไหน ถามผู้ดูแลระบบของทีม',
  },
  {
    chapter: 0,
    target: 'artifact',
    title: 'ตรวจร่างก่อนใช้จริง',
    body: 'เมื่อ AI ร่างเอกสาร ร่างจะเปิดในแผงทางขวา กด “ใช้ร่างนี้” แล้วแก้ต่อได้ มีประวัติเวอร์ชัน และส่งออกเป็น Word, PDF, Excel หรือ PowerPoint',
    tip: 'AI ร่าง คนตรวจและอนุมัติ ตรวจตัวเลข ชื่อ และวันที่ทุกครั้งก่อนส่งต่อ',
  },
  {
    chapter: 1,
    target: 'documents',
    title: 'เครื่องมือร่างเอกสาร',
    body: 'ร่าง TOR บันทึกข้อความ หนังสือราชการ โครงการ และรายงานการประชุมตามแบบของ STeP กรอกข้อมูลไม่กี่ช่อง แนบไฟล์อ้างอิงได้ แล้วส่งออกเป็น Word',
  },
  {
    chapter: 1,
    target: 'receipt',
    title: 'ตรวจใบเสร็จก่อนส่ง AFP',
    body: 'แนบรูปหรือสแกนใบเสร็จ ระบบอ่านตัวอักษรด้วย OCR (อ่านข้อความจากภาพ) ในเครื่องของคุณ แล้วบอกว่าข้อมูลครบไหมและควรเบิกหมวดใด',
    tip: 'ยังเป็นรุ่นทดลอง ตรวจผลกับใบเสร็จจริงอีกครั้งก่อนส่ง',
  },
  {
    chapter: 1,
    target: 'skills',
    title: 'Skill คือสูตรงานสำเร็จรูป',
    body: 'Skill รวมขั้นตอนและแบบฟอร์มของงานที่ทำบ่อยไว้ให้ AI ทำตาม ดูทั้งหมดได้ที่นี่ หรือพิมพ์ / ในกล่องพิมพ์เพื่อเลือก Skill เช่น /receipt-audit',
  },
  {
    chapter: 1,
    target: 'model',
    optional: true,
    title: 'เลือก AI และระดับการคิด',
    body: 'ปกติใช้ค่าเริ่มต้นได้เลย เปลี่ยนโมเดลหรือระดับการคิดได้ทุกเมื่อ ระดับสูงคิดละเอียดขึ้นแต่ช้าและใช้โควตามากขึ้น',
  },
  {
    chapter: 1,
    target: 'settings',
    title: 'ตั้งค่าให้เป็นของคุณ',
    body: 'เชื่อมต่อบัญชี AI เปลี่ยนทีม เลือกสไตล์การพูดของผู้ช่วย และสลับธีมสว่างหรือมืดได้ที่นี่',
  },
  {
    chapter: 1,
    target: 'version',
    title: 'รุ่นของแอปและการอัปเดต',
    body: 'ใต้ชื่อของคุณบอกรุ่นที่ใช้อยู่ เมื่อมีรุ่นใหม่จะขึ้นปุ่มอัปเดตตรงนี้ ข้อมูลและงานเดิมยังอยู่ครบหลังอัปเดต',
  },
  {
    chapter: 1,
    target: 'palette',
    title: 'ลืมว่าอยู่ตรงไหน กด Ctrl+K',
    body: 'กด Ctrl+K (Mac: ⌘K) เพื่อค้นหางานและทุกคำสั่ง เช่น ดูการใช้งาน AI, ความจำของผู้ช่วย, กล่องบทเรียน, มีอะไรใหม่ในรุ่นนี้ หรือเปิดทัวร์นี้อีกครั้ง',
  },
];

const present = (target?: string) => !!target && !!document.querySelector(`[data-tour="${target}"]`);

export function Tour({ onClose }: { onClose: () => void }) {
  // Which steps to show is decided once, when the tour opens, so the count does not jump around.
  const steps = useMemo(() => tourSteps.filter(s => !s.optional || present(s.target)), []);
  const [index, setIndex] = useState(0),
    [rect, setRect] = useState<DOMRect | null>(null),
    [height, setHeight] = useState(240);
  const card = useRef<HTMLElement>(null);
  const step = steps[index],
    last = index === steps.length - 1,
    // The end of the basics is a stop: people can start working there or carry on into the tools.
    checkpoint = !last && steps[index + 1].chapter !== step.chapter,
    inChapter = steps.filter(s => s.chapter === step.chapter),
    position = inChapter.indexOf(step);
  useLayoutEffect(() => {
    const measure = () => {
      const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
      el?.scrollIntoView({ block: 'nearest' });
      const box = el?.getBoundingClientRect();
      setRect(box && box.width && box.height ? box : null);
      if (card.current) setHeight(card.current.offsetHeight);
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
    width = 360;
  // Place the card beside the target, flipping to stay on screen.
  const left = rect
    ? Math.min(
        Math.max(12, rect.right + 16 + width > window.innerWidth ? rect.left - width - 16 : rect.right + 16),
        window.innerWidth - width - 12,
      )
    : window.innerWidth / 2 - width / 2;
  const top = rect ? Math.min(Math.max(12, rect.top), window.innerHeight - height - 12) : Math.max(12, window.innerHeight / 2 - height / 2);
  return (
    <div
      className="tour"
      role="dialog"
      aria-modal="true"
      aria-label={t('ทัวร์แนะนำ {0} จาก {1}: {2}', index + 1, steps.length, t(step.title))}
    >
      {rect ? (
        <div
          className="tour-spot"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <section ref={card} className={`tour-card${step.target ? '' : ' tour-center'}`} style={{ left, top, width }}>
        <div className="tour-chapters" aria-hidden="true">
          {tourChapters.map((name, i) => (
            <span key={name} className={i === step.chapter ? 'active' : i < step.chapter ? 'done' : ''}>
              {t('ส่วนที่ {0}', i + 1)} · {t(name)}
            </span>
          ))}
        </div>
        <h2>{t(step.title)}</h2>
        <p>{t(step.body)}</p>
        {step.tip && <p className="tour-tip">{t(step.tip)}</p>}
        {checkpoint && (
          <p className="tour-tip tour-checkpoint">
            {t('พื้นฐานครบแล้ว เริ่มงานแรกได้เลย หรือดูเครื่องมือช่วยงานต่ออีก {0} ขั้น', steps.length - index - 1)}
          </p>
        )}
        <div className="tour-progress">
          <span className="tour-dots" aria-hidden="true">
            {inChapter.map((s, i) => (
              <i key={s.title} className={i === position ? 'active' : i < position ? 'done' : ''} />
            ))}
          </span>
          <small className="muted">
            {index + 1} / {steps.length}
          </small>
        </div>
        <div className="tour-actions">
          {!checkpoint && !last && (
            <button className="text-link" onClick={onClose}>
              {t('ข้ามทัวร์')}
            </button>
          )}
          <span className="spacer" />
          {index > 0 && (
            <button className="quiet" onClick={() => setIndex(index - 1)}>
              {t('ย้อนกลับ')}
            </button>
          )}
          {checkpoint && (
            <button className="quiet" onClick={onClose}>
              {t('เริ่มใช้งานเลย')}
            </button>
          )}
          <button autoFocus onClick={() => (last ? onClose() : setIndex(index + 1))}>
            {last ? t('เริ่มใช้งาน') : checkpoint ? t('ดูเครื่องมือต่อ') : index === 0 ? t('เริ่มทัวร์') : t('ถัดไป')}
          </button>
        </div>
      </section>
    </div>
  );
}
