import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDocumentLayout, probeDocumentFont } from '../src/document-layout';

test('working document layouts distinguish explicit fonts and reject arbitrary profiles', () => {
  assert.equal(resolveDocumentLayout('memo').font, 'TH Sarabun New');
  assert.equal(resolveDocumentLayout('tor').font, 'TH Sarabun PSK');
  assert.equal(resolveDocumentLayout(undefined).font, 'TH Sarabun New');
  assert.equal(resolveDocumentLayout('memo', 'TH Sarabun New').font, 'TH Sarabun New');
  assert.throws(() => resolveDocumentLayout('../../private'), /INVALID_DOCUMENT_TOOL/);
  assert.throws(() => resolveDocumentLayout('memo', 'Unknown Font'), /INVALID_EXPORT_FONT/);
});

test('font probing distinguishes measurable local faces, fallback-only output and unavailable canvas', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  try {
    let present = false;
    const ctx = { font: '', measureText: () => ({ width: present && ctx.font.includes('TH Sarabun PSK') ? 99 : 100 }) };
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => ctx }) } });
    assert.equal(probeDocumentFont('TH Sarabun PSK'), 'missing');
    present = true;
    assert.equal(probeDocumentFont('TH Sarabun PSK'), 'available');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => null }) } });
    assert.equal(probeDocumentFont('TH Sarabun PSK'), 'unknown');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
