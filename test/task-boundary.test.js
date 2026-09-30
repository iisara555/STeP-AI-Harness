import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyContextPolicy } from '../src/modules/router/task-boundary.js';

test('task boundary separates new work, source references and draft revisions', () => {
  assert.deepEqual(classifyContextPolicy('ช่วยสรุประเบียบการลาฉบับใหม่'), {
    currentTurn: 'authoritative',
    history: 'ignore',
    carryover: false,
    revision: false,
    resume: false,
  });

  assert.deepEqual(classifyContextPolicy('ยอดรวมในใบเสร็จนี้เท่าไร'), {
    currentTurn: 'authoritative',
    history: 'relevant-only',
    carryover: true,
    revision: false,
    resume: false,
  });

  assert.deepEqual(classifyContextPolicy('ปรับโทนให้สุภาพขึ้น'), {
    currentTurn: 'authoritative',
    history: 'relevant-only',
    carryover: true,
    revision: true,
    resume: false,
  });

  assert.deepEqual(classifyContextPolicy('ต่อเลย'), {
    currentTurn: 'authoritative',
    history: 'relevant-only',
    carryover: true,
    revision: false,
    resume: true,
  });
});
