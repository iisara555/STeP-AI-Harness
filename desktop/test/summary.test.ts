import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftSummary, taskTitle } from '../electron/service';

test('a first draft names its Skill, headings, blanks and masked details', () => {
  const text = '# Brief\n## เป้าหมาย\nx\n## กลุ่มเป้าหมาย\n[ต้องยืนยัน] วันที่\nถึง [ชื่อบุคคลถูกปิดบัง]';
  const summary = draftSummary(text, '', 'Designer Brief', '');
  assert.match(summary, /Skill “Designer Brief”/);
  assert.match(summary, /3 หัวข้อ/);
  assert.match(summary, /1 จุดในวงเล็บ/);
  assert.match(summary, /1 จุดที่ระบบปิดบัง/);
});

test('a revision says what was asked and which headings changed', () => {
  const summary = draftSummary('## A\n## C', '## A\n## B', '', 'ทำให้สั้นลง');
  assert.match(summary, /แก้ร่างตามคำขอ “ทำให้สั้นลง”/);
  assert.match(summary, /เพิ่มหัวข้อ: C/);
  assert.match(summary, /ตัดหัวข้อ: B/);
});

test('task titles use the first line and never cut a word in half', () => {
  assert.equal(taskTitle('ช่วย pre-check ใบเสร็จ\nรายละเอียด'), 'ช่วย pre-check ใบเสร็จ');
  const long = taskTitle('ช่วยทำ Designer Brief สำหรับงาน Open House ของ STeP กลุ่มเป้าหมายคือนักเรียนและผู้ปกครอง');
  assert.ok(long.endsWith('…') && long.length <= 61 && !long.includes('กลุ่มเป้าหมา…'));
});
