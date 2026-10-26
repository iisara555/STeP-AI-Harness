import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { loadRouterIndex, queryStepRouter } from '../src/modules/router/service.js';

// Staff-style routing benchmark: how often the local Router's top pick is the right Skill when employees phrase
// requests their own way. The limits record the current level; a routing change may only tighten them.
const suite = JSON.parse(await readFile('manifest/routing-staff-benchmark.json', 'utf-8'));
const topPick = (result) => {
  const first = result.ranked?.[0];
  return first && first.score > 0 ? first.skill : null;
};

test('every routed Skill has at least four staff-style requests', async () => {
  const index = await loadRouterIndex();
  const missing = index
    .map((skill) => skill.name)
    .filter((name) => (suite.skills[name]?.length || 0) < 4);
  assert.deepEqual(missing, [], 'add four requests for each new Skill to manifest/routing-staff-benchmark.json');
  const unknown = Object.keys(suite.skills).filter((name) => !index.some((skill) => skill.name === name));
  assert.deepEqual(unknown, []);
});

test('staff-style requests reach the right Skill at or above the recorded level', async () => {
  let correct = 0;
  const wrong = [];
  const none = [];
  for (const [skill, requests] of Object.entries(suite.skills))
    for (const request of requests) {
      const pick = topPick(await queryStepRouter(request, { autoRoute: false }));
      if (pick === skill) correct++;
      else if (pick) wrong.push(`${request} => ${pick} (expected ${skill})`);
      else none.push(`${request} (expected ${skill})`);
    }
  const total = Object.values(suite.skills).flat().length;
  const report = `${correct}/${total} correct, ${wrong.length} wrong Skill, ${none.length} no match`;
  assert.ok(correct >= suite.limits.minCorrect, `${report}; minCorrect is ${suite.limits.minCorrect}`);
  assert.ok(
    wrong.length <= suite.limits.maxWrongSkill,
    `${report}; maxWrongSkill is ${suite.limits.maxWrongSkill}\n${wrong.join('\n')}`,
  );
});

test('general requests stay out of Skills and authority requests stay held', async () => {
  const matched = [];
  for (const request of suite.general) {
    const pick = topPick(await queryStepRouter(request, { autoRoute: false }));
    if (pick) matched.push(`${request} => ${pick}`);
  }
  assert.ok(
    matched.length <= suite.limits.maxGeneralMatched,
    `maxGeneralMatched is ${suite.limits.maxGeneralMatched}:\n${matched.join('\n')}`,
  );
  let held = 0;
  for (const request of suite.authority) {
    const result = await queryStepRouter(request, { autoRoute: true, authorityChecks: true });
    if (['BLOCK', 'ESCALATE'].includes(result.authorityPreflight?.status)) held++;
  }
  assert.ok(held >= suite.limits.minAuthorityHeld, `${held}/${suite.authority.length} held`);
});
