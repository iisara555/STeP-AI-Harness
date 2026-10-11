import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OrganizationKnowledge } from '../electron/knowledge';

const routing: any = await import('../../src/modules/router/service.js');

// Original 61-question corpus: 59/61 before HA05, 61/61 after its topic-coverage and evidence-backed team-role
// retrieval fix (2026-10-11). This measures top-document retrieval and abstention, not live model-answer accuracy.
// The additional paraphrase and independent synthetic cases are in knowledge-relevance.test.ts, outside this corpus.
const FLOOR = 61;

test('organization knowledge search finds the right document for staff questions', async () => {
  const knowledge = new OrganizationKnowledge(resolve('..'), routing.loadDocumentCatalog);
  const { questions } = JSON.parse(await readFile('eval/knowledge-questions.json', 'utf8'));
  const misses: string[] = [];
  for (const { q, doc } of questions as { q: string; doc: string | string[] }[]) {
    const found = await knowledge.search(q);
    const ok = doc === 'none' ? !found.length : [doc].flat().includes(found[0]?.id);
    if (!ok) misses.push(`${q} => ${found[0]?.id || 'nothing'} (expected ${[doc].flat().join(' or ')})`);
  }
  const score = questions.length - misses.length;
  assert.ok(score >= FLOOR, `${score}/${questions.length} below ${FLOOR}:\n${misses.join('\n')}`);
});
