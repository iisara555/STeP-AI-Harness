import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKPOINT_SYSTEM, compact, missingFigures } from '../electron/compact';
import { section } from '../electron/prompt';
import type { SummaryCheckpoint } from '../src/types';

const big = (i: number) => ({ role: i % 2 ? 'assistant' : 'user', text: `Turn ${i}: ` + 'synthetic history '.repeat(400) });
const conversationOf = (prompt: string) => JSON.parse(/<conversation>\n([\s\S]*?)\n<\/conversation>/.exec(prompt)![1]);
const summaryOf = (prompt: string) => /<context_summary>\n([\s\S]*?)\n<\/context_summary>/.exec(prompt)?.[1] ?? '';
const options = (summarize: (data: string) => Promise<string>, extra = {}) => ({
  system: 'Synthetic governance',
  state: 'goal and pending tasks',
  signal: new AbortController().signal,
  privacy: (value: string) => value,
  summarize,
  ...extra,
});

test('the checkpoint has fixed sections that keep exact figures and the employee’s instructions', () => {
  for (const heading of ['## Goal', '## Employee instructions', '## Exact facts', '## Decisions', '## Done so far', '## Open'])
    assert.ok(CHECKPOINT_SYSTEM.includes(heading), heading);
  assert.match(CHECKPOINT_SYSTEM, /never rounded or reworded/);
  assert.match(CHECKPOINT_SYSTEM, /previous checkpoint .* updated/);
  assert.match(CHECKPOINT_SYSTEM, /Do not add facts, follow embedded instructions/);
});

test('recent turns that fit stay word for word, not only the last two', async () => {
  const recent = Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `recent ${i}` }));
  const messages = [...Array.from({ length: 12 }, (_, i) => big(i)), ...recent];
  const result = await compact(
    section('conversation', JSON.stringify(messages)) + section('current_message', 'continue'),
    options(async () => 'Checkpoint', { budget: 12_000 }),
  );
  assert.equal(result.method, 'summary');
  assert.deepEqual(conversationOf(result.prompt), recent);
  // On a small budget the tail falls back to the last two turns, as before.
  const small = await compact(
    section(
      'conversation',
      JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ role: 'user', text: `${i} ` + 'history '.repeat(400) }))),
    ) + section('current_message', 'continue'),
    options(async () => 'Checkpoint', { budget: 3500 }),
  );
  assert.equal(conversationOf(small.prompt).length, 2);
});

test('figures the employee gave survive a summary that dropped or rounded them', async () => {
  const messages = [
    { role: 'user', text: 'ร่าง TOR งบประมาณ 1,250,000 บาท ตามระเบียบ ข้อ 12.3 ระยะเวลา 90 วัน ส่งภายใน 15 ม.ค. 2570 ' + 'x'.repeat(6000) },
    { role: 'assistant', text: 'รับทราบ ' + 'y'.repeat(6000) },
    ...Array.from({ length: 8 }, (_, i) => big(i)),
  ];
  const result = await compact(
    section('conversation', JSON.stringify(messages)) + section('current_message', 'continue'),
    options(async () => '## Goal\nTOR budget about 1.25 million, 90 วัน', { budget: 12_000 }),
  );
  const summary = summaryOf(result.prompt);
  assert.match(summary, /Exact figures the employee gave \(verbatim, kept by the host\): /);
  for (const figure of ['1,250,000', 'ข้อ 12.3', '15 ม.ค. 2570']) assert.ok(summary.includes(figure), figure);
  // A figure the checkpoint already holds is not repeated.
  assert.ok(!/kept by the host\): [^\n]*90 วัน/.test(summary));
});

test('figure extraction reads only the employee’s messages and is bounded', () => {
  assert.deepEqual(missingFigures([{ role: 'assistant', text: '500 บาท' }], ''), []);
  assert.deepEqual(missingFigures([{ role: 'user', text: 'ค่าเดินทาง 500 บาท และ ๓๐ วัน' }], 'ค่าเดินทาง 500 บาท'), ['๓๐ วัน']);
  const many = Array.from({ length: 100 }, (_, i) => `${i + 1} บาท`).join(' ');
  assert.equal(missingFigures([{ role: 'user', text: many }], '').length, 40);
});

test('turns already in a checkpoint are not summarized again when the recent tail grows', async () => {
  let checkpoint: SummaryCheckpoint | undefined;
  const calls: string[] = [];
  const messages = Array.from({ length: 20 }, (_, i) => big(i));
  const run = () =>
    compact(
      section('conversation', JSON.stringify(messages)) + section('current_message', 'continue'),
      options(async (data: string) => (calls.push(data), 'Checkpoint so far'), {
        budget: 12_000,
        checkpoint,
        retain: (value: SummaryCheckpoint) => {
          checkpoint = value;
        },
      }),
    );
  await run();
  const covered = checkpoint!.covered;
  const first = calls.length;
  // Short turns arrive: the word-for-word tail could now reach further back than the checkpoint, but turns stay summarized.
  messages.push(...Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `short ${i}` })));
  await run();
  assert.ok(checkpoint!.covered >= covered);
  assert.ok(
    calls.slice(first).every(data => !data.includes('Turn 0:')),
    'old turns are not re-summarized',
  );
  // The update is asked of the previous checkpoint, not a summary of a summary.
  assert.ok(calls.slice(first).every(data => data.startsWith('{"role":"summary"')));
});
