import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { Store } from '../electron/store';
import { DesktopTools } from '../electron/tools';
import { Workbench } from '../electron/workbench';
import { ToolGate } from '../electron/tool-gate';
import { Approvals } from '../electron/approvals';
import { Questions } from '../electron/questions';
import { defaultPolicy } from '../electron/policy';
import { readHistory, searchHistory } from '../electron/session-history';
import { loopRequests } from '../src/tools';
import { TOOL_RULES } from '../electron/tool-loop';
import type { Harness } from '../electron/service';
import type { Session } from '../src/types';

// Step 3 of the agent-learning plan: the AI finds earlier work by words, project or date instead of asking again.
function history() {
  const store = new Store(':memory:');
  const add = (title: string, team: string, project: string, updatedAt: string, user: string, draft = '') => {
    const s = store.create('c', team, project);
    s.title = title;
    s.originalQuery = user;
    s.messages.push({ role: 'user', text: user, at: updatedAt }, { role: 'assistant', text: 'ร่างให้แล้ว: ' + title, at: updatedAt });
    s.draft = draft;
    store.put('session', s.id, { ...s, updatedAt } as Session);
    return s.id;
  };
  const tor = add(
    'ร่าง TOR จ้างทำเว็บไซต์',
    'cc',
    'เว็บไซต์ใหม่',
    '2026-10-01T03:00:00.000Z',
    'ช่วยร่าง TOR จ้างทำเว็บไซต์ งบ 500,000 บาท',
    'ขอบเขตงาน…',
  );
  const memo = add('บันทึกข้อความขออนุมัติ', 'cc', 'เว็บไซต์ใหม่', '2026-10-10T03:00:00.000Z', 'ทำบันทึกขออนุมัติจัดจ้างเว็บไซต์');
  const other = add('สรุปประชุม AFP', 'afp', 'งบประมาณ', '2026-10-05T03:00:00.000Z', 'สรุปประชุมเว็บไซต์ของ AFP');
  const current = add('งานปัจจุบัน', 'cc', 'เว็บไซต์ใหม่', '2026-10-16T03:00:00.000Z', 'ต่องานเว็บไซต์จากครั้งก่อน');
  return { store, tor, memo, other, current };
}

test('search finds the same team’s earlier tasks by words, newest first, without the current task', () => {
  const h = history();
  const hits = searchHistory(h.store, 'cc', h.current, { query: 'เว็บไซต์' });
  assert.deepEqual(
    hits.map(x => x.id),
    [h.memo, h.tor],
  );
  assert.ok(!hits.some(x => x.id === h.other), 'another team’s task stays hidden');
  assert.match(hits[1].snippet, /เว็บไซต์/);
  assert.equal(hits[1].project, 'เว็บไซต์ใหม่');
});

test('search filters by project and local dates, and validates its arguments', () => {
  const h = history();
  assert.deepEqual(
    searchHistory(h.store, 'cc', h.current, { from: '2026-10-01', to: '2026-10-05' }).map(x => x.id),
    [h.tor],
  );
  assert.deepEqual(
    searchHistory(h.store, 'cc', h.current, { query: '', project: 'เว็บไซต์' }).map(x => x.id),
    [h.memo, h.tor],
  );
  assert.equal(searchHistory(h.store, 'cc', h.current, { project: 'ไม่มีโปรเจกต์นี้' }).length, 0);
  assert.equal(searchHistory(h.store, 'cc', h.current, { limit: 1 }).length, 1);
  for (const bad of [{ from: '1/10/2026' }, { from: '2026-10-10', to: '2026-10-01' }, { limit: 0 }, { limit: 11 }])
    assert.throws(() => searchHistory(h.store, 'cc', h.current, bad), /INVALID_INPUT/);
});

test('read returns a bounded excerpt of one earlier task of the same team only', () => {
  const h = history();
  const read = readHistory(h.store, 'cc', h.current, h.tor);
  assert.equal(read.title, 'ร่าง TOR จ้างทำเว็บไซต์');
  assert.match(read.request, /500,000/);
  assert.equal(read.turns.length, 2);
  assert.equal(read.draft, 'ขอบเขตงาน…');
  assert.throws(() => readHistory(h.store, 'cc', h.current, h.other), /SESSION_NOT_FOUND/);
  assert.throws(() => readHistory(h.store, 'cc', h.current, h.current), /SESSION_NOT_FOUND/);
  const long = h.store.session(h.memo);
  for (let i = 0; i < 20; i++) long.messages.push({ role: 'assistant', text: 'ก'.repeat(3000), at: long.updatedAt });
  h.store.put('session', long.id, long);
  const bounded = readHistory(h.store, 'cc', h.current, h.memo);
  assert.ok(bounded.turns.length <= 12);
  assert.ok(bounded.turns.reduce((n, t) => n + t.text.length, 0) <= 8000);
});

test('the AI can call session_search through the tool protocol, and the prompt tells it when', async () => {
  const h = history();
  const policy = defaultPolicy();
  h.store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
  const workbench = new Workbench(h.store, undefined, () => policy);
  const approvals = new Approvals(h.store, () => {});
  const gate = new ToolGate(
    () => policy,
    () => 'ask',
    () => workbench.root(),
    approvals,
    async () => ({ blocked: false, reason: '', results: [] }),
  );
  const make = (store?: Store) =>
    new DesktopTools(
      workbench,
      { root: tmpdir() } as Harness,
      gate,
      approvals,
      new Questions(() => {}),
      () => policy,
      () => 'ask',
      '',
      () => {},
      () => '',
      store,
    );
  const [request] = loopRequests(
    '```step-tool\n' +
      JSON.stringify({ tool: 'session_search', input: 'TOR', args: { project: 'เว็บไซต์', from: '2026-09-01' } }) +
      '\n```',
  );
  assert.equal(request.tool, 'session_search');
  const scope = { sessionId: h.current, team: 'cc' } as any;
  const found: any = await make(h.store).execute(request, scope);
  assert.deepEqual(
    found.results.map((x: any) => x.id),
    [h.tor],
  );
  const read: any = await make(h.store).execute({ tool: 'session_search', input: h.tor, args: { action: 'read' } }, scope);
  assert.equal(read.id, h.tor);
  await assert.rejects(make().execute(request, scope), /TOOL_UNAVAILABLE/);
  assert.equal(
    loopRequests('```step-tool\n' + JSON.stringify({ tool: 'session_search', input: '', args: { limit: 50 } }) + '\n```').length,
    0,
  );
  assert.match(TOOL_RULES, /session_search\(input=words/);
});
