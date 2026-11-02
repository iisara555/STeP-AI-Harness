import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { Store } from '../electron/store';
import { WorkService, type Harness } from '../electron/service';
import type { Connection } from '../src/types';

function fixture(route: Harness['route']) {
  const store = new Store(':memory:');
  store.put('connection', 'c', { id: 'c', provider: 'openai', ready: true } as Connection);
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
  const session = store.create('c', 'cc');
  session.originalQuery = 'Earlier question';
  session.messages.push({ role: 'user', text: 'Earlier question', at: '2026-01-01T00:00:00Z' });
  store.save(session);
  const harness: Harness = {
    root: tmpdir(),
    route,
    contextPolicy: () => ({ history: 'relevant-only', carryover: true }),
    privacy: text => ({ action: text === 'BLOCKED_SECRET' ? 'block-external' : 'pass', redactedText: text }),
    skillMetadata: async () => null,
    documentPrivacy: async () => null,
    nextOutput: async () => null,
  };
  const service = new WorkService(
    store,
    harness,
    async () => {
      throw new Error('provider must not be called');
    },
    () => {},
  );
  return { store, session, service };
}

test('a follow-up is stored and acknowledged before a slow route check, without duplicates on route failure', async () => {
  let release!: (value: any) => void;
  const route = new Promise<any>(resolve => {
    release = resolve;
  });
  const f = fixture(() => route);
  let accepted = false;
  try {
    const run = f.service.run(f.session.id, 'Follow-up question', '', true, undefined, 'chat', undefined, ['image.png'], {
      onAccepted: () => {
        accepted = true;
      },
    });
    assert.equal(accepted, true);
    assert.deepEqual(f.store.session(f.session.id).messages.at(-1), {
      role: 'user',
      text: 'Follow-up question',
      at: f.store.session(f.session.id).messages.at(-1)!.at,
      files: [{ name: 'image.png' }],
    });
    release({ routingContract: { mode: 'BLOCK', authority: { status: 'DENY' } } });
    await run;
    const messages = f.store.session(f.session.id).messages;
    assert.equal(messages.filter(message => message.text === 'Follow-up question').length, 1);
    assert.equal(messages.at(-1)?.text, 'AUTHORITY_REVIEW_REQUIRED');
    assert.equal(f.store.session(f.session.id).status, 'error');
  } finally {
    f.store.close();
  }
});

test('privacy refusal never acknowledges or stores an unapproved request', async () => {
  const f = fixture(async () => {
    throw new Error('route must not be called');
  });
  let accepted = false;
  try {
    await assert.rejects(
      f.service.run(f.session.id, 'BLOCKED_SECRET', '', true, undefined, 'chat', undefined, [], {
        onAccepted: () => {
          accepted = true;
        },
      }),
      /PRIVACY_REVIEW_REQUIRED/,
    );
    assert.equal(accepted, false);
    assert.equal(f.store.session(f.session.id).messages.length, 1);
  } finally {
    f.store.close();
  }
});

test('a rejected follow-up restores the pre-queue review state of an existing draft', async () => {
  const f = fixture(async () => ({ routingContract: { mode: 'BLOCK', authority: { status: 'DENY' } } }));
  try {
    const queued = f.store.session(f.session.id);
    queued.status = 'queued';
    queued.draft = 'Previously reviewed draft';
    f.store.save(queued);
    await f.service.run(f.session.id, 'Follow-up question', '', true, undefined, 'chat', undefined, [], { previousStatus: 'review' });
    const after = f.store.session(f.session.id);
    assert.equal(after.status, 'review');
    assert.equal(after.draft, 'Previously reviewed draft');
    assert.equal(after.messages.filter(message => message.text === 'Follow-up question').length, 1);
  } finally {
    f.store.close();
  }
});
