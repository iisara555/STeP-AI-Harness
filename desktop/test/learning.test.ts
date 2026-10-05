import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../electron/store';
import { Learning } from '../electron/learning';
import { Memories } from '../electron/memory';
import { defaultPolicy } from '../electron/policy';
const privacy: any = await import('../../src/modules/privacy/index.js');
const content = {
  name: 'Receipt checklist',
  kind: 'procedure',
  trigger: 'receipt,ใบเสร็จ',
  text: 'Mark missing fields as unknown. Never infer absent fields.',
};
const evidence = 'The reviewed example had a missing field.';
function setup(path = ':memory:') {
  const store = new Store(path);
  const learning = new Learning(store, tmpdir(), privacy.evaluatePrivacyGate);
  return { store, learning, context: learning.context() };
}

test('lessons require approval, match their trigger, preserve revisions, and can be disabled/restored after restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-learning-'));
  let { store, learning, context } = setup(join(dir, 'state.sqlite'));
  try {
    const p = learning.propose(context, { content, evidence });
    assert.deepEqual(learning.relevant('receipt'), []);
    learning.decide(context, p.id, true);
    assert.equal(learning.relevant('ตรวจใบเสร็จ')[0].revision, 1);
    assert.deepEqual(learning.relevant('meeting summary'), []);
    const p2 = learning.propose(context, {
      lessonId: p.lessonId,
      baseRevision: 1,
      content: { ...content, text: 'List missing fields separately.' },
      evidence,
    });
    assert.match(learning.relevant('receipt')[0].text, /Never infer/);
    learning.decide(context, p2.id, true);
    assert.equal(learning.relevant('receipt')[0].revision, 2);
    learning.restore(context, p.lessonId, 2, 1);
    assert.equal(learning.relevant('receipt')[0].revision, 3);
    assert.match(learning.relevant('receipt')[0].text, /Never infer/);
    learning.restore(context, p.lessonId, 3, 0);
    assert.deepEqual(learning.relevant('receipt'), []);
    store.close();
    ({ store, learning, context } = setup(join(dir, 'state.sqlite')));
    assert.equal(learning.snapshot().lessons[0].revisions.length, 4);
    learning.restore(context, p.lessonId, 4, 2);
    assert.equal(learning.relevant('receipt')[0].text, 'List missing fields separately.');
    assert.equal(learning.snapshot().candidates[0].evidence, evidence);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('competing edits and stale rollback cannot overwrite a newer release', () => {
  const { store, learning, context } = setup();
  try {
    const p = learning.propose(context, { content, evidence });
    learning.decide(context, p.id, true);
    const edit = (text: string) =>
      learning.propose(context, { lessonId: p.lessonId, baseRevision: 1, content: { ...content, text }, evidence });
    const a = edit('Check fields against the source.'),
      b = edit('Ask about missing fields.');
    learning.decide(context, a.id, true);
    assert.throws(() => learning.decide(context, b.id, true), /LEARNING_CONFLICT/);
    assert.throws(() => learning.restore(context, p.lessonId, 1, 0), /LEARNING_CONFLICT/);
    assert.equal(learning.snapshot().candidates.find(c => c.id === b.id)?.status, 'pending');
    assert.equal(learning.relevant('receipt')[0].text, 'Check fields against the source.');
    learning.decide(context, b.id, false);
  } finally {
    store.close();
  }
});

test('workspace/team boundaries reject stale UI writes and never leak lessons to another context', () => {
  const { store, learning, context } = setup();
  try {
    const p = learning.propose(context, { content, evidence });
    learning.decide(context, p.id, true);
    store.put('settings', 'main', { ...store.settings(), team: 'qs' });
    assert.deepEqual(learning.relevant('receipt'), []);
    assert.throws(() => learning.propose(context, { content, evidence }), /WORKSPACE_CHANGED/);
    assert.throws(() => learning.restore(context, p.lessonId, 1, 0), /WORKSPACE_CHANGED/);
    assert.throws(() => learning.decide(learning.context(), p.id, true), /LEARNING_NOT_FOUND/);
    store.put('settings', 'main', { ...store.settings(), team: '' });
    assert.equal(learning.relevant('receipt').length, 1);
  } finally {
    store.close();
  }
});

test('durable learning rejects secrets and malformed scopes regardless of ordinary chat policy', () => {
  const { store, learning, context } = setup();
  try {
    assert.throws(() => learning.propose(context, { content: { ...content, kind: 'policy' }, evidence }), /LEARNING_INVALID/);
    assert.throws(() => learning.propose(context, { content: { ...content, trigger: ',,' }, evidence }), /LEARNING_INVALID/);
    assert.throws(() => learning.propose(context, { content, evidence: 'password=super-secret-value-123' }), /MEMORY_PRIVACY_BLOCKED/);
    assert.equal(learning.snapshot().candidates.length, 0);
    const p = learning.propose(context, { content, evidence });
    assert.throws(() => learning.revise(context, p.id, { ...content, text: 'password=super-secret-value-123' }), /MEMORY_PRIVACY_BLOCKED/);
    assert.equal(learning.snapshot().candidates[0].status, 'pending', 'failed revision rolls back the rejection too');
  } finally {
    store.close();
  }
});

test('feedback transfers to the inbox atomically and revisions preserve its evidence', () => {
  const { store, learning, context } = setup();
  try {
    const memories = new Memories(store, tmpdir(), () => defaultPolicy(), privacy.evaluatePrivacyGate);
    const session = store.create('c', '');
    const p = memories.proposeFeedback(session.id, 'Prefer concise responses.');
    const candidate = learning.importFeedback(context, p);
    assert.equal(memories.proposals().length, 0);
    assert.deepEqual(learning.relevant('anything'), []);
    const revised = learning.revise(context, candidate.id, {
      name: 'Short responses',
      kind: 'preference',
      trigger: '',
      text: 'Use concise responses with clear next steps.',
    });
    assert.equal(revised.evidence, p.evidence);
    assert.equal(revised.sessionId, session.id);
    learning.decide(context, revised.id, true);
    assert.equal(learning.relevant('anything')[0].text, revised.content.text);
    assert.throws(() => learning.importFeedback(context, p), /LEARNING_NOT_FOUND/);
  } finally {
    store.close();
  }
});

test('current privacy rules recheck active lessons and keep prompt context bounded', () => {
  const store = new Store(':memory:');
  let blocked = false;
  const learning = new Learning(store, tmpdir(), text => (blocked ? { action: 'block-external' } : privacy.evaluatePrivacyGate(text)));
  try {
    const context = learning.context();
    for (let i = 0; i < 7; i++) {
      const p = learning.propose(context, {
        content: { ...content, kind: 'preference', name: `Preference ${i}`, text: 'Prefer concise responses.' },
        evidence,
      });
      learning.decide(context, p.id, true);
    }
    assert.equal(learning.relevant('anything').length, 5);
    blocked = true;
    assert.deepEqual(learning.relevant('anything'), []);
  } finally {
    store.close();
  }
});

test('one-character triggers cannot broaden matching, and history limits cannot prevent disabling', () => {
  const { store, learning, context } = setup();
  try {
    const p = learning.propose(context, { content: { ...content, trigger: 'receipt,a' }, evidence });
    learning.decide(context, p.id, true);
    assert.deepEqual(learning.relevant('annual meeting'), []);
    for (let revision = 1; revision < 100; revision++) learning.restore(context, p.lessonId, revision, 1);
    assert.throws(() => learning.restore(context, p.lessonId, 100, 1), /LEARNING_LIMIT/);
    learning.restore(context, p.lessonId, 100, 0);
    assert.deepEqual(learning.relevant('receipt'), []);
    learning.restore(context, p.lessonId, 101, 0);
    assert.equal(learning.snapshot().lessons[0].revisions.length, 101);
  } finally {
    store.close();
  }
});
