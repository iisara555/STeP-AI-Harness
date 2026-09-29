import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../electron/store';
import { validateDocument, documentText, markdownDocument } from '../src/draft';
import { exportDocument } from '../electron/export';

const rich = validateDocument({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Meeting' }] },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '<Review>', marks: [{ type: 'bold' }] }] }] },
      ],
    },
  ],
});
test('formatting persists across restart and restore and participates in conflict checks', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'step-rich-')), 'store.sqlite');
  let store = new Store(path);
  const s = store.create('test', '');
  store.edit(s.id, 'Ignored renderer text', 0, rich);
  assert.equal(store.session(s.id).draft, documentText(rich));
  store.close();
  store = new Store(path);
  assert.deepEqual(store.session(s.id).document, rich);
  store.edit(s.id, documentText(rich), 1);
  const previous = store.session(s.id).versions[1];
  store.edit(s.id, previous.text, 2, previous.document);
  assert.deepEqual(store.session(s.id).document, rich);
  assert.throws(() => store.edit(s.id, '', 2, rich), /DRAFT_CONFLICT/);
  store.close();
});
test('document boundary rejects executable content and unsupported nesting', () => {
  for (const value of [
    { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://invalid.example' } }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'link', marks: [{ type: 'link' }] }] }] },
    { type: 'doc', content: [{ type: 'heading', attrs: { level: 99 } }] },
    { type: 'doc', content: [{ type: 'text', text: 'invalid child' }] },
  ])
    assert.throws(() => validateDocument(value), /INVALID_DOCUMENT/);
});
test('structured Markdown and PDF preserve formatting and escape source text', async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-rich-export-'));
  await exportDocument(join(home, 'draft.md'), 'md', documentText(rich), async () => Buffer.alloc(0), rich);
  assert.match(await readFile(join(home, 'draft.md'), 'utf8'), /## Meeting/);
  await exportDocument(
    join(home, 'draft.pdf'),
    'pdf',
    documentText(rich),
    async html => {
      assert.match(html, /<h2>Meeting<\/h2>/);
      assert.match(html, /<ul><li><p><strong>&lt;Review&gt;<\/strong>/);
      return Buffer.from('%PDF-test');
    },
    rich,
  );
});

test('model Markdown becomes a bounded, formatted draft', () => {
  const doc = markdownDocument(
    '# บรีฟงาน\n\nเป้าหมาย **ชัดเจน** และ *วัดผลได้*\n\n- ข้อแรก\n  - ข้อย่อย\n- ข้อสอง\n\n3. ลำดับสาม\n4. ลำดับสี่\n\n| หัวข้อ | รายละเอียด |\n|---|---|\n| งบ | 50,000 |\n\n[ลิงก์](https://example.com) `code` <b>html</b>',
  );
  assert.deepEqual(validateDocument(doc), doc);
  const [h, p, bullets, ordered, header, row, last] = doc.content!;
  assert.equal(documentText(header), 'หัวข้อ · รายละเอียด');
  assert.deepEqual(h, { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'บรีฟงาน' }] });
  assert.deepEqual(
    p.content!.map(n => n.marks?.[0]?.type || 'plain'),
    ['plain', 'bold', 'plain', 'italic'],
  );
  assert.equal(bullets.type, 'bulletList');
  assert.equal(bullets.content!.length, 2);
  assert.equal(bullets.content![0].content![1].type, 'bulletList');
  assert.deepEqual(ordered.attrs, { start: 3 });
  assert.equal(documentText(row), 'งบ · 50,000');
  // Links keep only their text and raw HTML stays inert text.
  assert.equal(documentText(last), 'ลิงก์ code <b>html</b>');
});

test('accepting a Markdown proposal keeps its structure in the draft', () => {
  const store = new Store(':memory:');
  const s = store.create('c', 'cc');
  s.proposals.push({ id: 'p', text: '## หัวข้อ\n- รายการ', baseRevision: 0, sources: [], at: '' });
  store.save(s);
  const accepted = store.accept(s.id, 'p');
  assert.equal(accepted.document?.content?.[0].type, 'heading');
  assert.equal(accepted.draft, 'หัวข้อ\nรายการ');
  store.close();
});
