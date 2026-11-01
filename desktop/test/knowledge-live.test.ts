import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { judge, report, runKnowledge, summary, turnQuery } from '../eval/knowledge-live';
import type { Connection } from '../src/types';

const connection: Connection = { id: 'eval', provider: 'claude', mode: 'api', model: 'fake', executable: '', ready: true, note: '' };
const tool = (request: object) => '```step-tool\n' + JSON.stringify(request) + '\n```';

test('a document counts when search returned it or the AI opened it; a general question must reach none', () => {
  assert.deepEqual(judge({ q: 'x', doc: 'hr' }, ['afp'], ['hr']), { keyword: false, reached: true });
  assert.deepEqual(judge({ q: 'x', doc: ['hr', 'cc'] }, ['cc'], []), { keyword: true, reached: true });
  assert.deepEqual(judge({ q: 'x', doc: 'none' }, [], ['hr']), { keyword: true, reached: false });
  assert.deepEqual(judge({ q: 'x', doc: 'none' }, [], []), { keyword: true, reached: true });
  assert.equal(turnQuery({ q: 'แล้วลาป่วยล่ะ', earlier: 'ลาพักร้อนกี่วัน', doc: 'hr' }), 'ลาพักร้อนกี่วัน\nแล้วลาป่วยล่ะ');
});

test('the live run asks through WorkService chat, runs the reference tool and records what the AI opened', async () => {
  const prompts: string[] = [];
  const run = async (prompt: string) => {
    prompts.push(prompt);
    if (prompt.includes('skill_catalog') || /select ONE registered/.test(prompt)) return '{"skillId":null,"reason":"general"}';
    if (!prompt.includes('tool_results') && !prompt.includes('ลาคลอด'))
      return tool({ tool: 'reference', input: 'hr-personnel-welfare-2569', args: { action: 'outline' } });
    return 'ลาคลอดได้ตามระเบียบบุคคล (ข้อมูลสังเคราะห์สำหรับทดสอบ)';
  };
  const outcomes = await runKnowledge({
    root: resolve('..'),
    cases: [{ q: 'คลอดลูกหยุดงานได้นานแค่ไหน', doc: 'hr-personnel-welfare-2569' }],
    live: { connection, context: { cwd: resolve('.'), env: {} } as any, run: run as any },
  });
  assert.equal(outcomes.length, 1);
  const [o] = outcomes;
  assert.equal(o.code, undefined, JSON.stringify(o));
  assert.deepEqual(o.opened, ['hr-personnel-welfare-2569']);
  assert.equal(o.keyword, false, 'keyword search misses this reworded question');
  assert.equal(o.reached, true);
  assert.ok(o.rounds >= 2, 'the reference round is counted');
  assert.match(o.answer, /ลาคลอด/);
  const text = report({ provider: 'claude', model: 'fake', date: 'd', harness: 'h' }, outcomes);
  assert.match(text, /\| 1 \| 0 \| 1 \| 1 \| 0 \|/);
  assert.equal(summary(outcomes).keywordMissedButReached, 1);
});

test('when the app asks back which Skill fits, the case reply is sent once; still asking is CLARIFY and not reached', async () => {
  const run = async (prompt: string) => {
    if (prompt.includes('skill_catalog') || /select ONE registered/.test(prompt)) return '{"skillId":null,"reason":"general"}';
    return 'ตอบตามระเบียบบุคคล (ข้อมูลสังเคราะห์สำหรับทดสอบ)';
  };
  const live = { connection, context: { cwd: resolve('.'), env: {} } as any, run: run as any };
  const [answered, stuck] = await runKnowledge({
    root: resolve('..'),
    cases: [
      { q: 'แล้วลาป่วยล่ะ', earlier: 'ลาพักร้อนได้ปีละกี่วัน', doc: 'hr-personnel-welfare-2569', reply: '1' },
      { q: 'แล้วลาป่วยล่ะ', earlier: 'ลาพักร้อนได้ปีละกี่วัน', doc: 'hr-personnel-welfare-2569' },
    ],
    live,
  });
  assert.equal(answered.asked, true, 'this follow-up is asked back today (S2 has not landed)');
  assert.equal(answered.code, undefined, JSON.stringify(answered));
  assert.ok(answered.rounds >= 1, 'the answer after the reply is counted');
  assert.match(answered.answer, /ระเบียบบุคคล/);
  assert.equal(stuck.code, 'CLARIFY');
  assert.equal(stuck.reached, false, 'search excerpts do not count when no answer was given');
  assert.equal(stuck.rounds, 0);
  assert.equal(summary([answered, stuck]).asked, 2);
  assert.match(report({ provider: 'claude', model: 'fake', date: 'd', harness: 'h' }, [answered, stuck]), /\| 2 \|\n/);
});
