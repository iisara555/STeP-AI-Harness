import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { prepareDocumentSelection } from '../electron/document-selection';
import { runKnowledge } from '../eval/knowledge-live';
import type { RegistryEntry } from '../electron/knowledge';
import type { Connection } from '../src/types';

const entry = (id: string, sections: string[]): RegistryEntry => ({ id, title: id, path: `${id}.md`, summary: 's', sections });
const connection: Connection = { id: 'eval', provider: 'claude', mode: 'api', model: 'fake', executable: '', ready: true, note: '' };

test('the document pick keeps only registered ids and their own headings, and a malformed reply is undefined', () => {
  const selection = prepareDocumentSelection([entry('hr', ['ลา', 'สวัสดิการ']), entry('afp', ['ยืมเงิน'])], 'ลาบวชได้กี่วัน');
  assert.match(selection.system, /document_registry/);
  assert.deepEqual(JSON.parse(selection.prompt), { request: 'ลาบวชได้กี่วัน' });
  const reply = (documents: unknown) => JSON.stringify({ documents, reason: 'r' });
  assert.deepEqual(
    selection.parse(
      reply([
        { id: 'hr', sections: ['ลา', 'ยืมเงิน', 'ลา'] },
        { id: 'nope', sections: [] },
        { id: 'afp', sections: [] },
      ]),
    ),
    [
      { id: 'hr', sections: ['ลา'] },
      { id: 'afp', sections: [] },
    ],
  );
  assert.deepEqual(selection.parse(reply([])), [], 'not about STeP');
  assert.equal(selection.parse('ไม่รู้'), undefined);
  assert.equal(selection.parse(JSON.stringify({ documents: [] })), undefined, 'reason is required');
});

/** A fake provider: picks a document when asked, otherwise answers with what reached its prompt. */
function provider(pick: (system: string) => string) {
  const calls: { kind: string; prompt: string }[] = [];
  const run = async (prompt: string, _connection: Connection, context: { system?: string }) => {
    const system = context.system || '';
    if (system.includes('document_registry')) {
      calls.push({ kind: 'pick', prompt });
      return pick(system);
    }
    if (prompt.includes('skill_catalog') || /select ONE registered/.test(system)) return '{"skillId":null,"reason":"general"}';
    calls.push({ kind: 'answer', prompt });
    return 'ตอบตามเอกสาร (ข้อมูลสังเคราะห์สำหรับทดสอบ)';
  };
  return { calls, live: { connection, context: { cwd: resolve('.'), env: {} } as any, run: run as any } };
}

test('A1: a reworded STeP question with no keyword match gets the picked document in its first answer round', async () => {
  const fake = provider(() => JSON.stringify({ documents: [{ id: 'hr-personnel-welfare-2569', sections: [] }], reason: 'ลา' }));
  const [o] = await runKnowledge({
    root: resolve('..'),
    cases: [{ q: 'คลอดลูกหยุดงานได้นานแค่ไหน', doc: 'hr-personnel-welfare-2569' }],
    live: fake.live,
  });
  assert.equal(o.code, undefined, JSON.stringify(o));
  assert.equal(o.keyword, false, 'keyword search still misses it');
  assert.deepEqual(o.selected, ['hr-personnel-welfare-2569']);
  assert.equal(o.reached, true);
  assert.equal(o.opened.length, 0, 'no reference round was needed');
  assert.equal(fake.calls.filter(c => c.kind === 'pick').length, 1);
  const answer = fake.calls.find(c => c.kind === 'answer')!;
  assert.match(answer.prompt, /<organization_knowledge>[\s\S]*\[hr-personnel-welfare-2569\]/);
});

test('A1 does not run on a strong keyword match, when the policy is off, and a failed pick leaves the answer as before', async () => {
  const strong = provider(() => {
    throw new Error('must not pick');
  });
  const [direct] = await runKnowledge({
    root: resolve('..'),
    cases: [{ q: 'ผอ. STeP ชื่ออะไร', doc: 'step-executive-board' }],
    live: strong.live,
  });
  assert.equal(direct.keyword, true);
  assert.equal(direct.selected, undefined);
  assert.equal(strong.calls.filter(c => c.kind === 'pick').length, 0);

  const off = provider(() => '{"documents":[],"reason":"x"}');
  const [plain] = await runKnowledge({
    root: resolve('..'),
    cases: [{ q: 'คลอดลูกหยุดงานได้นานแค่ไหน', doc: 'hr-personnel-welfare-2569' }],
    live: off.live,
    documentSelection: false,
  });
  assert.equal(off.calls.filter(c => c.kind === 'pick').length, 0);
  assert.equal(plain.selected, undefined);

  const broken = provider(() => 'not json');
  const [failed] = await runKnowledge({
    root: resolve('..'),
    cases: [{ q: 'คลอดลูกหยุดงานได้นานแค่ไหน', doc: 'hr-personnel-welfare-2569' }],
    live: broken.live,
  });
  assert.equal(failed.code, undefined, 'the answer still runs');
  assert.equal(failed.selected, undefined);
  assert.ok(broken.calls.some(c => c.kind === 'answer'));
});

test('A1 on a general question: an empty pick adds no documents', async () => {
  const fake = provider(() => '{"documents":[],"reason":"public weather"}');
  const [o] = await runKnowledge({ root: resolve('..'), cases: [{ q: 'พรุ่งนี้ฝนตกไหม', doc: 'none' }], live: fake.live });
  assert.equal(o.reached, true, JSON.stringify(o));
  assert.equal(o.selected, undefined);
  assert.doesNotMatch(fake.calls.find(c => c.kind === 'answer')!.prompt, /<organization_knowledge>/);
});

test('only a lookup pays for a document pick: questions or STeP mentions, never drafting or file work', async () => {
  const { documentLookup } = await import('../electron/document-selection');
  for (const text of ['ลาบวชได้กี่วัน', 'แล้วลาป่วยล่ะ', 'มีเครื่องพิมพ์ 3 มิติให้ใช้ไหม', 'Who leads the park?'])
    assert.equal(documentLookup(text, false), true, text);
  assert.equal(documentLookup('เส้นทางการเติบโตของพนักงาน STeP', true), true);
  for (const text of [
    'ช่วยเขียนแคปชั่นวันเกิดเพื่อน',
    'ขอสั้นกว่านี้',
    'ร่างบันทึกข้อความขอยืมเงินได้ไหม',
    'Search and patch the synthetic local file fixture',
  ])
    assert.equal(documentLookup(text, false), false, text);
});
