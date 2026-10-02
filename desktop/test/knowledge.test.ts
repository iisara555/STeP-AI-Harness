import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Store } from '../electron/store';
import { WorkService, type Harness } from '../electron/service';
import { OrganizationKnowledge, MATCH_THRESHOLD } from '../electron/knowledge';

const routing: any = await import('../../src/modules/router/service.js');
const policy: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');
const root = resolve('..');
const knowledge = new OrganizationKnowledge(root, routing.loadDocumentCatalog);

test('documents kept as a summary index are readable; restricted and missing ones never are', async () => {
  const catalog = await routing.loadDocumentCatalog();
  const ids = catalog.map((d: any) => d.id);
  for (const id of ['hr-service-channels', 'hr-personnel-welfare-2569', 'step-career-path-2569', 'step-facility-equipment-inventory-2020'])
    assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('hr-personnel-welfare-2566'), 'restricted (superseded) announcement');
  assert.ok(!ids.includes('procurement-policy'), 'not provided to the harness');
  // The reference tool reads the same metadata: an index document resolves, a restricted one has no path.
  const [welfare, old] = await routing.loadDocumentContextMetadata(['hr-personnel-welfare-2569', 'hr-personnel-welfare-2566']);
  assert.equal(welfare.path, 'docs/hr-personnel-welfare-index.md');
  assert.equal(old.path, '');
  assert.equal(old.status, 'restricted');
});

test('staff questions find the right section of the organization documents; unrelated ones find nothing', async () => {
  const top = async (q: string) => (await knowledge.search(q))[0];
  assert.equal((await top('ติดต่อฝ่ายบุคคลช่องทางไหน'))?.id, 'hr-service-channels');
  const medical = await top('เบิกค่ารักษาพยาบาลได้เท่าไร');
  assert.equal(medical?.id, 'hr-personnel-welfare-2569');
  assert.match(medical!.heading, /รักษาพยาบาล/);
  assert.match((await top('ลาพักผ่อนประจำปีได้กี่วัน'))!.heading, /ลาพักผ่อน/);
  assert.equal((await top('เส้นทางความก้าวหน้าในอาชีพ'))?.id, 'step-career-path-2569');
  for (const q of ['ราคาทองวันนี้', 'ช่วยเขียนอีเมลขอบคุณลูกค้า', 'อัตราแลกเปลี่ยนดอลลาร์วันนี้', 'ผลบอลเมื่อคืน'])
    assert.deepEqual(await knowledge.search(q), [], q);
  for (const s of await knowledge.search('สวัสดิการบุคลากรมีอะไรบ้าง')) assert.ok(s.score >= MATCH_THRESHOLD);
});

function service(captured: { prompt: string; system: string; webSearch: boolean[] }) {
  const harness: Harness = {
    root,
    route: routing.queryStepRouter,
    contextPolicy: policy.classifyContextPolicy,
    privacy: privacy.evaluatePrivacyGate,
    skillMetadata: async id => {
      const m = await routing.loadSkillContextMetadata(id);
      return { ...m, mandatoryReferences: await routing.loadDocumentContextMetadata(m.mandatory) };
    },
    documentCatalog: routing.loadDocumentCatalog,
    documentPrivacy: async () => ({}),
    nextOutput: async () => ({}),
  };
  const store = new Store(':memory:');
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
  store.put('connection', 'test', { id: 'test', provider: 'openai', mode: 'subscription', ready: true });
  const work = new WorkService(
    store,
    harness,
    async (_connection, webSearch) => {
      captured.webSearch.push(Boolean(webSearch));
      return {
        adapter: {
          run: async (prompt, _c, context) => {
            captured.prompt = prompt;
            captured.system = context.system || '';
            return 'คำตอบทดสอบ';
          },
        },
        context: { cwd: tmpdir(), env: {} },
      };
    },
    () => {},
  );
  return { store, work, session: store.create('test', 'cc') };
}

test('a general question about STeP is answered from its documents, which the task lists as context used', async () => {
  const captured = { prompt: '', system: '', webSearch: [] as boolean[] };
  const { store, work, session } = service(captured);
  await work.run(session.id, 'ติดต่อฝ่ายบุคคลช่องทางไหน', '', true, undefined, 'chat');
  assert.match(captured.prompt, /<organization_knowledge>/);
  assert.match(captured.prompt, /\[hr-service-channels\]/);
  assert.match(captured.system, /never fill the gap from general knowledge/);
  assert.ok(store.session(session.id).loadedContext?.some(c => c.includes('HR Service Channels')));
  assert.ok(!captured.webSearch.includes(true), 'no web search for an internal question');
  store.close();
});

test('an HR policy Skill gets the welfare section it needs instead of answering from memory', async () => {
  const captured = { prompt: '', system: '', webSearch: [] as boolean[] };
  const { store, work, session } = service(captured);
  await work.run(session.id, 'ลาพักผ่อนประจำปีได้กี่วัน', '', true, undefined, 'chat');
  assert.match(captured.prompt, /\[hr-personnel-welfare-2569\]/);
  assert.match(captured.prompt, /ลาพักผ่อนประจำปี/);
  store.close();
});

test('an unrelated request carries no organization documents', async () => {
  const captured = { prompt: '', system: '', webSearch: [] as boolean[] };
  const { store, work, session } = service(captured);
  await work.run(session.id, 'ช่วยเขียนอีเมลขอบคุณลูกค้า', '', true, undefined, 'chat');
  assert.doesNotMatch(captured.prompt, /<organization_knowledge>/);
  store.close();
});

test('a request about STeP MIS is sent to the STeP Browser with the registered address, never answered from memory', async () => {
  const { internalSystemFor, internalSystemRule } = await import('../electron/internal-systems');
  for (const text of [
    'ดาวน์โหลดแบบฟอร์ม FM-CC-010 จาก STeP MIS',
    'เข้าMISทำรายงานขอความเห็นชอบหมวด B',
    'ช่วยดูใน STeP : MIS ให้หน่อย',
    'เปิด https://mis.step.cmu.ac.th/ ให้ที',
  ])
    assert.equal((await internalSystemFor(root, text))?.url, 'https://mis.step.cmu.ac.th/', text);
  for (const text of ['ร่าง mission statement ของทีม', 'misc notes', 'ติดต่อฝ่ายบุคคลช่องทางไหน'])
    assert.equal(await internalSystemFor(root, text), undefined, text);
  const mis = (await internalSystemFor(root, 'STeP MIS'))!;
  const on = internalSystemRule(mis, true);
  assert.match(on, /browser_control\(input="https:\/\/mis\.step\.cmu\.ac\.th\/", args\.action=open\)/);
  assert.match(on, /never ask for, type or store credentials/);
  assert.match(on, /Do not submit, approve, sign or e-sign/);
  assert.match(internalSystemRule(mis, false), /open https:\/\/mis\.step\.cmu\.ac\.th\/ themselves/);

  const captured = { prompt: '', system: '', webSearch: [] as boolean[] };
  const { store, work, session } = service(captured);
  await work.run(session.id, 'ช่วยหาแบบฟอร์ม ISO ล่าสุดใน STeP MIS', '', true, undefined, 'chat');
  assert.match(captured.system, /concerns STeP MIS \(https:\/\/mis\.step\.cmu\.ac\.th\/\)/);
  assert.ok(!captured.webSearch.includes(true), 'MIS is never searched on the public web');
  store.close();
});

test('declining the clarifying menu in chat gets an answer instead of the same question again', async () => {
  const captured = { prompt: '', system: '', webSearch: [] as boolean[] };
  const { store, work, session } = service(captured);
  await work.run(session.id, '12:00 น. D204 การประชุมการใช้ ai Harness 3 อิศรา แก้เรื่อง', '', true, undefined, 'chat');
  const asked = store.session(session.id);
  assert.equal(asked.status, 'waiting');
  assert.match(asked.messages.at(-1)!.text, /ตรงกับข้อนี้ไหม/);
  await work.run(session.id, 'ไม่ตรง', '', true, undefined, 'chat');
  const answered = store.session(session.id);
  assert.equal(answered.messages.at(-1)!.text, 'คำตอบทดสอบ');
  assert.match(captured.prompt, /D204/, 'the model sees the original request');
  store.close();
});
