import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { requestedDocumentTool } from '../src/document-intent';
import { documentTarget, applyDocumentPatch } from '../electron/document-patch';
import { markdownDocument } from '../src/draft';
import { Store } from '../electron/store';
import { ArtifactStore } from '../electron/artifacts';
import { Workbench } from '../electron/workbench';
import { DesktopTools } from '../electron/tools';
import { ToolGate } from '../electron/tool-gate';
import { Approvals } from '../electron/approvals';
import { Questions } from '../electron/questions';
import { defaultPolicy } from '../electron/policy';
import { WorkService, type Harness } from '../electron/service';
import { explainError, errorText } from '../src/messages';
import { visibleStream } from '../src/tools';
import { visibleAnswer, normalizeMarkdownMath, parseAlertTag } from '../src/chat-markdown';
import { buildSandboxedHtmlSrc, buildSandboxedSvgSrc, isPreviewableHtml, isPreviewableSvg, sanitizeStaticSvg } from '../src/inline-preview';
import { highlight } from '../src/code-highlight';
import { splitClaimReply } from '../src/claim-case';
import { stageLabel } from '../src/thinking-panel';
import { clearLiveSession, focusLiveSession, liveAnswer, liveThinking, resetThinking, setStream, think } from '../src/live-run';
import { resolveRun, runPayload } from '../src/run-flow';
import { COMPOSER_WORKFLOWS } from '../src/work-plan';
import type { Connection, PermissionMode } from '../src/types';

test('[DRAFT-02] communication/CC chat requests mentioning โครงการ/ประกาศ/รายงานความคืบหน้า do not hijack into document mode', () => {
  for (const prompt of [
    'ช่วยเขียนแคปชันประชาสัมพันธ์โครงการอบรม AI หน่อย',
    'ช่วยเขียนโพสต์ Facebook ประชาสัมพันธ์โครงการใหม่',
    'ช่วยเขียนอีเมลแจ้งประกาศวันหยุดให้พนักงาน',
    'ช่วยเขียนสคริปต์รายงานความคืบหน้าหน้าเวที',
    'ช่วยสร้างสไลด์นำเสนอโครงการอบรม',
    'ช่วยเขียนบรีฟงานออกแบบโปสเตอร์โครงการ',
    'โครงการอบรม AI ช่วยเขียนแคปชันประชาสัมพันธ์ให้หน่อย',
    'ช่วยเขียนข้อความประกาศรับสมัครในไลน์กลุ่ม',
  ]) {
    assert.equal(requestedDocumentTool(prompt), undefined, prompt);
  }
  // Explicit document conversion from an email still routes to memo.
  assert.equal(requestedDocumentTool('แปลงอีเมลนี้เป็นบันทึกข้อความ'), 'memo');
});

test('[DRAFT-02] project proposal requests phrased with รายละเอียด/ข้อมูล/สำหรับ still open the project tool', () => {
  for (const prompt of [
    // The project's own name mentions หนังสือราชการ; it must not become a letter.
    'ช่วยเขียนรายละเอียดโครงการอบรมการเขียนหนังสือราชการ',
    'ร่างข้อมูลโครงการพัฒนาบุคลากร',
    'ร่างเอกสารสำหรับโครงการพัฒนาบุคลากร',
  ]) {
    assert.equal(requestedDocumentTool(prompt), 'project', prompt);
  }
  // Communication pieces about a project still stay in chat.
  assert.equal(requestedDocumentTool('เขียนข่าวประชาสัมพันธ์เกี่ยวกับโครงการ'), undefined);
});

test('[DRAFT-03] adding a new section, multi-section edits, and word-level เฉพาะ fall back to full revision; fenced JSON inside patch parses', () => {
  const base = markdownDocument('# โครงการจำลอง\n\n## 1 วัตถุประสงค์\n\nเดิม 1\n\n## 2 กิจกรรม\n\nเดิม 2\n\n## 3 ระยะเวลา\n\nเดิม 3');
  assert.equal(documentTarget(base, 'เพิ่มข้อ 17 เรื่องการรับประกัน', 1), undefined);
  assert.equal(documentTarget(base, 'แก้ข้อ 1 กับข้อ 3 เป็น 90 วัน', 1), undefined);
  assert.equal(documentTarget(base, 'แก้คำผิดเฉพาะคำว่า อบรม เป็น สัมมนา', 1), undefined);
  // Explicit single missing section still fails safely.
  assert.throws(() => documentTarget(base, 'แก้เฉพาะข้อ 99', 1), /DOCUMENT_TARGET_AMBIGUOUS/);

  const target = documentTarget(base, 'แก้เฉพาะข้อ 1', 2)!;
  const fenced =
    '<document_patch>```json\n' +
    JSON.stringify({
      id: target.id,
      baseRevision: target.baseRevision,
      expectedHash: target.expectedHash,
      markdown: '## 1 วัตถุประสงค์\n\nใหม่',
    }) +
    '\n```</document_patch><document_review>ok</document_review>';
  const patched = applyDocumentPatch(fenced, target, base);
  assert.match(patched.draft, /ใหม่/);
});

test('[DRAFT-04] restoring an earlier generic draft after switching to TOR restores untyped documentTool instead of keeping TOR', () => {
  const store = new Store(':memory:');
  try {
    const s = store.create('c1', 'cc');
    store.edit(s.id, 'ร่างทั่วไปเดิม', 0, markdownDocument('ร่างทั่วไปเดิม'));
    store.startConversationDocument(s.id);
    const afterShelve = store.session(s.id);
    afterShelve.documentTool = 'tor';
    store.save(afterShelve);
    store.edit(s.id, '# TOR ใหม่', afterShelve.revision, markdownDocument('# TOR ใหม่'));
    const genericVersion = store.session(s.id).versions.find(v => v.text.includes('ร่างทั่วไปเดิม'))!;
    assert.equal(genericVersion.documentTool, undefined);
    const restored = store.restore(s.id, genericVersion.revision);
    assert.equal(restored.documentTool, undefined);
    assert.match(restored.draft, /ร่างทั่วไปเดิม/);
  } finally {
    store.close();
  }
});

test('[PLAN-01] workflow=plan blocks mutating tools even in acceptEdits/auto mode, and coding/read-only plan tool builds WorkPlanCard', async () => {
  const store = new Store(':memory:');
  try {
    const policy = defaultPolicy();
    store.put('settings', 'main', { workspace: tmpdir() });
    let permMode: PermissionMode = 'auto';
    const approvals = new Approvals(store, req => {
      if (req) queueMicrotask(() => approvals.respond(req.id, 'once'));
    });
    const questions = new Questions(() => {});
    const workbench = new Workbench(store, undefined, () => policy);
    const gate = new ToolGate(
      () => policy,
      () => permMode,
      () => workbench.root(),
      approvals,
      async () => ({ blocked: false, reason: '', results: [] }),
    );
    const harness: Harness = {
      root: tmpdir(),
      route: async () => ({ routingContract: { mode: 'GENERAL', authority: { status: 'ALLOW' }, mandatoryReferences: [] } }),
      contextPolicy: () => ({ history: 'ignore', carryover: false }),
      privacy: text => ({ action: 'pass', redactedText: text, findings: [] }),
      skillMetadata: async () => null,
      documentPrivacy: async () => null,
      nextOutput: async () => null,
    };
    const tools = new DesktopTools(
      workbench,
      harness,
      gate,
      approvals,
      questions,
      () => policy,
      () => permMode,
      resolve('electron/sheet-worker.cjs'),
    );
    const session = store.create('c1', 'cc');
    const baseScope = {
      cancel: () => {},
      sessionId: session.id,
      query: 'test',
      team: 'cc',
      contract: { mode: 'GENERAL', authority: { status: 'ALLOW' } },
      connection: { id: 'c1', provider: 'openai', mode: 'api', model: 'm', executable: '', ready: true, note: '' } as Connection,
      signal: new AbortController().signal,
      search: async () => '',
      activity: () => {},
    };
    // Write tools must be blocked when workflow='plan' even though permissionMode='auto'.
    await assert.rejects(
      tools.execute({ tool: 'changes', input: 'a.txt', content: 'hi' }, { ...baseScope, workflow: 'plan' }),
      /PLAN_MODE_BLOCKED/,
    );
    await assert.rejects(tools.execute({ tool: 'terminal', input: 'echo hi' }, { ...baseScope, workflow: 'plan' }), /PLAN_MODE_BLOCKED/);
    // In coding workflow (or read-only plan mode), submitting a checklist plan asks approval and stores WorkPlan.
    const planRes: any = await tools.execute(
      { tool: 'plan', input: '# เป้าหมาย: แก้บั๊ก\n- [ ] ตรวจโค้ด\n- [ ] เพิ่มเทสต์' },
      { ...baseScope, workflow: 'coding' },
    );
    assert.equal(planRes.approved, true);
    assert.equal(planRes.canProceedInline, false);
    assert.equal(store.session(session.id).workPlan?.tasks.length, 2);

    // updateWorkTask clears stale blocker note when status moves to done without a new note.
    workbench.updateWorkTask(session.id, 1, 'blocked', 'รอข้อมูล');
    assert.equal(store.session(session.id).workPlan?.tasks[0].note, 'รอข้อมูล');
    workbench.updateWorkTask(session.id, 1, 'done', '');
    assert.equal(store.session(session.id).workPlan?.tasks[0].note, undefined);

    // clearWorkPlan removes completed plan cleanly.
    workbench.clearWorkPlan(session.id);
    assert.equal(store.session(session.id).workPlan, undefined);
  } finally {
    store.close();
  }
});

test('[PLAN-01 / UI] composer dropdown excludes execute workflow while runPayload supports explicit workflow override for Proceed button', () => {
  assert.equal(COMPOSER_WORKFLOWS.includes('execute'), false);
  const run = resolveRun({ mode: 'chat', workflow: 'execute' }, { mode: 'chat', imageModel: '', coordinated: false });
  const payload = runPayload('s1', 'ลงมือทำตามแผน', run, '');
  assert.equal(payload.workflow, 'execute');
});

test('[PLAN-01 / PLAN-03] execute workflow refuses permissionMode=plan immediately and autoContinue avoids fake user bubbles', async () => {
  const store = new Store(':memory:');
  try {
    store.put('connection', 'c1', { id: 'c1', provider: 'openai', mode: 'api', model: 'm', ready: true } as Connection);
    const s = store.create('c1', 'cc');
    s.workPlan = {
      goal: 'แผนจำลอง',
      approvedAt: new Date().toISOString(),
      tasks: [
        { title: 'ขั้น 1', status: 'todo' },
        { title: 'ขั้น 2', status: 'todo' },
      ],
    };
    store.save(s);
    let permMode: PermissionMode = 'plan';
    let round = 0;
    const harness: Harness = {
      root: tmpdir(),
      permissionMode: () => permMode,
      route: async () => ({ routingContract: { mode: 'GENERAL', authority: { status: 'ALLOW' }, mandatoryReferences: [] } }),
      contextPolicy: () => ({ history: 'ignore', carryover: false }),
      privacy: t => ({ action: 'pass', redactedText: t, findings: [] }),
      skillMetadata: async () => null,
      documentPrivacy: async () => null,
      nextOutput: async () => null,
    };
    const service = new WorkService(
      store,
      harness,
      async () => ({
        context: { cwd: tmpdir(), env: {} },
        adapter: {
          run: async () => {
            round++;
            const cur = store.session(s.id);
            cur.workPlan!.tasks[round - 1].status = 'done';
            store.save(cur);
            return `เสร็จขั้น ${round}`;
          },
        },
      }),
      () => {},
    );
    await assert.rejects(
      service.run(s.id, 'ลงมือทำตามแผน', '', true, undefined, 'chat', undefined, [], { workflow: 'execute' }),
      /PLAN_MODE_BLOCKED/,
    );
    permMode = 'ask';
    await service.run(s.id, 'ลงมือทำตามแผน', '', true, undefined, 'chat', undefined, [], { workflow: 'execute', autoContinue: true });
    const done = store.session(s.id);
    assert.equal(done.longTask?.status, 'completed');
    assert.equal(done.longTask?.rounds, 2);
    const userMessages = done.messages.filter(m => m.role === 'user');
    assert.equal(userMessages.length, 1, 'autoContinue round 2 must not inject a synthetic user bubble');
  } finally {
    store.close();
  }
});

test('[CHAT-06] explainError matches specific longer error codes without substring shadowing and includes PLAN_READ_ONLY / RUN_INTERRUPTED / CHANGE_NOT_FOUND', () => {
  assert.equal(explainError(new Error('IMAGE_MODEL_UNAVAILABLE')), errorText.IMAGE_MODEL_UNAVAILABLE);
  assert.notEqual(explainError(new Error('IMAGE_MODEL_UNAVAILABLE')), errorText.MODEL_UNAVAILABLE);
  assert.equal(explainError(new Error('PROVIDER_TOOL_DENIED')), errorText.PROVIDER_TOOL_DENIED);
  assert.equal(explainError(new Error('SUBAGENT_TOOL_DENIED')), errorText.SUBAGENT_TOOL_DENIED);
  assert.equal(explainError(new Error('TOOL_OUTPUT_LIMIT')), errorText.TOOL_OUTPUT_LIMIT);
  assert.equal(explainError(new Error('HOOK_BLOCKED_AFTER_TOOL')), errorText.HOOK_BLOCKED_AFTER_TOOL);
  assert.equal(explainError(new Error('PLAN_READ_ONLY')), errorText.PLAN_READ_ONLY);
  assert.equal(explainError(new Error('RUN_INTERRUPTED')), errorText.RUN_INTERRUPTED);
  assert.equal(explainError(new Error('CHANGE_NOT_FOUND')), errorText.CHANGE_NOT_FOUND);
});

test('[RENDER-01 / RENDER-03 / RENDER-05] stream sanitization, thinking icons, per-session live state, and claim-update streaming work accurately', () => {
  // Raw document_patch JSON never leaks while streaming; <think> inside code fences stays intact.
  const patchStream =
    'กำลังแก้\n<document_patch>{"id":"part-1","baseRevision":1,"markdown":"x"}</document_patch><document_review>ok</document_review>';
  assert.equal(visibleStream(patchStream), 'กำลังแก้');
  assert.equal(visibleStream('ตัวอย่าง:\n```html\n<think>keep</think>\n```'), 'ตัวอย่าง:\n```html\n<think>keep</think>\n```');
  // Inline step-tool blocks are hidden from saved answers too.
  assert.equal(visibleAnswer('คำตอบ ```step-tool\n{"tool":"files","input":"a"}\n``` จบ'), 'คำตอบ  จบ');
  // Code keeps its blank lines (Python's two between functions), so Copy gives back what the AI wrote.
  assert.equal(
    visibleAnswer('```python\ndef a():\n    pass\n\n\ndef b():\n    pass\n```'),
    '```python\ndef a():\n    pass\n\n\ndef b():\n    pass\n```',
  );
  // Unclosed claim-update block while streaming is hidden.
  assert.equal(splitClaimReply('ข้อความ\n```claim-update\n{"title":"x"', true).text, 'ข้อความ');
  // Localized Thai tool activity maps back to its tool icon key.
  assert.equal(stageLabel('กำลังค้นเว็บ').tool, 'web_search');
  assert.equal(stageLabel('กำลังอ่านเอกสาร ระเบียบงานบุคคล').tool, 'reference');
  assert.equal(stageLabel('กำลังอ่าน Skill step-writing').tool, 'skill');
  // Per-session live buckets survive switching between running sessions.
  focusLiveSession('s-a');
  resetThinking(1000, 's-a');
  setStream('stream A', 's-a');
  think({ type: 'activity', text: 'กำลังค้นเว็บ' }, 's-a');
  focusLiveSession('s-b');
  resetThinking(2000, 's-b');
  setStream('stream B', 's-b');
  focusLiveSession('s-a');
  assert.equal(liveThinking(3000, 's-a')?.steps[0]?.title, 'กำลังค้นเว็บ');
  clearLiveSession('s-a');
  clearLiveSession('s-b');
  // liveAnswer dedupes draft summaries.
  assert.equal(liveAnswer('ร่างยาวๆ', { role: 'assistant', text: 'สรุปร่างแล้ว', draftSummary: true }).streamSaved, true);
});

test('[RENDER-06 / CHAT-07] ArtifactStore keeps version snapshots and deleteBySession cleans all records', () => {
  const store = new Store(':memory:');
  try {
    const artifacts = new ArtifactStore(store);
    artifacts.save('s1', 'doc', 'Doc', 'markdown', 'v1 body');
    artifacts.save('s1', 'doc', 'Doc', 'markdown', 'v2 body');
    assert.equal(artifacts.get('s1', 'doc', 1)?.content, 'v1 body');
    assert.equal(artifacts.get('s1', 'doc', 2)?.content, 'v2 body');
    assert.equal(artifacts.get('s1', 'doc')?.content, 'v2 body');
    assert.equal(artifacts.list('s1').length, 1);
    assert.equal(artifacts.deleteBySession('s1'), 1);
    assert.equal(artifacts.get('s1', 'doc', 1), undefined);
    assert.equal(artifacts.get('s1', 'doc', 2), undefined);
  } finally {
    store.close();
  }
});

test('[RENDER-STD] normalizeMarkdownMath converts LaTeX delimiters, skips code blocks, and protects currency amounts', () => {
  // Block \[...\] and inline \(...\) normalize cleanly.
  assert.match(normalizeMarkdownMath('สูตร \\(E = mc^2\\) ครับ'), /\$E = mc\^2\$/);
  assert.match(normalizeMarkdownMath('ดังนี้\n\\[\n\\frac{a+b}{2}\n\\]'), /\$\$\n\\frac\{a\+b\}\{2\}\n\$\$/);
  // Code fences and inline code stay untouched.
  const fenced = '```tex\n\\(x + y\\)\n```\nและ `\\(a\\)`';
  assert.equal(normalizeMarkdownMath(fenced), fenced);
  // Thai & English prices with multiple '$' stay literal currency, never math.
  const thaiPrices = normalizeMarkdownMath('ราคา $100 ถึง $200 และ $300 บาท');
  assert.equal(thaiPrices, 'ราคา \\$100 ถึง \\$200 และ $300 บาท');
  const enPrices = normalizeMarkdownMath('Budget is $5,000 - $10,000 per year.');
  assert.equal(enPrices, 'Budget is \\$5,000 - $10,000 per year.');
  // Real math with digits or \text{Thai} still renders as KaTeX.
  assert.equal(normalizeMarkdownMath('ค่า $10 + 20 = 30$ และ $\\text{กำไร} = R - C$'), 'ค่า $10 + 20 = 30$ และ $\\text{กำไร} = R - C$');
});

test('[RENDER-STD] parseAlertTag recognizes all 5 GitHub-style callout markers', () => {
  assert.deepEqual(parseAlertTag('[!NOTE]\nรายละเอียดเพิ่มเติม'), { kind: 'note', rest: 'รายละเอียดเพิ่มเติม' });
  assert.deepEqual(parseAlertTag('[!TIP] กดปุ่มนี้'), { kind: 'tip', rest: 'กดปุ่มนี้' });
  assert.deepEqual(parseAlertTag('[!IMPORTANT]\nต้องแนบใบเสร็จ'), { kind: 'important', rest: 'ต้องแนบใบเสร็จ' });
  assert.deepEqual(parseAlertTag('[!WARNING]\nระวังเกินวงเงิน'), { kind: 'warning', rest: 'ระวังเกินวงเงิน' });
  assert.deepEqual(parseAlertTag('[!CAUTION]\nห้ามเผยแพร่'), { kind: 'caution', rest: 'ห้ามเผยแพร่' });
  assert.equal(parseAlertTag('ข้อความอ้างอิงธรรมดา'), null);
});

test('[RENDER-STD] inline HTML/SVG preview builders enforce offline CSP and strip SVG scripts', () => {
  assert.equal(isPreviewableHtml('<p>hi</p>'), false);
  assert.equal(isPreviewableHtml('<!doctype html><html><body><h1>Chart</h1></body></html>'), true);
  assert.equal(isPreviewableHtml('<style>.box{color:red}</style><div class="box">Widget</div>'), true);
  assert.equal(isPreviewableSvg('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>'), true);
  assert.equal(isPreviewableSvg('<div>not svg</div>'), false);

  const dirtySvg =
    '<svg><script>alert(1)</script><foreignObject><b>x</b></foreignObject><rect onclick="evil()" href="javascript:alert(1)"/></svg>';
  const cleanSvg = sanitizeStaticSvg(dirtySvg);
  assert.doesNotMatch(cleanSvg, /<script|foreignObject|onclick|javascript:/i);

  const htmlSrc = decodeURIComponent(buildSandboxedHtmlSrc('<!doctype html><html><head></head><body>OK</body></html>', true));
  assert.match(htmlSrc, /Content-Security-Policy/);
  assert.match(htmlSrc, /connect-src 'none'/);
  assert.match(htmlSrc, /frame-src 'none'/);

  const svgSrc = decodeURIComponent(buildSandboxedSvgSrc(dirtySvg, false));
  assert.match(svgSrc, /default-src 'none'/);
  assert.doesNotMatch(svgSrc, /script-src/);
  assert.doesNotMatch(svgSrc, /onclick|<script/i);
});

test('[RENDER-STD] expanded code highlighter supports unified diff and modern languages', () => {
  const diffHtml = highlight('--- a.ts\n+++ b.ts\n-const old = 1;\n+const next = 2;', 'diff');
  assert.match(diffHtml, /hljs-deletion/);
  assert.match(diffHtml, /hljs-addition/);
  const rustHtml = highlight('fn main() { println!("ok"); }', 'rust');
  assert.match(rustHtml, /hljs-keyword/);
});
