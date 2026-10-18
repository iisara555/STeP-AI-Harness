import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRIEF_OPERATIONS, briefDay, readMorningBrief, summarizeDay } from '../electron/morning-brief';
import { parsePolicy } from '../electron/policy';
import type { GoogleRequest } from '../electron/google-operations';

// สรุปเช้านี้: synthetic Calendar and Tasks items only. 2026-10-19 07:30 Thai time.
const NOW = Date.parse('2026-10-19T00:30:00Z');
const at = (time: string) => `2026-10-19T${time}:00+07:00`;
const event = (summary: string, start: string, end: string, extra: Record<string, unknown> = {}) => ({
  summary,
  start: { dateTime: at(start) },
  end: { dateTime: at(end) },
  ...extra,
});

test('the brief day is the Thai calendar day, also just after midnight UTC changes it', () => {
  assert.deepEqual(briefDay(NOW), {
    date: '2026-10-19',
    timeMin: '2026-10-19T00:00:00+07:00',
    timeMax: '2026-10-20T00:00:00+07:00',
  });
  assert.equal(briefDay(Date.parse('2026-10-19T18:00:00Z')).date, '2026-10-20');
});

test('the summary orders the day, marks clashes and unanswered invitations, and finds a long free stretch', () => {
  const brief = summarizeDay({
    now: NOW,
    events: [
      event('ประชุมทีม', '10:30', '11:30', { location: 'ห้อง 2' }),
      event('ประชุมสรุปงบ', '10:00', '11:00', {
        location: 'ห้อง 1',
        hangoutLink: 'https://meet.google.com/abc-defg-hij',
        attendees: [{ self: true, responseStatus: 'needsAction' }],
      }),
      { summary: 'วันหยุดชดเชย', start: { date: '2026-10-19' }, end: { date: '2026-10-20' } },
      event('ยกเลิกแล้ว', '13:00', '14:00', { status: 'cancelled' }),
      event('ปฏิเสธแล้ว', '13:00', '14:00', { attendees: [{ self: true, responseStatus: 'declined' }] }),
    ],
    tasks: [],
  });
  assert.deepEqual(
    brief.events.map(e => [e.title, e.allDay, Boolean(e.conflict), Boolean(e.tentative)]),
    [
      ['วันหยุดชดเชย', true, false, false],
      ['ประชุมสรุปงบ', false, true, true],
      ['ประชุมทีม', false, true, false],
    ],
  );
  assert.equal(brief.events[1].meet, 'https://meet.google.com/abc-defg-hij');
  assert.deepEqual(brief.tips[0], { text: 'นัด {0} ({1}) ชนกับ {2} ({3})', args: ['ประชุมสรุปงบ', '10:00', 'ประชุมทีม', '10:30'] });
  assert.deepEqual(brief.tips.at(-1), { text: 'ช่วงว่าง {0}–{1} น. เหมาะทำงานที่ต้องใช้สมาธิ', args: ['11:30', '16:30'] });
});

test('a short hop between two places is pointed out, and only real Meet links are kept', () => {
  const brief = summarizeDay({
    now: NOW,
    events: [
      event('ตรวจสถานที่', '09:00', '10:00', { location: 'อาคาร A', hangoutLink: 'https://example.com/meet' }),
      event('พบผู้ประกอบการ', '10:05', '11:00', { location: 'อาคาร B' }),
    ],
    tasks: [],
  });
  assert.equal(brief.events[0].meet, undefined);
  assert.ok(brief.tips.some(t => t.text.includes('ไม่ถึง 10 นาที')));
});

test('tasks due today and overdue are split by due date; completed and undated ones are left out', () => {
  const brief = summarizeDay({
    now: NOW,
    events: [],
    tasks: [
      {
        list: 'งานของฉัน',
        items: [
          { title: 'ส่งรายงาน', due: '2026-10-19T00:00:00.000Z', status: 'needsAction' },
          { title: 'ตอบอีเมลผู้ประกอบการ', due: '2026-10-15T00:00:00.000Z', status: 'needsAction' },
          { title: 'เตรียมสไลด์', due: '2026-10-12T00:00:00.000Z', status: 'needsAction' },
          { title: 'เสร็จแล้ว', due: '2026-10-19T00:00:00.000Z', status: 'completed' },
          { title: 'ไม่มีกำหนด', status: 'needsAction' },
          { title: 'พรุ่งนี้', due: '2026-10-20T00:00:00.000Z', status: 'needsAction' },
        ],
      },
    ],
  });
  assert.deepEqual(
    brief.dueToday.map(t => t.title),
    ['ส่งรายงาน'],
  );
  assert.deepEqual(
    brief.overdue.map(t => t.title),
    ['เตรียมสไลด์', 'ตอบอีเมลผู้ประกอบการ'],
  );
  assert.deepEqual(brief.tips, [{ text: 'มีงาน {0} รายการเลยกำหนดแล้ว', args: ['2'] }]);
  // No free-time tip on a day without timed appointments.
  assert.ok(!brief.tips.some(t => t.text.includes('ช่วงว่าง')));
});

test('reading the brief makes only its three read operations, bounded, for today', async () => {
  const calls: GoogleRequest[] = [];
  const brief = await readMorningBrief(async request => {
    calls.push(request);
    if (request.operation === 'calendar.events')
      return { data: { items: [event('ประชุม', '10:00', '11:00')], nextPageToken: calls.length < 5 ? 'next' : undefined } };
    if (request.operation === 'tasks.lists') return { data: { items: [{ id: 'list-1', title: 'งานของฉัน' }] } };
    return { data: { items: [{ title: 'ส่งรายงาน', due: '2026-10-19T00:00:00.000Z', status: 'needsAction' }] } };
  }, NOW);
  assert.ok(calls.every(c => (BRIEF_OPERATIONS as readonly string[]).includes(c.operation)));
  const reads = calls.filter(c => c.operation === 'calendar.events');
  assert.equal(reads.length, 3, 'at most three pages of appointments');
  assert.deepEqual(reads[0].params, {
    calendarId: 'primary',
    timeMin: '2026-10-19T00:00:00+07:00',
    timeMax: '2026-10-20T00:00:00+07:00',
  });
  assert.equal(reads[1].params?.pageToken, 'next');
  assert.equal(brief.events.length, 3);
  assert.deepEqual(brief.gaps, [{ text: 'วันนี้มีนัดมากกว่าที่อ่าน แสดงเฉพาะ {0} นัดแรก', args: ['3'] }]);
  assert.deepEqual(
    brief.dueToday.map(t => t.list),
    ['งานของฉัน'],
  );
});

test('a Tasks failure still gives the Calendar part, but a cancelled consent or a changed account stops the brief', async () => {
  const brief = await readMorningBrief(async request => {
    if (request.operation === 'calendar.events') return { data: { items: [event('ประชุม', '10:00', '11:00')] } };
    throw new Error('GOOGLE_SCOPE_MISSING');
  }, NOW);
  assert.equal(brief.events.length, 1);
  assert.deepEqual(brief.gaps, [{ text: 'อ่าน Google Tasks ไม่ได้ จึงไม่มีงานในสรุปนี้', args: [] }]);
  for (const code of ['CANCELLED', 'GOOGLE_ACCOUNT_CHANGED'])
    await assert.rejects(
      readMorningBrief(async request => {
        if (request.operation === 'calendar.events') return { data: { items: [] } };
        throw new Error(code);
      }, NOW),
      { message: code },
    );
});

test('policy: the brief is on by default, IT can turn it or its remembered consent off', () => {
  assert.equal(parsePolicy({}).policy.features.morningBrief, true);
  assert.equal(parsePolicy({}).policy.morningBrief, undefined);
  assert.equal(parsePolicy({ features: { morningBrief: false } }).policy.features.morningBrief, false);
  assert.deepEqual(parsePolicy({ morningBrief: { rememberConsent: false } }).policy.morningBrief, { rememberConsent: false });
  assert.ok(parsePolicy({ morningBrief: { rememberConsent: 'no' } }).problems.length);
  assert.ok(parsePolicy({ morningBrief: { rememberConsent: true, extra: 1 } }).problems.length);
});
