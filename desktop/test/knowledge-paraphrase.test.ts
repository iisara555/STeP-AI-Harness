import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OrganizationKnowledge } from '../electron/knowledge';

const routing: any = await import('../../src/modules/router/service.js');

type Case = { q: string; doc: string | string[]; earlier?: string };

// Keyword search on 2026-11-01: 15 of 38 paraphrases, 7 of 8 follow-ups. The misses below are what A1 (pick a document from the table of contents
// when keywords find nothing), S1 and A6 (semantic search) must lift; raise the floors when they do, never lower them.
const PARAPHRASE_FLOOR = 15;
const FOLLOW_UP_FLOOR = 7;

/** The same query Desktop builds for a chat turn (service.ts): the conversation's first request, then the new message. */
const turnQuery = (item: Case) => [...new Set([item.earlier, item.q].filter(Boolean))].join('\n');

async function measure(cases: Case[]) {
  const knowledge = new OrganizationKnowledge(resolve('..'), routing.loadDocumentCatalog);
  const misses: string[] = [];
  for (const item of cases) {
    const found = await knowledge.search(turnQuery(item));
    const ok = item.doc === 'none' ? !found.length : [item.doc].flat().includes(found[0]?.id);
    if (!ok)
      misses.push(
        `${item.earlier ? `[${item.earlier}] ` : ''}${item.q} => ${found[0]?.id || 'nothing'} (expected ${[item.doc].flat().join(' or ')})`,
      );
  }
  return { score: cases.length - misses.length, misses };
}

const suite = async () =>
  JSON.parse(await readFile('eval/knowledge-paraphrases.json', 'utf8')) as { paraphrases: Case[]; followUps: Case[] };

test('questions worded differently from the documents still find them (paraphrase floor)', async () => {
  const { paraphrases } = await suite();
  const { score, misses } = await measure(paraphrases);
  assert.ok(score >= PARAPHRASE_FLOOR, `${score}/${paraphrases.length} below ${PARAPHRASE_FLOOR}:\n${misses.join('\n')}`);
});

test('follow-up questions in a chat find the document of the new question (follow-up floor)', async () => {
  const { followUps } = await suite();
  const { score, misses } = await measure(followUps);
  assert.ok(score >= FOLLOW_UP_FLOOR, `${score}/${followUps.length} below ${FOLLOW_UP_FLOOR}:\n${misses.join('\n')}`);
});

test('the paraphrase set names only registered documents and covers each one with more than one question', async () => {
  const { paraphrases, followUps } = await suite();
  const registered = new Set(((await routing.loadDocumentCatalog(resolve('..'))) as { id: string }[]).map(d => d.id));
  const counts = new Map<string, number>();
  for (const item of [...paraphrases, ...followUps])
    for (const doc of [item.doc].flat()) {
      if (doc !== 'none') assert.ok(registered.has(doc), `${item.q}: ${doc} is not in manifest/documents.yaml`);
      counts.set(doc, (counts.get(doc) || 0) + 1);
    }
  assert.ok((counts.get('none') || 0) >= 4, 'general questions must stay in the set so retrieval cannot win by always answering');
  assert.equal(new Set(paraphrases.map(p => p.q)).size, paraphrases.length, 'no repeated question');
});
