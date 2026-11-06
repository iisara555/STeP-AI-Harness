import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import jsQR from 'jsqr';
import { DOMParser } from '@xmldom/xmldom';
import { invitationUrl, resolveInvitation, invitationParts, invitationReview } from '../src/invitation';
import { resolvePresentation } from '../src/document-presentation';
import { requestedDocumentTool, requestedLetterVariant } from '../src/document-intent';
import { documentRequest, documentVariant } from '../src/document-tools';
import { markdownDocument, documentText } from '../src/draft';
import { invitationQrs } from '../electron/invitation-qr';
import { exportDocument } from '../electron/export';
import { Store } from '../electron/store';

const { PNG } = createRequire(import.meta.url)('pngjs');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const sample = (await readFile(new URL('./fixtures/step-invitation.md', import.meta.url), 'utf8')).trim();
const decode = (bytes: Buffer) => {
  const image = PNG.sync.read(bytes);
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data;
};

test('local review distinguishes event, deadline, weekday and pending attachments without rewriting prose', () => {
  const review = invitationReview(
    sample.replace('15 มกราคม 2570', '21 มกราคม 2570').replace('วันที่ 20 มกราคม', 'วันศุกร์ที่ 20 มกราคม'),
  ).join('\n');
  assert.match(review, /วันในสัปดาห์ไม่ตรง/);
  assert.match(review, /วันปิดตอบรับอยู่หลังวันจัดงาน/);
  assert.match(review, /ข้อมูลที่ยังต้องยืนยัน/);
  assert.match(review, /ตรวจไฟล์สิ่งที่ส่งมาด้วย/);
  assert.doesNotMatch(invitationReview(sample).join('\n'), /วันปิดตอบรับอยู่หลัง|วันในสัปดาห์ไม่ตรง/);
});

test('invitation intent and subtype are allowlisted independently from model output', () => {
  assert.equal(requestedDocumentTool('ช่วยร่างหนังสือเชิญเข้าร่วมกิจกรรม'), 'letter');
  assert.equal(requestedLetterVariant('ช่วยร่างหนังสือเชิญ'), 'invitation');
  assert.equal(requestedDocumentTool('ช่วยตรวจร่างหนังสือเชิญนี้'), undefined);
  assert.equal(requestedDocumentTool('ยังไม่ต้องร่างหนังสือเชิญ'), undefined);
  assert.equal(requestedLetterVariant('ช่วยร่างเลย', ['ต้องการหนังสือเชิญ']), 'invitation');
  assert.equal(documentVariant('letter', 'invitation'), 'invitation');
  assert.throws(() => documentVariant('memo', 'invitation'), /INVALID_DOCUMENT_VARIANT/);
  assert.throws(() => documentVariant('letter', '../../private'), /INVALID_DOCUMENT_VARIANT/);
  const fields = JSON.parse(
    documentRequest('letter', { recipientPosition: 'ตำแหน่งสังเคราะห์', rsvpDeadline: '15 มกราคม 2570' }, 'invitation').sourceText,
  ).fields;
  assert.equal(fields.recipientPosition.provenance, 'USER_INPUT');
  assert.equal(fields.rsvpDeadline.value, '15 มกราคม 2570');
  const qr = documentRequest(
    'letter',
    { rsvpUrl: 'https://example.org/rsvp?code=0007', venueUrl: 'https://example.org/map' },
    'invitation',
  );
  assert.doesNotMatch(qr.sourceText, /https:\/\/|code=0007/);
  assert.equal(JSON.parse(qr.sourceText).fields.rsvpUrl.localOnly, true);
});

test('QR input rejects non-web URLs and preserves the current task URL byte for byte', () => {
  const url = 'https://example.org/rsvp?code=0007&name=a%20b#section';
  assert.equal(invitationUrl('  ' + url + '  '), url);
  assert.deepEqual(resolveInvitation({}), { rsvpUrl: '', venueUrl: '' });
  assert.equal(resolvePresentation().invitation, undefined, 'legacy documents keep their stored layout');
  for (const value of [
    'file:///private',
    'https:example.org',
    'https://example.org/' + 'ก'.repeat(900),
    'javascript:alert(1)',
    'data:image/png;base64,foo',
    'https://u:p@example.org',
    'https://example.org/\nx',
    'https://',
    7,
    {},
    'https://example.org/' + 'a'.repeat(2048),
  ])
    assert.throws(() => invitationUrl(value), /INVALID_INVITATION_URL/);
  assert.throws(() => resolveInvitation({ rsvpUrl: '', assetId: 'other-task' }), /INVALID_DOCUMENT_PRESENTATION/);
});

test('invitation grouping preserves every current editor block including manual revisions', () => {
  const doc = markdownDocument(sample.replace('ผู้รับสังเคราะห์', 'ผู้รับที่เจ้าของแก้เอง'));
  const parts = invitationParts(doc);
  assert.equal(Object.values(parts).flat().length, doc.content!.length);
  assert.equal(new Set(Object.values(parts).flat()).size, doc.content!.length);
  assert.match(documentText({ type: 'doc', content: parts.body }), /ผู้รับที่เจ้าของแก้เอง/);
  assert.equal(parts.signature.length, 3);
  assert.match(documentText(parts.contact[0]), /synthetic@example.org/);
});

test('DOCX and PDF use the latest draft and QR payloads for zero, one and two links', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'step-invitation-test-'));
  try {
    for (const links of [
      { rsvpUrl: '', venueUrl: '' },
      { rsvpUrl: 'https://example.org/new?code=0007', venueUrl: '' },
      { rsvpUrl: 'https://example.org/new?code=0007', venueUrl: 'https://example.org/map#room' },
    ]) {
      const expected = Object.values(links).filter(Boolean);
      const qrs = await invitationQrs(links);
      assert.deepEqual(
        qrs.map(q => decode(q.bytes)),
        expected,
      );
      const doc = markdownDocument(sample.replace('ผู้รับสังเคราะห์', 'ผู้รับแก้ไขล่าสุด'));
      const presentation = { invitation: links, pageNumber: 'none', embedFonts: false };
      const options = { documentTool: 'letter', presentation };
      const file = join(folder, 'invitation.docx');
      await exportDocument(file, 'docx', documentText(doc), async () => Buffer.alloc(0), doc, options);
      const zip = await JSZip.loadAsync(await readFile(file));
      const xml = await zip.file('word/document.xml')!.async('string');
      const body = new DOMParser().parseFromString(xml, 'application/xml');
      const text = Array.from(body.getElementsByTagNameNS(W, 't'))
        .map(n => n.textContent)
        .join('')
        .replaceAll('\u200b', '');
      assert.equal(text.replace(/\s/g, ''), (documentText(doc) + qrs.map(q => q.label).join('')).replace(/\s/g, ''));
      assert.match(xml, /w:cantSplit/);
      assert.match(xml, /w:lineRule="exact"/);
      assert.match(xml, /w:hanging="510"/);
      const decoded: string[] = [];
      for (const path of Object.keys(zip.files).filter(p => p.startsWith('word/media/') && !p.endsWith('/'))) {
        const data = decode(await zip.file(path)!.async('nodebuffer'));
        if (data) decoded.push(data);
      }
      assert.deepEqual(decoded.sort(), expected.toSorted());
      let html = '';
      await exportDocument(
        join(folder, 'invitation.pdf'),
        'pdf',
        documentText(doc),
        async input => {
          html = input;
          return Buffer.from('synthetic-pdf');
        },
        doc,
        options,
      );
      assert.match(html, /ผู้รับแก้ไขล่าสุด/);
      assert.equal((html.match(/<figure>/g) || []).length, expected.length);
      assert.match(html, /grid-template-columns:6cm 3cm 7cm/);
      assert.match(html, /padding-left:0.9cm;text-indent:-0.9cm/);
      assert.match(html, /font-family:'TH SarabunPSK';font-weight:400;src:url\(data:font\/ttf;base64,/);
      const embedded = [...html.matchAll(/data:image\/png;base64,([A-Za-z\d+/=]+)/g)]
        .map(m => decode(Buffer.from(m[1], 'base64')))
        .filter(Boolean);
      assert.deepEqual(embedded.sort(), expected.toSorted());
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('invitation links are revisioned, restored, and cannot be applied to unrelated or native-template documents', () => {
  const store = new Store(':memory:');
  try {
    const session = store.create('test', 'ga');
    assert.throws(() => store.edit(session.id, '', 0, undefined, { invitation: {} }), /INVALID_DOCUMENT_PRESENTATION/);
    session.documentTool = 'letter';
    session.documentVariant = 'invitation';
    store.save(session);
    const first = store.edit(session.id, sample, 0, markdownDocument(sample), {
      invitation: { rsvpUrl: 'https://example.org/old' },
      pageNumber: 'none',
    });
    const second = store.edit(session.id, first.draft, first.revision, first.document, {
      invitation: { rsvpUrl: 'https://example.org/new' },
      pageNumber: 'none',
    });
    const old = second.versions.find(v => v.presentation?.invitation?.rsvpUrl === 'https://example.org/old')!;
    assert.ok(old);
    const restored = store.edit(session.id, old.text, second.revision, old.document, old.presentation);
    assert.equal(restored.presentation?.invitation?.rsvpUrl, 'https://example.org/old');
    assert.throws(() => store.edit(session.id, '', 0, undefined, old.presentation), /DRAFT_CONFLICT/);
    assert.throws(() => store.edit(session.id, restored.draft, restored.revision, restored.document, {}), /INVALID_DOCUMENT_PRESENTATION/);
    const locked = store.session(session.id);
    locked.documentTemplate = { key: 'synthetic-template', sha256: 'synthetic', name: 'synthetic.docx', font: 'TH Sarabun New' };
    store.save(locked);
    assert.throws(
      () => store.edit(session.id, locked.draft, locked.revision, locked.document, old.presentation),
      /INVALID_DOCUMENT_PRESENTATION/,
    );
  } finally {
    store.close();
  }
});
