import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachmentReason } from '../electron/attachments';

const documents: any = await import('../../src/modules/privacy/document.js');

// A minimal PDF: pages with text get a text layer; an empty string makes a page with none, like a scanned page.
function pdf(pages: string[]) {
  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((text, i) => {
    const stream = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : '';
    objects[4 + i * 2] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`;
    objects[5 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map(o => `${String(o).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

test('every file the scan withholds gets a reason the person can act on', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-attach-'));
  try {
    const scan = async (name: string, bytes: Buffer | string) => {
      await writeFile(join(dir, name), bytes);
      return attachmentReason(await documents.evaluateDocumentPrivacy(join(dir, name), { includeRedacted: true }));
    };
    assert.equal(await scan('minutes.pdf', pdf(['Meeting minutes: team A sends the draft by 1 October'])), undefined);
    // One page without a text layer (a scanned signature page, a logo cover) withholds the whole file.
    assert.equal(await scan('signed.pdf', pdf(['Meeting minutes: team A sends the draft', ''])), 'ATTACH_PAGES_WITHOUT_TEXT');
    assert.equal(await scan('scan.pdf', pdf(['', ''])), 'ATTACH_NO_TEXT');
    assert.equal(await scan('budget.xlsx', 'not a supported type'), 'ATTACH_UNSUPPORTED');
    assert.equal(await scan('notes.txt', 'บันทึกการประชุม ผู้เข้าร่วม นายสมชาย ใจดี'), undefined, 'names are masked, not refused');
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

test('reasons follow the scan report', () => {
  assert.equal(attachmentReason({ action: 'block-external', redactedText: 'x' }), 'ATTACH_SENSITIVE');
  assert.equal(attachmentReason({ extractionStatus: 'unavailable', reviewReasons: ['page-limit'] }), 'ATTACH_TOO_LARGE');
  assert.equal(attachmentReason({ extractionStatus: 'unavailable', reviewReasons: ['processing-time-limit'] }), 'ATTACH_TIMEOUT');
  assert.equal(attachmentReason({ extractionStatus: 'unavailable', reviewReasons: ['parser-failed'] }), 'ATTACH_READ_FAILED');
  assert.equal(attachmentReason({ extractionStatus: 'text-extracted' }), 'ATTACH_NEEDS_REVIEW');
  assert.equal(attachmentReason({ extractionStatus: 'text-extracted', redactedText: 'x'.repeat(100_001) }), 'ATTACH_TOO_LARGE');
  assert.equal(attachmentReason({ extractionStatus: 'text-extracted', action: 'human-confirm', redactedText: 'ok' }), undefined);
});
