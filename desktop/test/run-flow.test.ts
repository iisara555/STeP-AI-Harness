import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendStream,
  composerRequest,
  discardStream,
  finishedNotice,
  resolveRun,
  runPayload,
  sendBlocker,
  turnBreak,
  upsertById,
  withoutId,
} from '../src/run-flow';
import type { Attachment } from '../src/types';

const composer = { mode: 'chat' as const, imageModel: 'img-1', coordinated: true };
const file = (extra: Partial<Attachment> = {}) =>
  ({ id: 'f1', name: 'ใบเสร็จ.pdf', usable: true, status: 'ready', ...extra }) as Attachment;

test('a run fills what it left out from the composer', () => {
  const run = resolveRun({}, composer);
  assert.deepEqual(
    [run.attachments, run.mode, run.imageModel, run.coordinator, run.isolated, run.aside, run.autoContinue],
    [[], 'chat', 'img-1', false, false, false, false],
  );
  // The coordinator runs only for a plain draft: not with a Skill, not on a retry, and not when it is switched off.
  assert.equal(resolveRun({ mode: 'draft' }, composer).coordinator, true);
  assert.equal(resolveRun({ mode: 'draft', skill: 'tor-writer' }, composer).coordinator, false);
  assert.equal(resolveRun({ mode: 'draft', retry: true }, composer).coordinator, false);
  assert.equal(resolveRun({ mode: 'draft' }, { ...composer, coordinated: false }).coordinator, false);
  assert.equal(resolveRun({ mode: 'draft', coordinator: false }, composer).coordinator, false);
  assert.equal(resolveRun({ imageModel: '' }, composer).imageModel, '');
});

test('the host gets the workflow only on a plain chat run, and an isolated run makes no images', () => {
  const chat = runPayload('s1', 'วางแผนงาน', resolveRun({ allowIds: ['a'], sourceText: 'src' }, composer), 'plan');
  assert.equal(chat.workflow, 'plan');
  assert.equal(chat.allowIdentifiers?.[0], 'a');
  assert.equal(chat.sourceText, 'src');
  assert.equal('autoImage' in chat, false);
  const draft = runPayload('s1', 'ร่าง', resolveRun({ mode: 'draft' }, composer), 'plan');
  assert.equal('workflow' in draft, false);
  const isolated = runPayload('s1', 'ถามแทรก', resolveRun({ isolated: true }, composer), 'plan');
  assert.equal(isolated.autoImage, false);
  assert.equal('workflow' in isolated, false);
  assert.equal('workflow' in runPayload('s1', 'คุย', resolveRun({}, composer), ''), false);
});

test('sending waits for a picture being prepared, a running answer, or a file the AI cannot take', () => {
  assert.equal(sendBlocker({ preparingImage: false, busy: false, files: [file()] }), null);
  assert.equal(sendBlocker({ preparingImage: true, busy: true, files: [] })?.text, 'กำลังเตรียมภาพ กรุณารอสักครู่ก่อนส่ง');
  assert.equal(sendBlocker({ preparingImage: false, busy: true, files: [] })?.kind, 'info');
  const refused = sendBlocker({ preparingImage: false, busy: false, files: [file(), file({ id: 'f2', name: 'ลับ.docx', usable: false })] });
  assert.equal(refused?.kind, 'error');
  assert.match(refused!.text, /ลับ\.docx/);
});

test('an attached picture alone is sent with a stock request; empty text with no picture sends nothing', () => {
  assert.equal(composerRequest('  สรุปให้หน่อย ', []), '  สรุปให้หน่อย ');
  assert.equal(composerRequest('  ', [file({ imagePreview: 'data:' } as Partial<Attachment>)]), 'ช่วยดูไฟล์ที่แนบ');
  assert.equal(composerRequest('', [file()]), '');
});

test('a finished background task is announced only when it needs the person', () => {
  assert.equal(finishedNotice('review', 'ร่าง TOR'), '“ร่าง TOR” มีร่างให้ตรวจแล้ว');
  assert.equal(finishedNotice('waiting', 'ร่าง TOR'), '“ร่าง TOR” รอข้อมูลเพิ่มจากคุณ');
  assert.equal(finishedNotice('error', 'ร่าง TOR'), '“ร่าง TOR” ต้องตรวจสอบ');
  assert.equal(finishedNotice('done', 'ร่าง TOR'), '');
});

test('streamed text keeps its newest part, takes back discarded characters and breaks between turns', () => {
  assert.equal(appendStream('abc', 'def', 4), 'cdef');
  assert.equal(discardStream('abcdef', 2), 'abcd');
  assert.equal(discardStream('ab', 5), '');
  assert.equal(turnBreak('คำตอบแรก'), 'คำตอบแรก\n\n');
  assert.equal(turnBreak('คำตอบแรก\n\n'), 'คำตอบแรก\n\n');
  assert.equal(turnBreak('  '), '  ');
});

test('prompts that arrive again replace the earlier copy', () => {
  const list = [
    { id: 'a', v: 1 },
    { id: 'b', v: 1 },
  ];
  assert.deepEqual(upsertById(list, { id: 'a', v: 2 }), [
    { id: 'b', v: 1 },
    { id: 'a', v: 2 },
  ]);
  assert.deepEqual(withoutId(list, 'b'), [{ id: 'a', v: 1 }]);
  assert.deepEqual(withoutId(list, undefined), list);
});
