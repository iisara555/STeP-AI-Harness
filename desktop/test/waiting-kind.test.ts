import test from 'node:test';
import assert from 'node:assert/strict';
import { waitingKind } from '../src/waiting-kind';

test('the waiting mark follows what the status line says the AI is doing', () => {
  assert.equal(waitingKind('กำลังคิด'), 'think');
  assert.equal(waitingKind('กำลังเตรียมคำตอบ'), 'think');
  assert.equal(waitingKind('กำลังเตรียมคำตอบจากเอกสาร QP-AF-003'), 'think');
  assert.equal(waitingKind('ค้นเว็บแล้ว · กำลังเตรียมคำตอบจากแหล่งข้อมูล'), 'think');
  assert.equal(waitingKind('กำลังอ่าน Skill meeting-summary'), 'read');
  assert.equal(waitingKind('กำลังดูรายชื่อเอกสาร STeP'), 'read');
  assert.equal(waitingKind('กำลังค้นเว็บ'), 'search');
  assert.equal(waitingKind('กำลังใช้เครื่องมือ sheet_read'), 'search');
  assert.equal(waitingKind('กำลังเขียนคำตอบ'), 'write');
  assert.equal(waitingKind('อ่านครบแล้ว กำลังเขียนคำตอบ'), 'write');
  assert.equal(waitingKind('คำตอบยังไม่จบ กำลังต่อร่าง TOR'), 'write');
  // English interface.
  assert.equal(waitingKind('Reading Skill meeting-summary'), 'read');
  assert.equal(waitingKind('Searching the web'), 'search');
  assert.equal(waitingKind('Preparing the answer'), 'think');
});
