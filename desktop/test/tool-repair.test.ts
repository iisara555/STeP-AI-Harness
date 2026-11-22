import test from 'node:test';
import assert from 'node:assert/strict';
import { brokenRequests, loopRequests } from '../src/tools';
import { repairNotes, repairToolRequest } from '../src/tool-repair';
import { ToolLoop } from '../electron/tool-loop';

const fenced = (value: unknown) => '```step-tool\n' + JSON.stringify(value) + '\n```';
const one = (value: unknown) => {
  const requests = loopRequests(fenced(value));
  assert.equal(requests.length, 1, JSON.stringify(value));
  return requests[0];
};

test('a tool name from another harness runs the STeP tool with the same meaning', () => {
  assert.deepEqual(one({ tool: 'read_file', input: 'notes.md' }), { tool: 'files', input: 'notes.md' });
  assert.equal(one({ tool: 'bash', input: 'ls' }).tool, 'terminal');
  assert.equal(one({ tool: 'Web-Search', input: 'วันหยุดราชการ 2027' }).tool, 'web_search');
  assert.equal(one({ tool: 'functions.skill', input: 'step-tor' }).tool, 'skill');
  const request = one({ tool: 'load_skill', input: 'step-tor' });
  assert.match(repairNotes.get(request)!.join(), /ran skill for "load_skill"/);
});

test('an unknown name stays unknown and is reported, never guessed', () => {
  assert.equal(loopRequests(fenced({ tool: 'delete_everything', input: 'x' })).length, 0);
  assert.match(brokenRequests(fenced({ tool: 'delete_everything', input: 'x' }))[0], /unknown tool/);
  // The bare {"name": ...} shape of a JSON example in an answer is still not a request.
  assert.equal(loopRequests('```json\n{"name":"x"}\n```').length, 0);
});

test('the function-call shape becomes a step-tool request', () => {
  assert.deepEqual(one({ name: 'reference', arguments: { input: 'hr-leave', action: 'outline' } }), {
    tool: 'reference',
    input: 'hr-leave',
    args: { action: 'outline' },
  });
  assert.deepEqual(one({ name: 'skill', arguments: JSON.stringify({ skill: 'step-tor' }) }), { tool: 'skill', input: 'step-tor' });
});

test('a missing input is taken only from the tool’s own name for it', () => {
  assert.deepEqual(one({ tool: 'files', path: 'a/b.md' }), { tool: 'files', input: 'a/b.md' });
  assert.deepEqual(one({ tool: 'web_search', args: { query: 'ราคาทอง' } }), { tool: 'web_search', input: 'ราคาทอง' });
  assert.deepEqual(one({ tool: 'files', args: { input: 'x.md', action: 'read' } }), {
    tool: 'files',
    input: 'x.md',
    args: { action: 'read' },
  });
  // search_files has no unambiguous name for its folder, so a stray "query" is not guessed into input.
  assert.equal(loopRequests(fenced({ tool: 'search_files', query: 'ลา' })).length, 0);
});

test('argument types follow the published schema', () => {
  assert.deepEqual(one({ tool: 'session_search', input: 'TOR', args: { limit: '3' } }).args, { limit: 3 });
  assert.deepEqual(one({ tool: 'search_files', input: '.', args: '{"pattern":"ลา","maxResults":"20","regex":"false"}' }).args, {
    pattern: 'ลา',
    maxResults: 20,
    regex: false,
  });
  assert.deepEqual(one({ tool: 'reference', input: 'hr-leave', action: 'Outline' }).args, { action: 'outline' });
  assert.deepEqual(one({ tool: 'reference', input: 'hr-leave', args: { section: null } }), { tool: 'reference', input: 'hr-leave' });
  assert.deepEqual(one({ tool: 'patch', input: 'a.md', args: { old_str: 'a', new_str: 'b' } }).args, { old_string: 'a', new_string: 'b' });
  // Text that is not a number stays text, so the schema still refuses it with the field named.
  assert.equal(loopRequests(fenced({ tool: 'session_search', input: 'TOR', args: { limit: 'ten' } })).length, 0);
  assert.match(brokenRequests(fenced({ tool: 'session_search', input: 'TOR', args: { limit: 'ten' } }))[0], /limit must be an integer/);
});

test('repair never touches what is not a request', () => {
  for (const value of [null, 3, 'x', [1], { foo: 1 }]) assert.deepEqual(repairToolRequest(value), { value, notes: [] });
  const ok = { tool: 'skill', input: 'step-tor' };
  assert.deepEqual(repairToolRequest(ok), { value: ok, notes: [] });
});

test('a repaired request runs through the same host gates and its result says what was repaired', async () => {
  const seen: string[] = [];
  const loop = new ToolLoop({
    enabled: () => true,
    check: async () => {},
    readOnly: () => true,
    execute: async request => {
      seen.push(request.tool);
      return 'contents';
    },
    outgoing: async text => text,
  });
  const prompts: string[] = [];
  const replies = [fenced({ tool: 'read_file', path: 'a.md' }), 'คำตอบ'];
  const answer = await loop.run('task', async prompt => (prompts.push(prompt), replies.shift()!), new AbortController().signal);
  assert.equal(answer, 'คำตอบ');
  assert.deepEqual(seen, ['files']);
  assert.match(prompts[1], /Your request was repaired before it ran/);
  assert.match(prompts[1], /ran files for \\"read_file\\"/);
});

test('browser rules go only to conversations with web-page work, and stay once they do', async () => {
  const { needsBrowserRules } = await import('../electron/tool-loop');
  assert.equal(needsBrowserRules(['ร่างบันทึกข้อความขออนุมัติจัดซื้อ', 'ตรวจใบเสร็จนี้ให้หน่อย']), false);
  assert.equal(needsBrowserRules(['ลาพักร้อนได้กี่วัน']), false);
  for (const text of [
    'เปิดเว็บ step.cmu.ac.th',
    'https://example.com',
    'ช่วยกรอกแบบฟอร์มออนไลน์',
    'สั่งอาหารให้หน่อย',
    'login เข้าระบบ MIS',
  ])
    assert.equal(needsBrowserRules(['ร่างบันทึก', text]), true, text);
});

test('small models are told the exact request form', async () => {
  const { smallModel } = await import('../electron/tool-loop');
  for (const model of [
    'qwen3.5:4b',
    'Qwen3.5-4B',
    'hf.co/unsloth/Qwen3.5-2B-GGUF:Q4_K_M',
    'gemma-3-12b-it',
    'gemini-3.8-flash-lite',
    'gpt-5-mini',
  ])
    assert.equal(smallModel(model), true, model);
  for (const model of ['gemini-3.8-flash-medium', 'claude-opus-5-5', 'qwen3.5-27b', 'deepseek-v4.1-flash', 'step-chat', '', undefined])
    assert.equal(smallModel(model), false, String(model));
});
