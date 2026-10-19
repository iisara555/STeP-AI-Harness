import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Store } from '../electron/store';
import { WorkService, type Harness } from '../electron/service';
import { isDocumentQuestion } from '../electron/document-tools';
import { documentTarget, applyDocumentPatch } from '../electron/document-patch';
import { markdownDocument, documentMarkdown } from '../src/draft';
const routing: any = await import('../../src/modules/router/service.js');
const boundary: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');
const root = fileURLToPath(new URL('../../', import.meta.url));
const original =
  '# โครงการจำลอง\n\n## 1 วัตถุประสงค์\n\nข้อความเดิมหนึ่ง\n\n## 2 กิจกรรม\n\n**ข้อความเดิมสอง**\n\n| รหัส | รายการ |\n|---|---|\n| SYN-001 | คงเดิม |';
const reply = (target: any, markdown: string) =>
  `<document_patch>${JSON.stringify({ id: target.id, baseRevision: target.baseRevision, expectedHash: target.expectedHash, markdown })}</document_patch><document_review>ตรวจข้อมูลจำลอง</document_review>`;

function fixture(answer?: (prompt: string, system: string) => Promise<string>) {
  const store = new Store(':memory:');
  store.put('connection', 'test', { id: 'test', provider: 'openai', model: 'fixture', ready: true });
  const session = store.create('test', 'cc');
  Object.assign(session, {
    draft: original,
    document: markdownDocument(original),
    documentTool: 'project',
    skill: 'project-plan',
    originalQuery: 'ร่างโครงการจำลอง',
    routeKey: 'skill:project-plan',
    sourceText: 'แหล่งข้อมูลจำลอง',
    status: 'review',
    workPlan: { goal: 'งานจำลอง', approvedAt: 'synthetic', tasks: [{ title: 'ตรวจร่าง', status: 'doing' }] },
  });
  store.save(session);
  let effects = 0;
  const calls: { prompt: string; system: string }[] = [];
  const harness: Harness = {
    root,
    route: (q, options) =>
      routing.queryStepRouter(q, { ...options, autoRoute: false, authorityChecks: true, disableMemory: true, workspaceDir: root }),
    contextPolicy: boundary.classifyContextPolicy,
    privacy: privacy.evaluatePrivacyGate,
    skillMetadata: async id => {
      const meta = await routing.loadSkillContextMetadata(id);
      return { ...meta, mandatoryReferences: await routing.loadDocumentContextMetadata(meta.mandatory || []) };
    },
    documentPrivacy: async () => null,
    nextOutput: async () => null,
    toolLoop: () => true,
    tools: async () => ({
      enabled: () => true,
      check: async () => {},
      readOnly: () => true,
      outgoing: async text => text,
      execute: async () => {
        effects++;
        throw Error('UNEXPECTED_EFFECT');
      },
    }),
  };
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: root, env: {} },
      adapter: {
        run: async (prompt, _c, context) => {
          calls.push({ prompt, system: context.system || '' });
          context.onUsage?.({ input: 10, output: 2, total: 12 });
          return answer ? answer(prompt, context.system || '') : 'คำตอบจำลองจากภาพสถานะงาน';
        },
      },
    }),
    () => {},
  );
  return { store, session, service, calls, effects: () => effects };
}

test('polite questions stay questions while Thai and English edit requests remain edits', () => {
  for (const q of [
    'วัตถุประสงค์ข้อนี้หมายถึงอะไร',
    'ช่วยอธิบายว่าวัตถุประสงค์ข้อนี้หมายถึงอะไร',
    'ขอถามว่าทำไมต้องมีหัวข้อนี้',
    'ช่วยตอบหน่อย พนักงานลาพักร้อนได้กี่วัน',
    'พรุ่งนี้มีประชุมไหม',
    'What does this section mean?',
  ])
    assert.equal(isDocumentQuestion('project', q), true, q);
  for (const q of [
    'แก้เฉพาะข้อ 1 ให้กระชับ',
    'ช่วยปรับวัตถุประสงค์ได้ไหม',
    'Can you change section 1?',
    'Rewrite paragraph 2 please',
    'เพิ่มกิจกรรมอีกหนึ่งข้อ',
  ])
    assert.equal(isDocumentQuestion('project', q), false, q);
});

test('a natural side question cannot mutate the draft, route, source or approved work plan', async () => {
  const f = fixture();
  try {
    const retained = ['draft', 'document', 'originalQuery', 'skill', 'routeKey', 'revision', 'sourceText', 'workPlan', 'status'] as const;
    const before = Object.fromEntries(retained.map(key => [key, f.store.session(f.session.id)[key]]));
    await f.service.run(f.session.id, 'ช่วยอธิบายว่าวัตถุประสงค์ข้อนี้หมายถึงอะไร', '', true);
    const done = f.store.session(f.session.id);
    assert.deepEqual(Object.fromEntries(retained.map(key => [key, done[key]])), before);
    assert.equal(done.proposals.length, 0);
    assert.equal(done.sideQuestions?.at(-1)?.answer, 'คำตอบจำลองจากภาพสถานะงาน');
    assert.equal(done.usage?.total, 12);
    assert.equal(f.effects(), 0);
    assert.doesNotMatch(f.calls.at(-1)!.system, /<document_tool_contract>|The host supports tools/);
    assert.match(f.calls.at(-1)!.prompt, /ข้อความเดิมหนึ่ง/);
  } finally {
    f.store.close();
  }
});

test('a read-only side question can finish while the main document run is still active', async () => {
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>(resolve => (entered = resolve));
  const hold = new Promise<void>(resolve => (release = resolve));
  const f = fixture(async (_prompt, system) => {
    if (system.includes('Answer the side question')) return 'คำถามแทรกเสร็จแล้ว';
    entered();
    await hold;
    return `<document_draft>${original}</document_draft><document_review>ตรวจจำลอง</document_review>`;
  });
  try {
    const main = f.service.run(f.session.id, 'ปรับภาษาให้ชัดขึ้น', '', true);
    await waiting;
    await f.service.sideQuestion(f.session.id, 'ช่วยอธิบายเป้าหมายหน่อย', true);
    assert.equal(f.service.isActive(f.session.id), true);
    assert.equal(f.store.session(f.session.id).sideQuestions?.at(-1)?.answer, 'คำถามแทรกเสร็จแล้ว');
    release();
    await main;
    assert.equal(f.store.session(f.session.id).proposals.length, 1);
  } finally {
    release();
    await f.service.closeAndWait();
    f.store.close();
  }
});

test('targeted patches preserve every node outside the selected section and reject stale or invented targets', () => {
  const nested = markdownDocument('# ร่าง\n\n## 2. ภาพรวม\n\nเดิม\n\n### 2.1. ส่วนย่อย\n\nย่อย\n\n## 3. ถัดไป\n\nคงเดิม');
  assert.notEqual(documentTarget(nested, 'แก้เฉพาะข้อ 2', 1)!.end, documentTarget(nested, 'แก้เฉพาะข้อ 2.1', 1)!.start);
  assert.ok(documentTarget(nested, 'แก้เฉพาะข้อ 2.1', 1)!.markdown.includes('ส่วนย่อย'));
  assert.ok(
    documentTarget(markdownDocument('# ร่าง\n\n## 5. ระยะเวลา\n\n60 วัน'), 'แก้เฉพาะข้อ 5', 1),
    'numbered heading labels survive the rich editor',
  );
  const base = markdownDocument(original),
    target = documentTarget(base, 'แก้เฉพาะข้อ 1', 4)!;
  const paragraph = documentTarget(base, 'แก้ย่อหน้าที่ 1 ของหัวข้อ 2', 4)!;
  assert.match(paragraph.markdown, /ข้อความเดิมสอง/);
  assert.doesNotMatch(paragraph.markdown, /ข้อความเดิมหนึ่ง/);
  const output = applyDocumentPatch(reply(target, '## 1 วัตถุประสงค์\n\nข้อความใหม่'), target, base);
  assert.deepEqual(output.document.content!.slice(-3), base.content!.slice(-3));
  assert.match(output.draft, /ข้อความใหม่/);
  assert.match(output.draft, /\*\*ข้อความเดิมสอง\*\*/);
  assert.throws(() => applyDocumentPatch(reply({ ...target, expectedHash: 'invented' }, 'x'), target, base), /DOCUMENT_PATCH_INVALID/);
  assert.throws(
    () => applyDocumentPatch(reply(target, 'x'), target, markdownDocument(original.replace('ข้อความเดิมหนึ่ง', 'concurrent change'))),
    /DRAFT_CONFLICT/,
  );
  assert.throws(() => documentTarget(base, 'แก้เฉพาะข้อ 99', 4), /DOCUMENT_TARGET_AMBIGUOUS/);
});

test('side questions use the current revision, reject duplicate runs and hold the session lifecycle lock', async () => {
  let entered!: () => void, release!: () => void;
  const waiting = new Promise<void>(resolve => (entered = resolve));
  const hold = new Promise<void>(resolve => (release = resolve));
  const f = fixture(async () => {
    entered();
    await hold;
    return 'คำตอบจำลอง';
  });
  try {
    const s = f.store.session(f.session.id);
    s.proposals.push({ id: 'stale', text: 'STALE PROPOSAL', baseRevision: s.revision - 1, sources: [], at: new Date().toISOString() });
    f.store.save(s);
    const snapshot = f.service.questionSnapshot(s.id);
    assert.equal(JSON.parse(snapshot.source).proposed, false);
    assert.doesNotMatch(snapshot.source, /STALE PROPOSAL/);
    const pending = f.service.sideQuestion(s.id, 'อธิบายเป้าหมายหน่อย', true);
    await waiting;
    assert.equal(f.service.isActive(s.id), true);
    assert.equal(f.service.isQuestionActive(s.id), true);
    await assert.rejects(f.service.sideQuestion(s.id, 'ถามซ้ำ', true), /RUN_ALREADY_ACTIVE/);
    release();
    await pending;
    assert.equal(f.service.isActive(s.id), false);
  } finally {
    release();
    await f.service.closeAndWait();
    f.store.close();
  }
});

test('a side answer cannot execute or retain an attempted tool request', async () => {
  const f = fixture(async () => '```step-tool\n{"tool":"changes","input":"unrequested.txt","content":"x"}\n```');
  try {
    await f.service.sideQuestion(f.session.id, 'อธิบายเอกสารให้หน่อย', true);
    const question = f.store.session(f.session.id).sideQuestions!.at(-1)!;
    assert.equal(question.status, 'error');
    assert.equal(question.code, 'SIDE_QUESTION_TOOLS_BLOCKED');
    assert.equal(question.answer, undefined);
    assert.equal(f.effects(), 0);
  } finally {
    f.store.close();
  }
});

test('chat edits stage and accept a host-built section patch without rebuilding unselected rich content', async () => {
  let selected: any;
  const f = fixture(async (_prompt, system) => {
    assert.ok(system.includes('override the full-document output format'));
    return reply(selected, '## 1 วัตถุประสงค์\n\nปรับเฉพาะส่วนนี้');
  });
  try {
    selected = documentTarget(f.session.document!, 'แก้เฉพาะข้อ 1', f.session.revision);
    await f.service.run(f.session.id, 'แก้เฉพาะข้อ 1 ให้กระชับ', '', true);
    let done = f.store.session(f.session.id);
    assert.equal(done.status, 'review', JSON.stringify(done.runs?.at(-1)));
    assert.equal(done.draft, original);
    assert.ok(done.proposals.at(-1)?.document);
    f.store.accept(done.id, done.proposals.at(-1)!.id);
    done = f.store.session(done.id);
    assert.match(documentMarkdown(done.document!), /ปรับเฉพาะส่วนนี้/);
    assert.deepEqual(done.document!.content!.slice(-3), f.session.document!.content!.slice(-3));
  } finally {
    f.store.close();
  }
});
