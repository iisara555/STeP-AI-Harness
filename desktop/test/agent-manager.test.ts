import { test } from 'node:test';
import assert from 'node:assert/strict';
import { managerGroups, managerTask, needsYouCount, MANAGER_RECENT, PARALLEL_RUNS } from '../src/agent-manager';
import { MAX_PARALLEL_RUNS } from '../electron/service';
import { agentManagerEn } from '../src/locales/agent-manager-en';
import type { ApprovalRequest, Session, ToolQuestion } from '../src/types';

const session = (id: string, status: string, updatedAt: string, extra: Partial<Session> = {}) =>
  ({ id, title: 'งาน ' + id, project: '', team: 'cc', status, updatedAt, messages: [], ...extra }) as unknown as Session;
const approval = (sessionId: string): ApprovalRequest => ({
  id: 'a-' + sessionId,
  tool: 'google_workspace',
  title: 'Change Google data?',
  body: '',
  privacyClass: 'internal',
  allowRemember: false,
  sessionId,
});
const question = (sessionId: string): ToolQuestion => ({ id: 'q-' + sessionId, sessionId, question: 'ใช้แม่แบบไหน', options: [] });

test('tasks are grouped by what the employee does next, newest first', () => {
  const sessions = [
    session('new', 'idle', '2026-10-30T09:00:00Z'),
    session('run', 'running', '2026-10-30T08:00:00Z'),
    session('ask', 'running', '2026-10-30T07:00:00Z'),
    session('perm', 'running', '2026-10-30T10:00:00Z'),
    session('clarify', 'waiting', '2026-10-30T06:00:00Z'),
    session('old-review', 'review', '2026-10-29T06:00:00Z'),
    session('review', 'review', '2026-10-30T05:00:00Z'),
    session('failed', 'error', '2026-10-30T04:00:00Z'),
    session('stopped', 'cancelled', '2026-10-30T03:00:00Z'),
  ];
  const groups = managerGroups(sessions, [question('ask')], [approval('perm')]);
  assert.deepEqual(
    groups['needs-you'].map(task => [task.id, task.waiting?.kind]),
    [
      ['perm', 'approval'],
      ['ask', 'question'],
      ['clarify', 'clarification'],
    ],
  );
  assert.equal(groups['needs-you'][0].waiting?.text, 'Change Google data?');
  assert.deepEqual(
    groups.running.map(task => task.id),
    ['run'],
  );
  assert.deepEqual(
    groups.done.map(task => task.id),
    ['review', 'old-review'],
  );
  assert.deepEqual(
    groups.stopped.map(task => task.id),
    ['failed', 'stopped'],
  );
  // A new task nothing has happened in yet is not listed.
  assert.equal(managerTask(sessions[0], [], []), undefined);
  assert.equal(needsYouCount(sessions, [question('ask')], [approval('perm')]), 3);
});

test('a task shows its plan progress, and long histories keep only the recent results', () => {
  const planned = session('plan', 'running', '2026-10-30T08:00:00Z', {
    workPlan: {
      goal: 'g',
      tasks: [
        { title: 'a', status: 'done' },
        { title: 'b', status: 'doing' },
        { title: 'c', status: 'todo' },
      ],
    },
  });
  assert.deepEqual(managerTask(planned, [], [])?.plan, { done: 1, total: 3 });
  const many = Array.from({ length: MANAGER_RECENT + 7 }, (_, i) =>
    session('r' + i, 'review', new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString()),
  );
  const done = managerGroups(many, [], []).done;
  assert.equal(done.length, MANAGER_RECENT);
  assert.equal(done[0].id, 'r' + (MANAGER_RECENT + 6));
  // Questions and permissions of other or no tasks do not move a task.
  assert.equal(managerTask(planned, [question('other')], [{ ...approval('x'), sessionId: undefined }])?.group, 'running');
});

test('the overview states the same parallel limit the service enforces, and its text has English', () => {
  assert.equal(PARALLEL_RUNS, MAX_PARALLEL_RUNS);
  for (const key of [
    'ศูนย์ควบคุมงาน',
    'รอคุณ',
    'เสร็จแล้ว รอตรวจ',
    'หยุดหรือไม่สำเร็จ',
    'รอคุณตอบ: {0}',
    'รอคุณอนุญาต: {0}',
    'มีงานรอคุณอนุญาต',
  ])
    assert.ok(agentManagerEn[key], key);
});
