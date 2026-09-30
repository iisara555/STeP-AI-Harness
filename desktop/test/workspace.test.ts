import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../electron/store';
import { WorkService, type Harness } from '../electron/service';
import { exportDocument } from '../electron/export';
import ExcelJS from 'exceljs';
import { createRequire } from 'node:module';

const root = resolve('..');
const routing: any = await import('../../src/modules/router/service.js');
const routerPolicy: any = await import('../../src/modules/router/index.js');
const privacy: any = await import('../../src/modules/privacy/index.js');
const documents: any = await import('../../src/modules/privacy/document.js');
const outputs: any = await import('../../src/modules/output-manager.js');
const harness: Harness = {
  root,
  route: routing.queryStepRouter,
  contextPolicy: routerPolicy.classifyContextPolicy,
  privacy: privacy.evaluatePrivacyGate,
  skillMetadata: async id => {
    const m = await routing.loadSkillContextMetadata(id);
    return { ...m, mandatoryReferences: await routing.loadDocumentContextMetadata(m.mandatory) };
  },
  documentPrivacy: documents.evaluateDocumentPrivacy,
  nextOutput: outputs.getNextOutputPath,
};
function fixture() {
  const store = new Store(':memory:');
  store.put('connection', 'test', { id: 'test', provider: 'openai', mode: 'api', ready: true });
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc', assistant: 'Test', theme: 'system' });
  const session = store.create('test', 'cc');
  return { store, session };
}

test('manual edits survive a late AI proposal and stale acceptance is rejected', () => {
  const { store, session } = fixture();
  store.edit(session.id, 'Human correction', 0);
  const latest = store.session(session.id);
  latest.proposals.push({ id: 'proposal', text: 'AI draft', baseRevision: 0, sources: [], at: '' });
  store.save(latest);
  assert.throws(() => store.accept(session.id, 'proposal'), /DRAFT_CONFLICT/);
  assert.equal(store.session(session.id).draft, 'Human correction');
  assert.equal(store.session(session.id).proposals.length, 1);
  store.close();
});

test('accepting a current proposal creates a restorable immutable version', () => {
  const { store, session } = fixture();
  session.proposals.push({ id: 'p', text: 'Reviewed draft', baseRevision: 0, sources: ['source.md'], at: '' });
  store.save(session);
  const accepted = store.accept(session.id, 'p');
  assert.equal(accepted.revision, 1);
  assert.deepEqual(accepted.sources, ['source.md']);
  assert.equal(accepted.versions[0].text, '');
  assert.equal(accepted.proposals.length, 0);
  store.close();
});

test('reopening SQLite preserves drafts and marks interrupted jobs without replay', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-store-')),
    path = join(dir, 'workspace.sqlite');
  let store = new Store(path);
  const session = store.create('test', 'cc');
  session.draft = 'Saved Thai: สวัสดี';
  session.status = 'running';
  store.save(session);
  store.close();
  store = new Store(path);
  assert.equal(store.session(session.id).draft, session.draft);
  assert.equal(store.session(session.id).status, 'interrupted');
  store.close();
});

test('real router and context feed a fake provider without loading full registries', async () => {
  const { store, session } = fixture();
  let captured = '';
  const service = new WorkService(
    store,
    harness,
    async () => ({
      adapter: {
        run: async prompt => {
          captured = prompt;
          return 'ร่างบรีฟสำหรับตรวจทาน';
        },
      },
      context: { cwd: tmpdir(), env: {} },
    }),
    () => {},
  );
  await service.run(session.id, 'ทำ Designer Brief งานประชาสัมพันธ์กิจกรรม', '');
  assert.equal(store.session(session.id).status, 'review');
  assert.match(captured, /Designer Brief/);
  assert.doesNotMatch(captured, /router-index\.yaml/);
  assert.equal(store.session(session.id).draft, '');
  assert.equal(store.session(session.id).proposals.length, 1);
  store.close();
});

test('credentials and authority blocks never reach the provider', async () => {
  const { store, session } = fixture();
  let calls = 0;
  const service = new WorkService(
    store,
    harness,
    async () => {
      calls++;
      throw new Error('Should not run');
    },
    () => {},
  );
  await assert.rejects(
    service.run(session.id, 'api_key=' + ['sk', 'test-secret-value-long-enough'].join('-'), ''),
    /PRIVACY_REVIEW_REQUIRED/,
  );
  await service.run(session.id, 'อนุมัติเบิกจ่ายงบประมาณและเลือกผู้ชนะจัดซื้อ', '');
  assert.equal(calls, 0);
  assert.equal(store.session(session.id).status, 'error');
  store.close();
});

test('credentials stay blocked even after the user confirms a send', async () => {
  const { store, session } = fixture();
  let calls = 0;
  const service = new WorkService(
    store,
    harness,
    async () => {
      calls++;
      throw new Error('Should not run');
    },
    () => {},
  );
  const secret = 'api_key=' + ['sk', 'test-secret-value-long-enough'].join('-');
  assert.equal(service.review(secret, '').action, 'block-external');
  await assert.rejects(service.run(session.id, secret, '', true), /PRIVACY_REVIEW_REQUIRED/);
  assert.equal(calls, 0);
  store.close();
});

test('name-like review signals need confirmation instead of a permanent block', async () => {
  const { store, session } = fixture();
  let captured = '';
  const service = new WorkService(
    store,
    harness,
    async () => ({
      adapter: {
        run: async prompt => {
          captured = prompt;
          return 'ร่างรายชื่อผู้เข้าอบรมสำหรับตรวจทาน';
        },
      },
      context: { cwd: tmpdir(), env: {} },
    }),
    () => {},
  );
  const request = 'ทำ Designer Brief งานประชาสัมพันธ์กิจกรรม พร้อมรายชื่อผู้เข้าอบรม';
  assert.equal(service.review(request, '').action, 'human-confirm');
  await assert.rejects(service.run(session.id, request, ''), /PRIVACY_REVIEW_REQUIRED/);
  await service.run(session.id, request, '', true);
  assert.match(captured, /รายชื่อผู้เข้าอบรม/);
  // A model reply that mentions names must not fail the run or poison later turns.
  assert.equal(store.session(session.id).status, 'review');
  await service.run(session.id, 'ปรับโทนให้สุภาพขึ้น', '');
  assert.notEqual(store.session(session.id).status, 'error');
  assert.ok(!store.session(session.id).messages.some(m => m.text === 'PRIVACY_REVIEW_REQUIRED'));
  store.close();
});

test('follow-ups revise the latest proposal without re-opening clarification', async () => {
  const { store, session } = fixture();
  const prompts: string[] = [];
  const service = new WorkService(
    store,
    harness,
    async () => ({
      adapter: {
        run: async prompt => {
          prompts.push(prompt);
          return 'ร่างรอบที่ ' + prompts.length;
        },
      },
      context: { cwd: tmpdir(), env: {} },
    }),
    () => {},
  );
  await service.run(session.id, 'ทำ Designer Brief งานประชาสัมพันธ์กิจกรรม', '');
  await service.run(session.id, 'ปรับโทนให้สุภาพขึ้น', '');
  const after = store.session(session.id);
  assert.equal(after.status, 'review');
  assert.equal(after.clarification, false);
  assert.equal(after.originalQuery, 'ทำ Designer Brief งานประชาสัมพันธ์กิจกรรม');
  assert.match(prompts[1], /Current draft:\nร่างรอบที่ 1/);
  assert.match(prompts[1], /Revision requests[^]*ปรับโทนให้สุภาพขึ้น/);
  assert.equal(after.proposals.at(-1)?.text, 'ร่างรอบที่ 2');
  store.close();
});

test('clarification retains the original request and accumulates answers', async () => {
  const { store, session } = fixture();
  const received: any[] = [];
  const fake = {
    ...harness,
    route: async (text: string, opts: any) => {
      received.push([text, opts.clarificationAnswer]);
      return { routingContract: { mode: 'CLARIFY' }, clarification: { question: 'ต้องการผลลัพธ์อะไร' } };
    },
  };
  const service = new WorkService(
    store,
    fake,
    async () => {
      throw new Error('Should not run');
    },
    () => {},
  );
  await service.run(session.id, 'ช่วยหน่อย', '');
  await service.run(session.id, 'ร่างเอกสาร', '');
  await service.run(session.id, 'โครงการอบรม', '');
  assert.deepEqual(received, [
    ['ช่วยหน่อย', ''],
    ['ช่วยหน่อย', 'ร่างเอกสาร'],
    ['ช่วยหน่อย', 'ร่างเอกสาร\nโครงการอบรม'],
  ]);
  store.close();
});

test('cancelled generation cannot create a completed proposal', async () => {
  const { store, session } = fixture();
  let started!: () => void;
  const ready = new Promise<void>(r => (started = r));
  const service = new WorkService(
    store,
    harness,
    async () => ({
      adapter: {
        run: async (_p, _c, context) => {
          started();
          await new Promise<void>(r => context.signal.addEventListener('abort', () => r(), { once: true }));
          return 'Late result';
        },
      },
      context: { cwd: tmpdir(), env: {} },
    }),
    () => {},
  );
  const run = service.run(session.id, 'ทำ Designer Brief งานประชาสัมพันธ์กิจกรรม', '');
  await ready;
  service.cancel(session.id);
  await run;
  assert.equal(store.session(session.id).status, 'cancelled');
  assert.equal(store.session(session.id).proposals.length, 0);
  store.close();
});

test('all 22 teams can route without a model or a forced profile', async () => {
  const teams = await routing.loadTeamsDictionary();
  assert.equal(Object.keys(teams).length, 22);
  for (const team of Object.keys(teams)) {
    const result = await routing.queryStepRouter('ช่วยสรุปบันทึกประชุมเป็นรายการงาน', { team, workspaceDir: tmpdir() });
    assert.ok(['SKILL', 'PLAYBOOK', 'CLARIFY', 'ESCALATE', 'BLOCK', 'UNAVAILABLE'].includes(result.routingContract.mode));
    assert.equal(result.routingContract.routerRegistrySentToModel, false);
  }
});

test('exports preserve Thai text and spreadsheets never turn text into formulas', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-export-'));
  const text = 'หัวข้อโครงการ\nข้อความภาษาไทย\n=HYPERLINK("https://example.com")\t123';
  for (const format of ['md', 'docx', 'xlsx', 'pptx'])
    await exportDocument(join(dir, 'draft.' + format), format, text, async () => new Uint8Array());
  assert.equal(await readFile(join(dir, 'draft.md'), 'utf8'), text);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(join(dir, 'draft.xlsx'));
  assert.equal(workbook.worksheets[0].getCell('A1').value, 'หัวข้อโครงการ');
  assert.equal(typeof workbook.worksheets[0].getCell('A3').value, 'string');
  const require = createRequire(import.meta.url);
  const JSZip = require('jszip');
  const docx = await JSZip.loadAsync(await readFile(join(dir, 'draft.docx')));
  assert.match(await docx.file('word/document.xml').async('string'), /ข้อความภาษาไทย/);
  const pptx = await JSZip.loadAsync(await readFile(join(dir, 'draft.pptx')));
  assert.match(await pptx.file('ppt/slides/slide1.xml').async('string'), /หัวข้อโครงการ/);
});

test('reasoning streams to the UI and provider token usage accumulates per session', async () => {
  const { store, session } = fixture();
  const events: any[] = [];
  const service = new WorkService(
    store,
    harness,
    async () => ({
      adapter: {
        run: async (_p, _c, context) => {
          context.onReasoning?.('วางโครงก่อน');
          context.onUsage?.({ input: 100, output: 20, total: 120 });
          context.onUsage?.({ input: 150, output: 40, total: 190 });
          return 'ร่าง';
        },
      },
      context: { cwd: tmpdir(), env: {} },
    }),
    event => events.push(event),
  );
  await service.run(session.id, 'ทำ Designer Brief งานประชาสัมพันธ์กิจกรรม', '');
  await service.run(session.id, 'ปรับโทนให้สุภาพขึ้น', '');
  assert.ok(events.some(e => e.type === 'reasoning' && e.text === 'วางโครงก่อน'));
  assert.deepEqual(store.session(session.id).usage, { input: 300, output: 80, total: 380, runs: 2 });
  store.close();
});

test('removing a session deletes only that record', () => {
  const { store, session } = fixture();
  const other = store.create('test', 'cc');
  store.remove('session', session.id);
  assert.throws(() => store.session(session.id), /SESSION_NOT_FOUND/);
  assert.equal(store.session(other.id).id, other.id);
  store.close();
});

test('playbook runs publish their plan and step progress', async () => {
  const { store, session } = fixture();
  const events: any[] = [];
  const fake = {
    ...harness,
    route: async () => ({
      routingContract: {
        mode: 'PLAYBOOK',
        authority: { status: 'ALLOW' },
        skill: 'designer-brief',
        steps: [
          { skill: 'designer-brief', description: 'ร่างบรีฟ' },
          { skill: 'designer-brief', description: 'ตรวจโทน' },
          { action: 'spreadsheet-action-plan', description: 'สร้างชีต' },
        ],
      },
    }),
  };
  const service = new WorkService(
    store,
    fake,
    async () => ({ adapter: { run: async () => 'ร่าง' }, context: { cwd: tmpdir(), env: {} } }),
    e => events.push(e),
  );
  await service.run(session.id, 'ทำ Designer Brief', '');
  assert.deepEqual(events.find(e => e.type === 'plan').plan, [
    { label: 'ร่างบรีฟ' },
    { label: 'ตรวจโทน' },
    { label: 'สร้างชีต', action: true },
  ]);
  assert.deepEqual(
    events.filter(e => e.type === 'step').map(e => `${e.index}:${e.state}`),
    ['0:running', '0:done', '1:running', '1:done', '2:skipped'],
  );
  store.close();
});

test('a directly invoked skill is routed by name and kept for follow-ups', async () => {
  const { store, session } = fixture();
  const routes: any[] = [];
  const fake = {
    ...harness,
    route: async (text: string, options: any) => {
      routes.push(options.skill);
      return harness.route(text, options);
    },
  };
  const service = new WorkService(
    store,
    fake,
    async () => ({ adapter: { run: async () => 'ร่าง' }, context: { cwd: tmpdir(), env: {} } }),
    () => {},
  );
  await service.run(session.id, 'ช่วยหน่อย', '', false, 'designer-brief');
  assert.equal(store.session(session.id).status, 'review');
  assert.equal(store.session(session.id).skill, 'designer-brief');
  await service.run(session.id, 'ปรับโทนให้สุภาพขึ้น', '');
  assert.deepEqual(routes, ['designer-brief', 'designer-brief']);
  store.close();
});

test('a step that runs past its budget is reported as a timeout, not a user cancel', async () => {
  const { store, session } = fixture();
  const service = new WorkService(
    store,
    harness,
    async () => ({
      adapter: {
        run: async (_p, _c, context) => {
          await new Promise<void>(r => context.signal.addEventListener('abort', () => r(), { once: true }));
          return 'late';
        },
      },
      context: { cwd: tmpdir(), env: {} },
    }),
    () => {},
    50,
  );
  await service.run(session.id, 'ทำ Designer Brief งานประชาสัมพันธ์กิจกรรม', '');
  const after = store.session(session.id);
  assert.equal(after.status, 'error');
  assert.equal(after.messages.at(-1)?.text, 'RUN_TIMEOUT');
  assert.equal(after.proposals.length, 0);
  store.close();
});

test('general help without a Skill drafts with the mandatory rules only', async () => {
  const { store, session } = fixture();
  const prompts: string[] = [];
  const routed = await routing.queryStepRouter('ช่วยเขียนอีเมลถึงลูกค้าหน่อย', { workspaceDir: tmpdir() });
  assert.equal(routed.routingContract.mode, 'GENERAL');
  const service = new WorkService(
    store,
    { ...harness, route: async () => routed },
    async () => ({ adapter: { run: async (prompt: string) => (prompts.push(prompt), 'ร่างอีเมล') }, context: { cwd: tmpdir(), env: {} } }),
    () => {},
  );
  await service.run(session.id, 'ช่วยเขียนอีเมลถึงลูกค้าหน่อย', '');
  const done = store.session(session.id);
  assert.equal(done.status, 'review', done.messages.at(-1)?.text);
  assert.equal(done.proposals.at(-1)?.text, 'ร่างอีเมล');
  store.close();
});

test('structured receipt source persists in the workspace and is reused on follow-ups', async () => {
  const { store, session } = fixture();
  const prompts: string[] = [];
  const fake: Harness = {
    ...harness,
    route: async () => ({
      routingContract: {
        mode: 'GENERAL',
        authority: { status: 'ALLOW' },
        readiness: { status: 'ready' },
      },
    }),
  };
  const service = new WorkService(
    store,
    fake,
    async () => ({
      adapter: {
        run: async (prompt: string) => {
          prompts.push(prompt);
          return prompts.length === 1 ? 'ตรวจใบเสร็จเบื้องต้นแล้ว' : 'ยอดรวม 107.00 บาท';
        },
      },
      context: { cwd: tmpdir(), env: {} },
    }),
    () => {},
  );
  const source = [
    '[STeP receipt review JSON — persistent workspace source]',
    JSON.stringify({
      schema: 'step-receipt-review/v1',
      filename: 'receipt.jpg',
      fields: {
        merchant: { value: 'ร้านตัวอย่าง จำกัด', checked: true },
        receiptNumber: { value: 'RC-1024', checked: true },
        total: { value: '107.00', checked: true },
      },
      expense_note: 'ใช้ในโครงการทดสอบ',
    }),
  ].join('\n');

  await service.run(session.id, 'ช่วย pre-check ใบเสร็จก่อนส่ง AFP', source, true);
  const afterFirst = store.session(session.id);
  assert.match(afterFirst.sourceText || '', /RC-1024/);
  assert.match(prompts[0], /Approved source excerpts[^]*RC-1024/);

  await service.run(session.id, 'ยอดรวมในใบเสร็จนี้เท่าไร', '', true);
  assert.match(prompts[1], /Approved source excerpts[^]*RC-1024/);
  assert.match(prompts[1], /107\.00/);
  store.close();
});

test('an unrelated turn starts a new task without old receipt source, draft or history', async () => {
  const { store, session } = fixture();
  const prompts: string[] = [];
  const routes: string[] = [];
  const fake: Harness = {
    ...harness,
    route: async (text: string) => {
      routes.push(text);
      return {
        routingContract: {
          mode: 'GENERAL',
          authority: { status: 'ALLOW' },
          readiness: { status: 'ready' },
        },
      };
    },
  };
  const service = new WorkService(
    store,
    fake,
    async () => ({
      adapter: {
        run: async (prompt: string) => {
          prompts.push(prompt);
          return prompts.length === 1 ? 'ร่างตรวจใบเสร็จ 107.00 บาท' : 'สรุประเบียบการลาฉบับใหม่';
        },
      },
      context: { cwd: tmpdir(), env: {} },
    }),
    () => {},
  );

  await service.run(
    session.id,
    'ช่วย pre-check ใบเสร็จก่อนส่ง AFP',
    '[STeP receipt review JSON]\n{"merchant":"ร้านตัวอย่าง","total":"107.00"}',
    true,
  );
  assert.match(store.session(session.id).sourceText || '', /107\.00/);

  await service.run(session.id, 'ช่วยสรุประเบียบการลาฉบับใหม่', '', true);
  const second = prompts[1];
  assert.deepEqual(routes, ['ช่วย pre-check ใบเสร็จก่อนส่ง AFP', 'ช่วยสรุประเบียบการลาฉบับใหม่']);
  assert.match(second, /Conversation: \[\]/);
  assert.match(second, /Current draft:\n\n/);
  assert.doesNotMatch(second, /107\.00|ร้านตัวอย่าง|ร่างตรวจใบเสร็จ/);
  assert.equal(store.session(session.id).sourceText, undefined);
  assert.equal(store.session(session.id).originalQuery, 'ช่วยสรุประเบียบการลาฉบับใหม่');
  store.close();
});
