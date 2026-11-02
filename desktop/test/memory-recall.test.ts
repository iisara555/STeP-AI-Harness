import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../electron/store';
import { Memories, memoryTerms } from '../electron/memory';
import { defaultPolicy } from '../electron/policy';
const privacy: any = await import('../../src/modules/privacy/index.js');
const scan = privacy.evaluatePrivacyGate;

async function memoriesWith(entries: { name: string; text: string; type: string }[]) {
  const home = await mkdtemp(join(tmpdir(), 'step-recall-'));
  const store = new Store(':memory:'),
    policy = defaultPolicy();
  store.put('settings', 'main', { workspace: '', team: 'cc' });
  const memories = new Memories(store, home, () => policy, scan);
  for (const e of entries) await memories.save({ ...e, scope: 'private', importance: 0.5, ttl_days: 0 } as any);
  return { memories, store };
}
const names = (list: { name: string }[]) => list.map(m => m.name);

test('a Thai sentence is split into topic words, without filler and question words', () => {
  const terms = memoryTerms('ช่วยสรุปรายงานประชุมทีมการตลาดให้หน่อย');
  for (const word of ['สรุป', 'รายงาน', 'ประชุม', 'ตลาด']) assert.ok(terms.includes(word), word);
  for (const word of ['ช่วย', 'ให้', 'หน่อย', 'การ']) assert.ok(!terms.includes(word), word);
  assert.ok(!terms.includes('ช่วยสรุปรายงานประชุมทีมการตลาดให้หน่อย'), 'the whole sentence is not one term');
  assert.deepEqual(memoryTerms('Summarize the marketing meeting'), ['summarize', 'the', 'marketing', 'meeting']);
});

test('a Thai question recalls the project memory it is about, and not unrelated ones', async () => {
  const { memories, store } = await memoriesWith([
    { name: 'รายงานประชุมทีมตลาด', text: 'รายงานประชุมทีมตลาดใช้แม่แบบของฝ่ายสื่อสารองค์กร และส่งทุกวันศุกร์', type: 'project' },
    { name: 'ตรวจใบเสร็จ', text: 'ใบเสร็จต้องมีเลขประจำตัวผู้เสียภาษีของผู้ขายทุกใบ', type: 'reference' },
  ]);
  assert.deepEqual(names(await memories.relevant('ช่วยสรุปรายงานประชุมทีมการตลาดให้หน่อย')), ['รายงานประชุมทีมตลาด']);
  assert.deepEqual(names(await memories.relevant('ตรวจใบเสร็จร้านค้านี้ให้ที')), ['ตรวจใบเสร็จ']);
  store.close();
});

test('a question made only of question and filler words recalls no project memory', async () => {
  const { memories, store } = await memoriesWith([
    { name: 'รายงานประชุมทีมตลาด', text: 'รายงานประชุมทีมตลาดใช้แม่แบบของฝ่ายสื่อสารองค์กร', type: 'project' },
  ]);
  assert.deepEqual(await memories.relevant('มีอะไรบ้าง ช่วยหน่อยครับ'), []);
  assert.deepEqual(await memories.relevant('การเดินทาง'), []);
  store.close();
});

test('the memory sharing more topic words with the question ranks first', async () => {
  const { memories, store } = await memoriesWith([
    { name: 'ประชุมทั่วไป', text: 'ห้องประชุมใหญ่ต้องจองล่วงหน้าสามวัน', type: 'project' },
    { name: 'รายงานประชุมทีมตลาด', text: 'รายงานประชุมทีมตลาดส่งทุกวันศุกร์', type: 'project' },
  ]);
  assert.deepEqual(names(await memories.relevant('สรุปรายงานประชุมทีมตลาด')), ['รายงานประชุมทีมตลาด', 'ประชุมทั่วไป']);
  store.close();
});

test('English questions still recall English memories', async () => {
  const { memories, store } = await memoriesWith([
    { name: 'Marketing meeting', text: 'Marketing meeting notes use the communications template.', type: 'project' },
  ]);
  assert.deepEqual(names(await memories.relevant('Summarize the marketing meeting')), ['Marketing meeting']);
  assert.deepEqual(await memories.relevant('Check this receipt'), []);
  store.close();
});
