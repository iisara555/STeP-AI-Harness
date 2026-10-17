import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeSchedule, fromCron, SCHEDULE_TEMPLATES, toCron } from '../src/schedules';
import { nextCron } from '../electron/cron';

const withZone = (zone: string, run: () => void) => {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try {
    run();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
};
const now = new Date('2026-10-17T03:00:00Z');

test('a Thai local time becomes UTC cron and reads back, including the old presets', () =>
  withZone('Asia/Bangkok', () => {
    assert.equal(toCron({ repeat: 'weekdays', time: '09:00', days: [] }, now), '0 2 * * 1,2,3,4,5');
    assert.equal(toCron({ repeat: 'daily', time: '08:30', days: [] }, now), '30 1 * * *');
    // 06:00 in Bangkok is 23:00 UTC the day before, so Monday moves to Sunday.
    assert.equal(toCron({ repeat: 'days', time: '06:00', days: [1, 5] }, now), '0 23 * * 0,4');
    assert.equal(toCron({ repeat: 'hourly', time: '00:15', days: [] }, now), '15 * * * *');
    assert.deepEqual(fromCron('0 23 * * 0,4', now), { repeat: 'days', time: '06:00', days: [1, 5] });
    assert.deepEqual(fromCron('0 2 * * 1-5', now), { repeat: 'weekdays', time: '09:00', days: [] });
    assert.deepEqual(fromCron('0 2 * * *', now), { repeat: 'daily', time: '09:00', days: [] });
    assert.deepEqual(fromCron('0 * * * *', now), { repeat: 'hourly', time: '00:00', days: [] });
    assert.equal(fromCron('*/5 9 1 * *', now), null);
    assert.deepEqual(describeSchedule('0 23 * * 0,4', now), { text: 'ทุก {0} เวลา {1} น.', args: ['จ. ศ.', '06:00'] });
    assert.throws(() => toCron({ repeat: 'days', time: '09:00', days: [] }, now), /NO_DAYS/);
    assert.throws(() => toCron({ repeat: 'daily', time: '25:00', days: [] }, now), /INVALID_TIME/);
  }));

test('the next run from a page-made schedule falls at the chosen local time', () =>
  withZone('Asia/Bangkok', () => {
    const cron = toCron({ repeat: 'days', time: '16:00', days: [5] }, now),
      next = new Date(nextCron(cron, now.getTime()));
    assert.equal(next.getDay(), 5);
    assert.equal(next.getHours(), 16);
    assert.equal(next.getMinutes(), 0);
  }));

test('round trips hold west of UTC too, and every template is a valid schedule', () =>
  withZone('America/New_York', () => {
    for (const template of SCHEDULE_TEMPLATES) {
      const cron = toCron(template.choice, now);
      nextCron(cron, now.getTime());
      assert.deepEqual(fromCron(cron, now), template.choice, template.id);
    }
    assert.deepEqual(fromCron(toCron({ repeat: 'days', time: '22:30', days: [0, 6] }, now), now), {
      repeat: 'days',
      time: '22:30',
      days: [0, 6],
    });
  }));
