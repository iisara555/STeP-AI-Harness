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

test('everyday follow-ups keep the current work, new requests still start fresh', () => {
  const continues = {
    'ช่วยทำต่อให้หน่อย': { revision: false, resume: true },
    'โอเค แก้หัวข้อ 2 เป็นตาราง': { revision: true, resume: false },
    'ได้เลยครับ ปรับให้กระชับขึ้น': { revision: true, resume: false },
  };
  for (const [text, expected] of Object.entries(continues)) {
    const policy = classifyContextPolicy(text);
    assert.equal(policy.history, 'relevant-only', text);
    assert.equal(policy.revision, expected.revision, text);
    assert.equal(policy.resume, expected.resume, text);
    assert.equal(policy.inferred, undefined, `${text} is an explicit edit or continue request`);
  }

  // No edit verb at the start: carried as an inferred revision the host must confirm.
  for (const text of ['ขอแบบสั้นกว่านี้', 'ทำเป็นภาษาอังกฤษด้วย', 'สรุปให้เหลือครึ่งหน้า', 'ขออีกแบบ']) {
    const policy = classifyContextPolicy(text);
    assert.equal(policy.history, 'relevant-only', text);
    assert.equal(policy.revision, true, text);
    assert.equal(policy.inferred, true, text);
  }

  // A pointer into the draft links the question to it but is not an edit.
  const pointer = classifyContextPolicy('หัวข้อ 2 หมายถึงอะไร');
  assert.equal(pointer.history, 'relevant-only');
  assert.equal(pointer.revision, false);

  for (const text of [
    'ช่วยสรุประเบียบการลาฉบับใหม่',
    'ช่วยเขียนอีเมลถึงลูกค้าหน่อย',
    'ต่อไปช่วยร่างหนังสือขอใช้สถานที่',
    'ขอบคุณครับ',
    'ช่วยร่างหนังสือเชิญประชุมคณะกรรมการ ระบุวาระการประชุมให้ครบ และทำเป็นตารางแนบท้ายสำหรับผู้เข้าร่วมทุกคน',
  ]) {
    const policy = classifyContextPolicy(text);
    assert.equal(policy.history, 'ignore', text);
    assert.equal(policy.revision, false, text);
    assert.equal(policy.resume, false, text);
  }
});
