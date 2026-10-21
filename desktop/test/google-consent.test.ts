import test from 'node:test';
import assert from 'node:assert/strict';
import { googleResultConsent } from '../electron/google-consent';
import { useLanguage } from '../electron/i18n';

test('Calendar consent shows redacted meeting details and distinguishes working location; reviewed payload stays intact', () => {
  const reviewed = JSON.stringify({
    status: 'completed',
    operation: 'calendar.events',
    trust: 'untrusted-data',
    data: {
      nextSyncToken: 'synthetic-sync',
      items: [
        {
          summary: 'Synthetic meeting',
          start: { dateTime: '2026-10-21T10:00:00+07:00' },
          end: { dateTime: '2026-10-21T11:00:00+07:00' },
          location: 'Synthetic room',
        },
        { summary: 'Office', eventType: 'workingLocation', start: { date: '2026-10-21' }, end: { date: '2026-10-22' } },
      ],
    },
  });
  const view = googleResultConsent('calendar.events', reviewed, 'antigravity', 'fi••••@example.test');
  assert.match(view.preview, /Synthetic meeting/);
  assert.match(view.preview, /10:00:00/);
  assert.match(view.preview, /Synthetic room/);
  assert.match(view.preview, /สถานที่ทำงาน \(ไม่ใช่นัดประชุม\)/);
  assert.doesNotMatch(view.preview, /nextSyncToken|untrusted-data|[{}]/);
  assert.equal(view.technical, reviewed);
  assert.equal(view.facts[0].value, 'antigravity');
  assert.equal(view.facts[1].value, 'fi••••@example.test');
  assert.doesNotMatch(view.body, /synthetic-sync|calendar.events/);
  assert.doesNotThrow(() => googleResultConsent('calendar.events', '{"data":{"items":[null]}}', 'fixture', 'fixture'));
});

test('empty Calendar and other Google results have readable localized previews', () => {
  try {
    useLanguage(() => 'en');
    const empty = googleResultConsent('calendar.events', '{"data":{"items":[]}}', 'fixture', 'fixture');
    assert.match(empty.preview, /Calendar entries: 0/);
    const files = googleResultConsent('drive.list', '{"data":{"files":[{"name":"Synthetic file"}]}}', 'fixture', 'fixture');
    assert.match(files.preview, /Synthetic file/);
    assert.doesNotMatch(files.preview, /[{}]/);
  } finally {
    useLanguage(() => 'th');
  }
});
