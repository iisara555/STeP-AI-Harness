import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { runKnowledge } from '../eval/knowledge-live';
import { OrganizationKnowledge, WHOLE_DOCUMENT, WHOLE_DOCUMENT_CHARS } from '../electron/knowledge';
import type { Connection } from '../src/types';

const large: Connection = { id: 'eval', provider: 'claude', mode: 'api', model: 'fake', executable: '', ready: true, note: '' };

async function answerPrompt(q: string, connection: Connection) {
  const prompts: string[] = [];
  const run = async (prompt: string, _connection: Connection, context: { system?: string }) => {
    if (prompt.includes('skill_catalog') || /select ONE registered/.test(context.system || ''))
      return '{"skillId":null,"reason":"general"}';
    prompts.push(prompt);
    return 'ตอบ (ข้อมูลสังเคราะห์สำหรับทดสอบ)';
  };
  await runKnowledge({
    root: resolve('..'),
    cases: [{ q, doc: 'x' }],
    live: { connection, context: { cwd: resolve('.'), env: {} } as any, run: run as any },
  });
  return prompts[0] || '';
}
const knowledgeOf = (prompt: string) => /<organization_knowledge>\n([\s\S]*?)\n<\/organization_knowledge>/.exec(prompt)?.[1] || '';

test('a short matched document reaches the answer whole, so the section keyword search missed is already there', async () => {
  const routing: any = await import('../../src/modules/router/service.js');
  const knowledge = new OrganizationKnowledge(resolve('..'), routing.loadDocumentCatalog);
  const q = 'หยุดพักร้อนได้ปีละกี่วัน';
  const hits = await knowledge.search(q);
  assert.equal(hits[0].id, 'hr-personnel-welfare-2569');
  assert.ok(!hits.some(h => h.heading.startsWith('4.4')), 'keyword search alone misses 4.4 ลาพักผ่อนประจำปี');

  const given = knowledgeOf(await answerPrompt(q, large));
  assert.ok(given.includes(`[hr-personnel-welfare-2569]`) && given.includes(`§ ${WHOLE_DOCUMENT}`));
  assert.match(given, /### 4\.4 การลาพักผ่อนประจำปี/, 'the leave section is in the prompt without a reference call');
  assert.equal(given.split('[hr-personnel-welfare-2569]').length, 2, 'the document is given once, not whole and as excerpts');
});

test('a long document and a small prompt budget keep the excerpts', async () => {
  const routing: any = await import('../../src/modules/router/service.js');
  const knowledge = new OrganizationKnowledge(resolve('..'), routing.loadDocumentCatalog);
  const manual = await knowledge.search('คู่มือคุณภาพฉบับปัจจุบันเป็น rev ไหน');
  assert.equal(manual[0].id, 'mis-iso-document-register');
  assert.deepEqual(await knowledge.whole(manual, 1_000_000), manual, `the MIS register is over ${WHOLE_DOCUMENT_CHARS} characters`);

  const hr = await knowledge.search('หยุดพักร้อนได้ปีละกี่วัน');
  assert.deepEqual(await knowledge.whole(hr, 5_000), hr, 'a document over the token limit stays excerpts');
  // An unknown local model has the conservative 48k budget: a quarter of it is under this document.
  const local: Connection = { ...large, provider: 'compatible', model: 'local-model' };
  const given = knowledgeOf(await answerPrompt('หยุดพักร้อนได้ปีละกี่วัน', local));
  assert.ok(given.includes('[hr-personnel-welfare-2569]') && !given.includes(`§ ${WHOLE_DOCUMENT}`));
});
