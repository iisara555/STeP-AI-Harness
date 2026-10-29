import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateWorkActions, workActionError, workActionsFromTrace } from '../src/work-assistant';
import type { RunTrace } from '../src/types';

test('concurrent work actions update by their own IDs and history keeps staged steps separate from outcomes', () => {
  let actions = updateWorkActions([], { id: 'a', tool: 'files', state: 'running' });
  actions = updateWorkActions(actions, { id: 'b', tool: 'web_fetch', state: 'running' });
  actions = updateWorkActions(actions, { id: 'b', tool: 'web_fetch', state: 'failed', code: 'WEB_SITE_DECLINED' });
  actions = updateWorkActions(actions, { id: 'a', tool: 'files', state: 'done' });
  assert.deepEqual(
    actions.map(action => [action.id, action.state]),
    [
      ['a', 'done'],
      ['b', 'failed'],
    ],
  );
  const trace: RunTrace = {
    id: 'run',
    at: '',
    mode: '',
    workflow: 'assistant',
    route: '',
    outcome: 'error',
    ms: 0,
    steps: [
      {
        label: '',
        systemChars: 0,
        promptChars: 0,
        references: [],
        attempts: 0,
        ms: 0,
        tools: [
          { id: 'c', tool: 'patch', ok: true, ms: 2 },
          { id: 'd', tool: 'web_fetch', ok: false, code: 'WEB_SITE_DECLINED', ms: 2 },
        ],
      },
    ],
  };
  assert.deepEqual(
    workActionsFromTrace(trace).map(action => [action.tool, action.state]),
    [
      ['patch', 'done'],
      ['web_fetch', 'failed'],
    ],
  );
  assert.deepEqual(workActionsFromTrace({ ...trace, workflow: 'plan' }), []);
});

test('unknown failures give a next step and expose only safe diagnostic codes', () => {
  assert.match(workActionError('UNKNOWN_FAILURE'), /UNKNOWN_FAILURE/);
  assert.match(workActionError('UNKNOWN_FAILURE'), /ตรวจผลก่อนลองอีกครั้ง/);
  assert.match(workActionError('TOOL_FAILED'), /ตรวจผลก่อนลองอีกครั้ง/);
  assert.doesNotMatch(workActionError('private-name.txt'), /private-name/);
});
