import test from 'node:test';
import assert from 'node:assert/strict';
import { ToolLoop, MAX_REVIEWS } from '../electron/tool-loop';
import { parseSkillReview, qualityFeedback, skillChecklist } from '../electron/answer-review';
import { evaluateOutputQuality } from '../electron/output-quality';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { WorkService, type Harness } from '../electron/service';
import { Store } from '../electron/store';
import type { Connection } from '../src/types';
const routing: any = await import('../../src/modules/router/service.js');
const boundary: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');

const fenced = (value: unknown) => '```step-tool\n' + JSON.stringify(value) + '\n```';
const host = (review?: (answer: string) => Promise<string | undefined>) =>
  new ToolLoop({
    enabled: () => true,
    check: async () => {},
    readOnly: () => true,
    execute: async () => 'source text',
    outgoing: async text => text,
    ...(review ? { review } : {}),
  });

test('a finished answer that a check faults goes back to the model with its tools, and the fixed answer is returned', async () => {
  const prompts: string[] = [];
  const replies = ['ร่างแรก ยอดรวม 300', fenced({ tool: 'files', input: 'budget.md' }), 'ร่างที่แก้แล้ว ยอดรวม 350'];
  const reviewed: string[] = [];
  const loop = host(async answer => (reviewed.push(answer), answer.includes('300') ? '- ยอดรวมไม่ตรงกับรายการ' : undefined));
  const answer = await loop.run('task', async prompt => (prompts.push(prompt), replies.shift()!), new AbortController().signal);
  assert.equal(answer, 'ร่างที่แก้แล้ว ยอดรวม 350');
  assert.deepEqual(reviewed, ['ร่างแรก ยอดรวม 300', 'ร่างที่แก้แล้ว ยอดรวม 350']);
  assert.match(prompts[1], /<answer_check>/);
  assert.match(prompts[1], /ยอดรวมไม่ตรงกับรายการ/);
  assert.match(prompts[1], /ร่างแรก ยอดรวม 300/);
  // The check is appended, so every prompt still starts with the one before it (prefix-stable for delta transport).
  assert.ok(prompts[2].startsWith(prompts[1]));
  assert.equal(loop.stats.reviews, 1);
});

test('review rounds are bounded and the same finding twice ends the loop with the latest answer', async () => {
  let calls = 0;
  const stalled = host(async () => '- ยังขาดหัวข้องบประมาณ');
  assert.equal(await stalled.run('task', async () => `ร่าง ${++calls}`, new AbortController().signal), 'ร่าง 2');
  assert.equal(stalled.stats.reviews, 1);
  let n = 0;
  const changing = host(async () => `- ข้อที่ ${++n}`);
  calls = 0;
  assert.equal(await changing.run('task', async () => `ร่าง ${++calls}`, new AbortController().signal), `ร่าง ${MAX_REVIEWS + 1}`);
  assert.equal(changing.stats.reviews, MAX_REVIEWS);
});

test('without a review hook, or past the deadline, the answer goes out as it is', async () => {
  assert.equal(await host().run('task', async () => 'คำตอบ', new AbortController().signal), 'คำตอบ');
  const late = new ToolLoop({
    enabled: () => true,
    check: async () => {},
    readOnly: () => true,
    execute: async () => 'x',
    outgoing: async text => text,
    deadline: () => true,
    review: async () => '- something',
  });
  assert.equal(await late.run('task', async () => 'คำตอบ', new AbortController().signal), 'คำตอบ');
});

test('only findings worth a turn go back in the loop', () => {
  const table = '| รายการ | บาท |\n|---|---|\n| ก | 100 |\n| ข | 200 |\n| รวม | 400 |';
  const found = qualityFeedback(evaluateOutputQuality(table).findings);
  assert.ok(found.startsWith('- '), found);
  assert.equal(qualityFeedback(evaluateOutputQuality('คำตอบธรรมดา ไม่มีตาราง').findings), '');
  assert.equal(qualityFeedback([{ code: 'MISSING_REQUIRED_HEADINGS', severity: 'warning', detail: 'x' }]), '');
});

test('the Skill review reads Output and Guardrails and sends back only work the AI can still do', () => {
  const skill = '# TOR\n\n## Purpose\nx\n\n## Output\n- ขอบเขตงาน\n- งวดเงิน\n\n## Guardrails\n- ห้ามเดาราคา\n\n## Source\ny';
  const checklist = skillChecklist(skill);
  assert.match(checklist, /## Output\n- ขอบเขตงาน/);
  assert.match(checklist, /## Guardrails\n- ห้ามเดาราคา/);
  assert.ok(!checklist.includes('Purpose') && !checklist.includes('Source'));
  assert.equal(skillChecklist('# Plain\n\nno sections'), '');
  assert.equal(parseSkillReview('{"status":"continue","missing":["ยังไม่มีงวดเงิน"]}'), '- ยังไม่มีงวดเงิน');
  assert.equal(parseSkillReview('```json\n{"status":"done","missing":[]}\n```'), '');
  assert.equal(parseSkillReview('{"status":"blocked","missing":["ต้องถามราคากลาง"]}'), '');
  assert.equal(parseSkillReview('not json'), '');
});

test('in the app, a chat answer with a wrong total is fixed by the same AI before it is shown', async () => {
  const store = new Store(':memory:');
  store.put('connection', 'c', { id: 'c', provider: 'openai', model: 'fixture', ready: true } as Connection);
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
  const harness: Harness = {
    root: resolve('..'),
    route: (query, opts) => routing.queryStepRouter(query, { autoRoute: true, authorityChecks: true, ...opts }),
    contextPolicy: boundary.classifyContextPolicy,
    privacy: privacy.evaluatePrivacyGate,
    skillMetadata: async () => null,
    documentPrivacy: async () => null,
    nextOutput: async () => null,
    toolLoop: () => true,
    tools: async () => ({
      enabled: () => true,
      check: async () => {},
      readOnly: () => true,
      execute: async () => 'x',
      outgoing: async s => s,
    }),
  };
  const wrong = '| รายการ | บาท |\n|---|---|\n| ก | 100 |\n| ข | 200 |\n| รวม | 400 |';
  const right = '| รายการ | บาท |\n|---|---|\n| ก | 100 |\n| ข | 200 |\n| รวม | 300 |';
  const systems: string[] = [];
  const prompts: string[] = [];
  const replies = [wrong, right];
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async (prompt, _c, context) => {
          systems.push(context.system || '');
          prompts.push(prompt);
          return replies.shift() ?? right;
        },
      },
    }),
    () => {},
  );
  try {
    const session = store.create('c', 'cc');
    await service.run(session.id, 'ทำตารางสรุปค่าใช้จ่ายสองรายการ', '', true, undefined, 'chat');
    const done = store.session(session.id);
    assert.equal(done.messages.at(-1)!.text.trim(), right);
    assert.match(prompts[1], /<answer_check>/);
    // skillReview is off unless policy turns it on: no extra review call was made.
    assert.ok(systems.every(system => !/You check whether a finished answer meets the procedure/.test(system)));
  } finally {
    store.close();
  }
});
