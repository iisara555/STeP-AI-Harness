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

function fixture(extra: Partial<Harness>, checkReply = '{"unsupported":[]}') {
  const store = new Store(':memory:');
  store.put('connection', 'c', { id: 'c', provider: 'openai', model: 'fixture', ready: true } as Connection);
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
  const calls: { prompt: string; system: string; schema: boolean }[] = [];
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
        run: async (prompt, _c, context) => {
          const checking = /You check an AI answer/.test(context.system || '');
          calls.push({ prompt, system: context.system || '', schema: Boolean(context.jsonSchema) });
          if (checking) return checkReply;
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
    const done = f.store.session(f.session.id);
    const answer = done.messages.at(-1)!;
    assert.equal(done.status, 'review');
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
    const done = f.store.session(f.session.id);
    assert.equal(done.status, 'review');
    assert.equal(done.messages.at(-1)!.check, undefined);
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
