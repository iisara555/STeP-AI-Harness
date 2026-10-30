import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialSeen, needsYouCount, taskAlert, TASK_ALERT_LABELS } from '../src/task-alerts';
import { taskAlertsEn } from '../src/locales/task-alerts-en';
import type { ApprovalRequest, Session, ToolQuestion } from '../src/types';

const session = (id: string, status: string, updatedAt = '2026-10-30T09:00:00Z') =>
  ({ id, title: 'งาน ' + id, project: '', team: 'cc', status, updatedAt, messages: [] }) as unknown as Session;
const approval = (sessionId?: string): ApprovalRequest => ({
  id: 'a-' + sessionId,
  tool: 'google_workspace',
  title: 'Change Google data?',
  body: '',
  privacyClass: 'internal',
  allowRemember: false,
  sessionId,
});
const question = (sessionId: string): ToolQuestion => ({ id: 'q-' + sessionId, sessionId, question: 'ใช้แม่แบบไหน', options: [] });

test('a task waiting on the employee or running always shows; finished and stopped tasks only until opened', () => {
  assert.equal(taskAlert(session('a', 'running'), [question('a')], []), 'needs-you');
  assert.equal(taskAlert(session('a', 'running'), [], [approval('a')]), 'needs-you');
  assert.equal(taskAlert(session('a', 'waiting'), [], [], '2026-10-30T09:00:00Z'), 'needs-you', 'seen does not hide a question');
  assert.equal(taskAlert(session('a', 'running'), [question('other')], [approval(undefined)]), 'running');
  assert.equal(taskAlert(session('a', 'review'), [], []), 'done');
  assert.equal(taskAlert(session('a', 'review'), [], [], '2026-10-30T08:00:00Z'), 'done', 'updated since last seen');
  assert.equal(taskAlert(session('a', 'review'), [], [], '2026-10-30T09:00:00Z'), undefined);
  assert.equal(taskAlert(session('a', 'error'), [], []), 'stopped');
  assert.equal(taskAlert(session('a', 'interrupted'), [], [], '2026-10-30T09:00:00Z'), undefined);
  assert.equal(taskAlert(session('a', 'idle'), [], []), undefined);
  const sessions = [session('a', 'waiting'), session('b', 'running'), session('c', 'running'), session('d', 'review')];
  assert.equal(needsYouCount(sessions, [question('b')], []), 2);
});

test('the first launch counts every existing task as seen; stored marks are kept', () => {
  const sessions = [session('a', 'review', '2026-10-30T09:00:00Z'), session('b', 'error', '2026-10-30T08:00:00Z')];
  assert.deepEqual(initialSeen(null, sessions), { a: '2026-10-30T09:00:00Z', b: '2026-10-30T08:00:00Z' });
  assert.deepEqual(initialSeen('not json', sessions), { a: '2026-10-30T09:00:00Z', b: '2026-10-30T08:00:00Z' });
  assert.deepEqual(initialSeen('[]', sessions).a, '2026-10-30T09:00:00Z');
  assert.deepEqual(initialSeen('{"a":"2026-10-29T00:00:00Z"}', sessions), { a: '2026-10-29T00:00:00Z' });
});

test('every notification has English', () => {
  for (const label of [...Object.values(TASK_ALERT_LABELS).filter(l => l !== 'กำลังทำ'), 'มีงานรอคุณอนุญาต', 'มีงานรอคุณตอบ'])
    assert.ok(taskAlertsEn[label], label);
});
