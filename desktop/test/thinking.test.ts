import test from 'node:test';
import assert from 'node:assert/strict';
import { THINKING_CHARS, ThinkingLog, savedThinking, splitThoughts } from '../src/thinking';

test('reasoning splits into thoughts at bold heading lines, plain reasoning stays one thought', () => {
  assert.deepEqual(
    splitThoughts(
      'เริ่มจากโจทย์\n\n**Reviewing System Instructions**\n\nI checked the rules.\n**Drafting Placeholder Names**\nNames stay placeholders.',
    ),
    [
      { text: 'เริ่มจากโจทย์' },
      { title: 'Reviewing System Instructions', text: 'I checked the rules.' },
      { title: 'Drafting Placeholder Names', text: 'Names stay placeholders.' },
    ],
  );
  assert.deepEqual(splitThoughts('คิดเรื่อง **สำคัญ** ก่อน'), [{ text: 'คิดเรื่อง **สำคัญ** ก่อน' }]);
  assert.deepEqual(splitThoughts('  \n'), []);
});

test('the log keeps stages with their durations and the reasoning streamed during each', () => {
  const log = new ThinkingLog(1000);
  log.reason('อ่านคำขอก่อน');
  log.step('skill step-pr', 3000);
  log.step('skill step-pr', 3500); // the same status again is the same stage
  log.reason('**Loading the Skill**\nใช้แนวทางประชาสัมพันธ์');
  log.turn();
  log.reason('ตรวจอีกรอบ');
  log.step('reference docs/knowledge/pr.md', 10000);
  const result = log.result(12000)!;
  assert.equal(result.ms, 11000);
  assert.deepEqual(
    result.steps.map(step => [step.title, step.ms, step.notes]),
    [
      ['', 2000, [{ text: 'อ่านคำขอก่อน' }]],
      ['skill step-pr', 7000, [{ title: 'Loading the Skill', text: 'ใช้แนวทางประชาสัมพันธ์\n\nตรวจอีกรอบ' }]],
      ['reference docs/knowledge/pr.md', 2000, []],
    ],
  );
});

test('a run with no stage and no reasoning keeps nothing, and long reasoning keeps its latest part', () => {
  assert.equal(new ThinkingLog().result(), undefined);
  const log = new ThinkingLog(0);
  log.reason('เก่า'.repeat(THINKING_CHARS));
  log.reason('ล่าสุด');
  const notes = log.result(1)!.steps[0].notes;
  assert.ok(notes[0].text.length <= THINKING_CHARS);
  assert.ok(notes[0].text.endsWith('ล่าสุด'));
});

test('saved thinking from an older or edited record shows only well-formed parts', () => {
  assert.equal(savedThinking(undefined), undefined);
  assert.equal(savedThinking({ steps: 'x' }), undefined);
  assert.deepEqual(
    savedThinking({ ms: 'x', steps: [{ title: 'ค้นเว็บ', ms: 1200, notes: [{ text: 'ok' }, { text: 3 }] }, { title: 1 }] }),
    {
      ms: 0,
      steps: [{ title: 'ค้นเว็บ', ms: 1200, notes: [{ text: 'ok' }] }],
    },
  );
});
