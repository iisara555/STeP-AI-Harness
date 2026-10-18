// Scheduled tasks are stored as five-field cron in UTC (electron/cron.ts). Employees pick a local time and days;
// these helpers turn that choice into UTC cron and read it back for display and editing.
import { nextCron } from '../electron/cron-schedule';
import type { AutomationRun } from '../electron/cron';

export type Repeat = 'daily' | 'weekdays' | 'days' | 'hourly';
export type ScheduleChoice = { repeat: Repeat; time: string; days: number[] };

/** Sunday first, as cron and Date.getDay() count them. */
export const DAY_LABELS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
export const REPEAT_LABELS: Record<Repeat, string> = {
  weekdays: 'วันทำงาน (จ.–ศ.)',
  daily: 'ทุกวัน',
  days: 'เลือกวันเอง',
  hourly: 'ทุกชั่วโมง',
};
const WEEKDAYS = [1, 2, 3, 4, 5];

const pad = (n: number) => String(n).padStart(2, '0');
const sorted = (days: number[]) => [...new Set(days)].sort((a, b) => a - b);

/** Minutes between UTC and local time at a given moment (positive east of Greenwich, +420 for Thailand). */
const offsetMinutes = (at: Date) => -at.getTimezoneOffset();

/** The employee's local choice as UTC cron. A local time that falls on the previous or next UTC day moves the days too. */
export function toCron(choice: ScheduleChoice, now = new Date()): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(choice.time);
  if (!match) throw new Error('INVALID_TIME');
  const hour = Number(match[1]),
    minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error('INVALID_TIME');
  if (choice.repeat === 'hourly') {
    const utcMinute = (((minute - offsetMinutes(now)) % 60) + 60) % 60;
    return `${utcMinute} * * * *`;
  }
  const local = hour * 60 + minute - offsetMinutes(now),
    shift = Math.floor(local / 1440),
    utc = ((local % 1440) + 1440) % 1440;
  const days = choice.repeat === 'daily' ? [] : choice.repeat === 'weekdays' ? WEEKDAYS : sorted(choice.days);
  if (choice.repeat === 'days' && !days.length) throw new Error('NO_DAYS');
  const dow = days.length ? sorted(days.map(d => (((d + shift) % 7) + 7) % 7)).join(',') : '*';
  return `${utc % 60} ${Math.floor(utc / 60)} * * ${dow}`;
}

export function previewSchedule(choice: ScheduleChoice, now = Date.now()) {
  const schedule = toCron(choice, new Date(now));
  return { schedule, nextAt: nextCron(schedule, now) };
}

/** Only fixed, staff-facing messages; provider errors and unknown codes are never rendered verbatim. */
export function scheduledRunAdvice(
  run?: Pick<AutomationRun, 'status' | 'code'>,
): { message: string; action?: 'edit' | 'connections' } | null {
  if (run?.status === 'interrupted') return { message: 'รอบล่าสุดหยุดเมื่อแอปปิด ตรวจร่างเดิมก่อนกด "ทำตอนนี้" เพื่อลองใหม่' };
  if (run?.status !== 'error') return null;
  switch (run.code) {
    case 'LOGIN_REQUIRED':
    case 'COPILOT_LOGIN_REQUIRED':
    case 'CONNECTION_NOT_READY':
    case 'CONNECTION_NOT_FOUND':
      return { message: 'บัญชี AI ของงานยังไม่พร้อม เชื่อมต่อและทดสอบบัญชีอีกครั้ง แล้วกด "ทำตอนนี้"', action: 'connections' };
    case 'AUTOMATION_CONTEXT_CHANGED':
      return { message: 'บัญชี AI โมเดล ทีม หรือพื้นที่งานเปลี่ยนแล้ว ตรวจและบันทึกการตั้งค่าใหม่ก่อนลองอีกครั้ง', action: 'edit' };
    case 'POLICY_CHANGED':
      return { message: 'นโยบายการใช้งานเปลี่ยนแล้ว ตรวจการตั้งค่าและคำสั่งก่อนบันทึกใหม่', action: 'edit' };
    case 'PRIVACY_REVIEW_REQUIRED':
    case 'AUTHORITY_REVIEW_REQUIRED':
      return { message: 'คำสั่งของงานต้องผ่านการตรวจทาน ตรวจและแก้คำสั่งก่อนบันทึกใหม่', action: 'edit' };
    case 'CRON_DISABLED':
      return { message: 'รอบล่าสุดหยุดเพราะผู้ดูแลปิดงานตั้งเวลาไว้ ติดต่อผู้ดูแลหากยังเปิดใช้ไม่ได้' };
    case 'PROVIDER_TIMEOUT':
    case 'RUN_TIMEOUT':
    case 'RUNTIME_EXITED':
      return { message: 'การเชื่อมต่อ AI หยุดหรือตอบไม่ทัน ตรวจอินเทอร์เน็ตแล้วกด "ทำตอนนี้" เพื่อลองใหม่' };
    default:
      return {
        message: 'รอบล่าสุดทำงานไม่สำเร็จ ตรวจผลของรอบนั้นและการเชื่อมต่อ AI ก่อนกด "ทำตอนนี้" เพื่อลองใหม่',
        action: 'connections',
      };
  }
}

const parseDays = (field: string) => {
  const days = new Set<number>();
  for (const part of field.split(',')) {
    const range = /^(\d)(?:-(\d))?$/.exec(part);
    if (!range) return null;
    for (let d = Number(range[1]); d <= Number(range[2] ?? range[1]); d++) days.add(d % 7);
  }
  return [...days];
};

/** Reads cron this page wrote (or the old presets) back into a local choice; anything else returns null. */
export function fromCron(cron: string, now = new Date()): ScheduleChoice | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5 || parts[2] !== '*' || parts[3] !== '*' || !/^\d{1,2}$/.test(parts[0])) return null;
  const minute = Number(parts[0]);
  if (parts[1] === '*' && parts[4] === '*') {
    const local = (((minute + offsetMinutes(now)) % 60) + 60) % 60;
    return { repeat: 'hourly', time: `00:${pad(local)}`, days: [] };
  }
  if (!/^\d{1,2}$/.test(parts[1])) return null;
  const utc = Number(parts[1]) * 60 + minute + offsetMinutes(now),
    shift = Math.floor(utc / 1440),
    local = ((utc % 1440) + 1440) % 1440;
  const time = `${pad(Math.floor(local / 60))}:${pad(local % 60)}`;
  if (parts[4] === '*') return { repeat: 'daily', time, days: [] };
  const days = parseDays(parts[4]);
  if (!days) return null;
  const localDays = sorted(days.map(d => (((d + shift) % 7) + 7) % 7));
  if (localDays.join(',') === WEEKDAYS.join(',')) return { repeat: 'weekdays', time, days: [] };
  return { repeat: 'days', time, days: localDays };
}

/** Thai words for a schedule, such as "วันทำงาน (จ.–ศ.) เวลา 08:30 น." */
export function describeSchedule(cron: string, now = new Date()) {
  const choice = fromCron(cron, now);
  if (!choice) return { text: 'ตารางที่ผู้ดูแลกำหนด', args: [] as string[] };
  if (choice.repeat === 'hourly') return { text: 'ทุกชั่วโมง นาทีที่ {0}', args: [choice.time.slice(3)] };
  if (choice.repeat === 'days') return { text: 'ทุก {0} เวลา {1} น.', args: [choice.days.map(d => DAY_LABELS[d]).join(' '), choice.time] };
  return { text: choice.repeat === 'daily' ? 'ทุกวัน เวลา {0} น.' : 'วันทำงาน (จ.–ศ.) เวลา {0} น.', args: [choice.time] };
}

export type ScheduleTemplate = { id: string; name: string; query: string; choice: ScheduleChoice; note: string };

/** Ready-made tasks. Each works from organization documents and the employee's own notes, not from their accounts. */
export const SCHEDULE_TEMPLATES: ScheduleTemplate[] = [
  {
    id: 'weekly-summary',
    name: 'สรุปงานประจำสัปดาห์',
    query:
      'ร่างสรุปงานประจำสัปดาห์ของฉันเป็นหัวข้อ: งานที่เสร็จแล้ว งานที่ยังค้าง ปัญหาที่ต้องให้หัวหน้าช่วย และสิ่งที่จะทำสัปดาห์หน้า ใส่ [รอยืนยัน] ในส่วนที่ฉันต้องเติมเอง',
    choice: { repeat: 'days', time: '16:00', days: [5] },
    note: 'ทุกวันศุกร์ 16:00 น. ได้ร่างสรุปให้เติมและส่งหัวหน้า',
  },
  {
    id: 'weekly-agenda',
    name: 'ร่างวาระประชุมประจำสัปดาห์',
    query:
      'ร่างวาระการประชุมประจำสัปดาห์ของทีมตามรูปแบบรายงานการประชุมขององค์กร มีเรื่องแจ้งเพื่อทราบ เรื่องสืบเนื่อง เรื่องเพื่อพิจารณา และเรื่องอื่น ๆ ใส่ [รอยืนยัน] ในรายละเอียดที่ยังไม่รู้',
    choice: { repeat: 'days', time: '08:30', days: [1] },
    note: 'ทุกวันจันทร์ 08:30 น. ได้ร่างวาระพร้อมแก้ก่อนประชุม',
  },
  {
    id: 'afp-checklist',
    name: 'รายการตรวจก่อนส่งเบิก AFP',
    query:
      'สรุปขั้นตอนและเอกสารที่ต้องเตรียมก่อนส่งเบิก AFP จากเอกสารขององค์กร เป็นรายการตรวจสั้น ๆ ที่ติ๊กได้ พร้อมบอกว่าแต่ละข้อมาจากเอกสารใด',
    choice: { repeat: 'days', time: '09:00', days: [1] },
    note: 'ทุกวันจันทร์ 09:00 น. ทบทวนก่อนเริ่มรอบเบิก',
  },
];
