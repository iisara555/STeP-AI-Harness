import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDiagnosticLog } from '../electron/diagnostics';

test('diagnostic log parsing assigns severity and keeps sensitive detail masked', () => {
  const text = [
    JSON.stringify({ at: '2026-10-26T10:00:00.000Z', event: 'provider-call', provider: 'compatible', outcome: 'ok', ms: 42 }),
    JSON.stringify({
      at: '2026-10-26T10:01:00.000Z',
      event: 'run-failed',
      code: 'LOGIN_REQUIRED',
      detail: 'Contact admin@example.com with Bearer token-demo',
    }),
    JSON.stringify({ at: '2026-10-26T10:02:00.000Z', event: 'policy-problems', problems: 'invalid feature value' }),
    '{not-json}',
  ].join('\n');

  const entries = readDiagnosticLog(text, 10);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].level, 'info');
  assert.equal(entries[1].level, 'error');
  assert.equal(entries[2].level, 'warning');
  assert.equal(entries[2].detail, 'invalid feature value');
  assert.match(entries[1].detail || '', /<email>/);
  assert.match(entries[1].detail || '', /<token>/);
  assert.doesNotMatch(entries[1].detail || '', /admin@example\.com|token-demo/);
});

test('diagnostic log parsing returns only the requested latest entries', () => {
  const text = Array.from({ length: 8 }, (_, index) =>
    JSON.stringify({ at: `2026-10-26T10:0${index}:00.000Z`, event: `hook-${index}` }),
  ).join('\n');
  const entries = readDiagnosticLog(text, 3);
  assert.deepEqual(
    entries.map(entry => entry.event),
    ['hook-5', 'hook-6', 'hook-7'],
  );
});
