import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { WorkService, type Harness } from '../electron/service';
import { Store } from '../electron/store';
import type { Connection } from '../src/types';
const routing: any = await import('../../src/modules/router/service.js');
const boundary: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');
const catalog: any = await import('../../src/modules/skills/catalog.js');
const root = resolve('..');

function fixture(replies: string[]) {
  const store = new Store(':memory:');
  store.put('connection', 'c', { id: 'c', provider: 'openai', model: 'fixture', ready: true } as Connection);
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
  const staged: string[] = [];
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
    tools: async () => ({
      enabled: () => true,
      check: async () => {},
      readOnly: r => r.tool === 'files',
      execute: async r => {
        staged.push(r.input);
        return {
          id: 'change-' + staged.length,
          path: r.input,
          status: r.input.startsWith('draft/') ? 'staged-for-human-review' : 'applied',
        };
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
  return { store, service, staged, calls: () => call, session: store.create('c', 'cc') };
}
const write = (path: string) =>
  '```step-tool\n' + JSON.stringify({ tool: 'changes', input: path, content: '<html><body>สไลด์</body></html>' }) + '\n```';

test('files the AI writes in a chat answer are listed on it, applied or waiting for review', async () => {
  const f = fixture([write('deck.html'), write('draft/notes.md'), 'สร้าง deck.html แล้ว และเสนอ notes.md ให้ตรวจ']);
  try {
    await f.service.run(f.session.id, 'ทำสไลด์ HTML สรุปงาน', '', true, undefined, 'chat');
    const done = f.store.session(f.session.id);
    assert.equal(done.status, 'review');
    assert.deepEqual(done.messages.at(-1)!.written, [
      { path: 'deck.html', id: 'change-1', status: 'applied' },
      { path: 'draft/notes.md', id: 'change-2', status: 'staged' },
    ]);
  } finally {
    f.store.close();
  }
});

test('a chat reply that stays an unreadable tool request ends as an error, not an empty answer', async () => {
  const broken = '```step-tool\n{"tool":"changes","input":"deck.html","content":"<html lang="th"></html>"}\n```';
  const f = fixture([broken]);
  try {
    await f.service.run(f.session.id, 'ทำสไลด์ HTML สรุปงาน', '', true, undefined, 'chat').catch(() => {});
    const done = f.store.session(f.session.id);
    assert.equal(done.status, 'error');
    assert.match(JSON.stringify(done), /TOOL_REQUEST_UNREADABLE|อ่านไม่ได้/);
    assert.deepEqual(f.staged, []);
    // The first reply and two chances to send the request again, not a turn limit's worth of calls.
    assert.equal(f.calls(), 3);
  } finally {
    f.store.close();
  }
});
