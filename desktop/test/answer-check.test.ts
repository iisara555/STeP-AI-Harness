import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { WorkService, parseAnswerCheck, type Harness } from '../electron/service';
import { Store } from '../electron/store';
import type { Connection } from '../src/types';
const routing: any = await import('../../src/modules/router/service.js');
const boundary: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');
const catalog: any = await import('../../src/modules/skills/catalog.js');
const root = resolve('..');

function fixture(
  extra: Partial<Harness>,
  checkReply: string | (() => Promise<string>) = '{"unsupported":[]}',
  connection: Partial<Connection> = {},
) {
  const store = new Store(':memory:');
  store.put('connection', 'c', { id: 'c', provider: 'openai', model: 'fixture', ready: true, ...connection } as Connection);
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
  const calls: { prompt: string; system: string; schema: boolean; model: string }[] = [];
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
    ...extra,
  };
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async (prompt, c, context) => {
          const checking = /You check an AI answer/.test(context.system || '');
          calls.push({ prompt, system: context.system || '', schema: Boolean(context.jsonSchema), model: c.model });
          if (checking) return typeof checkReply === 'string' ? checkReply : checkReply();
          context.emit('ติดต่อฝ่ายบุคคลทางอีเมลและโทรศัพท์ภายใน');
          return 'ติดต่อฝ่ายบุคคลทางอีเมลและโทรศัพท์ภายใน';
        },
      },
    }),
    () => {},
  );
  return { store, service, calls, session: store.create('c', 'cc') };
}

const QUERY = 'ติดต่อฝ่ายบุคคลช่องทางไหน';

test('detached answers retain organization sources and answer-check warnings', async () => {
  const f = fixture({ answerCheck: () => true }, '{"unsupported":[{"claim":"โทรศัพท์ภายใน","reason":"ไม่มีหลักฐาน"}]}');
  try {
    await f.service.sideQuestion(f.session.id, QUERY, true);
    const answer = f.store.session(f.session.id).sideQuestions!.at(-1)!;
    assert.equal(answer.status, 'completed');
    assert.ok(answer.docSources?.length);
    assert.equal(answer.check?.unsupported[0].claim, 'โทรศัพท์ภายใน');
  } finally {
    f.store.close();
  }
});

test('a chat answer about STeP lists the documents it drew on; no check runs unless the policy turns it on', async () => {
  const f = fixture({});
  try {
    await f.service.run(f.session.id, QUERY, '', true, undefined, 'chat');
    const answer = f.store.session(f.session.id).messages.at(-1)!;
    assert.equal(answer.role, 'assistant');
    assert.ok(answer.docSources?.length, 'documents shown under the answer');
    assert.equal(answer.check, undefined);
    assert.equal(f.calls.filter(c => /You check an AI answer/.test(c.system)).length, 0);
  } finally {
    f.store.close();
  }
});

test('with answerCheck on, the answer is checked against the same excerpts and the result is kept on the message', async () => {
  const f = fixture({ answerCheck: () => true }, '{"unsupported":[{"claim":"โทรศัพท์ภายใน","reason":"เอกสารไม่ได้ระบุเบอร์ภายใน"}]}');
  try {
    await f.service.run(f.session.id, QUERY, '', true, undefined, 'chat');
    await f.service.settledChecks();
    const done = f.store.session(f.session.id);
    const answer = done.messages.at(-1)!;
    assert.equal(done.status, 'review');
    assert.equal(answer.checkPending, undefined);
    assert.deepEqual(answer.check, { unsupported: [{ claim: 'โทรศัพท์ภายใน', reason: 'เอกสารไม่ได้ระบุเบอร์ภายใน' }] });
    const check = f.calls.find(c => /You check an AI answer/.test(c.system))!;
    assert.ok(check.schema, 'the checker asks for structured output');
    assert.match(check.prompt, /<organization_knowledge>/);
    assert.match(check.prompt, /<answer>\nติดต่อฝ่ายบุคคล/);
    assert.ok(
      done
        .runs!.at(-1)!
        .steps.at(-1)!
        .providerCalls!.some(call => call.kind === 'check'),
    );
  } finally {
    f.store.close();
  }
});

test('a checker reply that is not the expected JSON leaves the answer without a check', async () => {
  const f = fixture({ answerCheck: () => true }, 'I cannot check this.');
  try {
    await f.service.run(f.session.id, QUERY, '', true, undefined, 'chat');
    await f.service.settledChecks();
    const done = f.store.session(f.session.id);
    assert.equal(done.status, 'review');
    assert.equal(done.messages.at(-1)!.check, undefined);
    assert.equal(done.messages.at(-1)!.checkPending, undefined, 'a failed check clears the pending mark');
  } finally {
    f.store.close();
  }
});

test('a chat answer is finished before its check returns; the result is added to that answer afterwards', async () => {
  let release!: (reply: string) => void;
  const held = new Promise<string>(resolve => (release = resolve));
  const f = fixture({ answerCheck: () => true }, () => held);
  try {
    await f.service.run(f.session.id, QUERY, '', true, undefined, 'chat');
    let done = f.store.session(f.session.id);
    const answer = done.messages.at(-1)!;
    assert.equal(done.status, 'review', 'the run ends without waiting for the check');
    assert.equal(answer.role, 'assistant');
    assert.equal(answer.check, undefined);
    assert.ok(answer.checkPending, 'the answer shows that its check is still running');

    // The next question can start while the first answer is still being checked.
    await f.service.run(f.session.id, 'ฝ่ายบุคคลอยู่ชั้นไหน', '', true, undefined, 'chat');
    release('{"unsupported":[{"claim":"โทรศัพท์ภายใน","reason":"เอกสารไม่ได้ระบุเบอร์ภายใน"}]}');
    await f.service.settledChecks();
    done = f.store.session(f.session.id);
    const first = done.messages.find(m => m.at === answer.at)!;
    assert.deepEqual(first.check, { unsupported: [{ claim: 'โทรศัพท์ภายใน', reason: 'เอกสารไม่ได้ระบุเบอร์ภายใน' }] });
    assert.equal(first.checkPending, undefined);
    assert.ok(done.messages.filter(m => m.role === 'assistant').length >= 2);
    assert.ok(done.runs!.some(run => run.steps.at(-1)?.providerCalls?.some(call => call.kind === 'check')));
  } finally {
    f.store.close();
  }
});

test('a check that finishes while another run is saving the conversation is not lost', async () => {
  let release!: (reply: string) => void;
  const held = new Promise<string>(resolve => (release = resolve));
  let checks = 0,
    runs = 0;
  const f = fixture(
    {
      answerCheck: () => true,
      // The second run reads the conversation, then waits here while the first answer's check lands and is saved;
      // the run then saves its own earlier copy of the conversation over it.
      modelLimits: async () => {
        if (++runs === 2) {
          release('{"unsupported":[]}');
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        return {};
      },
    },
    () => (++checks === 1 ? held : Promise.resolve('{"unsupported":[]}')),
  );
  try {
    await f.service.run(f.session.id, QUERY, '', true, undefined, 'chat');
    const first = f.store.session(f.session.id).messages.at(-1)!;
    assert.ok(first.checkPending);
    await f.service.run(f.session.id, QUERY, '', true, undefined, 'chat');
    await f.service.settledChecks();
    const saved = f.store.session(f.session.id).messages.find(m => m.at === first.at)!;
    assert.deepEqual(saved.check, { unsupported: [] });
    assert.equal(saved.checkPending, undefined);
  } finally {
    f.store.close();
  }
});

test('parseAnswerCheck accepts the JSON reply, trims items and caps them at five', () => {
  assert.deepEqual(parseAnswerCheck('{"unsupported":[]}'), { unsupported: [] });
  assert.deepEqual(parseAnswerCheck('```json\n{"unsupported":[{"claim":" a ","reason":" b "}]}\n```'), {
    unsupported: [{ claim: 'a', reason: 'b' }],
  });
  const many = JSON.stringify({ unsupported: Array.from({ length: 8 }, (_, i) => ({ claim: `c${i}`, reason: '' })) });
  assert.equal(parseAnswerCheck(many)!.unsupported.length, 5);
  assert.equal(parseAnswerCheck('no json'), undefined);
  assert.equal(parseAnswerCheck('{"other":1}'), undefined);
});

test('on Antigravity, the answer check and the answer stay on the chosen model even when agy lists a -low id', async () => {
  const models = ['gemini-3.8-flash-low', 'gemini-3.8-flash-medium', 'gemini-3.8-flash-high'].map(id => ({ id, label: id }));
  const f = fixture({ answerCheck: () => true }, '{"unsupported":[]}', {
    provider: 'antigravity',
    mode: 'subscription',
    model: 'gemini-3.8-flash-medium',
    models,
  });
  try {
    await f.service.run(f.session.id, QUERY, '', true, undefined, 'chat');
    const check = f.calls.find(c => /You check an AI answer/.test(c.system))!;
    // The -low id has only been measured for Skill selection (2026-11-01); the check that catches unsupported claims keeps the chosen model.
    assert.equal(check.model, 'gemini-3.8-flash-medium');
    const answers = f.calls.filter(c => !/You check an AI answer/.test(c.system) && !c.schema);
    assert.ok(answers.length && answers.every(c => c.model === 'gemini-3.8-flash-medium'), 'the answer keeps the chosen model');
  } finally {
    f.store.close();
  }
});
