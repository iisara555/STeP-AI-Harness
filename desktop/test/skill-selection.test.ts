import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareSkillSelection, highConfidenceSkill, shouldRunModelSkillSelection } from '../electron/skill-selection';
import { WorkService, type Harness } from '../electron/service';
import { Store } from '../electron/store';
import { selfContainedText } from '../electron/text-intent';
const routing: any = await import('../../src/modules/router/service.js');
const boundary: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');
const skills: any = await import('../../src/modules/skills/catalog.js');
const root = resolve('..');

function fixture(
  reply: string | ((model: string) => string) = '{"skillId":"document-review","reason":"Review an existing document"}',
  extra: Partial<Harness> = {},
  connection: Record<string, unknown> = {},
) {
  const store = new Store(':memory:');
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
  store.put('connection', 'c', { id: 'c', provider: 'openai', model: 'fixture', ready: true, ...connection });
  const calls: { prompt: string; system: string; selection: boolean; model: string; effort?: string }[] = [];
  const recorded: number[] = [];
  const harness: Harness = {
    root,
    hybridSkillSelection: () => true,
    route: (q, opts) => routing.queryStepRouter(q, { autoRoute: false, authorityChecks: true, disableMemory: true, ...opts }),
    contextPolicy: boundary.classifyContextPolicy,
    privacy: privacy.evaluatePrivacyGate,
    skillMetadata: async id => {
      const m = await routing.loadSkillContextMetadata(id);
      return { ...m, mandatoryReferences: await routing.loadDocumentContextMetadata(m.mandatory) };
    },
    catalog: skills.createSkillCatalog(root),
    documentCatalog: routing.loadDocumentCatalog,
    documentPrivacy: async () => null,
    nextOutput: async () => null,
    toolLoop: () => true,
    tools: async () => ({
      enabled: () => true,
      check: async () => {},
      readOnly: () => true,
      execute: async () => '',
      outgoing: async s => s,
    }),
    recordUsage: (_c, usage) => recorded.push(usage.total),
    ...extra,
  };
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async (prompt, c, ctx) => {
          const selection = Boolean((ctx.jsonSchema as any)?.properties?.skillId);
          calls.push({ prompt, system: ctx.system || '', selection, model: c.model, effort: ctx.effort });
          ctx.onUsage?.({ input: 10, output: 2, total: 12 });
          if (selection) return typeof reply === 'function' ? reply(c.model) : reply;
          return 'Synthetic answer';
        },
      },
    }),
    () => {},
  );
  return { store, service, calls, recorded, session: store.create('c', 'cc') };
}

test('selection validates exact registered names and never accepts tools or extra fields', () => {
  const selection = prepareSkillSelection(
    [
      { name: 'document-review', status: 'routed' },
      { name: 'draft-only', status: 'draft' },
    ],
    'Review this',
    'x'.repeat(13000),
  );
  assert.equal(selection.parse('{"skillId":"document-review","reason":"Review"}'), 'document-review');
  assert.equal(selection.parse('{"skillId":null,"reason":"General help"}'), null);
  for (const reply of [
    'Done',
    '{"skillId":"draft-only","reason":"x"}',
    '{"skillId":"../outside","reason":"x"}',
    '{"skillId":"document-review","reason":"x","tool":"terminal"}',
  ])
    assert.equal(selection.parse(reply), undefined);
  assert.equal(JSON.parse(selection.prompt).source.length, 12000);
  assert.equal(JSON.parse(selection.prompt).sourceTruncated, true);
  assert.doesNotMatch(selection.system, /draft-only/);
});

test('only HIGH candidates from the routed catalog can preload', () => {
  const entries = [{ name: 'known', status: 'routed' }];
  const r = (tier: string, name: string) => ({ routingConfidence: { tier }, candidateSkills: [{ skill: { name } }] });
  assert.equal(highConfidenceSkill(r('HIGH', 'known'), entries, 'Use known'), 'known');
  assert.equal(highConfidenceSkill(r('AMBIGUOUS', 'known'), entries, 'Use known'), undefined);
  assert.equal(highConfidenceSkill(r('HIGH', 'unregistered'), entries, 'Use unregistered'), undefined);
  assert.equal(highConfidenceSkill(r('HIGH', 'known'), entries, 'Review the tone of this existing text'), undefined);
});

test('shortening text never treats mixed actions or an organization policy lookup as text-only', () => {
  assert.equal(selfContainedText('ย่อข้อความนี้แล้วส่งให้ทีม: ข้อความจำลอง'), false);
  assert.equal(selfContainedText('ช่วยย่อระเบียบวันลาของอุทยานให้หน่อย'), false);
});

test('a colloquial review request selects, reroutes and loads real Skill instructions before the answer', async () => {
  const f = fixture();
  try {
    await f.service.run(
      f.session.id,
      'อ่านร่างนี้ให้หน่อย มีตรงไหนงง ข้อมูลตกหล่น หรือบอกไม่เหมือนกันบ้าง',
      'ร่างจำลอง: นัดที่ห้องประชุม แต่ท้ายข้อความบอกออนไลน์',
      true,
      undefined,
      'chat',
      undefined,
      ['synthetic.txt'],
    );
    const done = f.store.session(f.session.id),
      trace = done.runs!.at(-1)!;
    assert.equal(done.status, 'review');
    assert.deepEqual(
      f.calls.map(c => c.selection),
      [true, false],
    );
    assert.match(f.calls[1].system, /<skill_instructions>/);
    assert.ok(trace.steps[0].references.some(p => p.endsWith('document-review/SKILL.md')));
    assert.equal(trace.route, 'skill:document-review');
    assert.deepEqual(trace.skillSelection, { method: 'model', skill: 'document-review' });
    assert.equal(trace.providerCalls?.[0].kind, 'selection');
    assert.equal(
      f.recorded.reduce((n, x) => n + x, 0),
      24,
    );
    assert.doesNotMatch(JSON.stringify(trace.skillSelection), /อ่านร่าง/);
  } finally {
    f.store.close();
  }
});

test('the work assistant still selects and loads relevant STeP Skills', async () => {
  const f = fixture(undefined, { assistantPolicy: () => undefined });
  try {
    await f.service.run(
      f.session.id,
      'อ่านร่างนี้ให้หน่อย มีตรงไหนงง ข้อมูลตกหล่น หรือบอกไม่เหมือนกันบ้าง',
      'ร่างจำลอง: นัดที่ห้องประชุม แต่ท้ายข้อความบอกออนไลน์',
      true,
      undefined,
      'chat',
      undefined,
      ['synthetic.txt'],
      { workflow: 'assistant' },
    );
    const done = f.store.session(f.session.id);
    assert.equal(done.status, 'review');
    assert.equal(done.runs!.at(-1)!.workflow, 'assistant');
    assert.equal(done.runs!.at(-1)!.skillSelection?.skill, 'document-review');
    assert.match(f.calls.at(-1)!.system, /Native workflow: WORK ASSISTANT/);
    assert.match(f.calls.at(-1)!.system, /<skill_instructions>/);
  } finally {
    f.store.close();
  }
});

test('HIGH routing loads a procedure without a selection model call', async () => {
  const f = fixture();
  try {
    await f.service.run(
      f.session.id,
      'ช่วยทำ Designer Brief สำหรับงาน Open House',
      'โจทย์จำลอง: โปสเตอร์สำหรับนักศึกษา',
      true,
      undefined,
      'chat',
    );
    const done = f.store.session(f.session.id);
    assert.equal(done.runs!.at(-1)!.skillSelection?.method, 'router');
    assert.deepEqual(
      f.calls.map(c => c.selection),
      [false],
    );
    assert.match(f.calls[0].system, /<skill_instructions>/);
  } finally {
    f.store.close();
  }
});

test('short translation and proofreading keep text scope with no selector or Skill loading', async () => {
  for (const query of [
    'แปลเป็นอังกฤษ: วันนี้อากาศดี',
    'ช่วยตรวจคำผิด: วันนี้ฉันไปทำงาน',
    'ย่อข้อความนี้เหลือหนึ่งประโยค: ทีมทดลองระบบใหม่ ระบบช่วยค้นหาไฟล์ง่ายขึ้น',
    'ช่วยย่อข้อความนี้ให้สั้นลง: ทีมประชุมแล้ว ทุกคนตกลงทำโปสเตอร์',
  ]) {
    const f = fixture();
    try {
      await f.service.run(f.session.id, query, '', true, undefined, 'chat');
      const done = f.store.session(f.session.id);
      assert.deepEqual(
        f.calls.map(c => c.selection),
        [false],
      );
      assert.equal(done.runs!.at(-1)!.steps[0].contextScope, 'text');
      assert.doesNotMatch(f.calls[0].system, /<skill_instructions>|skill_catalog/);
    } finally {
      f.store.close();
    }
  }
});

test('explicit Skill and disabled hybrid policy never spend a selection call', async () => {
  for (const explicit of [true, false]) {
    const f = fixture(undefined, explicit ? {} : { hybridSkillSelection: () => false });
    try {
      await f.service.run(
        f.session.id,
        'ช่วยตรวจร่างเอกสารนี้ก่อนส่ง',
        'ข้อมูลจำลอง',
        true,
        explicit ? 'document-review' : undefined,
        'chat',
      );
      assert.ok(f.calls.length > 0);
      assert.ok(f.calls.every(c => !c.selection));
    } finally {
      f.store.close();
    }
  }
});

test('invalid selection falls back without loading an unregistered Skill', async () => {
  const f = fixture('{"skillId":"not-installed","reason":"x"}');
  try {
    await f.service.run(f.session.id, 'อ่านร่างนี้ว่ามีอะไรขาดบ้าง', 'ร่างจำลอง', true, undefined, 'chat');
    const done = f.store.session(f.session.id);
    assert.equal(done.status, 'review');
    assert.equal(done.runs!.at(-1)!.skillSelection?.method, 'fallback');
    assert.equal(done.runs!.at(-1)!.providerCalls?.[0].code, 'INVALID_SKILL_SELECTION');
    assert.doesNotMatch(f.calls.at(-1)!.system, /not-installed/);
  } finally {
    f.store.close();
  }
});

const agyModels = ['gemini-3.8-flash-low', 'gemini-3.8-flash-medium'].map(id => ({ id, label: id }));
const agy = { provider: 'antigravity', mode: 'subscription', model: 'gemini-3.8-flash-medium', models: agyModels };
const REVIEW = '{"skillId":"document-review","reason":"Review an existing document"}';

test("Antigravity selects on the model's -low id first, and the answer keeps the chosen model", async () => {
  const f = fixture(REVIEW, {}, agy);
  try {
    await f.service.run(f.session.id, 'อ่านร่างนี้ว่ามีอะไรขาดบ้าง', 'ร่างจำลอง', true, undefined, 'chat');
    const run = f.store.session(f.session.id).runs!.at(-1)!;
    assert.deepEqual(
      f.calls.filter(c => c.selection).map(c => c.model),
      ['gemini-3.8-flash-low'],
    );
    assert.deepEqual(run.skillSelection, { method: 'model', skill: 'document-review' });
    assert.ok(f.calls.filter(c => !c.selection).every(c => c.model === 'gemini-3.8-flash-medium'));
  } finally {
    f.store.close();
  }
});

test('a malformed -low selection asks the chosen model again, so the Skill is not lost', async () => {
  const f = fixture(model => (model.endsWith('-low') ? '{"skillId":"document-review"' : REVIEW), {}, agy);
  try {
    await f.service.run(f.session.id, 'อ่านร่างนี้ว่ามีอะไรขาดบ้าง', 'ร่างจำลอง', true, undefined, 'chat');
    const run = f.store.session(f.session.id).runs!.at(-1)!;
    assert.deepEqual(
      f.calls.filter(c => c.selection).map(c => c.model),
      ['gemini-3.8-flash-low', 'gemini-3.8-flash-medium'],
    );
    assert.deepEqual(
      run.providerCalls!.filter(c => c.kind === 'selection').map(c => c.code || c.outcome),
      ['INVALID_SKILL_SELECTION', 'completed'],
    );
    assert.deepEqual(run.skillSelection, { method: 'model', skill: 'document-review' });
    assert.match(f.calls.at(-1)!.system, /document-review/);
  } finally {
    f.store.close();
  }
});

test('a failed -low selection is retried on the chosen model; quota is not', async () => {
  let failure = 'PROVIDER_STREAM_INVALID';
  const f = fixture(
    model => {
      if (model.endsWith('-low')) throw new Error(failure);
      return REVIEW;
    },
    {},
    agy,
  );
  try {
    await f.service.run(f.session.id, 'อ่านร่างนี้ว่ามีอะไรขาดบ้าง', 'ร่างจำลอง', true, undefined, 'chat');
    assert.deepEqual(f.store.session(f.session.id).runs!.at(-1)!.skillSelection, { method: 'model', skill: 'document-review' });
    failure = 'PROVIDER_QUOTA';
    const before = f.calls.length;
    const second = f.store.create('c', 'cc');
    await f.service.run(second.id, 'อ่านร่างนี้ว่ามีอะไรขาดบ้าง', 'ร่างจำลอง', true, undefined, 'chat');
    assert.deepEqual(
      f.calls.slice(before).map(c => c.model),
      ['gemini-3.8-flash-low'],
      'quota on the account stops the run without a second selection call',
    );
    assert.equal(f.store.session(second.id).status, 'error');
  } finally {
    f.store.close();
  }
});

test('Claude selects once on the chosen model, with its own low level, even when Haiku is listed (owner, 2026-11-01)', async () => {
  const claude = {
    provider: 'claude',
    mode: 'subscription',
    model: 'sonnet',
    models: [
      { id: 'sonnet', label: 'Sonnet', efforts: [{ id: 'low' }, { id: 'medium' }] },
      { id: 'haiku', label: 'Haiku' },
    ],
  };
  const f = fixture(REVIEW, {}, claude);
  try {
    await f.service.run(f.session.id, 'อ่านร่างนี้ว่ามีอะไรขาดบ้าง', 'ร่างจำลอง', true, undefined, 'chat');
    assert.deepEqual(
      f.calls.filter(c => c.selection).map(c => [c.model, c.effort]),
      [['sonnet', 'low']],
    );
  } finally {
    f.store.close();
  }
});

test('a model id without a listed -low id selects once on the chosen model', async () => {
  const f = fixture('{"skillId":"document-review"', {}, { ...agy, models: agyModels.slice(1) });
  try {
    await f.service.run(f.session.id, 'อ่านร่างนี้ว่ามีอะไรขาดบ้าง', 'ร่างจำลอง', true, undefined, 'chat');
    assert.deepEqual(
      f.calls.filter(c => c.selection).map(c => c.model),
      ['gemini-3.8-flash-medium'],
    );
    assert.equal(f.store.session(f.session.id).runs!.at(-1)!.skillSelection?.method, 'fallback');
  } finally {
    f.store.close();
  }
});

test('selection rerouting cannot bypass an authority denial', async () => {
  const f = fixture(undefined, {
    route: (q, opts) =>
      opts?.skill
        ? Promise.resolve({ routingContract: { mode: 'BLOCK', skill: opts.skill, authority: { status: 'DENY' } } })
        : routing.queryStepRouter(q, { ...opts, autoRoute: false }),
  });
  try {
    await f.service.run(f.session.id, 'อ่านร่างนี้ว่ามีอะไรขาดบ้าง', 'ร่างจำลอง', true, undefined, 'chat');
    const done = f.store.session(f.session.id);
    assert.equal(done.status, 'error');
    assert.deepEqual(
      f.calls.map(c => c.selection),
      [true],
    );
    assert.equal(done.runs!.at(-1)!.code, 'AUTHORITY_REVIEW_REQUIRED');
  } finally {
    f.store.close();
  }
});

test('a follow-up keeps its selected procedure and rechecks its route without another selector', async () => {
  const f = fixture();
  try {
    await f.service.run(f.session.id, 'อ่านร่างนี้ว่ามีข้อมูลอะไรขาดบ้าง', 'ร่างจำลองสำหรับตรวจ', true, undefined, 'chat');
    await f.service.run(f.session.id, 'เรื่องเดิม ช่วยปรับให้อ่านง่ายขึ้นด้วย', '', true, undefined, 'chat');
    const done = f.store.session(f.session.id);
    assert.equal(done.status, 'review');
    assert.equal(f.calls.filter(c => c.selection).length, 1);
    assert.equal(done.runs!.at(-1)!.skillSelection?.method, 'previous');
    assert.match(f.calls.at(-1)!.system, /<skill_instructions>/);
  } finally {
    f.store.close();
  }
});

test('personal Workspace questions load the procedure without a separate model selection or manual Skill', async () => {
  for (const query of ['พรุ่งนี้ผมมีประชุมกี่โมง', 'อาทิตย์หน้ามีประชุมอะไรบ้าง', 'ช่วยสรุปอีเมลที่ยังไม่ได้อ่าน']) {
    const f = fixture();
    try {
      await f.service.run(f.session.id, query, '', true, undefined, 'chat');
      const done = f.store.session(f.session.id);
      assert.equal(done.runs!.at(-1)!.route, 'skill:google-workspace');
      assert.equal(done.runs!.at(-1)!.skillSelection?.method, 'router');
      assert.ok(f.calls.length > 0);
      assert.ok(f.calls.every(c => !c.selection));
      assert.match(f.calls[0].system, /<skill_instructions>/);
    } finally {
      f.store.close();
    }
  }
  for (const query of ['สรุปบันทึกประชุมที่แนบมา', 'ขั้นตอนจัดประชุมของ STeP มีอะไรบ้าง', 'ร่างกำหนดการประชุมให้หน่อย']) {
    const routed = await routing.queryStepRouter(query, {
      autoRoute: false,
      authorityChecks: true,
      disableMemory: true,
      conversational: true,
    });
    assert.notEqual(highConfidenceSkill(routed, [{ name: 'google-workspace', status: 'routed' }], query), 'google-workspace');
  }
});

test('calibrated Thai trigger+intent queries fast-path via router and preload skill templates and examples', async () => {
  const f = fixture();
  try {
    await f.service.run(f.session.id, 'ทำ Pre-mortem โครงการพัฒนาแพลตฟอร์ม', 'รายละเอียดโครงการจำลอง', true, undefined, 'chat');
    const done = f.store.session(f.session.id);
    assert.equal(done.runs!.at(-1)!.route, 'skill:project-pre-mortem');
    assert.equal(done.runs!.at(-1)!.skillSelection?.method, 'router');
    assert.deepEqual(
      f.calls.map(c => c.selection),
      [false],
    );
    assert.match(f.calls[0].system, /<skill_resource_manifest skill="project-pre-mortem">/);
    assert.match(f.calls[0].system, /<skill_template path="templates\/pre-mortem-matrix-template\.md"/);
  } finally {
    f.store.close();
  }
});

test('shouldRunModelSkillSelection skips redundant selection when no source and request has strong knowledge without deliverable cue', () => {
  assert.equal(shouldRunModelSkillSelection({ candidateSkills: [] }, 'ติดต่อฝ่ายบุคคลช่องทางไหน', '', true), false);
  assert.equal(
    shouldRunModelSkillSelection(
      { candidateSkills: [{ skill: { name: 'brand-tone-of-voice' }, score: 0.1 }] },
      'สอบถามระเบียบวันลาพักร้อน',
      '',
      true,
    ),
    false,
  );
  assert.equal(shouldRunModelSkillSelection({ candidateSkills: [] }, 'สวัสดีครับ', '', false), false);
  assert.equal(shouldRunModelSkillSelection({ candidateSkills: [] }, 'ตรวจร่างนี้ให้หน่อย', '', false), true);
  assert.equal(shouldRunModelSkillSelection({ candidateSkills: [] }, 'สวัสดีครับ', 'มีไฟล์แนบ', false), true);
});

test('organization knowledge chat without deliverable cues skips LLM selector call', async () => {
  const f = fixture();
  try {
    await f.service.run(f.session.id, 'ติดต่อฝ่ายบุคคลช่องทางไหน', '', true, undefined, 'chat');
    const done = f.store.session(f.session.id);
    assert.deepEqual(
      f.calls.map(c => c.selection),
      [false],
    );
    assert.equal(done.runs!.at(-1)!.skillSelection, undefined);
  } finally {
    f.store.close();
  }
});

test('connected Google Workspace summary reaches the system prompt directly without forcing /google-workspace or loading Skill prose', async () => {
  const f = fixture(undefined, {
    googleWorkspaceSummary: () => ({
      enabled: true,
      vaultSuspended: false,
      accounts: [{ label: 'ko••••@step.cmu.ac.th (1)', services: ['gmail-read', 'drive', 'sheets'] }],
    }),
  });
  try {
    await f.service.run(f.session.id, 'ช่วยสรุปข้อมูลไฟล์ในโปรเจกต์ให้หน่อย', '', true, undefined, 'chat');
    const answerCall = f.calls.find(c => !c.selection)!;
    assert.match(answerCall.system, /Google Workspace is connected and ready for direct google_workspace tool calls/);
    assert.match(answerCall.system, /ko••••@step\.cmu\.ac\.th \(1\): gmail-read, drive, sheets/);
    assert.doesNotMatch(answerCall.system, /<skill_instructions>[\s\S]*# STeP Google Workspace/);
  } finally {
    f.store.close();
  }
});

test('WorkService records patched files in assistant message written list', async () => {
  const store = new Store(':memory:');
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
  store.put('connection', 'c', { id: 'c', provider: 'openai', model: 'fixture', ready: true });
  let turn = 0;
  const harness: Harness = {
    root,
    hybridSkillSelection: () => false,
    route: (q, opts) => routing.queryStepRouter(q, { autoRoute: false, authorityChecks: true, disableMemory: true, ...opts }),
    contextPolicy: boundary.classifyContextPolicy,
    privacy: privacy.evaluatePrivacyGate,
    skillMetadata: async id => ({ ...(await routing.loadSkillContextMetadata(id)), mandatoryReferences: [] }),
    catalog: skills.createSkillCatalog(root),
    documentCatalog: routing.loadDocumentCatalog,
    documentPrivacy: async () => null,
    nextOutput: async () => null,
    toolLoop: () => true,
    tools: async () => ({
      enabled: () => true,
      check: async () => {},
      readOnly: () => false,
      execute: async () => ({ id: 'chg-1', path: 'src/app.ts', status: 'applied' }),
      outgoing: async s => s,
    }),
  };
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async () =>
          ++turn === 1 ? '```step-tool\n{"tool":"patch","input":"src/app.ts","args":{"old_string":"a","new_string":"b"}}\n```' : 'patched',
      },
    }),
    () => {},
  );
  const session = store.create('c', 'cc');
  try {
    await service.run(session.id, 'แก้โค้ด src/app.ts', '', true, undefined, 'chat');
    const saved = store.session(session.id);
    assert.deepEqual(saved.messages.at(-1)?.written, [{ path: 'src/app.ts', id: 'chg-1', status: 'applied' }]);
  } finally {
    store.close();
  }
});

// Chat clarification (policy chatClarification): the selection call may ask which of several fitting Skills is meant.
const REVIEW_REQUEST = 'อ่านร่างนี้ให้หน่อย มีตรงไหนงง ข้อมูลตกหล่น หรือบอกไม่เหมือนกันบ้าง';
const REVIEW_SOURCE = 'ร่างจำลอง: นัดที่ห้องประชุม แต่ท้ายข้อความบอกออนไลน์';
const ASKING =
  '{"skillId":"document-review","reason":"Two kinds of review fit","ask":{"question":"ต้องการให้ช่วยแบบไหนครับ","options":[' +
  '{"skillId":"document-review","label":"ตรวจความครบถ้วนของเอกสาร"},{"skillId":"tor-review","label":"ตรวจ TOR ก่อนประกาศ"}]}}';

test('the selector question is validated: real choices between registered Skills only', () => {
  const entries = ['document-review', 'tor-review'].map(name => ({ name, status: 'routed' }));
  const off = prepareSkillSelection(entries, 'x', '');
  assert.equal((off.schema.properties as any).ask, undefined);
  assert.doesNotMatch(off.system, /"ask"/);
  assert.equal(off.ask(ASKING), undefined);
  // With the ask key the old schema refuses the reply, so a stray question can never pass unnoticed.
  assert.equal(off.parse(ASKING), undefined);
  const on = prepareSkillSelection(entries, 'x', '', { clarify: true });
  assert.deepEqual(on.schema.required, ['skillId', 'reason', 'ask']);
  assert.match(on.system, /Never ask for details a procedure collects itself/);
  assert.equal(on.parse(ASKING), 'document-review');
  assert.deepEqual(on.ask(ASKING), {
    question: 'ต้องการให้ช่วยแบบไหนครับ',
    options: [
      { skillId: 'document-review', label: 'ตรวจความครบถ้วนของเอกสาร' },
      { skillId: 'tor-review', label: 'ตรวจ TOR ก่อนประกาศ' },
    ],
  });
  assert.equal(on.parse('{"skillId":"tor-review","reason":"Clear","ask":null}'), 'tor-review');
  assert.equal(on.ask('{"skillId":"tor-review","reason":"Clear","ask":null}'), undefined);
  const reply = (options: unknown, question = 'เลือกงาน') =>
    JSON.stringify({ skillId: 'tor-review', reason: 'x', ask: { question, options } });
  for (const bad of [
    reply([{ skillId: 'tor-review', label: 'ตรวจ TOR' }]),
    reply([
      { skillId: 'tor-review', label: 'ตรวจ TOR' },
      { skillId: null, label: 'อย่างอื่น' },
    ]),
    reply([
      { skillId: 'tor-review', label: 'ตรวจ TOR' },
      { skillId: 'tor-review', label: 'ตรวจ TOR อีกแบบ' },
    ]),
    reply([
      { skillId: 'tor-review', label: 'ตรวจ TOR' },
      { skillId: 'unknown-skill', label: 'อื่น ๆ' },
    ]),
    reply([
      { skillId: 'tor-review', label: 'tor-review' },
      { skillId: 'document-review', label: 'ตรวจเอกสาร' },
    ]),
    reply([
      { skillId: 'tor-review', label: 'ตรวจ TOR', tool: 'terminal' },
      { skillId: 'document-review', label: 'ตรวจเอกสาร' },
    ]),
    reply(
      [
        { skillId: 'tor-review', label: 'ตรวจ TOR' },
        { skillId: 'document-review', label: 'ตรวจเอกสาร' },
      ],
      '',
    ),
  ])
    assert.equal(on.ask(bad), undefined, bad);
  // Antigravity's own progress labels (seen live) do not make a reply unreadable; other extra keys still do.
  const labelled =
    '{"ask":null,"reason":"Official memo","skillId":"tor-review","toolAction":"Selecting skill","toolSummary":"Skill selection"}';
  assert.equal(on.parse(labelled), 'tor-review');
  assert.equal(off.parse('{"reason":"x","skillId":"tor-review","toolAction":"Selecting skill"}'), 'tor-review');
  assert.equal(on.parse('{"ask":null,"reason":"x","skillId":"tor-review","toolAction":"a","tool":"terminal"}'), undefined);
  // A dropped question still keeps the best choice.
  assert.equal(on.parse(reply([{ skillId: 'tor-review', label: 'ตรวจ TOR' }])), 'tor-review');
});

function asking(answer: string | null, reply: string | ((model: string) => string) = ASKING, policy = true) {
  const asked: { question: string; options: string[] }[] = [];
  const f = fixture(reply, {
    chatClarification: () => policy,
    ask: async (_id, question, options) => {
      asked.push({ question, options });
      return answer;
    },
  });
  return { ...f, asked };
}

test('a chosen option loads that Skill with no second selection call, and the answer stays with the task', async () => {
  const f = asking('ตรวจ TOR ก่อนประกาศ');
  try {
    await f.service.run(f.session.id, REVIEW_REQUEST, REVIEW_SOURCE, true, undefined, 'chat', undefined, ['synthetic.txt']);
    const done = f.store.session(f.session.id),
      trace = done.runs!.at(-1)!;
    assert.equal(done.status, 'review');
    assert.deepEqual(f.asked, [{ question: 'ต้องการให้ช่วยแบบไหนครับ', options: ['ตรวจความครบถ้วนของเอกสาร', 'ตรวจ TOR ก่อนประกาศ'] }]);
    assert.deepEqual(
      f.calls.map(c => c.selection),
      [true, false],
    );
    assert.equal(trace.route, 'skill:tor-review');
    assert.deepEqual(trace.skillSelection, { method: 'asked', skill: 'tor-review', asked: true });
    assert.deepEqual(done.followUps, ['ต้องการให้ช่วยแบบไหนครับ → ตรวจ TOR ก่อนประกาศ']);
    assert.match(f.calls[1].prompt + f.calls[1].system, /ตรวจ TOR ก่อนประกาศ/);
  } finally {
    f.store.close();
  }
});

test('a typed answer chooses again with it and never asks twice', async () => {
  const replies: string[] = [];
  const f = asking('ช่วยดูว่าข้อมูลตกหล่นตรงไหน', () => {
    replies.push('');
    return replies.length === 1 ? ASKING : '{"skillId":"document-review","reason":"Completeness review"}';
  });
  try {
    await f.service.run(f.session.id, REVIEW_REQUEST, REVIEW_SOURCE, true, undefined, 'chat', undefined, ['synthetic.txt']);
    const done = f.store.session(f.session.id),
      trace = done.runs!.at(-1)!;
    assert.equal(f.asked.length, 1);
    assert.deepEqual(
      f.calls.map(c => c.selection),
      [true, true, false],
    );
    assert.match(f.calls[0].system, /"ask"/);
    assert.doesNotMatch(f.calls[1].system, /"ask"/);
    assert.match(JSON.parse(f.calls[1].prompt).request, /ช่วยดูว่าข้อมูลตกหล่นตรงไหน/);
    assert.equal(trace.route, 'skill:document-review');
    assert.deepEqual(trace.skillSelection, { method: 'model', skill: 'document-review', asked: true });
  } finally {
    f.store.close();
  }
});

test('cancelling the question stops the run without an answer', async () => {
  const f = asking(null);
  try {
    await f.service.run(f.session.id, REVIEW_REQUEST, REVIEW_SOURCE, true, undefined, 'chat', undefined, ['synthetic.txt']);
    const done = f.store.session(f.session.id);
    assert.equal(done.status, 'cancelled');
    assert.equal(done.messages.at(-1)?.text, 'CANCELLED');
    assert.deepEqual(
      f.calls.map(c => c.selection),
      [true],
    );
  } finally {
    f.store.close();
  }
});

test('with chatClarification off the selection prompt is unchanged and nothing is asked', async () => {
  const f = asking('ตรวจ TOR ก่อนประกาศ', '{"skillId":"document-review","reason":"Review"}', false);
  try {
    await f.service.run(f.session.id, REVIEW_REQUEST, REVIEW_SOURCE, true, undefined, 'chat', undefined, ['synthetic.txt']);
    const trace = f.store.session(f.session.id).runs!.at(-1)!;
    assert.equal(f.asked.length, 0);
    assert.doesNotMatch(f.calls[0].system, /"ask"/);
    assert.deepEqual(trace.skillSelection, { method: 'model', skill: 'document-review' });
  } finally {
    f.store.close();
  }
});

test('a selector that does not ask answers as before, in one selection call', async () => {
  const f = asking('ไม่ควรถูกถาม', '{"skillId":"document-review","reason":"Clear","ask":null}');
  try {
    await f.service.run(f.session.id, REVIEW_REQUEST, REVIEW_SOURCE, true, undefined, 'chat', undefined, ['synthetic.txt']);
    const trace = f.store.session(f.session.id).runs!.at(-1)!;
    assert.equal(f.asked.length, 0);
    assert.deepEqual(trace.skillSelection, { method: 'model', skill: 'document-review' });
    assert.equal(trace.route, 'skill:document-review');
  } finally {
    f.store.close();
  }
});

test('a request later in a conversation is never asked about: the selector cannot see what was said before', async () => {
  const f = asking('ตรวจ TOR ก่อนประกาศ');
  try {
    const s = f.store.session(f.session.id);
    s.messages.push(
      { role: 'user', text: 'นี่คือ TOR จ้างทำเว็บไซต์ที่เพิ่งร่างเสร็จ', at: new Date().toISOString() },
      { role: 'assistant', text: 'รับทราบครับ', at: new Date().toISOString() },
    );
    f.store.save(s);
    await f.service.run(f.session.id, REVIEW_REQUEST, REVIEW_SOURCE, true, undefined, 'chat', undefined, ['synthetic.txt']);
    const trace = f.store.session(f.session.id).runs!.at(-1)!;
    assert.equal(f.asked.length, 0);
    assert.doesNotMatch(f.calls[0].system, /"ask"/);
    assert.equal(trace.skillSelection?.asked, undefined);
  } finally {
    f.store.close();
  }
});
