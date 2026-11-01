import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { runKnowledge } from '../eval/knowledge-live';
import { OrganizationKnowledge, STRONG_MATCH } from '../electron/knowledge';
import type { Connection } from '../src/types';

const connection: Connection = { id: 'eval', provider: 'claude', mode: 'api', model: 'fake', executable: '', ready: true, note: '' };

async function answerSystem(q: string) {
  const systems: string[] = [];
  const run = async (prompt: string, _connection: Connection, context: { system?: string }) => {
    if (prompt.includes('skill_catalog') || /select ONE registered/.test(context.system || ''))
      return '{"skillId":null,"reason":"general"}';
    systems.push(context.system || '');
    return 'ตอบ (ข้อมูลสังเคราะห์สำหรับทดสอบ)';
  };
  await runKnowledge({
    root: resolve('..'),
    cases: [{ q, doc: 'x' }],
    live: { connection, context: { cwd: resolve('.'), env: {} } as any, run: run as any },
  });
  return systems[0] || '';
}

test('a weak keyword match shows the whole document registry; a strong one narrows it to the matched documents', async () => {
  const routing: any = await import('../../src/modules/router/service.js');
  const knowledge = new OrganizationKnowledge(resolve('..'), routing.loadDocumentCatalog);
  const weak = 'อยากตรวจคุณภาพอาหาร STeP มีเครื่องมือไหม';
  const hits = await knowledge.search(weak);
  assert.ok(hits.length && hits[0].score < STRONG_MATCH, 'the food question has only a weak, wrong match');
  assert.ok(!hits.some(h => h.id === 'step-facility-equipment-inventory-2020'));
  assert.match(await answerSystem(weak), /- step-facility-equipment-inventory-2020 \|/, 'the right document is in the index');

  const strong = 'ผอ. STeP ชื่ออะไร';
  assert.ok((await knowledge.search(strong))[0].score >= STRONG_MATCH);
  const system = await answerSystem(strong);
  assert.match(system, /- step-executive-board \|/);
  assert.doesNotMatch(system, /- step-facility-equipment-inventory-2020 \|/, 'a strong match keeps the short index');
});
