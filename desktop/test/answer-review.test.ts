import test from 'node:test';
import assert from 'node:assert/strict';
import { ToolLoop, MAX_REVIEWS, type LoopHost } from '../electron/tool-loop';
import { parseSkillReview, qualityFeedback, skillChecklist } from '../electron/answer-review';
import { evaluateOutputQuality } from '../electron/output-quality';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import { WorkService, type Harness } from '../electron/service';
import { Store } from '../electron/store';
import type { Connection, RunEvent } from '../src/types';
const routing: any = await import('../../src/modules/router/service.js');
const boundary: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');

const fenced = (value: unknown) => '```step-tool\n' + JSON.stringify(value) + '\n```';
const host = (review?: (answer: string) => Promise<string | undefined>, extra: Partial<LoopHost> = {}, maxTurns?: number) =>
  new ToolLoop(
    {
      enabled: () => true,
      check: async () => {},
      readOnly: () => true,
      execute: async () => 'source text',
      outgoing: async text => text,
      ...(review ? { review } : {}),
      ...extra,
    },
    maxTurns,
  );

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

test("repository upkeep in a Skill's Verification is not given to the review as work the answer must do", () => {
  const read = (path: string) => readFileSync(resolve('..', 'skills', path, 'SKILL.md'), 'utf8');
  const brief = skillChecklist(read('creative/designer-brief'));
  assert.ok(!/validate-repo|npm test|evals\//.test(brief), brief);
  assert.match(brief, /FM-CC-010/);
  // A Verification that opens with a rule about the answer keeps its steps (for Skill authoring they are the work).
  assert.match(skillChecklist(read('common/step-skill-authoring')), /validate_repo\.py/);
  assert.ok(!/ผู้ดูแล repository/.test(skillChecklist(read('common/google-workspace'))));
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

test('a rewrite that fails, runs out of turns or loses most of the answer leaves the reviewed answer', async () => {
  const draft = 'ร่างฉบับเต็ม '.repeat(120);
  const once = async () => '- ยังขาดหัวข้องบประมาณ';
  const revising: string[] = [];
  const failing = host(once, { revising: answer => revising.push(answer) });
  let calls = 0;
  const failed = await failing.run(
    'task',
    async () => {
      if (calls++ === 0) return draft;
      throw new Error('PROVIDER_REQUEST_FAILED');
    },
    new AbortController().signal,
  );
  assert.equal(failed, draft);
  assert.equal(failing.stats.reviewKept, 'error');
  assert.deepEqual(revising, [draft]);

  const shorter = host(once);
  const replies = [draft, 'เพิ่มหัวข้องบประมาณ: 10,000 บาท'];
  assert.equal(await shorter.run('task', async () => replies.shift()!, new AbortController().signal), draft);
  assert.equal(shorter.stats.reviewKept, 'shorter');

  // The rewrite keeps asking for tools until the turns run out: the reviewed answer, not a progress report, goes out.
  let n = 0;
  const limited = host(once, {}, 3);
  const answer = await limited.run(
    'task',
    async () => (n++ === 0 ? draft : fenced({ tool: 'files', input: `budget-${n}.md` })),
    new AbortController().signal,
  );
  assert.equal(answer, draft);
  assert.equal(limited.stats.reviewKept, 'limit');
});

test('cancelling while a reviewed answer is rewritten still cancels the run', async () => {
  const controller = new AbortController();
  let calls = 0;
  const loop = host(async () => '- ขาดหัวข้อ');
  await assert.rejects(
    loop.run(
      'task',
      async () => {
        if (calls++ === 0) return 'ร่างแรก';
        controller.abort();
        throw new Error('CANCELLED');
      },
      controller.signal,
    ),
    /CANCELLED/,
  );
});

/** A WorkService on a Skill-routed chat request whose model replies through `reply`. */
async function skillRun(
  reply: (system: string, emit?: (text: string) => void) => Promise<string>,
  options: { permissionMode?: 'ask' | 'plan'; stepTimeoutMs?: number } = {},
) {
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
    skillReview: () => true,
    permissionMode: () => options.permissionMode || 'ask',
    tools: async () => ({
      enabled: () => true,
      check: async () => {},
      readOnly: () => true,
      execute: async () => 'x',
      outgoing: async s => s,
    }),
  };
  const events: RunEvent[] = [];
  const systems: string[] = [];
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async (_prompt, _c, context) => {
          systems.push(context.system || '');
          return reply(context.system || '', context.emit);
        },
      },
    }),
    event => events.push(event),
    options.stepTimeoutMs,
  );
  try {
    const session = store.create('c', 'cc');
    await service.run(session.id, 'ทำบรีฟให้ดีไซเนอร์ออกแบบโปสเตอร์งานสัมมนา', '', true, undefined, 'chat');
    return { text: store.session(session.id).messages.at(-1)!.text.trim(), events, reviews: systems.filter(isReview).length };
  } finally {
    store.close();
  }
}
const isReview = (system: string) => /You check whether a finished answer meets the procedure/.test(system);

test('in the app, the Skill review runs once per step, and the answer it sends back leaves the screen', async () => {
  const answers = ['บรีฟร่างแรก ยังไม่มีขนาดชิ้นงาน', 'บรีฟฉบับแก้ ขนาด A2 แนวตั้ง'];
  const run = await skillRun(async (system, emit) => {
    // Every review asks for more: only the first one may send the answer back.
    if (isReview(system)) return '{"status":"continue","missing":["ยังไม่มีขนาดชิ้นงาน"]}';
    const text = answers.shift() ?? 'บรีฟฉบับแก้ ขนาด A2 แนวตั้ง';
    emit?.(text);
    return text;
  });
  assert.equal(run.text, 'บรีฟฉบับแก้ ขนาด A2 แนวตั้ง');
  assert.equal(run.reviews, 1);
  const discard = run.events.find(event => event.type === 'discard');
  assert.equal(discard?.count, 'บรีฟร่างแรก ยังไม่มีขนาดชิ้นงาน'.length);
  assert.ok(run.events.some(event => event.type === 'activity' && event.text === 'กำลังเติมส่วนที่ยังขาด'));
});

test('in the app, no Skill review runs in plan mode or after an answer turn too slow for a rewrite', async () => {
  const reply = async (system: string) => (isReview(system) ? '{"status":"continue","missing":["x"]}' : 'บรีฟ');
  const plan = await skillRun(reply, { permissionMode: 'plan' });
  assert.equal(plan.reviews, 0);
  assert.equal(plan.text, 'บรีฟ');
  // The answer takes 60% of the step timeout: a rewrite could not fit, so the answer goes out unreviewed.
  const slow = await skillRun(async system => (isReview(system) ? '{"status":"continue","missing":["x"]}' : (await delay(600), 'บรีฟ')), {
    stepTimeoutMs: 1000,
  });
  assert.equal(slow.reviews, 0);
  assert.equal(slow.text, 'บรีฟ');
});

test('the live Skill Review cases are well formed and scored as the app would act on them', async () => {
  const { verdict, judgeFix } = await import('../eval/skill-review-live');
  const suite = JSON.parse(readFileSync(resolve('eval/skill-review-cases.json'), 'utf8'));
  for (const item of suite.cases) {
    assert.ok(skillChecklist(readFileSync(resolve('..', 'skills', item.skill, 'SKILL.md'), 'utf8')), item.id);
    if (item.kind === 'missing') assert.ok(new RegExp(item.expect) && new RegExp(item.fixed).source !== '(?:)', item.id);
  }
  const kinds = new Set(suite.cases.map((c: any) => c.kind));
  assert.deepEqual([...kinds].sort(), ['ask', 'complete', 'missing', 'pending']);
  const missing = suite.cases.find((c: any) => c.kind === 'missing');
  const base = { id: missing.id, kind: missing.kind, model: 'm', ms: 1, input: 0, output: 0 };
  assert.equal(verdict(missing, { ...base, status: 'done', findings: '' }), 'missed');
  assert.equal(verdict(missing, { ...base, status: 'continue', findings: '- ยังไม่มี Timeline' }), 'right');
  assert.equal(verdict(missing, { ...base, code: 'INVALID_REVIEW' }), 'invalid');
  const done = suite.cases.find((c: any) => c.kind === 'complete');
  assert.equal(verdict(done, { ...base, kind: 'complete', status: 'continue', findings: '- x' }), 'false-send-back');
  assert.equal(verdict(done, { ...base, kind: 'complete', status: 'blocked', findings: '' }), 'right');
  assert.equal(judgeFix(missing, 'สั้น'), 'fix-missing');
  assert.equal(judgeFix(missing, missing.answer + '\n## Timeline\n## Decision Path'), '');
});
