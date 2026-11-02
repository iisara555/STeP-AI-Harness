import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentConversationContext, requestedDocumentTool } from '../src/document-intent';

test('explicit requests select the intended document, even when the source is another document', () => {
  const cases = [
    ['ช่วยร่าง TOR จากข้อสรุปที่คุยกัน', 'tor'],
    ['ช่วยทำเอกสาร TOR จากข้อมูลที่สรุปแล้ว', 'tor'],
    ['ช่วยร่าง TOR โดยอธิบายว่าจะตรวจรับอย่างไร', 'tor'],
    ['จากที่คุยมาทำเป็น TOR ให้หน่อย', 'tor'],
    ['ช่วยสรุปที่คุยกันเป็นรายงานการประชุม', 'minutes'],
    ['ช่วยจัดทำบันทึกข้อความจากรายงานการประชุม', 'memo'],
    ['ร่างหนังสือราชการถึงหน่วยงานจาก TOR นี้', 'letter'],
    ['ช่วยเขียนรายงานการประชุมจากข้อมูลข้างต้น', 'minutes'],
    ['ร่างโครงการจากข้อสรุปนี้', 'project'],
    ['ช่วยร่างหนังสือรับรองให้หน่อย', 'other'],
    ['ช่วยเขียนรายงานความคืบหน้าโครงการจากข้อสรุป', 'other'],
    ['Please draft a TOR based on our discussion', 'tor'],
  ] as const;
  for (const [message, expected] of cases) assert.equal(requestedDocumentTool(message), expected, message);
});

test('discussion, partial edits and postponed drafting do not silently become a new document', () => {
  for (const message of [
    'TOR คืออะไร',
    'ช่วยอธิบายวิธีร่าง TOR',
    'เอกสาร TOR ควรร่างอย่างไร',
    'ต้องร่าง TOR หรือไม่',
    'ช่วยตรวจร่าง TOR นี้',
    'ยังไม่ต้องร่าง TOR',
    'ช่วยร่างเฉพาะหัวข้อวัตถุประสงค์ของ TOR',
    'ช่วยเขียนชื่อโครงการให้หน่อย',
    'ช่วยสร้างคำสั่ง SQL',
    'สรุปประเด็นจาก TOR นี้',
  ])
    assert.equal(requestedDocumentTool(message), undefined, message);
});

test('a brief request can refer to the most recent unambiguous document in the conversation', () => {
  assert.equal(requestedDocumentTool('ช่วยร่างให้หน่อย', ['ต้องการจัดซื้ออุปกรณ์และทำ TOR']), 'tor');
  assert.equal(requestedDocumentTool('ช่วยร่างเอกสารให้หน่อย', ['ต้องการจัดซื้ออุปกรณ์และทำ TOR']), 'tor');
  assert.equal(requestedDocumentTool('ร่างจากที่คุยกันเลย', ['ขอสรุปผลการประชุม', 'ทำรายงานการประชุม']), 'minutes');
  assert.equal(requestedDocumentTool('ช่วยร่างให้หน่อย', ['เปรียบเทียบ TOR กับบันทึกข้อความ']), undefined);
  assert.equal(requestedDocumentTool('ช่วยร่างให้หน่อย', []), undefined);
});

test('the consent context changes with sent content, not background answer-check metadata', () => {
  const source = {
    messages: [{ role: 'assistant' as const, text: 'SYNTHETIC-ANSWER', at: '2026-11-02T00:00:00Z' }],
    files: [{ name: 'source.txt', text: 'SYNTHETIC-FILE', at: '2026-11-02T00:00:00Z' }],
  };
  const baseline = documentConversationContext(source);
  assert.equal(documentConversationContext({ ...source, messages: [{ ...source.messages[0], checkPending: 'later' }] }), baseline);
  assert.notEqual(documentConversationContext({ ...source, messages: [{ ...source.messages[0], text: 'SYNTHETIC-CHANGED' }] }), baseline);
  assert.notEqual(documentConversationContext({ ...source, files: [{ ...source.files[0], text: 'SYNTHETIC-CHANGED' }] }), baseline);
});
