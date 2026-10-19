import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Store } from '../electron/store';
import { WorkService, type Harness } from '../electron/service';
import { DOCUMENT_TOOLS, documentRequest } from '../src/document-tools';
import { queryStepRouter, loadSkillContextMetadata, loadDocumentContextMetadata } from '../../src/modules/router/service.js';
import { evaluatePrivacyGate } from '../../src/modules/privacy/index.js';
import { classifyContextPolicy } from '../../src/modules/router/task-boundary.js';
import { isDocumentQuestion } from '../electron/document-tools';
import { parseDocumentOutput } from '../src/document-output';

const root = fileURLToPath(new URL('../../', import.meta.url));
const envelope = (draft: string) => `<document_draft>${draft}</document_draft><document_review>ตรวจต้นฉบับก่อนเสนอ</document_review>`;
// What chat-style models write around a revised document when they ignore the delimiters.
const chatty = (draft: string) => `ได้ครับ ผมแก้ไขให้แล้วดังนี้\n\n${draft}\n\nหากต้องการปรับเพิ่มบอกได้เลยครับ`;
// Edits staff type in the chat box after drafting; only some start with an edit verb.
const EDITS = ['ระยะเวลาดำเนินการให้เป็น 90 วัน', 'ใส่งบประมาณ 500,000 บาท', 'ตรงหัวข้อ 5 ช่วยแก้ระยะเวลาเป็น 90 วัน'];

function setup(reply: (prompt: string, system: string) => string) {
  const store = new Store(':memory:');
  store.put('connection', 'test', { id: 'test', provider: 'openai', model: 'synthetic', ready: true });
  const session = store.create('test', 'pm');
  const harness: Harness = {
    root,
    route: (text, options) => queryStepRouter(text, { ...options, workspaceDir: root }),
    contextPolicy: classifyContextPolicy,
    privacy: evaluatePrivacyGate,
    skillMetadata: async id => {
      const meta = await loadSkillContextMetadata(id);
      return { ...meta, mandatoryReferences: await loadDocumentContextMetadata(meta?.mandatory || []) };
    },
    documentPrivacy: async () => null,
    nextOutput: async () => null,
  };
  const systems: string[] = [];
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: root, env: {} },
      adapter: {
        run: async (prompt, _connection, context) => {
          systems.push(context.system || '');
          return reply(prompt, context.system || '');
        },
      },
    }),
    () => {},
  );
  return { store, session, service, systems };
}

test('chat-box edits without an edit verb keep revising the same document for every tool', async () => {
  for (const tool of DOCUMENT_TOOLS) {
    let turn = 0;
    const { store, session, service, systems } = setup((_prompt, system) => {
      const target = /<document_patch_target>\n([\s\S]*?)\n<\/document_patch_target>/.exec(system);
      if (target) {
        const patch = JSON.parse(target[1]);
        patch.markdown = '## 5. ระยะเวลาดำเนินการ\n\nระยะเวลา 90 วัน';
        return `<document_patch>${JSON.stringify(patch)}</document_patch><document_review>ตรวจจำลอง</document_review>`;
      }
      return envelope(`# เอกสารสังเคราะห์\n\n## 5. ระยะเวลาดำเนินการ\n\nฉบับที่ ${turn++}`);
    });
    const template = { key: 'synthetic', sha256: 'synthetic', name: 'synthetic.docx', font: 'TH Sarabun PSK' };
    try {
      const request = documentRequest(tool.id, { [tool.fields[0].key]: 'Synthetic input' }, tool.variants[0].id);
      await service.run(session.id, request.text, request.sourceText, true, undefined, 'draft', undefined, [], {
        documentTool: tool.id,
        documentTemplate: template,
      });
      store.accept(session.id, store.session(session.id).proposals.at(-1)!.id);
      for (const edit of EDITS) {
        if (edit.includes('หัวข้อ 5'))
          assert.ok(
            JSON.stringify(store.session(session.id).document).includes('5.'),
            JSON.stringify({ tool: tool.id, document: store.session(session.id).document }),
          );
        await service.run(session.id, edit, '', true, undefined, 'draft');
        const current = store.session(session.id);
        assert.equal(current.status, 'review', `${tool.id}: ${edit}: ${current.messages.at(-1)?.text}`);
        assert.equal(current.documentTool, tool.id, `${tool.id}: ${edit}`);
        assert.deepEqual(current.documentTemplate, template);
        assert.ok(systems.at(-1)!.includes('<document_tool_contract>'), `${tool.id}: ${edit} must use the document contract`);
        assert.ok(systems.at(-1)!.includes('current_draft'));
        store.accept(session.id, current.proposals.at(-1)!.id);
      }
      assert.ok(!store.session(session.id).draft.includes('ได้ครับ'));
    } finally {
      store.close();
    }
  }
});

test('a chat-style answer to a document edit never becomes the draft', async () => {
  let turn = 0;
  const { store, session, service } = setup(() =>
    turn++ ? chatty('# ขอบเขตของงาน\n\nระยะเวลา 90 วัน') : envelope('# ขอบเขตของงาน\n\nระยะเวลา 60 วัน'),
  );
  try {
    const request = documentRequest('tor', { title: 'จัดซื้อสังเคราะห์' });
    await service.run(session.id, request.text, request.sourceText, true, undefined, 'draft', undefined, [], { documentTool: 'tor' });
    store.accept(session.id, store.session(session.id).proposals.at(-1)!.id);
    const before = store.session(session.id);
    await service.run(session.id, 'ระยะเวลาดำเนินการให้เป็น 90 วัน', '', true, undefined, 'draft');
    const after = store.session(session.id);
    assert.equal(after.draft, before.draft);
    assert.equal(after.proposals.length, before.proposals.length);
    assert.equal(after.documentTool, 'tor');
    assert.equal(after.messages.at(-1)?.text, 'DOCUMENT_OUTPUT_INVALID');
  } finally {
    store.close();
  }
});

test('a question about the draft is answered in chat and leaves the document as it is', async () => {
  let turn = 0;
  const { store, session, service, systems } = setup(() =>
    turn++ === 1 ? 'หัวข้อ 3 คือขอบเขตงานที่ผู้รับจ้างต้องทำ' : envelope(`# ขอบเขตของงาน\n\nฉบับที่ ${turn}`),
  );
  try {
    const request = documentRequest('tor', { title: 'จัดซื้อสังเคราะห์' });
    await service.run(session.id, request.text, request.sourceText, true, undefined, 'draft', undefined, [], { documentTool: 'tor' });
    store.accept(session.id, store.session(session.id).proposals.at(-1)!.id);
    const before = store.session(session.id);
    await service.run(session.id, 'หัวข้อ 3 หมายถึงอะไรครับ', '', true, undefined, 'draft');
    let after = store.session(session.id);
    assert.equal(after.status, 'review');
    assert.ok(!systems.at(-1)!.includes('<document_tool_contract>'));
    assert.equal(after.sideQuestions?.at(-1)?.answer, 'หัวข้อ 3 คือขอบเขตงานที่ผู้รับจ้างต้องทำ');
    assert.deepEqual(after.messages, before.messages, 'side questions keep the main transcript unchanged');
    assert.equal(after.draft, before.draft);
    assert.equal(after.proposals.length, before.proposals.length);
    assert.equal(after.documentTool, 'tor');
    assert.equal(after.mode, 'draft');
    // The next typed edit still revises the TOR with its own Skill and the original request.
    await service.run(session.id, 'ระยะเวลาดำเนินการให้เป็น 90 วัน', '', true, undefined, 'draft');
    after = store.session(session.id);
    assert.equal(after.status, 'review', after.messages.at(-1)?.text);
    assert.equal(after.originalQuery, request.text);
    assert.ok(systems.at(-1)!.includes('Primary Skill: tor-government-writing'));
  } finally {
    store.close();
  }
});

test('a chat-mode turn beside a document keeps the document for later edits', async () => {
  let turn = 0;
  const { store, session, service, systems } = setup(() =>
    turn++ === 1 ? 'innovation คือการสร้างสิ่งใหม่' : envelope(`# ข้อเสนอโครงการ\n\nฉบับที่ ${turn}`),
  );
  try {
    const request = documentRequest('project', { rationale: 'Synthetic need' });
    await service.run(session.id, request.text, request.sourceText, true, undefined, 'draft', undefined, [], { documentTool: 'project' });
    store.accept(session.id, store.session(session.id).proposals.at(-1)!.id);
    await service.run(session.id, 'อธิบายคำว่า innovation', '', true, undefined, 'chat');
    assert.ok(!systems.at(-1)!.includes('<document_tool_contract>'), 'the chat answer is not a document run');
    assert.equal(store.session(session.id).documentTool, 'project');
    await service.run(session.id, 'กลุ่มเป้าหมายเป็นผู้ประกอบการ 30 ราย', '', true, undefined, 'draft');
    const after = store.session(session.id);
    assert.equal(after.status, 'review', after.messages.at(-1)?.text);
    assert.equal(after.originalQuery, request.text);
    assert.ok(systems.at(-1)!.includes('Primary Skill: project-plan'));
  } finally {
    store.close();
  }
});

test('questions are told apart from polite edit requests', () => {
  for (const question of ['หัวข้อ 3 หมายถึงอะไรครับ', 'ทำไมต้องมีหลักประกันสัญญา', 'ระยะเวลา 60 วันพอไหม', 'งบนี้มาจากไหน?'])
    assert.equal(isDocumentQuestion('tor', question), true, question);
  for (const edit of [...EDITS, 'แก้ระยะเวลาเป็น 90 วันได้ไหม', 'ช่วยเพิ่มการรับประกัน 1 ปีหน่อยได้ไหมครับ', 'ชื่อโครงการ: งานใหม่'])
    assert.equal(isDocumentQuestion('tor', edit), false, edit);
  assert.equal(isDocumentQuestion(undefined, 'หมายถึงอะไร'), false);
});

test('opening a chat answer in Output stages the document without the conversation around it', () => {
  const store = new Store(':memory:');
  try {
    const session = store.create('test', 'pm');
    session.documentTool = 'tor';
    session.messages.push({
      role: 'assistant',
      text: chatty('# ขอบเขตของงาน\n\n## 1. ความเป็นมา\n\nข้อความ'),
      at: new Date().toISOString(),
    });
    store.save(session);
    const staged = store.stageMessage(session.id, 0);
    assert.equal(staged.draft, '', 'the current draft is not overwritten');
    const proposal = staged.proposals.at(-1)!;
    assert.equal(proposal.baseRevision, staged.revision);
    assert.ok(proposal.text.startsWith('# ขอบเขตของงาน'), proposal.text);
    assert.ok(!proposal.text.includes('ได้ครับ') && !proposal.text.includes('บอกได้เลย'), proposal.text);
    const accepted = store.accept(session.id, proposal.id);
    assert.ok(
      accepted.document?.content?.some(node => node.type === 'heading' || node.type === 'title'),
      'headings stay structured',
    );

    // Outside a document task the answer still opens as structured Markdown, not raw text.
    const plain = store.create('test', 'pm');
    plain.messages.push({ role: 'assistant', text: '# หัวข้อ\n\n**ตัวหนา**', at: new Date().toISOString() });
    store.save(plain);
    const opened = store.stageMessage(plain.id, 0);
    assert.equal(opened.document?.content?.[0].type, 'title');
    assert.ok(!opened.draft.includes('**'));

    // A draft summary is a status note, never a document.
    plain.messages = store.session(plain.id).messages;
    plain.messages.push({ role: 'assistant', text: 'จัดทำร่างแล้ว', at: new Date().toISOString(), draftSummary: true });
    store.save(plain);
    assert.throws(() => store.stageMessage(plain.id, 1), /MESSAGE_NOT_FOUND/);
  } finally {
    store.close();
  }
});

test('legacy output parsing moves a chat opener and closer out of the draft', () => {
  const output = parseDocumentOutput(chatty('# ขอบเขตของงาน\n\nข้อความ'), 'tor');
  assert.equal(output.draft, '# ขอบเขตของงาน\n\nข้อความ');
  assert.ok(output.review.includes('ได้ครับ') && output.review.includes('บอกได้เลย'));
});
