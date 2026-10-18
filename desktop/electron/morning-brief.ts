import type { GoogleRequest } from './google-operations';

// สรุปเช้านี้ (design: the project's shared folder, google-workspace/morning-brief-design-2026-10-17.md, owner's
// decisions of 2026-10-17). Reads today's Calendar and Google Tasks with three fixed read-only operations after one
// consent, and works the summary out locally: no model call, nothing written, nothing kept beyond today in memory.

/** Thai time, as everywhere else in the app's schedules. */
export const BRIEF_OFFSET = '+07:00';
const OFFSET_MS = 7 * 3600_000;
const MAX_EVENT_PAGES = 3,
  MAX_TASK_LISTS = 5,
  MAX_TASK_PAGES = 3;

export type BriefEvent = {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  meet?: string;
  tentative?: boolean;
  conflict?: boolean;
};
export type BriefTask = { title: string; due: string; list: string };
export type BriefTip = { text: string; args: string[] };
export type MorningBrief = {
  date: string;
  retrievedAt: string;
  events: BriefEvent[];
  dueToday: BriefTask[];
  overdue: BriefTask[];
  tips: BriefTip[];
  /** What could not be read in full, so the card never claims more than it saw. */
  gaps: BriefTip[];
};

/** The local calendar day (YYYY-MM-DD) and its [start, next start) range in Thai time. */
export function briefDay(now: number) {
  const local = new Date(now + OFFSET_MS).toISOString().slice(0, 10);
  const next = new Date(Date.parse(local + 'T00:00:00Z') + 86400_000).toISOString().slice(0, 10);
  return { date: local, timeMin: `${local}T00:00:00${BRIEF_OFFSET}`, timeMax: `${next}T00:00:00${BRIEF_OFFSET}` };
}

const clock = (iso: string) => new Date(Date.parse(iso) + OFFSET_MS).toISOString().slice(11, 16);
const text = (value: unknown, limit = 200) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '');

/** Pure: Google's raw event and task items to today's brief. The same input always gives the same brief. */
export function summarizeDay(input: {
  events: any[];
  tasks: { list: string; items: any[] }[];
  now: number;
  gaps?: BriefTip[];
}): MorningBrief {
  const { date } = briefDay(input.now);
  const events: BriefEvent[] = [];
  for (const e of input.events) {
    if (!e || e.status === 'cancelled') continue;
    const me = Array.isArray(e.attendees) ? e.attendees.find((a: any) => a?.self) : undefined;
    if (me?.responseStatus === 'declined') continue;
    const allDay = typeof e.start?.date === 'string';
    const start = allDay ? text(e.start.date, 10) : text(e.start?.dateTime, 40);
    const end = allDay ? text(e.end?.date, 10) : text(e.end?.dateTime, 40);
    if (!start || (!allDay && !Number.isFinite(Date.parse(start)))) continue;
    const meet = text(e.hangoutLink, 120);
    events.push({
      title: text(e.summary) || '(ไม่มีชื่อนัด)',
      start,
      end,
      allDay,
      ...(text(e.location) ? { location: text(e.location) } : {}),
      ...(/^https:\/\/meet\.google\.com\//.test(meet) ? { meet } : {}),
      ...(e.status === 'tentative' || me?.responseStatus === 'needsAction' || me?.responseStatus === 'tentative'
        ? { tentative: true }
        : {}),
    });
  }
  const timed = events.filter(e => !e.allDay).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const tips: BriefTip[] = [];
  for (let i = 0; i < timed.length; i++)
    for (let j = i + 1; j < timed.length; j++) {
      if (Date.parse(timed[j].start) >= Date.parse(timed[i].end)) break;
      timed[i].conflict = timed[j].conflict = true;
      tips.push({
        text: 'นัด {0} ({1}) ชนกับ {2} ({3})',
        args: [timed[i].title, clock(timed[i].start), timed[j].title, clock(timed[j].start)],
      });
    }
  for (let i = 0; i + 1 < timed.length; i++) {
    const gap = Date.parse(timed[i + 1].start) - Date.parse(timed[i].end);
    if (gap >= 0 && gap < 10 * 60_000 && timed[i].location && timed[i + 1].location && timed[i].location !== timed[i + 1].location)
      tips.push({ text: 'จาก {0} ไป {1} มีเวลาเปลี่ยนสถานที่ไม่ถึง 10 นาที', args: [timed[i].title, timed[i + 1].title] });
  }
  // The longest free stretch inside working hours (08:30-16:30), worth keeping for focused work when it is 2 hours or more.
  const dayStart = Date.parse(`${date}T08:30:00${BRIEF_OFFSET}`),
    dayEnd = Date.parse(`${date}T16:30:00${BRIEF_OFFSET}`);
  let cursor = dayStart,
    best: [number, number] | undefined;
  for (const e of timed) {
    const s = Math.max(Date.parse(e.start), dayStart),
      f = Math.min(Date.parse(e.end), dayEnd);
    if (s > cursor && (!best || s - cursor > best[1] - best[0])) best = [cursor, Math.min(s, dayEnd)];
    cursor = Math.max(cursor, f);
  }
  if (cursor < dayEnd && (!best || dayEnd - cursor > best[1] - best[0])) best = [cursor, dayEnd];
  if (best && best[1] - best[0] >= 2 * 3600_000 && timed.length)
    tips.push({
      text: 'ช่วงว่าง {0}–{1} น. เหมาะทำงานที่ต้องใช้สมาธิ',
      args: [clock(new Date(best[0]).toISOString()), clock(new Date(best[1]).toISOString())],
    });
  const dueToday: BriefTask[] = [],
    overdue: BriefTask[] = [];
  for (const list of input.tasks)
    for (const t of list.items) {
      if (!t || t.status === 'completed' || t.deleted || t.hidden || typeof t.due !== 'string') continue;
      // Google Tasks keeps only the due date; its time part is always midnight UTC.
      const due = t.due.slice(0, 10);
      const task = { title: text(t.title) || '(ไม่มีชื่องาน)', due, list: text(list.list, 80) };
      if (due === date) dueToday.push(task);
      else if (due < date) overdue.push(task);
    }
  overdue.sort((a, b) => a.due.localeCompare(b.due));
  if (overdue.length) tips.push({ text: 'มีงาน {0} รายการเลยกำหนดแล้ว', args: [String(overdue.length)] });
  return {
    date,
    retrievedAt: new Date(input.now).toISOString(),
    events: [...events.filter(e => e.allDay), ...timed],
    dueToday,
    overdue,
    tips,
    gaps: input.gaps || [],
  };
}

/** The three read operations of the brief, as the consent dialog lists them. */
export const BRIEF_OPERATIONS = ['calendar.events', 'tasks.lists', 'tasks.list'] as const;

/**
 * Reads today's primary Calendar and every task list (bounded) through the app's own Google client, then summarizes.
 * `run` is GoogleWorkspace.execute bound to the account and to a context whose consent already covers these reads.
 */
export async function readMorningBrief(run: (request: GoogleRequest) => Promise<{ data: any }>, now = Date.now()) {
  const { timeMin, timeMax } = briefDay(now);
  const gaps: BriefTip[] = [];
  // Each read is one page of at most 20 items; a bounded number of pages keeps one brief to a few requests.
  const pages = async (request: GoogleRequest, limit: number) => {
    const items: any[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < limit; page++) {
      const { data } = await run({ ...request, params: { ...request.params, ...(pageToken ? { pageToken } : {}) } });
      items.push(...(Array.isArray(data?.items) ? data.items : []));
      pageToken = typeof data?.nextPageToken === 'string' && data.nextPageToken ? data.nextPageToken : undefined;
      if (!pageToken) break;
    }
    return { items, more: Boolean(pageToken) };
  };
  const events = await pages({ operation: 'calendar.events', params: { calendarId: 'primary', timeMin, timeMax } }, MAX_EVENT_PAGES);
  if (events.more) gaps.push({ text: 'วันนี้มีนัดมากกว่าที่อ่าน แสดงเฉพาะ {0} นัดแรก', args: [String(events.items.length)] });
  const tasks: { list: string; items: any[] }[] = [];
  try {
    const lists = await pages({ operation: 'tasks.lists', params: {} }, 1);
    if (lists.more || lists.items.length > MAX_TASK_LISTS)
      gaps.push({ text: 'อ่าน Google Tasks เฉพาะ {0} รายการแรก', args: [String(MAX_TASK_LISTS)] });
    for (const list of lists.items.slice(0, MAX_TASK_LISTS)) {
      if (typeof list?.id !== 'string') continue;
      const page = await pages({ operation: 'tasks.list', params: { tasklistId: list.id } }, MAX_TASK_PAGES);
      tasks.push({ list: typeof list.title === 'string' ? list.title : '', items: page.items });
      if (page.more) gaps.push({ text: 'บางรายการใน Google Tasks มีงานมากกว่าที่อ่าน', args: [] });
    }
  } catch (error) {
    // Calendar still counts when Tasks is not connected or fails; the card says Tasks was not read.
    if (['CANCELLED', 'POLICY_CHANGED', 'GOOGLE_ACCOUNT_CHANGED'].includes((error as Error).message)) throw error;
    gaps.push({ text: 'อ่าน Google Tasks ไม่ได้ จึงไม่มีงานในสรุปนี้', args: [] });
  }
  const unique = gaps.filter((g, i) => gaps.findIndex(o => o.text === g.text) === i);
  return summarizeDay({ events: events.items, tasks, now, gaps: unique });
}
