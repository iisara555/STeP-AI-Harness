import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { computeDraftDiff } from '../src/draft-diff';
import { Store } from '../electron/store';
import { WorkService, type Harness } from '../electron/service';

const root = resolve('..');
const routing: any = await import('../../src/modules/router/service.js');
const boundary: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');
const documents: any = await import('../../src/modules/privacy/document.js');
const outputs: any = await import('../../src/modules/output-manager.js');

function fixture() {
  const store = new Store(':memory:');
  store.put('connection', 'c', { id: 'c', provider: 'openai', mode: 'api', model: 'gpt-5', ready: true });
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc', assistant: 'Test', theme: 'system' });
  const session = store.create('c', 'cc');
  return { store, session };
}

test('computeDraftDiff groups Thai/CRLF edits into contextual hunks and handles identical or large drafts', () => {
  const identical = computeDraftDiff('หัวข้อ 1\r\nเนื้อหาเดิม', 'หัวข้อ 1\nเนื้อหาเดิม');
  assert.equal(identical.changed, false);
  assert.equal(identical.added, 0);
  assert.equal(identical.removed, 0);
  assert.equal(identical.hunks.length, 0);

  const before = ['บรรทัด 1', 'บรรทัด 2', 'บรรทัด 3', 'บรรทัด 4', 'บรรทัด 5', 'บรรทัด 6', 'บรรทัด 7', 'งบประมาณ 10,000 บาท'].join('\n');
  const after = [
    'บรรทัด 1',
    'บรรทัด 2',
    'บรรทัด 3',
    'บรรทัด 4',
    'บรรทัด 5',
    'บรรทัด 6',
    'บรรทัด 7',
    'งบประมาณ 15,000 บาท',
    'หมายเหตุ: เพิ่ม Foamboard 150x75 cm',
  ].join('\n');
  const diff = computeDraftDiff(before, after, 2);
  assert.equal(diff.changed, true);
  assert.equal(diff.removed, 1);
  assert.equal(diff.added, 2);
  assert.equal(diff.hunks.length, 1);
  assert.equal(diff.hunks[0].skippedBefore, 5);
  assert.deepEqual(
    diff.hunks[0].lines.map(l => `${l.kind}:${l.text}`),
    [
      'context:บรรทัด 6',
      'context:บรรทัด 7',
      'remove:งบประมาณ 10,000 บาท',
      'add:งบประมาณ 15,000 บาท',
      'add:หมายเหตุ: เพิ่ม Foamboard 150x75 cm',
    ],
  );

  // Large inputs beyond the 250k DP cap fall back without throwing or blowing memory.
  const largeBefore = Array.from({ length: 600 }, (_, i) => `line-before-${i}`).join('\n');
  const largeAfter = Array.from({ length: 600 }, (_, i) => `line-after-${i}`).join('\n');
  const largeDiff = computeDraftDiff(largeBefore, largeAfter);
  assert.equal(largeDiff.changed, true);
  assert.equal(largeDiff.removed, 600);
  assert.equal(largeDiff.added, 600);
});

test('Store records origin/label/restoredFrom metadata, keeps immutable history, and stageMessage replaces stale proposals', () => {
  const { store, session } = fixture();
  try {
    // 1. Accept AI proposal attaches origin='ai' and prompt label to active draft.
    store.save({
      ...store.session(session.id),
      messages: [
        { role: 'user', text: 'ช่วยร่างบันทึกข้อความขออนุมัติงบ', at: '' },
        { role: 'assistant', text: 'ฉบับที่ 1', at: '' },
      ],
      proposals: [
        { id: 'p1', text: 'ฉบับที่ 1 จาก AI', baseRevision: 0, prompt: 'ช่วยร่างบันทึกข้อความขออนุมัติงบ', sources: ['a.md'], at: '' },
      ],
    });
    const r1 = store.accept(session.id, 'p1');
    assert.equal(r1.revision, 1);
    assert.deepEqual(r1.draftMeta, { origin: 'ai', label: 'ช่วยร่างบันทึกข้อความขออนุมัติงบ' });

    // 2. Manual edit moves rev 1 AI metadata into versions[] and sets draftMeta.origin='manual'.
    const r2 = store.edit(session.id, 'ฉบับที่ 2 แก้เอง', r1.revision);
    assert.equal(r2.revision, 2);
    assert.deepEqual(r2.draftMeta, { origin: 'manual' });
    const v1 = r2.versions.find(v => v.revision === 1)!;
    assert.equal(v1.origin, 'ai');
    assert.equal(v1.label, 'ช่วยร่างบันทึกข้อความขออนุมัติงบ');

    // 3. Restoring rev 1 records restoredFrom=1 without mutating existing version entries.
    const r3 = store.restore(session.id, 1);
    assert.equal(r3.revision, 3);
    assert.equal(r3.draft, 'ฉบับที่ 1 จาก AI');
    assert.deepEqual(r3.draftMeta, { origin: 'restore', label: 'ช่วยร่างบันทึกข้อความขออนุมัติงบ', restoredFrom: 1 });
    assert.equal(r3.versions.find(v => v.revision === 2)?.origin, 'manual');

    // 4. stageMessage on documentTool replaces any older unaccepted proposal and attaches preceding prompt.
    const doc = store.session(session.id);
    doc.documentTool = 'memo';
    doc.messages.push(
      { role: 'user', text: 'ปรับถ้อยคำใหม่ให้กระชับ', at: '' },
      { role: 'assistant', text: '# บันทึกข้อความ\n\nเนื้อหากระชับแล้ว', at: '' },
    );
    doc.proposals = [{ id: 'stale', text: 'เก่าค้างอยู่', baseRevision: doc.revision, sources: [], at: '' }];
    store.save(doc);
    const staged = store.stageMessage(session.id, doc.messages.length - 1);
    assert.equal(staged.proposals.length, 1);
    assert.equal(staged.proposals[0].prompt, 'ปรับถ้อยคำใหม่ให้กระชับ');
    assert.match(staged.proposals[0].text, /เนื้อหากระชับแล้ว/);

    // 5. shelveDocument via startConversationDocument preserves origin metadata on shelved versions.
    const shelved = store.startConversationDocument(session.id);
    assert.equal(shelved.draftMeta, undefined);
    assert.ok(shelved.versions.some(v => v.origin === 'restore' && v.restoredFrom === 1));
    assert.ok(shelved.versions.some(v => v.origin === 'ai' && v.label === 'ปรับถ้อยคำใหม่ให้กระชับ'));
  } finally {
    store.close();
  }
});

test('WorkService draft runs replace stale unaccepted proposal and attach prompt summary', async () => {
  const { store, session } = fixture();
  try {
    const harness: Harness = {
      root,
      route: (q, opts) => routing.queryStepRouter(q, { autoRoute: false, authorityChecks: true, ...opts }),
      contextPolicy: boundary.classifyContextPolicy,
      privacy: privacy.evaluatePrivacyGate,
      skillMetadata: async id => {
        const m = await routing.loadSkillContextMetadata(id);
        return { ...m, mandatoryReferences: await routing.loadDocumentContextMetadata(m.mandatory) };
      },
      documentPrivacy: documents.evaluateDocumentPrivacy,
      nextOutput: outputs.getNextOutputPath,
    };
    let turn = 0;
    const service = new WorkService(
      store,
      harness,
      async () => ({
        context: { cwd: root, env: {} },
        adapter: {
          run: async () => {
            turn++;
            return turn === 1 ? '# ร่างรอบแรก' : '# ร่างรอบสอง';
          },
        },
      }),
      () => {},
    );
    await service.run(session.id, 'ช่วยร่างบันทึกข้อความขอเชิญประชุม', '', true, undefined, 'draft');
    await service.run(session.id, 'ช่วยเพิ่มวันเวลา 10.00 น.', '', true, undefined, 'draft');
    const final = store.session(session.id);
    assert.equal(final.proposals.length, 1);
    assert.match(final.proposals[0].text, /ร่างรอบสอง/);
    assert.equal(final.proposals[0].prompt, 'ช่วยเพิ่มวันเวลา 10.00 น.');
  } finally {
    store.close();
  }
});
