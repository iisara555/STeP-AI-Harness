import { test } from 'node:test';
import assert from 'node:assert/strict';
import { report, sampleCases, score, type Outcome, pickRange, joinOutcomes } from '../eval/skill-selection-live';

test('live selection eval samples per Skill and scores right, wrong, none and invalid picks per model', () => {
  const cases = sampleCases({ skills: { a: ['a1', 'a2'], b: ['b1'] }, general: ['g1'] }, 1);
  assert.deepEqual(cases, [
    { request: 'a1', expected: 'a' },
    { request: 'b1', expected: 'b' },
    { request: 'g1', expected: null },
  ]);
  const outcomes: Outcome[] = [
    { ...cases[0], model: 'm', chosen: 'a', ms: 1000, output: 10 },
    { ...cases[0], model: 'm-low', chosen: 'b', ms: 400, output: 4 },
    { ...cases[1], model: 'm', chosen: null, ms: 3000, output: 10 },
    { ...cases[1], model: 'm-low', code: 'INVALID_SKILL_SELECTION', ms: 500 },
    { ...cases[2], model: 'm', chosen: null, ms: 2000 },
    { ...cases[2], model: 'm-low', chosen: null, ms: 300 },
  ];
  const [full, low] = score(outcomes);
  assert.deepEqual(
    { ...full },
    {
      model: 'm',
      right: 1,
      wrongSkill: 0,
      noSkill: 1,
      skillCases: 2,
      generalKept: 1,
      generalCases: 1,
      invalid: 0,
      p50Ms: 2000,
      outputTokens: 20,
    },
  );
  assert.equal(low.right, 0);
  assert.equal(low.wrongSkill, 1);
  assert.equal(low.invalid, 1);
  assert.equal(low.p50Ms, 300);
  const text = report([full, low], outcomes);
  assert.match(text, /\| m-low \| 0\/2 \| 1 \| 0 \| 1\/1 \| 1 \| 0\.3 s \| 4 \|/);
  // Only requests the models answered differently are listed.
  assert.match(text, /- a1 \(expected a\): m → a, m-low → b/);
  assert.match(text, /- b1 \(expected b\): m → none, m-low → INVALID_SKILL_SELECTION/);
  assert.doesNotMatch(text, /- g1/);
});

test('a selection run can be split into 1-based inclusive parts under a call cap', () => {
  const cases = Array.from({ length: 61 }, (_, i) => i + 1);
  assert.deepEqual(pickRange(cases, '1-25'), cases.slice(0, 25));
  assert.deepEqual(pickRange(cases, '51-61'), cases.slice(50));
  assert.deepEqual(pickRange(cases, '51-99').length, 11);
  assert.equal(pickRange(cases).length, 61);
  for (const bad of ['0-5', '10-5', '62-70', 'all', '5']) assert.throws(() => pickRange(cases, bad), /EVAL_CASES_INVALID/, bad);
});

test('joining parts drops a request a part did not send when another part answered it', () => {
  const o = (model: string, code?: string) => ({ request: 'r15', expected: 'a', model, ms: 1, ...(code ? { code } : { chosen: 'a' }) });
  const joined = joinOutcomes([
    o('sonnet', 'EVAL_QUOTA_BOUND'),
    o('sonnet'),
    o('haiku'),
    { ...o('haiku', 'EVAL_QUOTA_BOUND'), request: 'r16' },
  ]);
  assert.deepEqual(
    joined.map(x => [x.request, x.model, x.code || 'ok']),
    [
      ['r15', 'sonnet', 'ok'],
      ['r15', 'haiku', 'ok'],
      ['r16', 'haiku', 'EVAL_QUOTA_BOUND'],
    ],
  );
});
