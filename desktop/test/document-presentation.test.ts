import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../electron/store';
import { markdownDocument, documentText } from '../src/draft';

test('presentation is revisioned with the draft, survives restart and rejects stale writers', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'step-presentation-')), 'workspace.sqlite');
  let store = new Store(file);
  const session = store.create('synthetic', 'SHARED'),
    doc = markdownDocument('ข้อความสังเคราะห์');
  const first = store.edit(session.id, documentText(doc), 0, doc, { preset: 'book', thaiBreaks: false });
  const second = store.edit(session.id, first.draft, first.revision, first.document, { preset: 'report' });
  const version = second.versions.find(v => v.presentation?.preset === 'book')!;
  assert.ok(version);
  assert.throws(() => store.edit(session.id, first.draft, 0, doc, { preset: 'saraban' }), /DRAFT_CONFLICT/);
  store.close();
  store = new Store(file);
  const restored = store.edit(session.id, version.text, store.session(session.id).revision, version.document, version.presentation);
  assert.equal(restored.presentation?.preset, 'book');
  assert.equal(restored.presentation?.thaiBreaks, false);
  assert.ok(!restored.draft.includes('\u200b'));
  store.close();
});
