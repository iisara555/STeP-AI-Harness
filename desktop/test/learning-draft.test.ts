import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftInput, parseDrafts, MAX_DRAFTS } from '../electron/learning-draft';

test('AI drafts are parsed strictly into candidate content', () => {
  const reply =
    'บทเรียน:\n```json\n' +
    JSON.stringify([
      {
        name: 'ใบเสร็จไม่มีเลขผู้เสียภาษี',
        kind: 'procedure',
        trigger: 'ใบเสร็จ,receipt',
        text: '1. ระบุว่าไม่พบ\n2. ห้ามเดาจากชื่อร้าน',
        evidence: 'ไม่มีเลขผู้เสียภาษีให้เขียนว่าไม่พบ ห้ามเดา',
        reason: 'ผู้ใช้แก้',
      },
      { name: 'No trigger', kind: 'procedure', trigger: 'x', text: 'steps', evidence: 'e' },
      { name: 'No evidence', kind: 'preference', text: 'Prefer tables' },
      { name: 'Odd kind', kind: 'skill', text: 'Answer in Thai', evidence: 'ตอบเป็นภาษาไทย' },
      'string item',
    ]) +
    '\n```';
  const drafts = parseDrafts(reply);
  assert.equal(drafts.length, 2);
  assert.deepEqual(drafts[0].content, {
    name: 'ใบเสร็จไม่มีเลขผู้เสียภาษี',
    kind: 'procedure',
    trigger: 'ใบเสร็จ,receipt',
    text: '1. ระบุว่าไม่พบ\n2. ห้ามเดาจากชื่อร้าน',
  });
  assert.match(drafts[0].evidence, /^AI draft from the task: “ไม่มีเลขผู้เสียภาษี/);
  assert.match(drafts[0].evidence, /Reason: ผู้ใช้แก้/);
  // A procedure that could never be selected is dropped; an unknown kind is a preference with no trigger.
  assert.deepEqual([drafts[1].content.kind, drafts[1].content.trigger], ['preference', '']);
  assert.deepEqual(parseDrafts('nothing'), []);
  assert.deepEqual(parseDrafts('[{"name": broken'), []);
  const many = JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ name: 'n' + i, kind: 'preference', text: 't' + i, evidence: 'e' })));
  assert.equal(parseDrafts(many).length, MAX_DRAFTS);
});

test('the reviewer sees recent turns, the focus and the draft, bounded', () => {
  const input = draftInput(
    {
      title: 'ตรวจใบเสร็จ',
      skill: 'receipt-check',
      draft: 'ร่าง',
      messages: Array.from({ length: 40 }, (_, i) => ({
        role: i % 2 ? 'assistant' : 'user',
        text: 'turn ' + i + ' ' + 'ก'.repeat(5000),
        at: '',
      })),
    } as any,
    'เน้นขั้นตอนตรวจความครบถ้วน',
  );
  assert.match(input, /Skill used: receipt-check/);
  assert.match(input, /focus on: เน้นขั้นตอน/);
  assert.doesNotMatch(input, /turn 9 /, 'only the last 30 turns');
  assert.match(input, /turn 39 /);
});
