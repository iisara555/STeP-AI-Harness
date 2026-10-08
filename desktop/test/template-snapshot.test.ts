import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, open } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readTemplateSnapshot } from '../electron/document-template-store';
import { attachmentCapabilities } from '../electron/attachments';

test('native selection reads a bounded immutable file, refusing over-limit DOCX before loading its content', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-template-snapshot-')),
    path = join(dir, 'synthetic.docx');
  await writeFile(path, 'selected file');
  const snapshot = await readTemplateSnapshot(path);
  await writeFile(path, 'replacement');
  assert.equal(snapshot.toString(), 'selected file');
  const file = await open(path, 'w');
  await file.truncate(8_000_001);
  await file.close();
  await assert.rejects(readTemplateSnapshot(path), /DOCUMENT_TEMPLATE_LIMIT/);
});
test('a verified sample-free outline does not authorize sending withheld original source text', () => {
  const report = {
    action: 'human-confirm',
    extractionStatus: 'text-extracted',
    reviewReasons: ['layout-images-metadata-and-embedded-content-not-scanned'],
  };
  assert.deepEqual(attachmentCapabilities(report, false), { sourceUsable: false, usable: false, reason: 'ATTACH_NEEDS_REVIEW' });
  assert.deepEqual(attachmentCapabilities(report, true), { sourceUsable: false, usable: true, reason: undefined });
  const safe = { ...report, redactedText: 'source that passed its own gate' };
  assert.equal(attachmentCapabilities(safe, false).sourceUsable, true);
});
