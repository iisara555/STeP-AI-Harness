import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OrganizationKnowledge } from '../electron/knowledge';

const routing: any = await import('../../src/modules/router/service.js');

// Measured 53 of 55 on 2026-10-09 (keywords in manifest/documents.yaml). 59 of 61 on 2026-10-10 after the STeP MIS ISO
// register: six questions added (five answered by the register, one more outside question), the same two misses as
// before, and the MIS register accepted for "ฟอร์มขอใช้บริการของทีม CC รหัสอะไร" because its CC section lists the
// current FM-CC-010. A change to the search, the documents or their keywords must not drop below this; raise it when a
// change answers more.
const FLOOR = 59;

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
