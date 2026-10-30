import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { WorkService, type Harness } from '../electron/service';
import { Store } from '../electron/store';
import { googleChange, googleChangeLabel, googleResourceUrl, GOOGLE_CHANGE_LIMIT } from '../src/google-changes';
import { googleChangesEn } from '../src/locales/google-changes-en';
import { GOOGLE_OPERATIONS } from '../electron/google-operations';
import type { Connection } from '../src/types';
const routing: any = await import('../../src/modules/router/service.js');
const boundary: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');
const catalog: any = await import('../../src/modules/skills/catalog.js');
const root = resolve('..');
const at = '2026-10-30T09:00:00.000Z';
const doc = 'https://docs.google.com/document/d/synthetic-doc_1/edit';

test('a completed write becomes a change with its service, Google’s name for it and its own link', () => {
  assert.deepEqual(
    googleChange(
      'docs.create',
      { status: 'completed', resourceUrl: doc, data: { documentId: 'synthetic-doc_1', title: 'สรุปประชุม' } },
      at,
    ),
    { operation: 'docs.create', service: 'docs', title: 'สรุปประชุม', url: doc, at },
  );
  assert.deepEqual(googleChange('gmail.send', { status: 'completed', data: { id: 'm1', threadId: 't1' } }, at), {
    operation: 'gmail.send',
    service: 'gmail',
    at,
  });
  const event = 'https://www.google.com/calendar/event?eid=c3ludGhldGlj';
  assert.equal(
    googleChange('calendar.createEvent', { status: 'completed', data: { summary: 'ประชุมทีม', htmlLink: event } }, at)?.url,
    event,
  );
  assert.equal(googleChange('appscript.run', { status: 'completed', data: {} }, at)?.service, 'scripts');
});

test('a change keeps no unchecked link, no mail text and nothing from a write that did not complete', () => {
  assert.equal(googleChange('docs.create', { status: 'failed', resourceUrl: doc }), undefined);
  assert.equal(googleChange('unknown.op', { status: 'completed' }), undefined);
  const lookalike = googleChange('calendar.createEvent', {
    status: 'completed',
    data: { summary: 'x', htmlLink: 'https://www.google.com.evil.example/calendar/event?eid=abc' },
  });
  assert.equal(lookalike?.url, undefined);
  // An email's subject or body is not a name: nothing of the message is kept.
  assert.equal(googleChange('gmail.send', { status: 'completed', data: { title: 'subject', name: 'x' } })?.title, undefined);
  const long = googleChange('docs.create', { status: 'completed', data: { title: 'ก'.repeat(300) + '\n' } });
  assert.equal(long?.title?.length, 120);
  for (const url of [
    doc,
    'https://docs.google.com/spreadsheets/d/abc/edit',
    'https://drive.google.com/file/d/abc/view',
    'https://script.google.com/home/projects/abc/edit',
  ])
    assert.equal(googleResourceUrl(url), true, url);
  for (const url of [
    'http://docs.google.com/document/d/abc/edit',
    'https://docs.google.com/document/d/abc/edit?usp=x',
    'https://docs.google.com/document/d/../edit',
    'javascript:alert(1)',
    'https://mail.google.com/mail/u/0/#sent/abc',
    42,
  ])
    assert.equal(googleResourceUrl(url), false, String(url));
});

test('every Google operation has a staff label with English, and writes get their own words', () => {
  for (const operation of GOOGLE_OPERATIONS) assert.ok(googleChangesEn[googleChangeLabel(operation)], operation);
  assert.ok(googleChangesEn[googleChangeLabel('other.op')]);
  assert.equal(googleChangeLabel('gmail.send'), 'ส่งอีเมล');
  assert.equal(googleChangeLabel('gmail.draft'), 'บันทึกร่างอีเมล');
  assert.equal(googleChangeLabel('sheets.values.clear'), 'ล้างข้อมูลใน Google Sheet');
  assert.equal(googleChangeLabel('drive.permissions.create'), 'แชร์ไฟล์ใน Drive');
  assert.equal(googleChangeLabel('appscript.deployments.create'), 'เผยแพร่ Apps Script');
  assert.equal(googleChangeLabel('tasks.complete'), 'ทำเครื่องหมายงานเสร็จใน Google Tasks');
});

function fixture(onExecute: (scope: any, n: number) => void, replies: string[]) {
  const store = new Store(':memory:');
  store.put('connection', 'c', { id: 'c', provider: 'openai', model: 'fixture', ready: true } as Connection);
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
  let executed = 0;
  const harness: Harness = {
    root,
    route: (query, opts) => routing.queryStepRouter(query, { autoRoute: true, authorityChecks: true, ...opts }),
    contextPolicy: boundary.classifyContextPolicy,
    privacy: privacy.evaluatePrivacyGate,
    skillMetadata: async id => {
      const metadata = await routing.loadSkillContextMetadata(id);
      return { ...metadata, mandatoryReferences: await routing.loadDocumentContextMetadata(metadata.mandatory) };
    },
    documentCatalog: async () => routing.loadDocumentCatalog(),
    catalog: async () => catalog.loadSkillCatalog(root),
    documentPrivacy: async () => null,
    nextOutput: async () => null,
    toolLoop: () => true,
    tools: async scope => ({
      enabled: () => true,
      check: async () => {},
      readOnly: () => false,
      execute: async () => {
        onExecute(scope, ++executed);
        return { status: 'completed', operation: 'docs.create', data: { documentId: 'synthetic-doc_1' } };
      },
      outgoing: async s => s,
    }),
  };
  let call = 0;
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: { run: async () => replies[Math.min(call++, replies.length - 1)] },
    }),
    () => {},
  );
  return { store, service, session: store.create('c', 'cc') };
}
const request = '```step-tool\n' + JSON.stringify({ tool: 'google_workspace', input: 'docs.create', args: { account: 'a' } }) + '\n```';

test('the Google changes a chat answer made are listed on it, bounded', async () => {
  const change = googleChange('docs.create', { status: 'completed', resourceUrl: doc, data: { title: 'สรุปประชุม' } }, at)!;
  const f = fixture(
    scope => {
      for (let i = 0; i < GOOGLE_CHANGE_LIMIT + 5; i++) scope.googleChange?.(change);
    },
    [request, 'สร้าง Google Doc สรุปประชุมแล้ว'],
  );
  try {
    await f.service.run(f.session.id, 'ทำสไลด์ HTML สรุปงาน', '', true, undefined, 'chat');
    const done = f.store.session(f.session.id);
    assert.equal(done.status, 'review');
    const last = done.messages.at(-1)!;
    assert.equal(last.role, 'assistant');
    assert.equal(last.google?.length, GOOGLE_CHANGE_LIMIT);
    assert.deepEqual(last.google?.[0], change);
  } finally {
    f.store.close();
  }
});

test('a run that fails after a Google write still shows the change on its status message', async () => {
  const change = googleChange('gmail.send', { status: 'completed', data: {} }, at)!;
  const f = fixture(
    scope => {
      scope.googleChange?.(change);
      throw new Error('GOOGLE_QUOTA_LIMIT');
    },
    [request, '```step-tool\n{"tool":"changes","input":"a.md","content":"<html lang="th"></html>"}\n```'],
  );
  try {
    await f.service.run(f.session.id, 'ส่งอีเมลแจ้งทีม', '', true, undefined, 'chat').catch(() => {});
    const done = f.store.session(f.session.id);
    assert.equal(done.status, 'error');
    const status = done.messages.filter(m => m.role === 'status').at(-1)!;
    assert.deepEqual(status.google, [change]);
  } finally {
    f.store.close();
  }
});
