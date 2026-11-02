import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { runKnowledge } from '../eval/knowledge-live';
import type { Connection } from '../src/types';

const connection: Connection = { id: 'eval', provider: 'claude', mode: 'api', model: 'fake', executable: '', ready: true, note: '' };

async function activities(q: string, answers: string[]) {
  const seen: string[] = [];
  let turn = 0;
  const run = async (prompt: string, _c: Connection, context: { system?: string }) => {
    if (prompt.includes('skill_catalog') || /select ONE registered/.test(context.system || ''))
      return '{"skillId":null,"reason":"general"}';
    return answers[Math.min(turn++, answers.length - 1)];
  };
  await runKnowledge({
    root: resolve('..'),
    cases: [{ q, doc: 'x' }],
    live: { connection, context: { cwd: resolve('.'), env: {} } as any, run: run as any },
    onEvent: event => event.type === 'activity' && event.text && seen.push(event.text),
  });
  return seen;
}

test('the status line names the STeP document the answer reads, by its title', async () => {
  const seen = await activities('ผอ. STeP ชื่ออะไร', ['ตอบ (ข้อมูลสังเคราะห์สำหรับทดสอบ)']);
  assert.ok(
    seen.some(text => /^กำลังเตรียมคำตอบจากเอกสาร \S/.test(text) && !text.includes('step-executive-board')),
    seen.join(' | '),
  );
});

test('a document the AI opens is named by its title, not its registry ID; a weak match keeps the plain wait line', async () => {
  const open = '```step-tool\n{"tool":"reference","input":"step-facility-equipment-inventory-2020"}\n```';
  const seen = await activities('อยากตรวจคุณภาพอาหาร STeP มีเครื่องมือไหม', [open, 'ตอบ (ข้อมูลสังเคราะห์สำหรับทดสอบ)']);
  assert.ok(seen.includes('กำลังรอ AI เตรียมคำตอบ'), seen.join(' | '));
  const reading = seen.find(text => text.startsWith('กำลังอ่านเอกสาร '));
  assert.ok(reading && !reading.includes('step-facility-equipment-inventory-2020'), seen.join(' | '));
  assert.ok(!seen.some(text => text.includes('step-facility-equipment-inventory-2020')), 'never the registry ID');
});

test('the status line says when the AI is choosing a Skill', async () => {
  const seen = await activities('อยากตรวจคุณภาพอาหาร STeP มีเครื่องมือไหม', ['ตอบ (ข้อมูลสังเคราะห์สำหรับทดสอบ)']);
  assert.ok(seen.includes('กำลังเลือก Skill ที่เหมาะกับงาน'), seen.join(' | '));
});
