import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../electron/store';
import { DocumentTemplates } from '../electron/document-template-store';

test('local templates are immutable snapshots owned by one session and never part of JSON export or a fork', () => {
  const store = new Store(':memory:');
  const a = store.create('c', 'ga'),
    b = store.create('c', 'ga');
  const templates = new DocumentTemplates(store);
  const bytes = Buffer.from('synthetic local native template');
  const info = templates.save(a.id, bytes, 'memo', 'synthetic.docx', 'TH SarabunIT๙');
  a.documentTool = 'memo';
  a.documentTemplate = info;
  store.save(a);
  bytes.fill(0);
  assert.equal(templates.load(store.session(a.id)).toString(), 'synthetic local native template');
  assert.throws(() => templates.load({ ...b, documentTool: 'memo', documentTemplate: info }), /DOCUMENT_TEMPLATE_NOT_FOUND/);
  assert.throws(() => templates.load({ ...a, documentTool: 'project' }), /DOCUMENT_TEMPLATE_NOT_FOUND/);
  assert.ok(!store.exportSession(a.id, 'json').includes(info.key));
  assert.equal(store.fork(a.id).documentTemplate, undefined);
  templates.remove(a.id);
  assert.throws(() => templates.load(a), /DOCUMENT_TEMPLATE_NOT_FOUND/);
  store.close();
});

test('a modified local template cannot bypass the stored fingerprint', () => {
  const store = new Store(':memory:');
  const session = store.create('c', 'ga');
  const templates = new DocumentTemplates(store);
  session.documentTool = 'memo';
  session.documentTemplate = templates.save(session.id, Buffer.from('first'), 'memo', 'test.docx', 'TH Sarabun PSK');
  const key = session.documentTemplate.key;
  const record = store.get<any>('document-template', key);
  record.data = Buffer.from('replaced').toString('base64');
  store.put('document-template', key, record);
  assert.throws(() => templates.load(session), /DOCUMENT_TEMPLATE_NOT_FOUND/);
  store.close();
});
