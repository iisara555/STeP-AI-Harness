import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WorkService, type Harness } from '../electron/service';
import { Store } from '../electron/store';
import { tokens } from '../electron/compact';
import { selfContainedText } from '../electron/text-intent';
import { selectDiscovery } from '../electron/discovery';
import { OrganizationKnowledge } from '../electron/knowledge';
import type { Connection } from '../src/types';
const routing: any = await import('../../src/modules/router/service.js');
const boundary: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');
const catalog: any = await import('../../src/modules/skills/catalog.js');
const root = resolve('..');

function fixture(extra: Partial<Harness> = {}) {
  const store = new Store(':memory:');
  store.put('connection', 'c', { id: 'c', provider: 'openai', model: 'fixture', ready: true } as Connection);
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
  const captured: { prompt: string; system: string }[] = [];
  let catalogs = 0,
    documents = 0,
    hosts = 0;
  const harness: Harness = {
    root,
    route: (query, opts) => routing.queryStepRouter(query, { autoRoute: true, authorityChecks: true, ...opts }),
    contextPolicy: boundary.classifyContextPolicy,
    privacy: privacy.evaluatePrivacyGate,
    skillMetadata: async id => {
      const metadata = await routing.loadSkillContextMetadata(id);
      return { ...metadata, mandatoryReferences: await routing.loadDocumentContextMetadata(metadata.mandatory) };
    },
    documentCatalog: async () => {
      documents++;
      return routing.loadDocumentCatalog();
    },
    catalog: async () => {
      catalogs++;
      return catalog.loadSkillCatalog(root);
    },
    documentPrivacy: async () => null,
    nextOutput: async () => null,
    toolLoop: () => true,
    tools: async () => {
      hosts++;
      return { enabled: () => true, check: async () => {}, readOnly: () => true, execute: async () => '', outgoing: async s => s };
    },
    ...extra,
  };
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async (prompt, _c, context) => {
          captured.push({ prompt, system: context.system || '' });
          context.emit('Done');
          return 'Done';
        },
      },
    }),
    () => {},
  );
  return { store, service, captured, session: store.create('c', 'cc'), counts: () => ({ catalogs, documents, hosts }) };
}

test('self-contained language tasks reduce real harness input by over 60% while retaining routed mandatory instructions', async () => {
  for (const [query, baseline] of [
    ['แปลเป็นอังกฤษ: วันนี้อากาศดี', 14529],
    ['ตรวจคำผิด: วันนี้ฉันไปทำงาน', 12228],
    ['Summarize this text: The project is complete.', 14529],
  ] as const) {
    const f = fixture();
    try {
      await f.service.run(f.session.id, query, '', true, undefined, 'chat');
      const session = f.store.session(f.session.id),
        call = f.captured[0];
      assert.equal(session.status, 'review', query);
      assert.ok(tokens(call.system + call.prompt) < baseline * 0.4, query);
      assert.deepEqual({ ...f.counts(), documents: 0 }, { catalogs: 0, documents: 0, hosts: 0 });
      assert.ok(call.prompt.includes(query));
      assert.ok(call.system.indexOf('<standing_governance>') >= 0);
      if (call.system.includes('<skill_instructions>'))
        assert.ok(call.system.indexOf('<standing_governance>') < call.system.indexOf('<skill_instructions>'));
      const step = session.runs!.at(-1)!.steps[0];
      assert.equal(step.contextScope, 'text');
      assert.equal(step.providerCalls![0].components.registry, 0);
      assert.ok(step.providerCalls![0].ttftMs !== undefined);
      if (query.startsWith('ตรวจ')) assert.ok(step.references.includes('rules/step-writing.md'));
      else assert.ok(step.references.includes('rules/human-approval.md'));
    } finally {
      f.store.close();
    }
  }
});

test('organization, selected-Skill, workflow, file and history requests keep full context', async () => {
  const variants = ['organization', 'selected', 'workflow', 'file', 'history'] as const;
  for (const variant of variants) {
    const f = fixture();
    try {
      if (variant === 'history') {
        const session = f.store.session(f.session.id);
        session.messages.push({ role: 'assistant', text: 'Earlier source', at: new Date().toISOString() });
        f.store.save(session);
      }
      const query = variant === 'organization' ? 'ติดต่อฝ่ายบุคคลช่องทางไหน' : 'แปลเป็นอังกฤษ: วันนี้อากาศดี';
      await f.service.run(
        f.session.id,
        query,
        variant === 'file' ? 'Source from file' : '',
        true,
        variant === 'selected' ? 'step-writing' : undefined,
        'chat',
        undefined,
        variant === 'file' ? ['note.txt'] : [],
        variant === 'workflow' ? { workflow: 'diagnose' } : {},
      );
      const done = f.store.session(f.session.id);
      assert.equal(done.status, 'review', variant);
      assert.equal(done.runs!.at(-1)!.steps[0].contextScope, 'full', variant);
      assert.ok(f.counts().documents > 0 && f.counts().hosts > 0, variant);
      if (variant === 'organization') {
        assert.match(f.captured[0].prompt, /\[hr-service-channels\]/);
        const discovery = done.runs!.at(-1)!.steps[0].discovery!;
        assert.equal(discovery.documents, 'top3');
        assert.ok(discovery.documentCount <= 3);
      }
      if (variant === 'file') assert.match(f.captured[0].prompt, /Source from file/);
      if (variant === 'history') assert.match(f.captured[0].prompt, /Earlier source/);
    } finally {
      f.store.close();
    }
  }
});

test('natural language transformations use text scope, while mixed actions and pointers retain full context', async () => {
  for (const query of [
    'ช่วยแปลเป็นภาษาอังกฤษ วันนี้อากาศดี',
    'เช็กคำผิดให้หน่อย: วันนี้ฉันไปทำงาน',
    'Please translate to English Hello there',
    'ช่วยสรุปข้อความนี้\nThe project is complete.',
    'ช่วยแปลเป็นภาษาอังกฤษ',
  ]) {
    const f = fixture();
    try {
      assert.ok(selfContainedText(query), query);
      await f.service.run(f.session.id, query, '', true, undefined, 'chat');
      const done = f.store.session(f.session.id);
      assert.equal(done.status, 'review', query);
      assert.equal(done.runs!.at(-1)!.steps[0].contextScope, 'text', query);
      assert.deepEqual({ ...f.counts(), documents: 0 }, { catalogs: 0, documents: 0, hosts: 0 });
    } finally {
      f.store.close();
    }
  }
  for (const query of [
    'Translate to English and send it by email',
    'แปลเป็นอังกฤษแล้วส่งอีเมล',
    'Summarize this text then publish it',
    'Translate the previous answer',
    'Summarize above',
    'สรุปข้อความ อันนี้',
    'Translate hello and email it',
    'ช่วยแปลไฟล์ที่แนบ',
    'แปลเป็นภาษาอังกฤษตามระเบียบฝ่ายบุคคล',
  ])
    assert.equal(selfContainedText(query), false, query);
});

test('summaries or translations that touch STeP itself keep the organization documents and full context', async () => {
  for (const query of [
    // Worded as a text task, but the employee is asking about STeP: the documents must be read.
    'สรุปข้อความ: ระเบียบลาพักร้อนของ STeP คืออะไร',
    'สรุปข้อความ: ติดต่อฝ่ายบุคคลช่องทางไหน',
    'แปลเป็นอังกฤษ: วันลาพักร้อนของพนักงาน STeP มีกี่วัน',
    'Summarize this text: STeP welfare policy for staff',
  ]) {
    const f = fixture();
    try {
      assert.ok(selfContainedText(query), query);
      await f.service.run(f.session.id, query, '', true, undefined, 'chat');
      const done = f.store.session(f.session.id);
      assert.equal(done.status, 'review', query);
      assert.equal(done.runs!.at(-1)!.steps[0].contextScope, 'full', query);
      assert.ok(f.counts().documents > 0 && f.counts().hosts > 0, query);
      // The organization rule and the document registry reach the AI, so it answers from STeP's own sources.
      assert.match(f.captured[0].system, /answer from <organization_knowledge> or a registered document/, query);
      assert.match(f.captured[0].system, /STeP knowledge registry/, query);
      if (query.includes('ฝ่ายบุคคล')) assert.match(f.captured[0].prompt, /\[hr-service-channels\]/);
    } finally {
      f.store.close();
    }
  }
});

test('Top-3 discovery deduplicates ranked evidence and preserves mandatory sources; uncertain discovery stays complete', () => {
  const entries = Array.from({ length: 8 }, (_, i) => ({ id: 'doc' + i }));
  const chosen = selectDiscovery(entries, entry => entry.id, ['missing', 'doc2', 'doc2', 'doc3', 'doc4', 'doc5'], ['doc7']);
  assert.deepEqual(
    chosen.entries.map(entry => entry.id),
    ['doc7', 'doc2', 'doc3', 'doc4'],
  );
  assert.equal(chosen.scope, 'top3');
  assert.deepEqual(selectDiscovery(entries, entry => entry.id, ['unknown']).entries, entries);
  assert.equal(selectDiscovery(entries, entry => entry.id, []).scope, 'full');
});

test('fast text scope never skips authority or privacy gates and does not treat quoted organization names as a lookup', async () => {
  const blocked = fixture({ route: async () => ({ routingContract: { mode: 'GENERAL', authority: { status: 'BLOCK' } } }) });
  try {
    await blocked.service.run(blocked.session.id, 'Translate: hello', '', true, undefined, 'chat');
    assert.equal(blocked.captured.length, 0);
    assert.equal(blocked.store.session(blocked.session.id).status, 'error');
  } finally {
    blocked.store.close();
  }
  const f = fixture();
  try {
    await assert.rejects(
      f.service.run(f.session.id, 'Translate: sk-' + 'synthetic'.repeat(5), '', true, undefined, 'chat'),
      /PRIVACY_REVIEW_REQUIRED/,
    );
    assert.equal(f.captured.length, 0);
  } finally {
    f.store.close();
  }
  assert.ok(selfContainedText('Translate to English: STeP is an organization.'));
  for (const query of [
    'Translate the previous answer',
    'แปลไฟล์นี้: ข้อความ',
    'แปลและส่งอีเมล: ข้อความ',
    'สรุประเบียบฝ่ายบุคคล: ข้อความ',
    'Summarize this text and publish: hello',
    'ติดต่อฝ่ายบุคคลช่องทางไหน',
  ])
    assert.equal(selfContainedText(query), false, query);
});

test('knowledge cache refreshes changed files and revoked entries before subsequent retrieval', async t => {
  const home = await mkdtemp(join(tmpdir(), 'step-knowledge-refresh-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  let entries = [{ id: 'fixture', title: 'Welfare policy', path: 'policy.md', status: 'active' }];
  await writeFile(join(home, 'policy.md'), '# Policy\n\nMedical allowance old\n## Medical\nThe allowance is 100.');
  const knowledge = new OrganizationKnowledge(home, async () => entries);
  assert.match((await knowledge.search('Medical allowance'))[0].text, /old|100/);
  await writeFile(join(home, 'policy.md'), '# Policy\n\nMedical allowance revised\n## Medical\nThe allowance is 200.');
  const result = (await knowledge.search('Medical allowance')).map(e => e.text).join('\n');
  assert.match(result, /revised|200/);
  assert.doesNotMatch(result, /100/);
  entries = [{ ...entries[0], status: 'restricted' }];
  assert.deepEqual(await knowledge.search('Medical allowance'), []);
  assert.deepEqual(await knowledge.registry(), []);
  assert.ok((await readFile(join(home, 'policy.md'), 'utf8')).includes('200'));
});
