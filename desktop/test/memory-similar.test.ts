import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../electron/store';
import { Memories, similarMemories } from '../electron/memory';
import { defaultPolicy } from '../electron/policy';
import type { MemoryEntry } from '../src/types';
const privacy: any = await import('../../src/modules/privacy/index.js');
const scan = privacy.evaluatePrivacyGate;

const saved = (id: string, name: string, text: string) => ({ id, name, text }) as MemoryEntry;
const ids = (list: { id: string }[]) => list.map(m => m.id);

test('a memory that mostly repeats a saved one, or has its name, is found before saving', () => {
  const entries = [
    saved('friday', 'รายงานประชุมทีมตลาด', 'รายงานประชุมทีมตลาดส่งทุกวันศุกร์'),
    saved('receipt', 'ตรวจใบเสร็จ', 'ใบเสร็จต้องมีเลขประจำตัวผู้เสียภาษีของผู้ขายทุกใบ'),
    saved('style', 'Answer style', 'Prefer concise responses.'),
  ];
  // The same fact with a different day: both would reach the AI and disagree.
  assert.deepEqual(ids(similarMemories({ name: 'กำหนดส่งรายงาน', text: 'รายงานประชุมทีมตลาดส่งทุกวันจันทร์' }, entries)), ['friday']);
  assert.deepEqual(ids(similarMemories({ name: 'Style', text: 'Prefer detailed responses with tables.' }, entries)), ['style']);
  assert.deepEqual(ids(similarMemories({ name: ' answer STYLE ', text: 'Use bullet points.' }, entries)), ['style'], 'same name');
  assert.deepEqual(similarMemories({ name: 'จองรถตู้', text: 'การจองรถตู้ต้องแจ้งล่วงหน้าสองวัน' }, entries), []);
  // Editing a memory does not count the memory itself.
  assert.deepEqual(similarMemories({ id: 'friday', name: 'รายงานประชุมทีมตลาด', text: 'รายงานประชุมทีมตลาดส่งทุกวันจันทร์' }, entries), []);
});

test('Memories.similar checks the memories this computer can read and never saves anything', async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-similar-'));
  const store = new Store(':memory:'),
    policy = defaultPolicy();
  store.put('settings', 'main', { workspace: '', team: 'cc' });
  const memories = new Memories(store, home, () => policy, scan);
  const first = await memories.save({
    name: 'กำหนดส่งรายงาน',
    text: 'รายงานประชุมทีมตลาดส่งทุกวันศุกร์',
    type: 'project',
    scope: 'private',
    importance: 0.5,
    ttl_days: 0,
  });
  assert.deepEqual(ids(await memories.similar({ name: 'วันส่งรายงาน', text: 'รายงานประชุมทีมตลาดส่งทุกวันจันทร์' })), [first.id]);
  assert.deepEqual(await memories.similar({ name: 'x', text: '' }), []);
  assert.deepEqual(await memories.similar(null), []);
  assert.equal((await memories.list()).length, 1);
  store.close();
});
